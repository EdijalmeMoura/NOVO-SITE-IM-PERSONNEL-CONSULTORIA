import { stdin as input, stderr as errorOutput } from 'node:process';

export const STRONG_PASSWORD_MESSAGE = 'A senha deve ter ao menos 14 caracteres, com letras maiúsculas, minúsculas e números.';

export function isStrongPassword(password) {
  return password.length >= 14 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

// Lê a senha sem exibi-la em terminais interativos. Em entrada não interativa (pipe), lê uma linha normal.
export async function readPassword(rl, output = errorOutput) {
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
