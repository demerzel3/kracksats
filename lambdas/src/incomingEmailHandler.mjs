import aws from 'aws-sdk';
import mailparser from 'mailparser';
import planer from 'planer';
import {
    T,
    F,
} from 'ramda';

import buildEmailResponse from './lib/buildEmailResponse';
import storeEmail from './lib/storeEmail';

const {
    EMAILS_TABLE_NAME,
    EVENT_BUS_ARN,
} = process.env;

const { simpleParser } = mailparser;
const s3 = new aws.S3();
const ses = new aws.SES();
const dynamodb = new aws.DynamoDB();
const sns = new aws.SNS();

const emailExists = messageId =>
    dynamodb.getItem({
        TableName: EMAILS_TABLE_NAME,
        Key: {
            messageId: {
                S: messageId,
            },
        },
    })
    .promise()
    .then(T)
    .catch(F);

const publishEmailReceivedEvent = event => sns.publish({
    TopicArn: EVENT_BUS_ARN,
    Message: JSON.stringify(event),
    MessageAttributes: {
        type: {
            DataType: 'String',
            StringValue: 'emailReceived',
        },
    },
}).promise();

exports.handler = (event, context) => {
    const {
        Records: [
            {
                s3: {
                    bucket: {
                        name: bucketName,
                    },
                    object: {
                        key: objectKey,
                    },
                },
            },
        ],
    } = event;

    return s3.getObject({
        Bucket: bucketName,
        Key: objectKey,
    })
        .promise()
        .then(s3Object => {
            const rawEmail = s3Object.Body.toString();

            return simpleParser(rawEmail)
                .then(parsedEmail => [rawEmail, parsedEmail]);
        })
        .then(([rawEmail, parsedEmail]) => {
            console.log(JSON.stringify(parsedEmail, null, 2));

            const {
                subject,
                text,
                inReplyTo,
                messageId,
                from: {
                    value: [{ address: from }],
                },
                to: {
                    value: [{ address: to }],
                },
            } = parsedEmail;
            const body = planer.extractFromPlain(text);

            return emailExists(inReplyTo)
                .then(repliedEmailExists => {
                    if (repliedEmailExists) {
                        // store email and send event
                        const emailDetails = {
                            from,
                            to,
                            messageId,
                            inReplyTo,
                            subject,
                            body,
                            raw: rawEmail,
                        };

                        return storeEmail(EMAILS_TABLE_NAME, emailDetails)
                            .then(() => publishEmailReceivedEvent(emailDetails));
                    } else {
                        // reply with an automatic message
                        const reply = `Can't help you with that, please reply to one of my emails directly instead.`;

                        return buildEmailResponse(parsedEmail, 'kracksats@demerzel3.dev', { text: reply, html: reply })
                            .then(rawResponseMessage =>
                                ses.sendRawEmail({
                                    RawMessage: {
                                        Data: rawResponseMessage,
                                    },
                                }).promise()
                            );
                    }
                });
        })
        .then(() => s3.deleteObject({
            Bucket: bucketName,
            Key: objectKey,
        }).promise());
};
