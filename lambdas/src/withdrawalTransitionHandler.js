import aws from 'aws-sdk'

import unwrapSnsEvent from './lib/unwrapSnsEvent'

const { PENDING_WITHDRAWALS_TABLE_NAME } = process.env

const dynamodb = new aws.DynamoDB()

exports.handler = (event, context) => {
  const { type, body } = unwrapSnsEvent(event)

  if (type !== 'withdrawalTransition') {
    return Promise.resolve(`Nothing to do here (event type: ${type})`)
  }

  const {
    withdrawal,
    withdrawalStatus, // pendingExchange, pendingChain, confirmed
  } = body
  const { refid } = withdrawal

  if (
    withdrawalStatus === 'pendingExchange' ||
    withdrawalStatus === 'pendingChain'
  ) {
    // Insert or update row in the database.
    return dynamodb
      .putItem({
        TableName: PENDING_WITHDRAWALS_TABLE_NAME,
        Item: {
          refid: {
            S: refid,
          },
          data: {
            S: JSON.stringify(body),
          },
        },
      })
      .promise()
  } else if (withdrawalStatus === 'confirmed') {
    // Delete from the database.
    return dynamodb
      .deleteItem({
        TableName: PENDING_WITHDRAWALS_TABLE_NAME,
        Key: {
          refid: {
            S: refid,
          },
        },
      })
      .promise()
  } else {
    console.error(
      `Don't know what to do with this (withdrawal status: ${withdrawalStatus})`,
      JSON.stringify(body, null, 2)
    )
  }
}
