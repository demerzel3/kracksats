const numberToString = require('./numberToString');

class AboveMaximumPriceError extends Error {
    constructor(maximumPrice, currentPrice) {
        super(`BTC price of €${currentPrice} is above maximum (€${maximumPrice})`);
    }
}

class BelowMinimumAmountError extends Error {
    constructor(amount) {
        super(`${numberToString(amount)} is below minimum order`);
    }
}

class OrderPendingError extends Error {
    constructor(orderId) {
        super(`The order ${orderId} is still pending`);
    }
}

module.exports = {
    AboveMaximumPriceError,
    BelowMinimumAmountError,
    OrderPendingError,
};
