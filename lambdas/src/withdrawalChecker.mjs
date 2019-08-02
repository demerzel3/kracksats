import aws from 'aws-sdk';
import { tap } from 'ramda';

import handleError from './lib/handleError';
import { WithdrawalNotFoundError, WithdrawalNoTransactionError } from './lib/errors';
import fetchWithdrawalTransactionId from './lib/fetchWithdrawalTransactionId';
import fetchTransactionStatus from './lib/fetchTransactionStatus';
import unwrapSnsEvent from './lib/unwrapSnsEvent';
import readSecretJson from './lib/readSecretJson';

const {
    KRAKEN_CREDENTIALS_ARN,
    EVENT_BUS_ARN,
    REQUIRED_CONFIRMATIONS,
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
    const { type, body } = unwrapSnsEvent(event);

    if (type !== 'withdrawalPending') {
        return Promise.resolve(`Nothing to do here (event type: ${type})`);
    }

    const {
        withdrawal,
        withdrawalStatus,
        sourceType,
        sourceId,
    } = body;
    const { asset, refid: withdrawalId, txid: transactionId } = withdrawal;

    if (withdrawalStatus === 'pendingExchange') {
        return readSecretJson(KRAKEN_CREDENTIALS_ARN)
            .then(credentials => fetchWithdrawalTransactionId(credentials, { asset, withdrawalId }))
            .then(tap((transactionId) => {
                console.log(`Withdrawal ${withdrawalId} associated transaction is ${transactionId}`);
            }))
            .then(transactionId => publishWithdrawalTransitionEvent({
                withdrawal: {
                    ...withdrawal,
                    txid: transactionId,
                },
                prevWithdrawalStatus: 'pendingExchange',
                withdrawalStatus: 'pendingChain',
                sourceType,
                sourceId,
            }))
            .catch(handleError(WithdrawalNotFoundError, e => console.error(e.message)))
            .catch(handleError(WithdrawalNoTransactionError, e => console.error(e.message)));
    } else if (withdrawalStatus === 'pendingChain') {
        return fetchTransactionStatus(transactionId)
            .then((transactionStatus) => {
                console.log(`Transaction ${transactionId} status`, JSON.stringify(transactionStatus, null, 2));

                if (transactionStatus.confirmations >= parseInt(REQUIRED_CONFIRMATIONS)) {
                    return publishWithdrawalTransitionEvent({
                        withdrawal,
                        transactionStatus,
                        prevWithdrawalStatus: 'pendingChain',
                        withdrawalStatus: 'confirmed',
                        sourceType,
                        sourceId,
                    });
                }
            });
    } else {
        return Promise.resolve(`Nothing to do here (withdrawal status: ${withdrawalStatus})`);
    }
};
