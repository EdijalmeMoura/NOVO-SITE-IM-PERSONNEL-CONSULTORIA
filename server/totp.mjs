import crypto from 'node:crypto';

// TOTP (RFC 6238) em SHA-1, 6 dígitos e janela de 30 segundos — o formato que
// Google Authenticator, Authy, 1Password e Microsoft Authenticator já leem.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const DIGITS = 6;
const PERIOD_SECONDS = 30;

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(text) {
  const clean = String(text ?? '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

export function totpCode(secret, { timestamp = Date.now(), period = PERIOD_SECONDS, digits = DIGITS } = {}) {
  const counter = Math.floor(timestamp / 1000 / period);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, '0');
}

// Aceita o código do relógio anterior e do seguinte: relógios de celular atrasam.
export function verifyTotp(secret, token, { window = 1 } = {}) {
  const candidate = String(token ?? '').replace(/\D/g, '');
  if (!secret || candidate.length !== DIGITS) return false;
  for (let drift = -window; drift <= window; drift += 1) {
    if (totpCode(secret, { timestamp: Date.now() + drift * PERIOD_SECONDS * 1000 }) === candidate) return true;
  }
  return false;
}

export function otpauthUri({ secret, email, issuer = 'IM Personnel' }) {
  const label = `${issuer}:${email}`;
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: String(DIGITS), period: String(PERIOD_SECONDS) });
  return `otpauth://totp/${encodeURIComponent(label)}?${params.toString()}`;
}

// Códigos de recuperação: exibidos uma única vez, guardados apenas como hash.
export function generateRecoveryCodes(total = 8) {
  const codes = [];
  for (let index = 0; index < total; index += 1) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

export function recoveryCodeHash(code) {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function normalizeRecoveryCode(code) {
  return String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}
