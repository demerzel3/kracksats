import fetchWithdrawalTransactionId from './lib/fetchWithdrawalTransactionId';
import fetchTransactionStatus from './lib/fetchTransactionStatus';

const {
    env: {
        API_KEY,
        API_SECRET,
    },
    argv: [
        ,
        ,
        withdrawalId,
    ]
} = process;

fetchWithdrawalTransactionId({ API_KEY, API_SECRET }, { withdrawalId, asset: 'XXBT' })
    .then(console.log)
    .then(fetchTransactionStatus)
    .then(console.log)
    .catch(console.error);
