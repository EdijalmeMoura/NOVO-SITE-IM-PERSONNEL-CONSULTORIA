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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-personnel-settings-'));
const adminPassword = 'StrongAdminPass123!';
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let port;
let child;
let baseUrl;
let cookie;
let csrf;

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
      if (response.ok) break;
    } catch { /* aguarda o servidor abrir a porta */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const login = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'admin@example.test', password: adminPassword }) });
  assert.equal(login.status, 200, `login do administrador falhou. ${logs}`);
  const loginData = await login.json();
  cookie = login.headers.get('set-cookie').split(';')[0];
  csrf = loginData.csrf;
});

after(async () => {
  if (child && child.exitCode === null) {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('os destaques da página inicial são editáveis pelo painel', { timeout: 30_000 }, async () => {
  const publicSlides = await fetch(`${baseUrl}/api/hero-slides`).then((response) => response.json());
  assert.equal(publicSlides.items.length, 6, 'os seis destaques revisados são carregados na instalação');
  assert.ok(publicSlides.items.every((slide) => slide.active), 'todos começam ativos');
  assert.ok(publicSlides.items[0].title.some((line) => line.accent), 'a linha destacada do título é preservada');
  assert.equal(publicSlides.items[0].imageUrl, '/images/hero-team.jpg', 'sem imagem própria, usa a imagem padrão');

  const adminSlides = await fetch(`${baseUrl}/api/admin/hero-slides`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(adminSlides.items.length, 6);
  const first = adminSlides.items[0];

  const edited = await putAdmin(`/api/admin/hero-slides/${first.id}`, { eyebrow: 'PESSOAS E NEGÓCIOS', text: 'Texto revisado do destaque inicial.', active: false });
  assert.equal(edited.response.status, 200);
  assert.equal(edited.data.slide.eyebrow, 'PESSOAS E NEGÓCIOS');
  assert.equal(edited.data.slide.active, false);
  assert.ok(edited.data.slide.title.length, 'editar sem enviar o título mantém as linhas existentes');
  const afterDeactivate = await fetch(`${baseUrl}/api/hero-slides`).then((response) => response.json());
  assert.equal(afterDeactivate.items.length, 5, 'destaque desativado sai do carrossel público');
  assert.equal((await putAdmin(`/api/admin/hero-slides/${first.id}`, { active: true })).response.status, 200);

  const externalLink = await postAdmin('/api/admin/hero-slides', {
    eyebrow: 'DESTINO EXTERNO', navigation_label: 'Destino externo', title: 'Título do slide', text: 'Texto de apoio do slide.',
    primary_label: 'Sair do site', primary_to: 'https://exemplo.malicioso.test',
  });
  assert.equal(externalLink.response.status, 400, 'os botões só aceitam caminhos internos');

  const incomplete = await postAdmin('/api/admin/hero-slides', { eyebrow: 'SEM TÍTULO', navigation_label: 'Sem título', title: '', text: 'Texto.' });
  assert.equal(incomplete.response.status, 400, 'título é obrigatório');

  const form = new FormData();
  form.set('eyebrow', 'NOVO DESTAQUE');
  form.set('location', 'RECIFE, PE');
  form.set('navigation_label', 'Destaque com imagem');
  form.set('title', 'Primeira linha\nLinha destacada');
  form.set('accent_line', '2');
  form.set('text', 'Texto de apoio do novo destaque criado pelo painel.');
  form.set('primary_label', 'Conhecer');
  form.set('primary_to', '/solucoes');
  form.set('active', 'true');
  form.set('image_alt', 'Imagem do novo destaque');
  form.append('image', new Blob([PNG_1x1], { type: 'image/png' }), 'fundo.png');
  const createResponse = await fetch(`${baseUrl}/api/admin/hero-slides`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf }, body: form });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(created.slide.title[1].accent, true, 'a linha destacada indicada é marcada');
  assert.match(created.slide.imageUrl, /^\/media\/content-images\/[a-f0-9-]{36}\.png$/);
  assert.equal((await fetch(`${baseUrl}${created.slide.imageUrl}`)).status, 200);

  const listed = await fetch(`${baseUrl}/api/admin/hero-slides`, { headers: { cookie } }).then((response) => response.json());
  const reversed = listed.items.map((slide) => slide.id).reverse();
  const reordered = await postAdmin('/api/admin/hero-slides/reorder', { order: reversed });
  assert.equal(reordered.response.status, 200);
  assert.deepEqual(reordered.data.items.map((slide) => slide.id), reversed, 'a ordem enviada vira a ordem do carrossel');
  const publicAfterReorder = await fetch(`${baseUrl}/api/hero-slides`).then((response) => response.json());
  assert.equal(publicAfterReorder.items[0].id, reversed[0]);

  const badOrder = await postAdmin('/api/admin/hero-slides/reorder', { order: [crypto.randomUUID()] });
  assert.equal(badOrder.response.status, 400, 'a reordenação precisa listar os destaques existentes');

  assert.equal((await deleteAdmin(`/api/admin/hero-slides/${created.slide.id}`)).status, 200);
  assert.equal((await fetch(`${baseUrl}${created.slide.imageUrl}`)).status, 404, 'a imagem do destaque excluído sai do ar');
  const remaining = await fetch(`${baseUrl}/api/admin/hero-slides`, { headers: { cookie } }).then((response) => response.json());
  for (const slide of remaining.items.slice(1)) assert.equal((await deleteAdmin(`/api/admin/hero-slides/${slide.id}`)).status, 200);
  const last = await deleteAdmin(`/api/admin/hero-slides/${remaining.items[0].id}`);
  assert.equal(last.status, 409, 'o último destaque não pode ser excluído');
});

test('SMTP e modelos de mensagem são configuráveis pelo painel', { timeout: 30_000 }, async () => {
  const initial = await fetch(`${baseUrl}/api/admin/email-settings`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(initial.configured, false, 'começa sem SMTP configurado');
  assert.equal(initial.SMTP_PASS_SET, false);
  assert.equal(initial.templates.length, 7, 'os sete modelos revisados são carregados');
  assert.ok(initial.templates.every((template) => template.variables.length), 'cada modelo declara suas variáveis');
  assert.ok(!('SMTP_PASS' in initial), 'a senha nunca é devolvida pela API');

  const invalidPort = await putAdmin('/api/admin/email-settings', { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '99999', EMAIL_FROM: 'contato@example.test' });
  assert.equal(invalidPort.response.status, 400);
  const invalidFrom = await putAdmin('/api/admin/email-settings', { EMAIL_FROM: 'não é um e-mail' });
  assert.equal(invalidFrom.response.status, 400);

  const saved = await putAdmin('/api/admin/email-settings', { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '465', SMTP_SECURE: true, SMTP_USER: 'contato@example.test', SMTP_PASS: 'SegredoSmtp123', EMAIL_FROM: 'IM Personnel <contato@example.test>', LEADS_NOTIFICATION_EMAIL: 'equipe@example.test' });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.configured, true, 'com host e remetente o e-mail passa a estar ativo');
  const afterSave = await fetch(`${baseUrl}/api/admin/email-settings`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(afterSave.SMTP_PASS_SET, true);
  assert.equal(afterSave.SMTP_SECURE, true);
  assert.equal(afterSave.EMAIL_FROM, 'IM Personnel <contato@example.test>');
  assert.ok(afterSave.stored_in_panel.includes('SMTP_HOST'), 'o painel informa o que foi definido nele');
  assert.ok(!JSON.stringify(afterSave).includes('SegredoSmtp123'), 'a senha não aparece em nenhuma resposta');

  const testWithoutMailbox = await postAdmin('/api/admin/email-settings/test', { to: 'destino inválido' });
  assert.equal(testWithoutMailbox.response.status, 400);

  // Volta ao estado desativado para não deixar transporte pendurado após o teste.
  const cleared = await putAdmin('/api/admin/email-settings', { SMTP_HOST: '', EMAIL_FROM: '', SMTP_PASS: '' });
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.data.configured, false);
  const afterClear = await fetch(`${baseUrl}/api/admin/email-settings`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(afterClear.SMTP_PASS_SET, false, 'limpar o campo remove a senha guardada');

  const unknownVariable = await putAdmin('/api/admin/email-templates/lead_team', { subject: 'Novo lead {{inexistente}}' });
  assert.equal(unknownVariable.response.status, 400, 'variável desconhecida é recusada');
  assert.match(unknownVariable.data.error, /\{\{inexistente\}\}/);

  const updated = await putAdmin('/api/admin/email-templates/lead_team', { subject: 'Nova conversa • {{empresa}}', body: 'Empresa: {{empresa}}\nContato: {{nome}}\nProtocolo: {{protocolo}}', enabled: false });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.template.enabled, false);
  assert.equal(updated.data.template.subject, 'Nova conversa • {{empresa}}');

  const preview = await postAdmin('/api/admin/email-templates/lead_team/preview', {});
  assert.equal(preview.response.status, 200);
  assert.equal(preview.data.subject, 'Nova conversa • Indústria Exemplo');
  assert.doesNotMatch(preview.data.body, /\{\{/, 'nenhuma variável fica sem substituição na prévia');

  const emptySubject = await putAdmin('/api/admin/email-templates/lead_customer', { subject: '   ' });
  assert.equal(emptySubject.response.status, 400, 'o assunto não pode ficar vazio');

  const auditTrail = await fetch(`${baseUrl}/api/admin/audit`, { headers: { cookie } }).then((response) => response.json());
  for (const action of ['hero_slide.updated', 'hero_slide.created', 'hero_slide.reordered', 'hero_slide.deleted', 'email_settings.updated', 'email_template.updated']) {
    assert.ok(auditTrail.items.some((item) => item.action === action), `a auditoria registra ${action}`);
  }
  const passwordEntries = auditTrail.items.filter((item) => item.action === 'email_settings.updated');
  assert.ok(passwordEntries.every((item) => !item.details.includes('SegredoSmtp123')), 'a senha SMTP não entra na trilha de auditoria');
});

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}
async function postAdmin(route, body) {
  const response = await fetch(`${baseUrl}${route}`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json().catch(() => ({})) };
}
async function putAdmin(route, body) {
  const response = await fetch(`${baseUrl}${route}`, { method: 'PUT', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json().catch(() => ({})) };
}
async function deleteAdmin(route) {
  return fetch(`${baseUrl}${route}`, { method: 'DELETE', headers: { cookie, 'x-csrf-token': csrf } });
}
