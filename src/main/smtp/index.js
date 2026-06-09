import nodemailer from 'nodemailer'
import MailComposer from 'nodemailer/lib/mail-composer/index.js'

function toMailOptions(email, options) {
  return {
    from: `"${options.fromName || email}" <${email}>`,
    to: options.to || undefined,
    cc: options.cc || undefined,
    bcc: options.bcc || undefined,
    subject: options.subject,
    html: options.html,
    text: options.text,
    inReplyTo: options.inReplyTo || undefined,
    references: options.references || undefined,
    attachments: options.attachments || [],
    icalEvent: options.icalEvent || undefined
  }
}

export async function buildRawEmail(email, options) {
  return new MailComposer(toMailOptions(email, options)).compile().build()
}

export async function sendEmail(email, password, options) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.mail.me.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: {
      user: email,
      pass: password
    },
    tls: {
      rejectUnauthorized: true,
      minVersion: 'TLSv1.2'
    }
  })

  const info = await transporter.sendMail(toMailOptions(email, options))

  return info.messageId
}
