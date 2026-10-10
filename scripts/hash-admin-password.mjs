import readline from 'node:readline/promises';
import { stdin as input, stderr as errorOutput } from 'node:process';
import { hashPassword } from '../server/auth.mjs';
import { isStrongPassword, readPassword, STRONG_PASSWORD_MESSAGE } from './password-prompt.mjs';

// Gera o valor de ADMIN_BOOTSTRAP_PASSWORD_HASH localmente. Não acessa o banco e não grava nada.
// Prompts vão para stderr; somente o hash é impresso em stdout, facilitando uso em pipelines.
const rl = readline.createInterface({ input, output: errorOutput });
try {
  const password = await readPassword(rl, errorOutput);
  if (!isStrongPassword(password)) throw new Error(STRONG_PASSWORD_MESSAGE);
  const { salt, digest } = hashPassword(password);
  console.error('\nCopie a linha abaixo para a variável ADMIN_BOOTSTRAP_PASSWORD_HASH (marque como secreta no Render):');
  console.log(`${salt}:${digest}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
