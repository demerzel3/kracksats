const KrakenClient = require('kraken-api');
const {
    path,
    tap,
} = require('ramda');

class OrderPendingError extends Error {
    constructor(orderId) {
        super(`The order ${orderId} is still pending`);
    }
}

const fetchOrder = (client, orderId) => client
    .api('QueryOrders', { txid: orderId })
    .then(path(['result', orderId]))
;

const checkOrderStatus = (credentials, orderId) => {
    const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET);

    return fetchOrder(client, orderId)
        .then(tap(order => {
            if (order.vol_exec !== order.vol) {
                console.log('Order still pending', orderId, order);
                throw new OrderPendingError(orderId);
            }
        }))
        .then(order => ({
            txid: orderId,
            ...order,
        }));
};

module.exports = {
    OrderPendingError,
    checkOrderStatus,
};
