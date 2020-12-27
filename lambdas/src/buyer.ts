import aws from 'aws-sdk'
import * as OneSignal from 'onesignal-node'

import buy from './lib/buy'
import handleError from './lib/handleError'
import {
  AboveMaximumPriceError,
  BelowMinimumAmountError,
  OTPNeededError,
} from './lib/errors'
import { Order, BuyerEvent } from './shared/types'
import readKrakenCredentials from './lib/readKrakenCredentials'
import readOneSignalCredentials from './lib/readOneSignalCredentials'
import numberToString from './lib/numberToString'

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

export const handler: AWSLambda.Handler<BuyerEvent> = (event, context) => {
  const { MAXIMUM_PRICE, MAXIMUM_AMOUNT, MOBILE_PLAYER_ID } = process.env

  const sns = new aws.SNS()

  return readKrakenCredentials()
    .then((credentials) =>
      buy(credentials, {
        otp: event.otp,
        maximumPrice: MAXIMUM_PRICE ? parseFloat(MAXIMUM_PRICE) : undefined,
        maximumAmount: MAXIMUM_AMOUNT ? parseFloat(MAXIMUM_AMOUNT) : undefined,
      })
    )
    .then((order) => publishOrderPlacedEvent(sns, order))
    .catch(
      handleError(OTPNeededError, (e) => {
        console.error(e)

        return readOneSignalCredentials().then((credentials) => {
          console.log('Sending push notification for OTP')
          const client = new OneSignal.Client(
            credentials.APP_ID,
            credentials.API_KEY
          )

          return client
            .createNotification({
              headings: {
                en: 'Order confirmation',
              },
              contents: {
                en: `Do you want to buy ${numberToString(
                  e.amount
                )} BTC at €${e.price.toFixed(2)}?`,
              },
              data: {
                amount: e.amount,
                price: e.price,
              },
              include_player_ids: MOBILE_PLAYER_ID ? [MOBILE_PLAYER_ID] : [],
            })
            .then((response) => response.body)
        })
      })
    )
    .catch(handleError(AboveMaximumPriceError, (e) => console.error(e)))
    .catch(handleError(BelowMinimumAmountError, (e) => console.error(e)))
}
