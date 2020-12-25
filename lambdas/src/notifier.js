import aws from 'aws-sdk'
import KrakenClient from 'kraken-api'
import { allPass, cond, pathEq, propEq, T } from 'ramda'

import numberToString from './lib/numberToString'
import readSecretJson from './lib/readSecretJson'
import unwrapSnsEvent from './lib/unwrapSnsEvent'
import storeEmail from './lib/storeEmail'
import getStoredEmail from './lib/getStoredEmail'
import buildEmailResponse from './lib/buildEmailResponse'
import fetchWithdrawInfo from './lib/fetchWithdrawInfo'

const CRYPTO_SYMBOL = 'XXBT'

const {
  RECIPIENT,
  WITHDRAWAL_KEY,
  KRAKEN_CREDENTIALS_ARN,
  EMAILS_TABLE_NAME,
} = process.env

const ses = new aws.SES()

const sendRawEmail = (emailDetails) =>
  ses
    .sendRawEmail({
      RawMessage: {
        Data: emailDetails.raw,
      },
    })
    .promise()
    .then(({ MessageId }) => ({ ...emailDetails, messageId: MessageId }))

const sendOrderCompletedEmail = ({ order: { vol_exec: amount, price } }) =>
  readSecretJson(KRAKEN_CREDENTIALS_ARN)
    .then((credentials) => {
      const client = new KrakenClient(
        credentials.API_KEY,
        credentials.API_SECRET
      )

      return fetchWithdrawInfo(client, {
        asset: CRYPTO_SYMBOL,
        key: WITHDRAWAL_KEY,
      })
    })
    .then(({ limit: totalAmount, fee: withdrawFee }) => {
      const feePercent = ((withdrawFee / totalAmount) * 100).toFixed(2)
      const subject = 'Order completed'
      const body = `Hi!

I just bought ${amount} BTC @ €${price} on your behalf.

You have a total amount of ${numberToString(
        totalAmount
      )} BTC, you can withdraw them for a ${numberToString(
        withdrawFee
      )} BTC fee (${feePercent}%).
Respond with "Withdraw" to this message if you want to proceed.
`

      const params = {
        Destination: {
          ToAddresses: [RECIPIENT],
        },
        Message: {
          Subject: {
            Charset: 'UTF-8',
            Data: subject,
          },
          Body: {
            Text: {
              Charset: 'UTF-8',
              Data: body,
            },
          },
        },
        Source: 'Kracksats <kracksats@demerzel3.dev>',
      }

      return ses
        .sendEmail(params)
        .promise()
        .then(({ MessageId }) => ({
          messageId: MessageId,
          to: RECIPIENT,
          subject,
          body,
        }))
    })

const sendWithdrawalInitiatedEmail = ({ sourceId: sourceMessageId }) => {
  return getStoredEmail(EMAILS_TABLE_NAME, sourceMessageId)
    .then((userEmail) => {
      const reply =
        'The withdrawal has been requested, I will let you know as soon as I have a transaction id.'

      return buildEmailResponse(userEmail.raw, 'kracksats@demerzel3.dev', {
        text: reply,
        html: reply,
      })
    })
    .then(sendRawEmail)
}

const sendWithdrawalPendingChainEmail = ({
  sourceId: sourceMessageId,
  withdrawal: { txid },
}) => {
  return getStoredEmail(EMAILS_TABLE_NAME, sourceMessageId)
    .then((userEmail) => {
      const url = `https://blockstream.info/tx/${txid}`
      const text = `The transaction id for your withdrawal is ${txid}.\nFollow confirmation here: ${url}`
      const html = `The transaction id for your withdrawal is <a href="${url}">${txid}</a>.`

      return buildEmailResponse(userEmail.raw, 'kracksats@demerzel3.dev', {
        text,
        html,
      })
    })
    .then(sendRawEmail)
}

const sendWithdrawalConfirmedEmail = ({ sourceId: sourceMessageId }) => {
  return getStoredEmail(EMAILS_TABLE_NAME, sourceMessageId)
    .then((userEmail) => {
      const reply = 'The withdrawal is now confirmed, enjoy your sats!'

      return buildEmailResponse(userEmail.raw, 'kracksats@demerzel3.dev', {
        text: reply,
        html: reply,
      })
    })
    .then(sendRawEmail)
}

const isOrderCompleted = propEq('type', 'orderCompleted')
const isWithdrawalInitiated = allPass([
  propEq('type', 'withdrawalTransition'),
  pathEq(['body', 'withdrawalStatus'], 'pendingExchange'),
])
const isWithdrawalPendingChain = allPass([
  propEq('type', 'withdrawalTransition'),
  pathEq(['body', 'withdrawalStatus'], 'pendingChain'),
])
const isWithdrawalConfirmed = allPass([
  propEq('type', 'withdrawalTransition'),
  pathEq(['body', 'withdrawalStatus'], 'confirmed'),
])

const store = (emailDetails) =>
  storeEmail(EMAILS_TABLE_NAME, emailDetails)
    .then(() => emailDetails)
    .catch((e) =>
      console.error('Error storing notification email', emailDetails, e)
    )

exports.handler = (event, context) => {
  const snsEvent = unwrapSnsEvent(event)
  const emailPromise = cond([
    [isOrderCompleted, ({ body }) => sendOrderCompletedEmail(body).then(store)],
    [
      isWithdrawalInitiated,
      ({ body }) => sendWithdrawalInitiatedEmail(body).then(store),
    ],
    [
      isWithdrawalPendingChain,
      ({ body }) => sendWithdrawalPendingChainEmail(body).then(store),
    ],
    [
      isWithdrawalConfirmed,
      ({ body }) => sendWithdrawalConfirmedEmail(body).then(store),
    ],
    [
      T,
      ({ type }) => Promise.resolve(`Nothing to do here (event type: ${type})`),
    ],
  ])(snsEvent)

  return emailPromise.catch((e) =>
    console.error('Error sending notification mail', e)
  )
}
