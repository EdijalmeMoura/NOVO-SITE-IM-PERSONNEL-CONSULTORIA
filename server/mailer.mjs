import nodemailer from 'nodemailer';

let transporter;
function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.EMAIL_FROM) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
        : undefined,
    });
  }
  return transporter;
}

export async function sendMessage({ to, subject, text, replyTo }) {
  const transport = getTransporter();
  if (!transport || !to) return false;
  await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject, text, replyTo });
  return true;
}

export const isEmailConfigured = () => Boolean(process.env.SMTP_HOST && process.env.EMAIL_FROM);
