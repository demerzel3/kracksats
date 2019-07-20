import KrakenClient from 'kraken-api';
import {
    prop,
    min,
} from 'ramda';

import fetchWithdrawInfo from './fetchWithdrawInfo';

const requestWithdrawal = (client, { asset, key, amount }) =>
    client.api('Withdraw', {
        asset,
        key,
        amount,
    })
    .then(prop('result'));

export default (credentials, { asset, key, maxAmount }) => {
    const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET);

    return fetchWithdrawInfo(client, { asset, key })
        .then(({ limit, fee }) => {
            const amount = min(limit, maxAmount);

            return requestWithdrawal(client, { asset, key, amount })
                .then(({ refid }) => ({
                    refid,
                    asset,
                    amount,
                    fee,
                }));
        });
};
