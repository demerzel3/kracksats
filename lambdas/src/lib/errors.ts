import numberToString from './numberToString'

export class AboveMaximumPriceError extends Error {
  constructor(maximumPrice: number, currentPrice: number) {
    super(`BTC price of €${currentPrice} is above maximum (€${maximumPrice})`)
  }
}

export class BelowMinimumAmountError extends Error {
  constructor(amount: number) {
    super(`${numberToString(amount)} is below minimum order`)
  }
}

export class OTPNeededError extends Error {
  readonly amount: number
  readonly price: number

  constructor(amount: number, price: number) {
    super(
      `OTP needed to place order to buy ${numberToString(
        amount
      )} BTC @ €${price.toFixed(2)}`
    )

    this.amount = amount
    this.price = price
  }
}

export class OrderPendingError extends Error {
  constructor(orderId: string) {
    super(`The order ${orderId} is still pending`)
  }
}

export class WithdrawalNotFoundError extends Error {
  constructor(withdrawalId: string, asset: 'XXBT') {
    super(`The withdrawal ${withdrawalId} (asset ${asset}) couldn't be found`)
  }
}

export class WithdrawalNoTransactionError extends Error {
  constructor(withdrawalId: string, asset: 'XXBT') {
    super(
      `The withdrawal ${withdrawalId} (asset ${asset}) doesn't have a transaction id yet`
    )
  }
}
