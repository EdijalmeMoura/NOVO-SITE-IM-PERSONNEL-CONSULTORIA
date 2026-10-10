import crypto from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { get, initializeDatabase, persistDatabase, run } from '../server/db.mjs';
import { hashPassword } from '../server/auth.mjs';

const rl = readline.createInterface({ input, output });
try {
  const email = (process.argv[2] || await rl.question('E-mail administrativo: ')).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um endereço de e-mail válido.');
  await initializeDatabase();
  if (get('SELECT id FROM admin_users WHERE email = ?', [email])) throw new Error('Já existe um usuário administrador com este e-mail.');
  const password = await readPassword(rl);
  if (password.length < 14 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
    throw new Error('A senha deve ter ao menos 14 caracteres, com letras maiúsculas, minúsculas e números.');
  }
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

async function readPassword(rl) {
  if (!input.isTTY) return rl.question('Senha (entrada não interativa): ');
  rl.close();
  output.write('Senha (14+ caracteres; entrada oculta): ');
  input.setRawMode(true);
  input.resume();
  return new Promise((resolve) => {
    let value = '';
    const onData = (chunk) => {
      const key = chunk.toString();
      if (key === '\u0003') { input.setRawMode(false); process.exit(130); }
      if (key === '\r' || key === '\n') {
        input.setRawMode(false);
        input.pause();
        input.removeListener('data', onData);
        output.write('\n');
        resolve(value);
      } else if (key === '\u007f' || key === '\b') value = value.slice(0, -1);
      else if (key >= ' ') value += key;
    };
    input.on('data', onData);
  });
}
