import KrakenClient from 'kraken-api'
import { path, tap } from 'ramda'

import { OrderPendingError } from './errors'

const fetchOrder = (client, orderId) =>
  client.api('QueryOrders', { txid: orderId }).then(path(['result', orderId]))
const checkOrderStatus = (credentials, orderId) => {
  const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET)

  return fetchOrder(client, orderId)
    .then(
      tap((order) => {
        if (
          (order.status === 'pending' || order.status === 'open') &&
          order.vol_exec !== order.vol
        ) {
          console.log('Order still pending', orderId, order)
          throw new OrderPendingError(orderId)
        }
      })
    )
    .then((order) => ({
      txid: orderId,
      ...order,
    }))
}

export default checkOrderStatus
