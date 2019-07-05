const {
    SES,
} = require('aws-sdk');

const {
    RECIPIENT,
} = process.env;
const ses = new SES();

exports.handler = (event, context) => {
    console.log(event);

    const params = {
        Destination: {
            ToAddresses: [RECIPIENT],
        },
        Message: {
            Body: {
                Text: {
                    Charset: 'UTF-8',
                    Data: 'Order completed man.',
                },
            },
            Subject: {
                Charset: 'UTF-8',
                Data: 'Order completed',
            },
        },
        Source: 'kracksats@demerzel3.dev',
    };

    return ses.sendEmail(params).promise()
        .catch(e => console.log(e));
};
