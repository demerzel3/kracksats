import aws from 'aws-sdk'
import { compose, map, path, prop, tap } from 'ramda'

const { PENDING_WITHDRAWALS_TABLE_NAME, EVENT_BUS_ARN } = process.env

const dynamodb = new aws.DynamoDB()
const sns = new aws.SNS()

const publishWithdrawalPendingEvent = (event) =>
  sns
    .publish({
      TopicArn: EVENT_BUS_ARN,
      Message: JSON.stringify(event),
      MessageAttributes: {
        type: {
          DataType: 'String',
          StringValue: 'withdrawalPending',
        },
      },
    })
    .promise()

exports.handler = (event, context) => {
  return dynamodb
    .scan({ TableName: PENDING_WITHDRAWALS_TABLE_NAME })
    .promise()
    .then(prop('Items'))
    .then(tap((items) => console.log(JSON.stringify(items, null, 2))))
    .then((items) =>
      Promise.all(
        map(
          compose(
            publishWithdrawalPendingEvent,
            (data) => JSON.parse(data),
            path(['data', 'S'])
          ),
          items
        )
      )
    )
}
