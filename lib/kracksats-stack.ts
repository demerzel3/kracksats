import * as cdk from '@aws-cdk/core'
import * as lambda from '@aws-cdk/aws-lambda'
import * as lambdaEventSources from '@aws-cdk/aws-lambda-event-sources'
import * as events from '@aws-cdk/aws-events'
import * as targets from '@aws-cdk/aws-events-targets'
import * as sns from '@aws-cdk/aws-sns'
import * as snsSubscriptions from '@aws-cdk/aws-sns-subscriptions'
import * as iam from '@aws-cdk/aws-iam'
import * as sqs from '@aws-cdk/aws-sqs'
import * as ses from '@aws-cdk/aws-ses'
import * as sesActions from '@aws-cdk/aws-ses-actions'
import * as s3 from '@aws-cdk/aws-s3'
import * as s3Notifications from '@aws-cdk/aws-s3-notifications'
import * as dynamodb from '@aws-cdk/aws-dynamodb'

const KRAKEN_CREDENTIALS_ARN =
  'arn:aws:secretsmanager:eu-west-1:932003549659:secret:prod/kraksats/credentials-A0C3o9'

export class KracksatsStack extends cdk.Stack {
  /**
   *
   * @param {cdk.Construct} scope
   * @param {string} id
   * @param {cdk.StackProps=} props
   */
  constructor(scope?: cdk.Construct, id?: string, props?: cdk.StackProps) {
    super(scope, id, props)

    const email = this.node.tryGetContext('email')
    if (!email) {
      throw new Error('Please specify an email.')
    }

    const withdrawalKey = this.node.tryGetContext('withdrawalKey')
    if (!withdrawalKey) {
      throw new Error('Please specify a withdrawalKey.')
    }

    const maximumPrice = this.node.tryGetContext('maximumPrice')
    const maximumAmount = this.node.tryGetContext('maximumAmount')

    const orderPlacedEventFilterPolicy = {
      type: sns.SubscriptionFilter.stringFilter({
        whitelist: ['orderPlaced'],
      }),
    }

    const orderPollerQueue = new sqs.Queue(this, 'OrderPollerQueue', {
      deliveryDelay: cdk.Duration.seconds(60),
    })

    const emailsTable = new dynamodb.Table(this, 'Emails', {
      partitionKey: {
        name: 'messageId',
        type: dynamodb.AttributeType.STRING,
      },
    })

    const pendingWithdrawalsTable = new dynamodb.Table(
      this,
      'PendingWithdrawals',
      {
        partitionKey: {
          name: 'refid',
          type: dynamodb.AttributeType.STRING,
        },
      }
    )

    const eventsTopic = new sns.Topic(this, 'KracksatsEvents', {
      displayName: 'KracksatsEvents',
    })
    eventsTopic.addSubscription(
      new snsSubscriptions.SqsSubscription(orderPollerQueue, {
        filterPolicy: orderPlacedEventFilterPolicy,
      })
    )

    const eventsLogger = new lambda.Function(this, 'EventsLogger', {
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: 14,
      handler: 'index.handler',
      code: new lambda.InlineCode(`
        exports.handler = (event, context, callback) => {
          const {
            Message,
            MessageAttributes: { type: { Value: messageType } },
          } = event.Records[0].Sns;

          console.log(JSON.stringify({
            type: messageType,
            body: JSON.parse(Message),
            raw: JSON.stringify(event),
          }, null, 2));

          return Promise.resolve();
        };
    `),
    })
    eventsLogger.addEventSource(
      new lambdaEventSources.SnsEventSource(eventsTopic)
    )

    const buyer = new lambda.Function(this, 'BuyerLambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: 14,
      code: lambda.Code.fromAsset('lambdas/dist/buyer'),
      timeout: cdk.Duration.seconds(4),
      handler: 'index.handler',
      environment: {
        KRAKEN_CREDENTIALS_ARN,
        EVENT_BUS_ARN: eventsTopic.topicArn,
        ...(maximumPrice ? { MAXIMUM_PRICE: maximumPrice } : {}),
        ...(maximumAmount ? { MAXIMUM_AMOUNT: maximumAmount } : {}),
      },
    })
    eventsTopic.grantPublish(buyer)

