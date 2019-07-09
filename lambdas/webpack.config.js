const path = require('path');
const PnpWebpackPlugin = require('pnp-webpack-plugin');

module.exports = {
    mode: 'production',
    target: 'node',
    entry: {
        buyer: './src/buyer.mjs',
        notifier: './src/notifier.mjs',
        orderPoller: './src/orderPoller.mjs',
        incomingEmailHandler: './src/incomingEmailHandler.mjs',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name]/index.js',
        library: '',
        libraryTarget: 'commonjs',
    },
    resolve: {
        plugins: [
            PnpWebpackPlugin,
        ],
    },
    resolveLoader: {
        plugins: [
            PnpWebpackPlugin.moduleLoader(module),
        ],
    },
    externals: [
        (context, request, callback) => {
            if (request === 'aws-sdk') {
                return callback(null, 'commonjs aws-sdk');
            } else if (request === 'electron') {
                return callback(null, 'commonjs electron')
            }
            callback();
        }
    ],
};
