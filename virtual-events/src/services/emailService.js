const nodemailer = require('nodemailer');
const config = require('../config');

let transporter;
function getTransporter() {
  if (!transporter) {
    transporter = config.smtp.host
      ? nodemailer.createTransport({
          host: config.smtp.host,
          port: config.smtp.port,
          auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        })
      : nodemailer.createTransport({ jsonTransport: true }); // no SMTP: simulate sending
  }
  return transporter;
}

async function sendEmail({ to, subject, text }) {
  const info = await getTransporter().sendMail({ from: config.mailFrom, to, subject, text });
  if (!config.smtp.host && process.env.NODE_ENV !== 'test') {
    console.log(`[email simulated] to=${to} subject="${subject}"`);
  }
  return info;
}

const sendWelcomeEmail = (user) =>
  sendEmail({
    to: user.email,
    subject: 'Welcome to Virtual Events',
    text: `Hi ${user.name},\n\nYour ${user.role} account has been created successfully.`,
  });

const sendEventRegistrationEmail = (user, event) =>
  sendEmail({
    to: user.email,
    subject: `Registered: ${event.title}`,
    text: `Hi ${user.name},\n\nYou're registered for "${event.title}" on ${event.date} at ${event.time}.`,
  });

module.exports = { sendEmail, sendWelcomeEmail, sendEventRegistrationEmail };
