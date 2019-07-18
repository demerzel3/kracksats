import aws from 'aws-sdk';
import KrakenClient from 'kraken-api';
import {
    allPass,
    applySpec,
    compose,
    cond,
    pathEq,
    prop,
    propEq,
    propOr,
    T,
} from 'ramda';

import numberToString from './lib/numberToString';
import readSecretJson from './lib/readSecretJson';
import unwrapSnsEvent from './lib/unwrapSnsEvent';
import storeEmail from './lib/storeEmail';

const CRYPTO_SYMBOL = 'XXBT';

const {
    RECIPIENT,
    WITHDRAWAL_KEY,
    KRAKEN_CREDENTIALS_ARN,
    EMAILS_TABLE_NAME,
} = process.env;

const ses = new aws.SES();

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

const sendOrderCompletedEmail = ({
    order: {
        vol_exec: amount,
        price,
    },
}) => readSecretJson(KRAKEN_CREDENTIALS_ARN)
    .then((credentials) => {
        const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET);

        return fetchWithdrawInfo(client);
    })
    .then(({ limit: totalAmount, fee: withdrawFee }) => {
        const feePercent = ((withdrawFee / totalAmount) * 100).toFixed(2);
        const subject = 'Order completed';
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
                    Data: subject,
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

        return ses.sendEmail(params).promise().then(({ MessageId }) => ({
            messageId: MessageId,
            to: RECIPIENT,
            subject,
            body,
        }));
    });

const sendWithdrawalInitiatedEmail = () => {
    const subject = 'Withdrawal initiated';
    const body =
`Hi!

The withdrawal you have request has started, I will ping you when it hits the blockchain.
`;

    const params = {
        Destination: {
            ToAddresses: [RECIPIENT],
        },
        Message: {
            Subject: {
                Charset: 'UTF-8',
                Data: subject,
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

    return ses.sendEmail(params).promise().then(({ MessageId }) => ({
        messageId: MessageId,
        to: RECIPIENT,
        subject,
        body,
    }));
};

const isOrderCompleted = propEq('type', 'orderCompleted');
const isWithdrawalInitiated = allPass([
    propEq('type', 'withdrawalTransition'),
    pathEq(['body', 'withdrawalStatus'], 'pendingExchange'),
]);

exports.handler = (event, context) => {
    const snsEvent = unwrapSnsEvent(event);
    const emailPromise = cond([
        [isOrderCompleted, ({ body }) => sendOrderCompletedEmail(body)],
        [isWithdrawalInitiated, ({ body }) => sendWithdrawalInitiatedEmail(body)],
        [T, ({ type }) => Promise.resolve(`Nothing to do here (event type: ${type})`)],
    ])(snsEvent)

    return emailPromise
        .then(emailDetails =>
            storeEmail(EMAILS_TABLE_NAME, emailDetails)
                .then(() => emailDetails)
                .catch(e => console.error('Error storing notification email', emailDetails, e))
        )
        .catch(e => console.error('Error sending notification mail', e));
};
