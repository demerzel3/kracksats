export type Order = {
  pair: 'XXBTZEUR'
  type: 'buy'
  ordertype: 'limit'
  price: number
  volume: number
  txid: string
  txids: string[]
}

export type BuyerEvent = {
  otp?: string
}
