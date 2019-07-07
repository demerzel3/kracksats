const {
    SES,
    SecretsManager,
} = require('aws-sdk');
const KrakenClient = require('kraken-api');
const {
    applySpec,
    prop,
    propOr,
    compose,
} = require('ramda');

const numberToString = require('./lib/numberToString');

const CRYPTO_SYMBOL = 'XXBT';

const {
    RECIPIENT,
    WITHDRAWAL_KEY,
    KRAKEN_CREDENTIALS_ARN,
} = process.env;

const ses = new SES();

const readSecretJson = arn =>
    (new SecretsManager()).getSecretValue({ SecretId: arn }).promise()
        .then(result => JSON.parse(result.SecretString));

const fetchWithdrawInfo = client =>
    client.api('WithdrawInfo', {
        asset: CRYPTO_SYMBOL,
        key: WITHDRAWAL_KEY,
        amount: 1,
    })
    .then(prop('result'))
    .then(applySpec({
        fee: compose(parseFloat, propOr('0', 'fee')),
        limit: compose(parseFloat, propOr('0', 'limit')),
    }));

exports.handler = (event, context) => {
    const {
        Records: [
            {
                Sns: {
                    Message,
                    MessageAttributes: {
                        type: {
                            Value: messageType,
                        },
                    },
                },
            },
        ],
    } = event;

    if (messageType !== 'orderCompleted') {
        return Promise.resolve(`Nothing to do here (messageType: ${messageType})`);
    }

    const {
        order: {
            vol_exec: amount,
            price,
        },
    } = JSON.parse(Message);

    return readSecretJson(KRAKEN_CREDENTIALS_ARN)
        .then((credentials) => {
            const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET);

            return fetchWithdrawInfo(client);
        })
        .then(({ limit: totalAmount, fee: withdrawFee }) => {
            const feePercent = ((withdrawFee / totalAmount) * 100).toFixed(2);
            const body =
`Hi!

I just bought ${amount} BTC @ €${price} on your behalf.

You have a total amount of ${numberToString(totalAmount)} BTC, you can withdraw them for a ${numberToString(withdrawFee)} BTC fee (${feePercent}%).
Respond with "Withdraw" to this message if you want to proceed.
`;

            const params = {
                Destination: {
                    ToAddresses: [RECIPIENT],
                },
                Message: {
                    Subject: {
                        Charset: 'UTF-8',
                        Data: 'Order completed',
                    },
                    Body: {
                        Text: {
                            Charset: 'UTF-8',
                            Data: body,
                        },
                    },
                },
                Source: 'Kracksats <kracksats@demerzel3.dev>',
            };

            return ses.sendEmail(params).promise();
        })
        .catch(e => console.error('Error sending notification mail', e));
};
