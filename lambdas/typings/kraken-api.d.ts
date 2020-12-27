declare module 'kraken-api' {
  type Symbols = 'ZEUR' | 'XXBT'
  type Pairs = 'XXBTZEUR'

  type BalanceResponse = {
    result?: {
      [sym in Symbols]?: string
    }
  }

  type TickerResponse = {
    result?: {
      [pair in Pairs]?: {
        a: [string, string, string]
        b: [string, string, string]
        c: [string, string]
        v: [string, string]
        p: [string, string]
        t: [number, number]
        l: [string, string]
        h: [string, string]
        o: string
      }
    }
  }

  type AddOrderRequest = {
    pair: 'XXBTZEUR'
    type: 'buy'
    ordertype: 'limit'
    price: number
    volume: number
  }

  type AddOrderResponse = {
    result?: {
      txid: string[]
    }
  }

  class KrakenClient {
    constructor(
      key: string,
      secret: string,
      options?: {
        otp?: string
        timeout?: number
      }
    )

    api(method: 'Balance'): Promise<BalanceResponse>
    api(method: 'Ticker', params: { pair: Pairs }): Promise<TickerResponse>
    api(method: 'AddOrder', request: AddOrderRequest): Promise<AddOrderResponse>
  }

  export = KrakenClient
}
