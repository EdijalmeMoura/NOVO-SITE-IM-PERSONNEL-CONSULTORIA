import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-personnel-bootstrap-'));
const firstPassword = 'FirstBootstrapPass123!';
const secondPassword = 'SecondBootstrapPass456!';
let db;
let bootstrap;
let auth;
let firstHash;

before(async () => {
  process.env.DATA_DIR = dataDir;
  db = await import('../server/db.mjs');
  bootstrap = await import('../server/bootstrap.mjs');
  auth = await import('../server/auth.mjs');
  await db.initializeDatabase();
  firstHash = hashFor(firstPassword);
});

after(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

function hashFor(password) {
  const { salt, digest } = auth.hashPassword(password);
  return `${salt}:${digest}`;
}

function adminRows(email) {
  return db.all('SELECT id, salt, password_hash FROM admin_users WHERE email = ?', [email]);
}

test('sem variáveis de bootstrap nada é criado', () => {
  assert.equal(bootstrap.ensureBootstrapAdmin({}), 'skipped');
  assert.equal(db.get('SELECT COUNT(*) AS count FROM admin_users').count, 0);
});

test('cria o administrador inicial a partir do hash e registra auditoria', () => {
  const env = { ADMIN_BOOTSTRAP_EMAIL: 'Owner@Empresa.com.br', ADMIN_BOOTSTRAP_PASSWORD_HASH: firstHash };
  assert.equal(bootstrap.ensureBootstrapAdmin(env), 'created');
  const rows = adminRows('owner@empresa.com.br');
  assert.equal(rows.length, 1);
  assert.equal(auth.verifyPassword(firstPassword, rows[0].salt, rows[0].password_hash), true);
  assert.equal(auth.verifyPassword('senha-errada-123A', rows[0].salt, rows[0].password_hash), false);
  const audit = db.get("SELECT actor_email, action FROM audit_log WHERE action = 'admin.bootstrap_created'");
  assert.deepEqual({ actor_email: audit.actor_email, action: audit.action }, { actor_email: 'bootstrap', action: 'admin.bootstrap_created' });
});

test('reinicializações são idempotentes e não duplicam a conta', () => {
  const env = { ADMIN_BOOTSTRAP_EMAIL: 'owner@empresa.com.br', ADMIN_BOOTSTRAP_PASSWORD_HASH: firstHash };
  assert.equal(bootstrap.ensureBootstrapAdmin(env), 'unchanged');
  assert.equal(adminRows('owner@empresa.com.br').length, 1);
});

test('alterar o hash no ambiente atualiza a senha do mesmo e-mail', () => {
  const env = { ADMIN_BOOTSTRAP_EMAIL: 'owner@empresa.com.br', ADMIN_BOOTSTRAP_PASSWORD_HASH: hashFor(secondPassword) };
  assert.equal(bootstrap.ensureBootstrapAdmin(env), 'updated');
  const [row] = adminRows('owner@empresa.com.br');
  assert.equal(auth.verifyPassword(secondPassword, row.salt, row.password_hash), true);
  assert.equal(auth.verifyPassword(firstPassword, row.salt, row.password_hash), false);
});

test('configuração parcial ou inválida interrompe a inicialização', () => {
  assert.throws(() => bootstrap.ensureBootstrapAdmin({ ADMIN_BOOTSTRAP_EMAIL: 'x@y.com.br' }), /juntos/);
  assert.throws(() => bootstrap.ensureBootstrapAdmin({ ADMIN_BOOTSTRAP_PASSWORD_HASH: hashFor(firstPassword) }), /juntos/);
  assert.throws(() => bootstrap.ensureBootstrapAdmin({ ADMIN_BOOTSTRAP_EMAIL: 'nao-e-email', ADMIN_BOOTSTRAP_PASSWORD_HASH: hashFor(firstPassword) }), /e-mail válido/);
  assert.throws(() => bootstrap.ensureBootstrapAdmin({ ADMIN_BOOTSTRAP_EMAIL: 'x@y.com.br', ADMIN_BOOTSTRAP_PASSWORD_HASH: firstPassword }), /npm run admin:hash/);
});

test('o utilitário de hash gera um valor aceito pelo bootstrap e recusa senha fraca', () => {
  const ok = spawnSync(process.execPath, ['scripts/hash-admin-password.mjs'], { cwd: root, input: `${firstPassword}\n`, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  const hash = ok.stdout.trim().split('\n').at(-1);
  assert.match(hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
  assert.equal(bootstrap.readBootstrapAdmin({ ADMIN_BOOTSTRAP_EMAIL: 'novo@empresa.com.br', ADMIN_BOOTSTRAP_PASSWORD_HASH: hash }).email, 'novo@empresa.com.br');

  const weak = spawnSync(process.execPath, ['scripts/hash-admin-password.mjs'], { cwd: root, input: 'curta\n', encoding: 'utf8' });
  assert.equal(weak.status, 1);
  assert.match(weak.stderr, /14 caracteres/);
});
