import checkOrderStatus from './lib/checkOrderStatus'

const {
  env: { API_KEY, API_SECRET },
  argv: [, , orderId],
} = process

checkOrderStatus({ API_KEY, API_SECRET }, orderId)
  .then(console.log)
  .catch(console.error)
