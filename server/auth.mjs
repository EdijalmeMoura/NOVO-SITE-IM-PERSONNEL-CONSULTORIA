import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const digest = scryptSync(password, salt, 64).toString('hex');
  return { salt, digest };
}

export function verifyPassword(password, salt, expected) {
  const actual = scryptSync(password, salt, 64);
  const wanted = Buffer.from(expected, 'hex');
  return wanted.length === actual.length && timingSafeEqual(actual, wanted);
}