    const orderPoller = new lambda.Function(this, 'OrderPollerLambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: 14,
      code: lambda.Code.fromAsset('lambdas/dist/orderPoller'),
      timeout: cdk.Duration.seconds(4),
      handler: 'index.handler',
      environment: {
        KRAKEN_CREDENTIALS_ARN,
        QUEUE_URL: orderPollerQueue.queueUrl,
        EVENT_BUS_ARN: eventsTopic.topicArn,
      },
    })
    orderPoller.addEventSource(
      new lambdaEventSources.SqsEventSource(orderPollerQueue, {
        batchSize: 1,
      })
    )
    orderPollerQueue.grantSendMessages(orderPoller)
    eventsTopic.grantPublish(orderPoller)

    const notifier = new lambda.Function(this, 'NotifierLambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: 14,
      code: lambda.Code.fromAsset('lambdas/dist/notifier'),
      timeout: cdk.Duration.seconds(4),
      handler: 'index.handler',
      environment: {
        KRAKEN_CREDENTIALS_ARN,
        RECIPIENT: email,
        WITHDRAWAL_KEY: withdrawalKey,
        EMAILS_TABLE_NAME: emailsTable.tableName,
      },
    })
    notifier.addEventSource(new lambdaEventSources.SnsEventSource(eventsTopic))
    emailsTable.grant(notifier, 'dynamodb:GetItem', 'dynamodb:PutItem')

    const incomingEmailHandler = new lambda.Function(
      this,
      'IncomingEmailHandler',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        logRetention: 14,
        code: lambda.Code.fromAsset('lambdas/dist/incomingEmailHandler'),
        handler: 'index.handler',
        environment: {
          EMAILS_TABLE_NAME: emailsTable.tableName,
          EVENT_BUS_ARN: eventsTopic.topicArn,
        },
      }
    )
    emailsTable.grant(
      incomingEmailHandler,
      'dynamodb:GetItem',
      'dynamodb:PutItem'
    )
    eventsTopic.grantPublish(incomingEmailHandler)

    const incomingEmailParser = new lambda.Function(
      this,
      'IncomingEmailParser',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        logRetention: 14,
        code: lambda.Code.fromAsset('lambdas/dist/incomingEmailParser'),
        handler: 'index.handler',
        environment: {
          EVENT_BUS_ARN: eventsTopic.topicArn,
        },
      }
    )
    eventsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(incomingEmailParser, {
        filterPolicy: {
          type: sns.SubscriptionFilter.stringFilter({
            whitelist: ['emailReceived'],
          }),
        },
      })
    )
    eventsTopic.grantPublish(incomingEmailParser)

    const withdrawer = new lambda.Function(this, 'WithdrawerLambda', {
      runtime: lambda.Runtime.NODEJS_12_X,
      logRetention: 14,
      code: lambda.Code.fromAsset('lambdas/dist/withdrawer'),
      timeout: cdk.Duration.seconds(8),
      handler: 'index.handler',
      environment: {
        KRAKEN_CREDENTIALS_ARN,
        EVENT_BUS_ARN: eventsTopic.topicArn,
        WITHDRAWAL_KEY: withdrawalKey,
      },
    })
    eventsTopic.addSubscription(
      new snsSubscriptions.LambdaSubscription(withdrawer, {
        filterPolicy: {
          type: sns.SubscriptionFilter.stringFilter({
            whitelist: ['withdrawalRequested'],
          }),
        },
      })
    )
    eventsTopic.grantPublish(withdrawer)

    const withdrawalChecker = new lambda.Function(
      this,
      'WithdrawalCheckerLambda',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        logRetention: 14,
        code: lambda.Code.fromAsset('lambdas/dist/withdrawalChecker'),
        timeout: cdk.Duration.seconds(4),
        handler: 'index.handler',
        environment: {
          KRAKEN_CREDENTIALS_ARN,
          EVENT_BUS_ARN: eventsTopic.topicArn,
          REQUIRED_CONFIRMATIONS: String(6),
        },
      }
    )
    withdrawalChecker.addEventSource(
      new lambdaEventSources.SnsEventSource(eventsTopic)
    )
    eventsTopic.grantPublish(withdrawalChecker)

    const withdrawalTransitionHandler = new lambda.Function(
      this,
      'WithdrawalTransitionHandlerLambda',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        logRetention: 14,
        code: lambda.Code.fromAsset('lambdas/dist/withdrawalTransitionHandler'),
        handler: 'index.handler',
        environment: {
          PENDING_WITHDRAWALS_TABLE_NAME: pendingWithdrawalsTable.tableName,
        },
      }
    )
    withdrawalTransitionHandler.addEventSource(
      new lambdaEventSources.SnsEventSource(eventsTopic)
    )
    pendingWithdrawalsTable.grant(
      withdrawalTransitionHandler,
      'dynamodb:PutItem',
      'dynamodb:DeleteItem'
    )

    const withdrawalPendingEmitter = new lambda.Function(
      this,
      'WithdrawalPendingEmitterLambda',
      {
        runtime: lambda.Runtime.NODEJS_12_X,
        logRetention: 14,
        code: lambda.Code.fromAsset('lambdas/dist/withdrawalPendingEmitter'),
        handler: 'index.handler',
        environment: {
          EVENT_BUS_ARN: eventsTopic.topicArn,
          PENDING_WITHDRAWALS_TABLE_NAME: pendingWithdrawalsTable.tableName,
        },
      }
    )
    eventsTopic.grantPublish(withdrawalPendingEmitter)
    pendingWithdrawalsTable.grant(withdrawalPendingEmitter, 'dynamodb:Scan')

    const getKrakenCredentialsPolicy = new iam.PolicyStatement()
    getKrakenCredentialsPolicy.addResources(KRAKEN_CREDENTIALS_ARN)
    getKrakenCredentialsPolicy.addActions('secretsmanager:GetSecretValue')

    buyer.addToRolePolicy(getKrakenCredentialsPolicy)
    notifier.addToRolePolicy(getKrakenCredentialsPolicy)
    orderPoller.addToRolePolicy(getKrakenCredentialsPolicy)
    withdrawer.addToRolePolicy(getKrakenCredentialsPolicy)
    withdrawalChecker.addToRolePolicy(getKrakenCredentialsPolicy)

    const sendMailPolicy = new iam.PolicyStatement()
    sendMailPolicy.addResources(
      `arn:aws:ses:eu-west-1:932003549659:identity/${email}`,
      `arn:aws:ses:eu-west-1:932003549659:identity/demerzel3.dev`
    )
    sendMailPolicy.addActions('ses:SendEmail', 'ses:SendRawEmail')

    notifier.addToRolePolicy(sendMailPolicy)
    incomingEmailHandler.addToRolePolicy(sendMailPolicy)

    const emailsFilter = new lambda.Function(this, 'EmailsFilter', {
      runtime: lambda.Runtime.NODEJS_12_X,
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
    })

    const incomingEmailsBucket = new s3.Bucket(this, 'IncomingEmailsBucket')
    incomingEmailsBucket.addObjectCreatedNotification(
      new s3Notifications.LambdaDestination(incomingEmailHandler)
    )
    incomingEmailsBucket.grantRead(incomingEmailHandler)
    incomingEmailsBucket.grantDelete(incomingEmailHandler)

    new ses.ReceiptRuleSet(this, 'RuleSet', {
      dropSpam: false,
      rules: [
        {
          actions: [
            new sesActions.Lambda({
              function: emailsFilter,
              invocationType: sesActions.LambdaInvocationType.REQUEST_RESPONSE,
            }),
            new sesActions.S3({
              bucket: incomingEmailsBucket,
            }),
          ],
        },
      ],
    })

    // Run buyer every hour at minute 42.
    const buyerTicker = new events.Rule(this, 'BuyerTicker', {
      schedule: events.Schedule.cron({
        minute: '42',
      }),
    })
    buyerTicker.addTarget(new targets.LambdaFunction(buyer))

    // Run withdrawal pending emitter every 10 minutes.
    const withdrawalPendingTicker = new events.Rule(
      this,
      'WithdrawalPendingTicker',
      {
        schedule: events.Schedule.cron({
          minute: '*/5',
        }),
      }
    )
    withdrawalPendingTicker.addTarget(
      new targets.LambdaFunction(withdrawalPendingEmitter)
    )
  }
}
