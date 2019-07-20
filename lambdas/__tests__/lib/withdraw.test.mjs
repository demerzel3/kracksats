import withdraw from '../../src/lib/withdraw';

const {
    API_KEY,
    API_SECRET,
    WITHDRAWAL_KEY,
} = process.env;

// 🚨🚨🚨 This will trigger an actual withdrawal, use at your own risk.
withdraw({ API_KEY, API_SECRET }, { asset: 'XXBT', maxAmount: Infinity, key: WITHDRAWAL_KEY })
    .then(console.log)
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
