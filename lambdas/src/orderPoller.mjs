import aws from 'aws-sdk';

import handleError from './lib/handleError';
import { OrderPendingError } from './lib/errors';
import checkOrderStatus from './lib/checkOrderStatus';

const {
    KRAKEN_CREDENTIALS_ARN,
    QUEUE_URL,
    EVENT_BUS_ARN,
} = process.env;

const unwrapQueueEvent = (event) => {
    const {
        Records: [
            {
                eventSource,
                body,
            },
        ],
    } = event;

    if (eventSource !== 'aws:sqs') {
        throw new Error(`Unexpected event ${JSON.stringify(event)}`);
    }

    const parsedBody = JSON.parse(body);

    return parsedBody.Message
        ? JSON.parse(parsedBody.Message)
        : parsedBody;
};

const publishOrderCompletedEvent = (sns, order) => sns.publish({
    TopicArn: EVENT_BUS_ARN,
    Message: JSON.stringify({
        order,
    }),
    MessageAttributes: {
        type: {
            DataType: 'String',
            StringValue: 'orderCompleted',
        },
    },
}).promise();

exports.handler = (event, context) => {
    const secretsManager = new aws.SecretsManager();
    const sqs = new aws.SQS();
    const sns = new aws.SNS();

    return secretsManager.getSecretValue({ SecretId: KRAKEN_CREDENTIALS_ARN }).promise()
        .then(result => JSON.parse(result.SecretString))
        .then(credentials => {
            const unwrappedEvent = unwrapQueueEvent(event);
            const {
                order: {
                    txid: orderId,
                },
            } = unwrappedEvent;
            console.log(JSON.stringify(unwrappedEvent, null, 2));

            return checkOrderStatus(credentials, orderId)
                .then(order => {
                    console.log(JSON.stringify(order, null, 2));

                    return publishOrderCompletedEvent(sns, order)
                        .then(() => order);
                })
                .catch(handleError(OrderPendingError, e =>
                    sqs.sendMessage({
                        MessageBody: JSON.stringify(unwrappedEvent),
                        QueueUrl: QUEUE_URL,
                    })
                    .promise()
                    .then(() => e.message)
                ))
                .catch(e => console.error(e));
        });
};
