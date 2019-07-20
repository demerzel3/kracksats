import {
    complement,
    compose,
    concat,
    is,
    join,
    map,
    split,
    startsWith,
    when,
    of,
    propOr,
} from 'ramda';
import MailComposer from 'nodemailer/lib/mail-composer';
import mailparser from 'mailparser';

const { simpleParser } = mailparser;

const quoteText = compose(
    join('\n'),
    map(concat('> ')),
    split('\n'),
);

const composeEmail = (emailDetails) => {
    const composer = new MailComposer(emailDetails);

    return new Promise((resolve, reject) => composer.compile().build((err, message) => {
        if (err) {
            reject(err);
        } else {
            resolve(message.toString());
        }
    }));
};

const buildEmailResponse = (rawOrParsedEmail, from, response) => {
    const parsedEmailPromise = is(String, rawOrParsedEmail)
        ? simpleParser(rawOrParsedEmail)
        : Promise.resolve(rawOrParsedEmail);

    return parsedEmailPromise.then((parsedEmail) => {
        const { text, html } = response;

        return composeEmail({
            from,
            to: parsedEmail.from.text,
            subject: when(complement(startsWith('Re:')), concat('Re: '), parsedEmail.subject),
            inReplyTo: parsedEmail.messageId,
            references: [
                ...compose(
                    when(is(String), of),
                    propOr([], 'references')
                )(parsedEmail),
                parsedEmail.messageId,
            ],
            text: `${text}\n\nYou wrote:\n${quoteText(parsedEmail.text)}`,
            html: `${html}<br><br>You wrote:<br><blockquote>${parsedEmail.html}</blockquote>`,
        });
    });
};

export default buildEmailResponse;
