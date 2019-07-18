import aws from 'aws-sdk';
import {
    compose,
    either,
    reject,
    isEmpty,
    isNil,
    map,
    objOf,
    pick,
} from 'ramda';

export default (tableName, emailDetails) => {
    const dynamodb = new aws.DynamoDB();
    const attributes = compose(
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
