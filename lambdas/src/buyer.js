const {
    SecretsManager,
} = require('aws-sdk');

const buy = require('./lib/buy');
const handleError = require('./lib/handleError');
const { AboveMaximumPriceError, BelowMinimumAmountError } = require('./lib/errors');

exports.handler = (event, context) => {
    const {
        KRAKEN_CREDENTIALS_ARN,
        MAXIMUM_PRICE,
    } = process.env;

    const secretsManager = new SecretsManager();

    return secretsManager.getSecretValue({ SecretId: KRAKEN_CREDENTIALS_ARN }).promise()
        .then(result => JSON.parse(result.SecretString))
        .then(credentials => buy(credentials, { maximumPrice: parseFloat(MAXIMUM_PRICE) }))
        .catch(handleError(AboveMaximumPriceError, e => console.error(e)))
        .catch(handleError(BelowMinimumAmountError, e => console.error(e)));
};
