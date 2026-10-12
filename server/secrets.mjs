import crypto from 'node:crypto';

// Segredos gravados pelo painel (hoje a senha do SMTP) saem da base protegidos com
// AES-256-GCM, usando uma chave derivada de APP_SECRET. Sem APP_SECRET o valor é
// gravado como veio, e o painel avisa que falta a chave do ambiente.
const PREFIX = 'enc:v1:';
const KDF_SALT = 'im-personnel:settings:v1';
let cachedKey;

export function encryptionAvailable() {
  return Boolean((process.env.APP_SECRET || '').trim());
}

function encryptionKey() {
  const secret = (process.env.APP_SECRET || '').trim();
  if (!secret) return null;
  if (!cachedKey) cachedKey = crypto.scryptSync(secret, KDF_SALT, 32);
  return cachedKey;
}

export function isProtectedSecret(value) {
  return String(value ?? '').startsWith(PREFIX);
}

export function protectSecret(value) {
  const text = String(value ?? '');
  if (!text) return '';
  const key = encryptionKey();
  if (!key) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf-8'), cipher.final()]);
  return `${PREFIX}${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${encrypted.toString('base64url')}`;
}

export function revealSecret(value) {
  const text = String(value ?? '');
  // Valores anteriores a esta versão continuam legíveis: são gravados como texto puro.
  if (!isProtectedSecret(text)) return text;
  const key = encryptionKey();
  if (!key) return '';
  try {
    const [iv, tag, payload] = text.slice(PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(payload, 'base64url')), decipher.final()]).toString('utf-8');
  } catch {
    // Chave trocada ou valor corrompido: melhor tratar como ausente do que enviar lixo ao provedor.
    console.warn('Não foi possível abrir um segredo gravado pelo painel. Confira se APP_SECRET não mudou.');
    return '';
  }
}
