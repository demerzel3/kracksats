import fs from 'fs';
import mailparser from 'mailparser';

import __dirname from './__dirname.js';
import buildEmailResponse from '../../src/lib/buildEmailResponse';

const { simpleParser } = mailparser;
const rawEmail = fs.readFileSync(`${__dirname}/../../__fixtures__/incomingEmail.eml`).toString();

simpleParser(rawEmail)
    .then(mailObject =>
        buildEmailResponse(mailObject, 'kracksats@demerzel3.dev', {
            text: 'Your message has been received',
            html: 'Your message has been received',
        }))
    .then(console.log);
