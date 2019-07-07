const fs = require('fs');
const simpleParser = require('mailparser').simpleParser;
const buildEmailResponse = require('../../src/lib/buildEmailResponse');

const rawEmail = fs.readFileSync(`${__dirname}/../../__fixtures__/incomingEmail.eml`).toString();

simpleParser(rawEmail)
    .then(mailObject =>
        buildEmailResponse(mailObject, 'kracksats@demerzel3.dev', {
            text: 'Your message has been received',
            html: 'Your message has been received',
        }))
    .then(console.log);
