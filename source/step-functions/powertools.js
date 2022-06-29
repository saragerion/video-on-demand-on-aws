const { Logger, injectLambdaContext } = require('@aws-lambda-powertools/logger');
const { Tracer, captureLambdaHandler } = require('@aws-lambda-powertools/tracer');
const { Metrics, logMetrics, MetricUnits } = require('@aws-lambda-powertools/metrics');

const componentName = 'step-functions';
const serviceName = 'video-on-demand-on-aws';

const logger = new Logger({
    serviceName: serviceName,
    logLevel: 'DEBUG',
    persistentLogAttributes: {
        component: componentName
    },
});

const loggerInjectLambdaContext = injectLambdaContext(logger, { clearState: true, logEvent: true });

const tracer = new Tracer({
    serviceName: serviceName,
});

tracer.putAnnotation('component', componentName);

const tracerCaptureLambdaHandler = captureLambdaHandler(tracer);

const metrics = new Metrics({
    serviceName: serviceName,
    namespace: 'awesome-company',
    defaultDimensions: {
        component: componentName
    },
});

const metricsLogMetrics = logMetrics(metrics, { captureColdStartMetric: true });

module.exports = {
    logger,
    tracer,
    metrics,
    loggerInjectLambdaContext,
    tracerCaptureLambdaHandler,
    metricsLogMetrics,
    MetricUnits
}