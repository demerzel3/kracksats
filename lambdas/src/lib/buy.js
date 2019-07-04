const KrakenClient = require('kraken-api');
const {
    path,
    pathOr,
} = require('ramda');

const floor = require('./floor');
const { BelowMinimumAmountError } = require('./errors');

const FIAT_SYMBOL = 'ZEUR';
const CRYPTO_SYMBOL = 'XXBT';
const MIN_ORDER_AMOUNT = 0.002;
const ORDER_PRECISION = 8;
const ORDER_FEES = 0.0016;

const fetchFiatBalance = (client) => client.api('Balance')
    .then(pathOr(0, ['result', FIAT_SYMBOL]))
    .then(parseFloat);

const fetchCryptoBidPrice = (client) => client.api('Ticker', { pair: `${CRYPTO_SYMBOL}${FIAT_SYMBOL}` })
    .then(pathOr(Infinity, ['result', `${CRYPTO_SYMBOL}${FIAT_SYMBOL}`, 'b', 0]))
    .then(parseFloat);

const placeOrder = (client, price, orderAmount) => {
    const order = {
        pair: `${CRYPTO_SYMBOL}${FIAT_SYMBOL}`,
        type: 'buy',
        ordertype: 'limit',
        price,
        volume: orderAmount,
    };

    return client.api('AddOrder', order)
        .then(path(['result', 'txid']))
        .then(txid => ({ txid, ...order }));
};

const computeOrderAmount = (initialBalance, bidPrice) =>
    floor(ORDER_PRECISION, (initialBalance * (1 - ORDER_FEES)) / bidPrice);

const buy = (credentials) => {
    const client = new KrakenClient(credentials.API_KEY, credentials.API_SECRET);

    return Promise.all([fetchFiatBalance(client), fetchCryptoBidPrice(client)])
        .then(([fiatBalance, cryptoBidPrice]) => {
            const orderAmount = computeOrderAmount(fiatBalance, cryptoBidPrice);

            console.log(JSON.stringify({
                fiatBalance,
                fiatBalanceMinusFees: fiatBalance * (1 - ORDER_FEES),
                cryptoBidPrice,
                orderAmount,
            }));

            if (orderAmount < MIN_ORDER_AMOUNT) {
                throw new BelowMinimumAmountError(orderAmount);
            } else {
                return placeOrder(client, cryptoBidPrice, orderAmount);
            }
        });
};

module.exports = buy;
