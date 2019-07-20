import {
    applySpec,
    compose,
    prop,
    propOr,
} from 'ramda';

export default (krakenClient, { asset, key }) =>
    krakenClient.api('WithdrawInfo', {
        asset,
        key,
        amount: 1,
    })
    .then(prop('result'))
    .then(applySpec({
        fee: compose(parseFloat, propOr('0', 'fee')),
        limit: compose(parseFloat, propOr('0', 'limit')),
    }));
