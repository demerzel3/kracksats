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
} from 'ramda'
import MailComposer from 'nodemailer/lib/mail-composer'
import mailparser from 'mailparser'

const { simpleParser } = mailparser

const quoteText = compose(join('\n'), map(concat('> ')), split('\n'))

const composeEmail = (emailDetails) => {
  const composer = new MailComposer(emailDetails)

  return new Promise((resolve, reject) =>
    composer.compile().build((err, message) => {
      if (err) {
        reject(err)
      } else {
        resolve(message.toString())
      }
    })
  )
}

const buildEmailResponse = (rawOrParsedEmail, from, response) => {
  const parsedEmailPromise = is(String, rawOrParsedEmail)
    ? simpleParser(rawOrParsedEmail)
    : Promise.resolve(rawOrParsedEmail)

  return parsedEmailPromise.then((parsedEmail) => {
    const { text, html } = response
    const subject = when(
      complement(startsWith('Re:')),
      concat('Re: '),
      parsedEmail.subject
    )
    const inReplyTo = parsedEmail.messageId

    return composeEmail({
      from,
      to: parsedEmail.from.text,
      subject,
      inReplyTo,
      references: [
        ...compose(when(is(String), of), propOr([], 'references'))(parsedEmail),
        parsedEmail.messageId,
      ],
      text: `${text}\n\nYou wrote:\n${quoteText(parsedEmail.text)}`,
      html: `${html}<br><br>You wrote:<br><blockquote>${parsedEmail.html}</blockquote>`,
    }).then((raw) => ({
      inReplyTo,
      from,
      to: parsedEmail.from.value[0].address,
      subject,
      body: text,
      raw,
    }))
  })
}

export default buildEmailResponse
