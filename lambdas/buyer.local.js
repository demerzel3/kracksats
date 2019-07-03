const { buy } = require('./src/buyer');

const {
    API_KEY,
    API_SECRET,
} = process.env;

buy({ API_KEY, API_SECRET })
    .then(console.log)
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
