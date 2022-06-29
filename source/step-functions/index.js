/*********************************************************************************************************************
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.                                           *
 *                                                                                                                    *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance    *
 *  with the License. A copy of the License is located at                                                             *
 *                                                                                                                    *
 *      http://www.apache.org/licenses/LICENSE-2.0                                                                    *
 *                                                                                                                    *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES *
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions    *
 *  and limitations under the License.                                                                                *
 *********************************************************************************************************************/

const {
    logger,
    metrics,
    loggerInjectLambdaContext,
    tracerCaptureLambdaHandler,
    metricsLogMetrics,
    MetricUnits
} = require('./powertools.js');
const AWS = require('aws-sdk');
const uuidv4 = require('uuid/v4');
const error = require('./lib/error.js');
const middy = require('@middy/core');

const lambdaHandler = async (event) => {

    const stepfunctions = new AWS.StepFunctions({
        region: process.env.AWS_REGION,
        customUserAgent: process.env.SOLUTION_IDENTIFIER
    });

    let response;
    let params;
    let context = {};

    try {
        switch (true) {
            case event.hasOwnProperty('Records'):
                // Ingest workflow triggered by s3 event::
                event.guid = uuidv4();

                // Identify file extention of s3 object::
                let key = decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
                if (key.slice((key.lastIndexOf(".") - 1 >>> 0) + 2) === 'json') {
                    event.workflowTrigger = 'Metadata';
                } else {
                    event.workflowTrigger = 'Video';
                }
                params = {
                    stateMachineArn: process.env.IngestWorkflow,
                    input: JSON.stringify(event),
                    name: event.guid
                };
                response = 'success';
                context = {
                    workflowTrigger: event.workflowTrigger,
                    guid: event.guid,
                    ...context
                }
                break;

            case event.hasOwnProperty('guid'):
                // Process Workflow trigger
                params = {
                    stateMachineArn: process.env.ProcessWorkflow,
                    input: JSON.stringify({
                        guid: event.guid
                    }),
                    name: event.guid
                };
                response = 'success';
                context = {
                    workflowTrigger: event.workflowTrigger,
                    guid: event.guid,
                    ...context
                }
                break;

            case event.hasOwnProperty('detail'):
                // Publish workflow triggered by MediaConvert CloudWatch event::
                params = {
                    stateMachineArn: process.env.PublishWorkflow,
                    input: JSON.stringify(event),
                    name: event.detail.userMetadata.guid
                };
                response = 'success';
                context = {
                    stateMachineArn: process.env.PublishWorkflow,
                    workflowTrigger: event.workflowTrigger,
                    guid: event.detail.userMetadata.guid,
                    ...context
                }
                break;

            default:
                throw new Error('invalid event object');
        }

        let data = await stepfunctions.startExecution(params).promise();

        context = {
            success: 'true',
            ...context
        }
        logger.info('STATEMACHINE EXECUTION', {
            ...context,
            details: {
                data
            }
        });
    } catch (err) {
        await error.handler(event, err);
        context = {
            success: 'false',
            ...context
        }
        logger.error('Unexpected error occurred', err, ...context);
        throw err;
    }
    metrics.addDimensions(context);
    metrics.addMetric('statemachine-execution', MetricUnits.Count, 1);

    return response;
};

exports.handler = middy(lambdaHandler)
    .use(tracerCaptureLambdaHandler)
    .use(metricsLogMetrics)
    .use(loggerInjectLambdaContext);