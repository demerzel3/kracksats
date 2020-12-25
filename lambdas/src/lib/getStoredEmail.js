import aws from 'aws-sdk'
import { map, prop } from 'ramda'

export default (tableName, messageId) =>
  new aws.DynamoDB()
    .getItem({
      TableName: tableName,
      Key: {
        messageId: {
          S: messageId,
        },
      },
    })
    .promise()
    .then(({ Item }) => map(prop('S'), Item))
