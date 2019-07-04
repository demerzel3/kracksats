const numberToString = require('./numberToString');

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
    BelowMinimumAmountError,
    OrderPendingError,
};
