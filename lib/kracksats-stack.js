const cdk = require('@aws-cdk/core');
const lambda = require('@aws-cdk/aws-lambda');
const lambdaEventSources = require('@aws-cdk/aws-lambda-event-sources');
const kms = require('@aws-cdk/aws-kms');
const ssm = require('@aws-cdk/aws-ssm');
const events = require('@aws-cdk/aws-events');
const targets = require('@aws-cdk/aws-events-targets');
const sns = require('@aws-cdk/aws-sns');
const snsSubscriptions = require('@aws-cdk/aws-sns-subscriptions');
const iam = require('@aws-cdk/aws-iam');
const sqs = require('@aws-cdk/aws-sqs');

const KRAKEN_CREDENTIALS_ARN = 'arn:aws:secretsmanager:eu-west-1:932003549659:secret:prod/kraksats/credentials-A0C3o9';

class KracksatsStack extends cdk.Stack {
    /**
     *
     * @param {cdk.Construct} scope
     * @param {string} id
     * @param {cdk.StackProps=} props
     */
    constructor(scope, id, props) {
        super(scope, id, props);

        const email = this.node.tryGetContext('email');

        const orderPlacedEventFilterPolicy = {
            type: sns.SubscriptionFilter.stringFilter({
                whitelist: ['orderPlaced'],
            }),
        };

        const orderCompletedEventFilterPolicy = {
            type: sns.SubscriptionFilter.stringFilter({
                whitelist: ['orderCompleted'],
            }),
        };

        const orderPollerQueue = new sqs.Queue(this, 'OrderPollerQueue', {
            deliveryDelay: cdk.Duration.seconds(60),
        });

        const eventsTopic = new sns.Topic(this, 'KracksatsEvents', {
            displayName: 'KracksatsEvents',
        });
        eventsTopic.addSubscription(new snsSubscriptions.SqsSubscription(orderPollerQueue, {
            filterPolicy: orderPlacedEventFilterPolicy,
        }));
        if (email) {
            eventsTopic.addSubscription(new snsSubscriptions.EmailSubscription(email, {
                filterPolicy: orderCompletedEventFilterPolicy,
            }));
        }

        const lambdasCode = lambda.Code.asset('lambdas');

        const buyer = new lambda.Function(this, 'BuyerLambda', {
            runtime: lambda.Runtime.NODEJS_10_X,
            code: lambdasCode,
            timeout: cdk.Duration.seconds(4),
            handler: 'src/buyer.handler',
            environment: {
                NODE_OPTIONS: '-r ./.pnp.js',
                KRAKEN_CREDENTIALS_ARN,
            },
        });
        eventsTopic.grantPublish(buyer);

        const orderPoller = new lambda.Function(this, 'OrderPollerLambda', {
            runtime: lambda.Runtime.NODEJS_10_X,
            code: lambdasCode,
            timeout: cdk.Duration.seconds(4),
            handler: 'src/orderPoller.handler',
            environment: {
                NODE_OPTIONS: '-r ./.pnp.js',
                KRAKEN_CREDENTIALS_ARN,
                QUEUE_URL: orderPollerQueue.queueUrl,
                EVENT_BUS_ARN: eventsTopic.topicArn,
            },
        });
        orderPoller.addEventSource(new lambdaEventSources.SqsEventSource(orderPollerQueue, {
            batchSize: 1,
        }));
        orderPollerQueue.grantSendMessages(orderPoller);
        eventsTopic.grantPublish(orderPoller);

        const getKrakenCredentialsPolicy = new iam.PolicyStatement();
        getKrakenCredentialsPolicy.addResources(KRAKEN_CREDENTIALS_ARN);
        getKrakenCredentialsPolicy.addActions('secretsmanager:GetSecretValue');

        buyer.addToRolePolicy(getKrakenCredentialsPolicy);
        orderPoller.addToRolePolicy(getKrakenCredentialsPolicy);
    }
}

module.exports = { KracksatsStack }
