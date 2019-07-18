import aws from 'aws-sdk';
import {
    complement,
    compose,
    either,
    isEmpty,
    isNil,
    lensProp,
    map,
    objOf,
    over,
    pick,
    reject,
    startsWith,
    when,
} from 'ramda';

const {
    AWS_REGION = 'us-west-1',
} = process.env;

const enrichAwsMessageId = when(
    complement(startsWith('<')),
    rawMessageId => `<${rawMessageId}@${AWS_REGION}.amazonses.com>`,
);

export default (tableName, emailDetails) => {
    const dynamodb = new aws.DynamoDB();
    const attributes = compose(
        over(lensProp('messageId'), enrichAwsMessageId),
        map(objOf('S')),
        reject(either(isNil, isEmpty)),
        pick([
            'messageId',
            'inReplyTo',
            'from',
            'to',
            'subject',
            'body',
            'raw',
        ]),
    )(emailDetails);

    return dynamodb.putItem({
        TableName: tableName,
        Item: attributes,
    }).promise();
};
