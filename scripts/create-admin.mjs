import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { get, initializeDatabase, persistDatabase, run } from '../server/db.mjs';
import { hashPassword } from '../server/auth.mjs';
import { isStrongPassword, readPassword, STRONG_PASSWORD_MESSAGE } from './password-prompt.mjs';

const rl = readline.createInterface({ input, output });
try {
  const email = (process.argv[2] || await rl.question('E-mail administrativo: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um endereço de e-mail válido.');
  await initializeDatabase();
  if (get('SELECT id FROM admin_users WHERE email = ?', [email])) throw new Error('Já existe um usuário administrador com este e-mail.');
  const password = await readPassword(rl);
  if (!isStrongPassword(password)) throw new Error(STRONG_PASSWORD_MESSAGE);
  const { salt, digest } = hashPassword(password);
  run('INSERT INTO admin_users (id, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), email, salt, digest, new Date().toISOString()]);
  persistDatabase();
  console.log(`Usuário administrativo criado: ${email}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
