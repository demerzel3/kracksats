import aws from 'aws-sdk'

import buy from './lib/buy'
import handleError from './lib/handleError'
import { AboveMaximumPriceError, BelowMinimumAmountError } from './lib/errors'
import { Order } from './shared/types'
import readKrakenCredentials from './lib/readKrakenCredentials'

const { EVENT_BUS_ARN } = process.env

const publishOrderPlacedEvent = (sns: aws.SNS, order: Order) =>
  sns
    .publish({
      TopicArn: EVENT_BUS_ARN,
      Message: JSON.stringify({
        order,
      }),
      MessageAttributes: {
        type: {
          DataType: 'String',
          StringValue: 'orderPlaced',
        },
      },
    })
    .promise()

export const handler: AWSLambda.Handler = (event, context) => {
  const { MAXIMUM_PRICE, MAXIMUM_AMOUNT } = process.env

  const sns = new aws.SNS()

  return readKrakenCredentials()
    .then((credentials) =>
      buy(credentials, {
        maximumPrice: MAXIMUM_PRICE ? parseFloat(MAXIMUM_PRICE) : undefined,
        maximumAmount: MAXIMUM_AMOUNT ? parseFloat(MAXIMUM_AMOUNT) : undefined,
      })
    )
    .then((order) => publishOrderPlacedEvent(sns, order))
    .catch(handleError(AboveMaximumPriceError, (e) => console.error(e)))
    .catch(handleError(BelowMinimumAmountError, (e) => console.error(e)))
}
