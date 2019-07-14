import axios from 'axios';
import {
    prop,
    propOr,
} from 'ramda';

const ESPLORA_API_BASE_URL = 'https://blockstream.info/api';

export default transactionId => Promise.all([
    axios.get(`${ESPLORA_API_BASE_URL}/blocks/tip/height`).then(prop('data')),
    axios.get(`${ESPLORA_API_BASE_URL}/tx/${transactionId}/status`).then(prop('data')),
])
    .then(([tipHeight, transactionStatus]) => ({
        ...transactionStatus,
        confirmations: tipHeight - propOr(tipHeight, 'block_height', transactionStatus),
    }));
