import KrakenClient from 'kraken-api'

import floor from './floor'
import {
  AboveMaximumPriceError,
  BelowMinimumAmountError,
  OTPNeededError,
} from './errors'
import { Order } from '../shared/types'

const MIN_ORDER_AMOUNT = 0.002
const ORDER_PRECISION = 8
const ORDER_FEES = 0.0016

const fetchFiatBalance: (client: KrakenClient) => Promise<number> = (client) =>
  client
    .api('Balance')
    .then(({ result }) => result?.ZEUR || '0')
    .then(parseFloat)

const fetchCryptoBidPrice: (client: KrakenClient) => Promise<number> = (
  client
) =>
  client
    .api('Ticker', { pair: 'XXBTZEUR' })
    .then(({ result }) => result?.XXBTZEUR?.b[0])
    .then((bidAmount) => (bidAmount ? parseFloat(bidAmount) : Infinity))

const placeOrder: (
  client: KrakenClient,
  price: number,
  orderAmount: number
) => Promise<Order> = (client, price, orderAmount) => {
  const order = {
    pair: 'XXBTZEUR',
    type: 'buy',
    ordertype: 'limit',
    price,
    volume: orderAmount,
  } as const

  return client
    .api('AddOrder', order)
    .then(({ result }) => result?.txid || [])
    .then((txids) => ({ txid: txids[0] || '', txids: txids, ...order }))
}

const computeOrderAmount: (
  initialBalance: number,
  bidPrice: number
) => number = (initialBalance, bidPrice) =>
  floor(ORDER_PRECISION, (initialBalance * (1 - ORDER_FEES)) / bidPrice)

const buy: (
  credentials: {
    API_KEY: string
    API_SECRET: string
    READONLY_API_KEY: string
    READONLY_API_SECRET: string
  },
  options?: { otp?: string; maximumPrice?: number; maximumAmount?: number }
) => Promise<Order> = (credentials, options = {}) => {
  const { otp, maximumPrice, maximumAmount } = {
    ...options,
    maximumPrice: options.maximumPrice || Infinity,
    maximumAmount: options.maximumAmount || Infinity,
  }
  const readClient = new KrakenClient(
    credentials.READONLY_API_KEY,
    credentials.READONLY_API_SECRET
  )

  return Promise.all([
    fetchFiatBalance(readClient),
    fetchCryptoBidPrice(readClient),
  ]).then(([fiatBalance, cryptoBidPrice]) => {
    const orderAmount = computeOrderAmount(
      Math.min(fiatBalance, maximumAmount),
      cryptoBidPrice
    )

    console.log(
      JSON.stringify({
        fiatBalance,
        fiatBalanceMinusFees: fiatBalance * (1 - ORDER_FEES),
        cryptoBidPrice,
        orderAmount,
        otp,
      })
    )

    if (cryptoBidPrice > maximumPrice) {
      throw new AboveMaximumPriceError(maximumPrice, cryptoBidPrice)
    } else if (orderAmount < MIN_ORDER_AMOUNT) {
      throw new BelowMinimumAmountError(orderAmount)
    } else if (!otp) {
      throw new OTPNeededError(orderAmount, cryptoBidPrice)
    } else {
      const client = new KrakenClient(
        credentials.API_KEY,
        credentials.API_SECRET,
        {
          otp,
        }
      )

      return placeOrder(client, cryptoBidPrice, orderAmount)
    }
  })
}

export default buy
