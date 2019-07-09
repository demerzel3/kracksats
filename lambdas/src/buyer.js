const {
    SecretsManager,
    SNS,
} = require('aws-sdk');

const buy = require('./lib/buy');
const handleError = require('./lib/handleError');
const { AboveMaximumPriceError, BelowMinimumAmountError } = require('./lib/errors');

const {
    EVENT_BUS_ARN,
} = process.env;

const publishOrderPlacedEvent = (sns, order) => sns.publish({
    TopicArn: EVENT_BUS_ARN,
    Message: JSON.stringify({
        order,
    }),
    MessageAttributes: {
        type: {
            DataType: 'String',
            StringValue: 'orderPlaced',
        },
    },
}).promise();

exports.handler = (event, context) => {
    const {
        KRAKEN_CREDENTIALS_ARN,
        MAXIMUM_PRICE,
        MAXIMUM_AMOUNT,
    } = process.env;

    const secretsManager = new SecretsManager();
    const sns = new SNS();

    return secretsManager.getSecretValue({ SecretId: KRAKEN_CREDENTIALS_ARN }).promise()
        .then(result => JSON.parse(result.SecretString))
        .then(credentials => buy(credentials, {
            maximumPrice: parseFloat(MAXIMUM_PRICE),
            maximumAmount: parseFloat(MAXIMUM_AMOUNT),
        }))
        .then(order => publishOrderPlacedEvent(sns, order))
        .catch(handleError(AboveMaximumPriceError, e => console.error(e)))
        .catch(handleError(BelowMinimumAmountError, e => console.error(e)));
};
