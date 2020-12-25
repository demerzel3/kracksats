import numberToString from './numberToString'

class AboveMaximumPriceError extends Error {
  constructor(maximumPrice, currentPrice) {
    super(`BTC price of €${currentPrice} is above maximum (€${maximumPrice})`)
  }
}

class BelowMinimumAmountError extends Error {
  constructor(amount) {
    super(`${numberToString(amount)} is below minimum order`)
  }
}

class OrderPendingError extends Error {
  constructor(orderId) {
    super(`The order ${orderId} is still pending`)
  }
}

class WithdrawalNotFoundError extends Error {
  constructor(withdrawalId, asset) {
    super(`The withdrawal ${withdrawalId} (asset ${asset}) couldn't be found`)
  }
}

class WithdrawalNoTransactionError extends Error {
  constructor(withdrawalId, asset) {
    super(
      `The withdrawal ${withdrawalId} (asset ${asset}) doesn't have a transaction id yet`
    )
  }
}

export {
  AboveMaximumPriceError,
  BelowMinimumAmountError,
  OrderPendingError,
  WithdrawalNotFoundError,
  WithdrawalNoTransactionError,
}
