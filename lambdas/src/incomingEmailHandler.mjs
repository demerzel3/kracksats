import aws from 'aws-sdk';
import mailparser from 'mailparser';

import buildEmailResponse from './lib/buildEmailResponse';

const { simpleParser } = mailparser;
const s3 = new aws.S3();
const ses = new aws.SES();

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
            const emailContent = s3Object.Body.toString();

            return simpleParser(emailContent);
        })
        .then((incomingMail) => {
            console.log(JSON.stringify(incomingMail, null, 2));

            return buildEmailResponse(incomingMail, 'kracksats@demerzel3.dev', {
                text: 'Message received!',
                html: 'Message received!',
            });
        })
        .then((rawResponseMessage) =>
            ses.sendRawEmail({
                RawMessage: {
                    Data: rawResponseMessage,
                },
            }).promise()
        )
        .then(() => s3.deleteObject({
            Bucket: bucketName,
            Key: objectKey,
        }).promise());
};
