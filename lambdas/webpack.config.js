const path = require('path')

module.exports = {
  mode: 'production',
  target: 'node',
  entry: {
    ordersController: './src/ordersController.ts',

    buyReminder: './src/buyReminder.ts',
    buyer: './src/buyer.ts',
    notifier: './src/notifier.js',
    orderPoller: './src/orderPoller.js',
    incomingEmailHandler: './src/incomingEmailHandler.js',
    incomingEmailParser: './src/incomingEmailParser.js',
    withdrawer: './src/withdrawer.js',
    withdrawalChecker: './src/withdrawalChecker.js',
    withdrawalTransitionHandler: './src/withdrawalTransitionHandler.js',
    withdrawalPendingEmitter: './src/withdrawalPendingEmitter.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name]/index.js',
    libraryTarget: 'commonjs',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [{ test: /\.ts$/, loader: 'ts-loader' }],
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
