import crypto from 'node:crypto';
import { get, persistDatabase, run } from './db.mjs';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HASH_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/;

// Lê o acesso administrativo inicial a partir de variáveis de ambiente, para ambientes sem Shell.
// A variável guarda somente o hash scrypt (salt:digest) gerado por `npm run admin:hash`; nunca a senha em texto puro.
export function readBootstrapAdmin(env = process.env) {
  const email = (env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
  const passwordHash = (env.ADMIN_BOOTSTRAP_PASSWORD_HASH || '').trim();
  if (!email && !passwordHash) return null;
  if (!email || !passwordHash) {
    throw new Error('Defina ADMIN_BOOTSTRAP_EMAIL e ADMIN_BOOTSTRAP_PASSWORD_HASH juntos, ou remova ambos.');
  }
  if (!EMAIL_PATTERN.test(email)) throw new Error('ADMIN_BOOTSTRAP_EMAIL não é um e-mail válido.');
  if (!HASH_PATTERN.test(passwordHash)) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD_HASH inválido. Gere o valor com `npm run admin:hash`.');
  }
  const [salt, digest] = passwordHash.split(':');
  return { email, salt, digest };
}

// Garante que o administrador inicial exista ao iniciar o servidor (idempotente).
// - Sem variáveis: não faz nada.
// - E-mail inexistente: cria o usuário.
// - E-mail existente com hash diferente: atualiza a senha (a variável passa a ser a fonte para esse e-mail).
// - Mesmo hash: não altera nada.
export function ensureBootstrapAdmin(env = process.env) {
  const account = readBootstrapAdmin(env);
  if (!account) return 'skipped';

  const existing = get('SELECT id, salt, password_hash FROM admin_users WHERE email = ?', [account.email]);
  const now = new Date().toISOString();
  if (!existing) {
    const id = crypto.randomUUID();
    run('INSERT INTO admin_users (id, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', [id, account.email, account.salt, account.digest, now]);
    run('INSERT INTO audit_log (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), 'bootstrap', 'admin.bootstrap_created', 'admin_user', id, JSON.stringify({ email: account.email }), now]);
    persistDatabase();
    return 'created';
  }

  if (existing.salt === account.salt && existing.password_hash === account.digest) return 'unchanged';

  run('UPDATE admin_users SET salt = ?, password_hash = ? WHERE id = ?', [account.salt, account.digest, existing.id]);
  run('INSERT INTO audit_log (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), 'bootstrap', 'admin.bootstrap_password_updated', 'admin_user', existing.id, JSON.stringify({ email: account.email }), now]);
  persistDatabase();
  return 'updated';
}
