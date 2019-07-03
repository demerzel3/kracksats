const {
    SecretsManager,
    SQS,
} = require('aws-sdk')

const handleError = require('./src/lib/handleError');
const {
    OrderPendingError,
    checkOrderStatus,
} = require('./src/orderPoller');

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

exports.handler = (event, context) => {
    const {
        KRAKEN_CREDENTIALS_ARN,
        QUEUE_URL,
    } = process.env;

    const secretsManager = new SecretsManager();
    const sqs = new SQS();

    return secretsManager.getSecretValue({ SecretId: KRAKEN_CREDENTIALS_ARN }).promise()
        .then(result => JSON.parse(result.SecretString))
        .then(credentials => {
            const unwrappedEvent = unwrapQueueEvent(event);
            const {
                order: {
                    txid: orderId,
                },
            } = unwrappedEvent;
            console.log(unwrappedEvent);

            return checkOrderStatus(credentials, orderId)
                .then(order => {
                    console.log(order);
                    // TODO: broadcast "orderCompleted" event.
                    return order;
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
