const path = require('path')

module.exports = {
  mode: 'production',
  target: 'node',
  entry: {
    buyer: './src/buyer.mjs',
    notifier: './src/notifier.mjs',
    orderPoller: './src/orderPoller.mjs',
    incomingEmailHandler: './src/incomingEmailHandler.mjs',
    incomingEmailParser: './src/incomingEmailParser.mjs',
    withdrawer: './src/withdrawer.mjs',
    withdrawalChecker: './src/withdrawalChecker.mjs',
    withdrawalTransitionHandler: './src/withdrawalTransitionHandler.mjs',
    withdrawalPendingEmitter: './src/withdrawalPendingEmitter.mjs',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/index.js',
    library: '',
    libraryTarget: 'commonjs',
  },
  externals: [
    (context, request, callback) => {
      if (request === 'aws-sdk') {
        return callback(null, 'commonjs aws-sdk')
      } else if (request === 'electron') {
        return callback(null, 'commonjs electron')
      }
      callback()
    },
  ],
}
