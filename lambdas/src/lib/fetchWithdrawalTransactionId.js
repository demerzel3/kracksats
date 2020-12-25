import KrakenClient from 'kraken-api'
import { compose, find, isNil, prop, propEq, when } from 'ramda'

import { WithdrawalNotFoundError, WithdrawalNoTransactionError } from './errors'

export default (credentials, { withdrawalId, asset }) => {
  const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET)

  return client
    .api('WithdrawStatus', { asset })
    .then(
      compose(
        when(isNil, () =>
          Promise.reject(new WithdrawalNotFoundError(withdrawalId, asset))
        ),
        find(propEq('refid', withdrawalId)),
        prop('result')
      )
    )
    .then(
      compose(
        when(isNil, () =>
          Promise.reject(new WithdrawalNoTransactionError(withdrawalId, asset))
        ),
        prop('txid')
      )
    )
}
