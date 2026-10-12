import nodemailer from 'nodemailer';
import { get } from './db.mjs';
import { revealSecret } from './secrets.mjs';

let transporter;
let transporterSignature = '';

// Configuração definida no painel tem prioridade; sem ela, vale o ambiente (.env).
function setting(key, envValue = '') {
  try {
    const row = get('SELECT value FROM settings WHERE key = ?', [key]);
    const stored = (row?.value ?? '').trim();
    if (stored) return stored;
  } catch { /* banco ainda não inicializado: segue com o ambiente */ }
  return (envValue || '').trim();
}

export function emailSettings() {
  return {
    host: setting('SMTP_HOST', process.env.SMTP_HOST),
    port: Number(setting('SMTP_PORT', process.env.SMTP_PORT) || 587),
    secure: setting('SMTP_SECURE', process.env.SMTP_SECURE) === 'true',
    user: setting('SMTP_USER', process.env.SMTP_USER),
    // A senha do painel fica protegida na base; a variável de ambiente continua em texto puro.
    pass: revealSecret(setting('SMTP_PASS', process.env.SMTP_PASS)),
    from: setting('EMAIL_FROM', process.env.EMAIL_FROM),
    notification: setting('LEADS_NOTIFICATION_EMAIL', process.env.LEADS_NOTIFICATION_EMAIL),
  };
}

export const isEmailConfigured = () => {
  const { host, from } = emailSettings();
  return Boolean(host && from);
};

// Descarta o transporter em memória quando a configuração muda pelo painel.
export function resetMailer() {
  transporter = undefined;
  transporterSignature = '';
}

function getTransporter() {
  const config = emailSettings();
  if (!config.host || !config.from) return null;
  const signature = JSON.stringify([config.host, config.port, config.secure, config.user, config.pass]);
  if (!transporter || signature !== transporterSignature) {
    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.pass || '' } : undefined,
    });
    transporterSignature = signature;
  }
  return transporter;
}

// Substitui {{chave}} pelos valores informados; chaves ausentes viram texto vazio.
export function renderTemplate(text, variables = {}) {
  return String(text ?? '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

export function readTemplate(key) {
  try {
    const row = get('SELECT subject, body, enabled FROM email_templates WHERE key = ?', [key]);
    if (row) return { key, subject: row.subject || '', body: row.body || '', enabled: Boolean(Number(row.enabled)) };
  } catch { /* banco indisponível no momento da leitura */ }
  return null;
}

export async function sendMessage({ to, subject, text, replyTo }) {
  const transport = getTransporter();
  if (!transport || !to) return false;
  await transport.sendMail({ from: emailSettings().from, to, subject, text, replyTo });
  return true;
}

export async function sendTemplate({ key, to, replyTo, variables = {} }) {
  const template = readTemplate(key);
  if (!template || !template.enabled || !to) return false;
  const subject = renderTemplate(template.subject, variables).trim();
  if (!subject) return false;
  return sendMessage({ to, subject, text: renderTemplate(template.body, variables), replyTo });
}

// Verifica as credenciais sem disparar mensagem; usado pelo botão "Testar conexão".
export async function verifyTransport() {
  const transport = getTransporter();
  if (!transport) throw new Error('Configure SMTP_HOST e EMAIL_FROM antes de testar.');
  await transport.verify();
  return true;
}
