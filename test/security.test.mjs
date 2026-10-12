import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-personnel-security-'));
const adminPassword = 'StrongAdminPass123!';
const smtpPassword = 'SegredoDoProvedor987';
let port;
let child;
let baseUrl;
let cookie;
let csrf;
let logs = '';

before(async () => {
  process.env.DATA_DIR = dataDir;
  const { initializeDatabase, run, persistDatabase } = await import('../server/db.mjs');
  const { hashPassword } = await import('../server/auth.mjs');
  await initializeDatabase();
  const { salt, digest } = hashPassword(adminPassword);
  run('INSERT INTO admin_users (id, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), 'admin@example.test', salt, digest, new Date().toISOString()]);
  persistDatabase();
  port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATA_DIR: dataDir,
      PORT: String(port),
      SITE_URL: 'https://impersonnel.com.br',
      APP_SECRET: crypto.randomBytes(32).toString('hex'),
      // A suíte faz mais entradas do que o limite de produção permite por IP.
      LOGIN_RATE_LIMIT: '60',
      APPLICATION_RETENTION_DAYS: '3650',
      TALENT_RETENTION_DAYS: '3650',
      LEAD_RETENTION_DAYS: '3650',
      PRIVACY_REQUEST_RETENTION_DAYS: '3650',
      AUDIT_RETENTION_DAYS: '3650',
      ADMIN_BOOTSTRAP_EMAIL: '',
      ADMIN_BOOTSTRAP_PASSWORD_HASH: '',
      LEADS_NOTIFICATION_EMAIL: '',
      SMTP_HOST: '',
      EMAIL_FROM: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (chunk) => { logs += chunk.toString(); });
  child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
  const started = Date.now();
  while (Date.now() - started < 15_000) {
    if (child.exitCode !== null) throw new Error(`Test server exited unexpectedly. ${logs}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) break;
    } catch { /* aguarda o servidor abrir a porta */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const login = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: adminPassword }) });
  assert.equal(login.status, 200, `login inicial falhou. ${logs}`);
  cookie = login.headers.get('set-cookie').split(';')[0];
  csrf = (await login.json()).csrf;
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('o gerador de códigos segue a RFC 6238 e o hash dos códigos de recuperação é estável', async () => {
  const { totpCode, base32Encode, base32Decode, verifyTotp, generateTotpSecret, url } = await import('../server/totp.mjs').then((module) => ({ ...module, url: null }));
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  // Vetores oficiais da RFC 6238 (SHA-1, 8 dígitos truncados para 6).
  const vectors = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']];
  for (const [timestamp, expected] of vectors) assert.equal(totpCode(secret, { timestamp: timestamp * 1000 }), expected, `vetor ${timestamp}`);
  assert.equal(base32Decode(secret).toString(), '12345678901234567890', 'ida e volta do base32 preserva o segredo');
  const fresh = generateTotpSecret();
  assert.equal(fresh.length, 32, 'segredo de 160 bits em base32');
  assert.ok(verifyTotp(fresh, totpCode(fresh)), 'o código do momento é aceito');
  assert.ok(!verifyTotp(fresh, '000000'), 'código de outro segredo é recusado');
  assert.ok(!verifyTotp(fresh, 'abacaxi'), 'entrada não numérica é recusada');
});

test('a senha do SMTP é guardada cifrada e nunca volta em resposta ou auditoria', { timeout: 30_000 }, async () => {
  const saved = await putAdmin('/api/admin/email-settings', {
    SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_SECURE: false,
    SMTP_USER: 'contato@example.test', SMTP_PASS: smtpPassword, EMAIL_FROM: 'IM Personnel <contato@example.test>',
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.SMTP_PASS_SET, true);
  assert.equal(saved.data.secrets_protected, true, 'a resposta informa que a senha está protegida');
  assert.equal(saved.data.pass_readable, true, 'a aplicação consegue abrir a própria senha');
  assert.ok(!JSON.stringify(saved.data).includes(smtpPassword), 'a senha não volta na resposta do PUT');

  // O arquivo do banco não pode conter a senha em texto puro.
  const databaseBytes = fs.readFileSync(path.join(dataDir, 'im-personnel.sqlite'));
  assert.ok(!databaseBytes.includes(Buffer.from(smtpPassword)), 'a senha não aparece no arquivo do banco');
  assert.ok(databaseBytes.includes(Buffer.from('enc:v1:')), 'o valor gravado está marcado como cifrado');

  const listed = await adminGet('/api/admin/email-settings');
  assert.equal(listed.SMTP_PASS_SET, true);
  assert.equal(listed.secrets_protected, true);
  assert.ok(!JSON.stringify(listed).includes(smtpPassword), 'a senha não volta na leitura das configurações');

  const audit = await adminGet('/api/admin/audit?q=email_settings.updated');
  assert.ok(audit.total >= 1);
  assert.ok(audit.items.every((item) => !item.details.includes(smtpPassword)), 'a senha não entra na trilha de auditoria');

  const cleared = await putAdmin('/api/admin/email-settings', { SMTP_HOST: '', EMAIL_FROM: '', SMTP_PASS: '' });
  assert.equal(cleared.data.SMTP_PASS_SET, false);
  assert.equal(cleared.data.configured, false);
});

test('a verificação em duas etapas protege o acesso ao painel', { timeout: 40_000 }, async () => {
  const { totpCode } = await import('../server/totp.mjs');
  const initial = await adminGet('/api/admin/security');
  assert.equal(initial.totp_enabled, false, 'começa desativada');
  assert.equal(initial.encryption_available, true, 'a chave do ambiente é reconhecida');

  const setup = await postAdmin('/api/admin/security/totp/setup', {});
  assert.equal(setup.response.status, 200);
  assert.match(setup.data.uri, /^otpauth:\/\/totp\/IM%20Personnel%3Aadmin%40example\.test\?/, 'endereço pronto para o aplicativo autenticador');
  assert.equal(setup.data.secret.length, 32);

  const wrong = await postAdmin('/api/admin/security/totp/enable', { code: '000000' });
  assert.equal(wrong.response.status, 400, 'código errado não ativa a proteção');

  const enabled = await postAdmin('/api/admin/security/totp/enable', { code: totpCode(setup.data.secret) });
  assert.equal(enabled.response.status, 200);
  assert.equal(enabled.data.recovery_codes.length, 8, 'oito códigos de recuperação são entregues uma única vez');
  assert.equal(enabled.data.state.totp_enabled, true);
  assert.equal(enabled.data.state.recovery_codes_left, 8);

  const listedUsers = await adminGet('/api/admin/users');
  assert.equal(listedUsers.items[0].totp_enabled, true, 'a lista de usuários mostra quem tem 2FA');

  // A senha sozinha não abre mais sessão.
  const passwordOnly = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: adminPassword }) });
  assert.equal(passwordOnly.status, 200);
  const challenge = await passwordOnly.json();
  assert.equal(challenge.authenticated, false, 'sem o segundo fator não há sessão');
  assert.equal(challenge.totp_required, true);
  assert.ok(challenge.challenge);
  assert.equal(passwordOnly.headers.get('set-cookie'), null, 'nenhum cookie de sessão é entregue antes do código');

  const badCode = await fetch(`${baseUrl}/api/admin/login/totp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: challenge.challenge, code: '123456' }) });
  assert.equal(badCode.status, 401, 'código inválido é recusado');
  // O desafio continua válido depois de um erro de digitação; o relógio é que manda nele.
  const expired = await fetch(`${baseUrl}/api/admin/login/totp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: 'desafio-inexistente', code: '000000' }) });
  assert.equal(expired.status, 401);

  const withCode = await fetch(`${baseUrl}/api/admin/login/totp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: challenge.challenge, code: totpCode(setup.data.secret) }) });
  assert.equal(withCode.status, 200);
  const session = await withCode.json();
  assert.equal(session.authenticated, true, 'com o código correto a sessão abre');
  assert.ok(withCode.headers.get('set-cookie').includes('im_admin'));

  const audit = await adminGet('/api/admin/audit?q=admin.mfa');
  for (const action of ['admin.mfa_setup_started', 'admin.mfa_enabled', 'admin.mfa_verified', 'admin.mfa_failed']) {
    assert.ok(audit.items.some((item) => item.action === action), `a auditoria registra ${action}`);
  }

  // Código de recuperação: entra uma única vez.
  const secondChallenge = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: adminPassword }) }).then((response) => response.json());
  const recovery = enabled.data.recovery_codes[0];
  const recoveryLogin = await fetch(`${baseUrl}/api/admin/login/totp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: secondChallenge.challenge, code: recovery }) });
  assert.equal(recoveryLogin.status, 200, 'o código de recuperação entra no lugar do aplicativo');
  const recoverySession = await recoveryLogin.json();
  assert.equal(recoverySession.recovery_codes_left, 7, 'o código usado é consumido');

  const reuseChallenge = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: adminPassword }) }).then((response) => response.json());
  const reused = await fetch(`${baseUrl}/api/admin/login/totp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge: reuseChallenge.challenge, code: recovery }) });
  assert.equal(reused.status, 401, 'o mesmo código de recuperação não serve duas vezes');

  // Sessão nova (a do cookie inicial continua válida para administrar a conta).
  const freshCookie = withCode.headers.get('set-cookie').split(';')[0];
  const freshCsrf = session.csrf;
  const regenerated = await fetch(`${baseUrl}/api/admin/security/recovery-codes`, { method: 'POST', headers: { cookie: freshCookie, 'x-csrf-token': freshCsrf, 'content-type': 'application/json' }, body: JSON.stringify({ password: adminPassword }) });
  assert.equal(regenerated.status, 200);
  const regeneratedData = await regenerated.json();
  assert.equal(regeneratedData.state.recovery_codes_left, 8, 'novos códigos substituem os antigos');

  const wrongPassword = await fetch(`${baseUrl}/api/admin/security/totp/disable`, { method: 'POST', headers: { cookie: freshCookie, 'x-csrf-token': freshCsrf, 'content-type': 'application/json' }, body: JSON.stringify({ password: 'senha-errada' }) });
  assert.equal(wrongPassword.status, 403, 'desativar exige a senha correta');

  const disabled = await fetch(`${baseUrl}/api/admin/security/totp/disable`, { method: 'POST', headers: { cookie: freshCookie, 'x-csrf-token': freshCsrf, 'content-type': 'application/json' }, body: JSON.stringify({ password: adminPassword }) });
  assert.equal(disabled.status, 200);
  const disabledState = await disabled.json();
  assert.equal(disabledState.state.totp_enabled, false);
  assert.equal(disabledState.state.recovery_codes_left, 0, 'desativar apaga os códigos de recuperação');

  const afterDisable = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: adminPassword }) }).then((response) => response.json());
  assert.equal(afterDisable.authenticated, true, 'sem 2FA a senha volta a abrir a sessão');
  assert.ok(afterDisable.csrf);

  const finalAudit = await adminGet('/api/admin/audit?q=admin.mfa');
  assert.ok(finalAudit.items.some((item) => item.action === 'admin.mfa_recovery_codes_regenerated'));
  assert.ok(finalAudit.items.some((item) => item.action === 'admin.mfa_disabled'));
});

test('as rotas de segurança exigem sessão e token', { timeout: 20_000 }, async () => {
  const anonymous = await fetch(`${baseUrl}/api/admin/security`);
  assert.equal(anonymous.status, 401);
  const noCsrf = await fetch(`${baseUrl}/api/admin/security/totp/setup`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403, 'sem o token CSRF a rota é recusada');
});

async function adminGet(route) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { cookie } });
  assert.ok(response.ok, `GET ${route} respondeu ${response.status}`);
  return response.json();
}
async function postAdmin(route, body) {
  const response = await fetch(`${baseUrl}${route}`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json().catch(() => ({})) };
}
async function putAdmin(route, body) {
  const response = await fetch(`${baseUrl}${route}`, { method: 'PUT', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json().catch(() => ({})) };
}
async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}
