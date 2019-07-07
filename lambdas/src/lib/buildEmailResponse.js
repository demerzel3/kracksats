const {
    compose,
    map,
    split,
    join,
    concat,
    startsWith,
    when,
    complement,
} = require('ramda');
const MailComposer = require('nodemailer/lib/mail-composer');

const quoteText = compose(
    join('\n'),
    map(concat('> ')),
    split('\n'),
);

const buildEmailResponse = (mailObject, from, response) => {
    console.log(mailObject.subject);

    const { text, html } = response;
    const composer = new MailComposer({
        from,
        to: mailObject.from.text,
        subject: when(complement(startsWith('Re:')), concat('Re: '), mailObject.subject),
        inReplyTo: mailObject.messageId,
        references: [
            ...(mailObject.references || []),
            mailObject.messageId,
        ],
        text: `${text}\n\nYou wrote:\n${quoteText(mailObject.text)}`,
        html: `${html}<br><br>You wrote:<br><blockquote>${mailObject.html}</blockquote>`,
    });

    return new Promise((resolve, reject) => composer.compile().build((err, message) => {
        if (err) {
            reject(err);
        } else {
            resolve(message.toString());
        }
    }));
};

module.exports = buildEmailResponse;
