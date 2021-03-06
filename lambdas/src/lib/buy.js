import KrakenClient from 'kraken-api'
import { path, pathOr, applySpec, propOr, min, head } from 'ramda'

import floor from './floor'
import { AboveMaximumPriceError, BelowMinimumAmountError } from './errors'

const FIAT_SYMBOL = 'ZEUR'
const CRYPTO_SYMBOL = 'XXBT'
const MIN_ORDER_AMOUNT = 0.002
const ORDER_PRECISION = 8
const ORDER_FEES = 0.0016

const fetchFiatBalance = (client) =>
  client
    .api('Balance')
    .then(pathOr(0, ['result', FIAT_SYMBOL]))
    .then(parseFloat)

const fetchCryptoBidPrice = (client) =>
  client
    .api('Ticker', { pair: `${CRYPTO_SYMBOL}${FIAT_SYMBOL}` })
    .then(
      pathOr(Infinity, ['result', `${CRYPTO_SYMBOL}${FIAT_SYMBOL}`, 'b', 0])
    )
    .then(parseFloat)

const placeOrder = (client, price, orderAmount) => {
  const order = {
    pair: `${CRYPTO_SYMBOL}${FIAT_SYMBOL}`,
    type: 'buy',
    ordertype: 'limit',
    price,
    volume: orderAmount,
  }

  return client
    .api('AddOrder', order)
    .then(path(['result', 'txid']))
    .then((txids) => ({ txid: head(txids), txids: txids, ...order }))
}

const computeOrderAmount = (initialBalance, bidPrice) =>
  floor(ORDER_PRECISION, (initialBalance * (1 - ORDER_FEES)) / bidPrice)

const buy = (credentials, options) => {
  const { maximumPrice, maximumAmount } = applySpec({
    maximumPrice: propOr(Infinity, 'maximumPrice'),
    maximumAmount: propOr(Infinity, 'maximumAmount'),
  })(options)
  const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET)

  return Promise.all([
    fetchFiatBalance(client),
    fetchCryptoBidPrice(client),
  ]).then(([fiatBalance, cryptoBidPrice]) => {
    const orderAmount = computeOrderAmount(
      min(fiatBalance, maximumAmount),
      cryptoBidPrice
    )

    console.log(
      JSON.stringify({
        fiatBalance,
        fiatBalanceMinusFees: fiatBalance * (1 - ORDER_FEES),
        cryptoBidPrice,
        orderAmount,
      })
    )

    if (cryptoBidPrice > maximumPrice) {
      throw new AboveMaximumPriceError(maximumPrice, cryptoBidPrice)
    } else if (orderAmount < MIN_ORDER_AMOUNT) {
      throw new BelowMinimumAmountError(orderAmount)
    } else {
      return placeOrder(client, cryptoBidPrice, orderAmount)
    }
  })
}

export default buy
