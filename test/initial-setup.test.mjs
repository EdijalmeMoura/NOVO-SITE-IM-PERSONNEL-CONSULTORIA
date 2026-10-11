import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-personnel-initial-setup-'));
const password = 'InitialAdminPass123!';
let child;
let baseUrl;

before(async () => {
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      PORT: String(port),
      SITE_URL: 'https://impersonnel.com.br',
      APPLICATION_RETENTION_DAYS: '365',
      TALENT_RETENTION_DAYS: '365',
      LEAD_RETENTION_DAYS: '365',
      PRIVACY_REQUEST_RETENTION_DAYS: '365',
      AUDIT_RETENTION_DAYS: '365',
      // Um .env local não pode mudar o cenário do teste: o dotenv não sobrescreve variáveis já definidas no processo.
      ADMIN_BOOTSTRAP_EMAIL: '',
      ADMIN_BOOTSTRAP_PASSWORD_HASH: '',
      LEADS_NOTIFICATION_EMAIL: '',
      SMTP_HOST: '',
      EMAIL_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (child.exitCode !== null) throw new Error(`Test server exited unexpectedly. ${logs}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch { /* wait for the HTTP server to bind */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Test server did not start. ${logs}`);
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a configuração inicial cria somente o primeiro administrador', { timeout: 30_000 }, async () => {
  const invalid = await postJson('/api/setup/initial-admin', { email: 'owner@example.test', password: 'fraca' });
  assert.equal(invalid.response.status, 400);
  assert.match(invalid.data.error, /14 caracteres/);

  const crossOrigin = await postJson('/api/setup/initial-admin', { email: 'owner@example.test', password }, { Origin: 'https://malicious.example' });
  assert.equal(crossOrigin.response.status, 403);

  const created = await postJson('/api/setup/initial-admin', { email: 'Owner@Example.Test', password });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.ok, true);

  const duplicate = await postJson('/api/setup/initial-admin', { email: 'second@example.test', password });
  assert.equal(duplicate.response.status, 409);

  const login = await postJson('/api/admin/login', { email: 'owner@example.test', password });
  assert.equal(login.response.status, 200);
  const cookie = login.response.headers.get('set-cookie').split(';')[0];
  const audit = await fetch(`${baseUrl}/api/admin/audit`, { headers: { cookie } }).then((response) => response.json());
  assert.ok(audit.items.some((item) => item.action === 'admin.initial_setup_created' && item.actor_email === 'initial-setup'));
});

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function postJson(route, body, headers = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}
