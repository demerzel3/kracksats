import aws from 'aws-sdk';
import { tap } from 'ramda';

import withdraw from './lib/withdraw';
import unwrapSnsEvent from './lib/unwrapSnsEvent';
import readSecretJson from './lib/readSecretJson';

const CRYPTO_SYMBOL = 'XXBT';

const {
    KRAKEN_CREDENTIALS_ARN,
    EVENT_BUS_ARN,
    WITHDRAWAL_KEY,
} = process.env;

const sns = new aws.SNS();

const publishWithdrawalTransitionEvent = event => sns.publish({
    TopicArn: EVENT_BUS_ARN,
    Message: JSON.stringify(event),
    MessageAttributes: {
        type: {
            DataType: 'String',
            StringValue: 'withdrawalTransition',
        },
    },
}).promise();

exports.handler = (event, context) => {
    const {
        body: {
            sourceType,
            sourceId,
        },
    } = unwrapSnsEvent(event);

    return readSecretJson(KRAKEN_CREDENTIALS_ARN)
        .then(credentials => withdraw(credentials, {
            asset: CRYPTO_SYMBOL,
            maxAmount: Infinity,
            key: WITHDRAWAL_KEY,
        }))
        .then(tap(withdrawal => console.log('New withdrawal', JSON.stringify(withdrawal, null, 2))))
        .then(withdrawal => publishWithdrawalTransitionEvent({
            withdrawal,
            prevWithdrawalStatus: null,
            withdrawalStatus: 'pendingExchange',
            sourceType,
            sourceId,
        }));
};
