import aws from 'aws-sdk';
import {
    includes,
    toLower,
} from 'ramda';

import unwrapSnsEvent from './lib/unwrapSnsEvent';

const {
    EVENT_BUS_ARN,
} = process.env;

const sns = new aws.SNS();

const publishWithdrawalRequestedEvent = event => sns.publish({
    TopicArn: EVENT_BUS_ARN,
    Message: JSON.stringify(event),
    MessageAttributes: {
        type: {
            DataType: 'String',
            StringValue: 'withdrawalRequested',
        },
    },
}).promise();

exports.handler = (event, context) => {
    const { body: { email } } = unwrapSnsEvent(event);
    const {
        body,
        messageId,
    } = email;

    console.log('Email body:', body);
    if (includes('withdraw', toLower(body))) {
        console.log('Publishing withdrawalRequested event');

        return publishWithdrawalRequestedEvent({
            sourceType: 'email',
            sourceId: messageId,
        });
    }

    console.log('No command matched');
    return Promise.resolve('Nothing to do here.');
};
