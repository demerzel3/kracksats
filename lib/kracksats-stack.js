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
const ses = require('@aws-cdk/aws-ses');
const s3 = require('@aws-cdk/aws-s3');
const s3Notifications = require('@aws-cdk/aws-s3-notifications');

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
        if (!email) {
            throw new Error('Please specify an email.');
        }

        const domain = this.node.tryGetContext('domain');
        if (!domain) {
            throw new Error('Please specify a domain.');
        }

        const withdrawalKey = this.node.tryGetContext('withdrawalKey');
        if (!withdrawalKey) {
            throw new Error('Please specify a withdrawalKey.');
        }

        const orderPlacedEventFilterPolicy = {
            type: sns.SubscriptionFilter.stringFilter({
                whitelist: ['orderPlaced'],
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

        const lambdasCode = lambda.Code.asset('lambdas');

        const buyer = new lambda.Function(this, 'BuyerLambda', {
            runtime: lambda.Runtime.NODEJS_10_X,
            logRetention: 14,
            code: lambdasCode,
            timeout: cdk.Duration.seconds(4),
            handler: 'src/buyer.handler',
            environment: {
                NODE_OPTIONS: '-r ./.pnp.js',
                KRAKEN_CREDENTIALS_ARN,
                MAXIMUM_PRICE: String(10000),
            },
        });
        eventsTopic.grantPublish(buyer);

        const orderPoller = new lambda.Function(this, 'OrderPollerLambda', {
            runtime: lambda.Runtime.NODEJS_10_X,
            logRetention: 14,
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

        const notifier = new lambda.Function(this, 'NotifierLambda', {
            runtime: lambda.Runtime.NODEJS_10_X,
            logRetention: 14,
            code: lambdasCode,
            timeout: cdk.Duration.seconds(4),
            handler: 'src/notifier.handler',
            environment: {
                NODE_OPTIONS: '-r ./.pnp.js',
                KRAKEN_CREDENTIALS_ARN,
                RECIPIENT: email,
                WITHDRAWAL_KEY: withdrawalKey,
            },
        });
        notifier.addEventSource(new lambdaEventSources.SnsEventSource(eventsTopic));

        const incomingEmailHandler = new lambda.Function(this, 'IncomingEmailHandler', {
            runtime: lambda.Runtime.NODEJS_10_X,
            logRetention: 14,
            code: lambdasCode,
            handler: 'src/incomingEmailHandler.handler',
            environment: {
                NODE_OPTIONS: '-r ./.pnp.js',
            },
        });

        const getKrakenCredentialsPolicy = new iam.PolicyStatement();
        getKrakenCredentialsPolicy.addResources(KRAKEN_CREDENTIALS_ARN);
        getKrakenCredentialsPolicy.addActions('secretsmanager:GetSecretValue');

        buyer.addToRolePolicy(getKrakenCredentialsPolicy);
        notifier.addToRolePolicy(getKrakenCredentialsPolicy);
        orderPoller.addToRolePolicy(getKrakenCredentialsPolicy);

        const sendMailPolicy = new iam.PolicyStatement();
        sendMailPolicy.addResources(
            `arn:aws:ses:eu-west-1:932003549659:identity/${email}`,
            `arn:aws:ses:eu-west-1:932003549659:identity/${domain}`,
        );
        sendMailPolicy.addActions('ses:SendEmail', 'ses:SendRawEmail');

        notifier.addToRolePolicy(sendMailPolicy);
        incomingEmailHandler.addToRolePolicy(sendMailPolicy);

        const emailsFilter = new lambda.Function(this, 'EmailsFilter', {
            runtime: lambda.Runtime.NODEJS_8_10,
            logRetention: 14,
            handler: 'index.handler',
            code: new lambda.InlineCode(`
                exports.handler = (event, context, callback) => {
                    const mail = event.Records[0].ses.mail;
                    const validDestinations = mail.destination
                        .filter(address => address.toLowerCase() === 'kracksats@demerzel3.dev');

                    if (validDestinations.length > 0) {
                        callback(null, null);
                    } else {
                        callback(null, {'disposition':'STOP_RULE_SET'});
                    }
                };
            `),
        });

        const incomingEmailsBucket = new s3.Bucket(this, 'IncomingEmailsBucket');
        incomingEmailsBucket.addObjectCreatedNotification(
            new s3Notifications.LambdaDestination(incomingEmailHandler)
        );
        incomingEmailsBucket.grantRead(incomingEmailHandler);
        incomingEmailsBucket.grantDelete(incomingEmailHandler);

        new ses.ReceiptRuleSet(this, "RuleSet", {
            dropSpam: false,
            rules: [
                {
                    actions: [
                        new ses.ReceiptRuleLambdaAction({
                            function: emailsFilter,
                            invocationType: ses.LambdaInvocationType.REQUEST_RESPONSE,
                        }),
                        new ses.ReceiptRuleS3Action({
                            bucket: incomingEmailsBucket,
                        }),
                    ],
                }
            ]
        });
    }
}

module.exports = { KracksatsStack }
