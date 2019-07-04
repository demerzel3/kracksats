const {
    SecretsManager,
} = require('aws-sdk');

const buy = require('./lib/buy');

exports.handler = (event, context) => {
    const {
        KRAKEN_CREDENTIALS_ARN,
    } = process.env;

    const secretsManager = new SecretsManager();

    return secretsManager.getSecretValue({ SecretId: KRAKEN_CREDENTIALS_ARN }).promise()
        .then(result => JSON.parse(result.SecretString))
        .then(buy);
};
