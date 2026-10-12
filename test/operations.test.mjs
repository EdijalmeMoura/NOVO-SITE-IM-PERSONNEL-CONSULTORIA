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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-personnel-operations-'));
const adminPassword = 'StrongAdminPass123!';
const smtpPassword = 'SenhaSmtpDeTeste456';
const seededApplications = 5;
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
  const created = new Date().toISOString();
  const { salt, digest } = hashPassword(adminPassword);
  run('INSERT INTO admin_users (id, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', [crypto.randomUUID(), 'admin@example.test', salt, digest, created]);
  // Massa de teste gravada direto na base: as listas precisam de mais registros do que cabe em uma página.
  const jobId = crypto.randomUUID();
  run('INSERT INTO jobs (id, slug, title, area, city, state, modality, employment_type, summary, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)', [jobId, 'vaga-de-teste', 'Vaga de teste', 'Recursos Humanos', 'Recife', 'PE', 'Presencial', 'CLT', 'Resumo da vaga de teste.', created, created]);
  for (let index = 1; index <= seededApplications; index += 1) {
    run('INSERT INTO applications (id, job_id, full_name, email, phone, city, state, linkedin, cover_letter, answers, resume_key, status, internal_notes, privacy_notice_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), jobId, `Pessoa Candidata ${index}`, `candidata${index}@example.test`, '+55 81 90000-0000', 'Recife', 'PE', `https://www.linkedin.com/in/candidata-${index}`, '', '{}', `${crypto.randomUUID()}.pdf`, 'Candidatura recebida', '', '2026-10-v1', `2026-0${index}-01T12:00:00.000Z`, created]);
    run('INSERT INTO talent_profiles (id, full_name, email, phone, city, state, area, linkedin, resume_key, consent_at, privacy_notice_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), `Talento ${index}`, `talento${index}@example.test`, '+55 81 90000-0000', 'Olinda', 'PE', 'Logística', '', `${crypto.randomUUID()}.pdf`, created, '2026-10-v1', `2026-0${index}-02T12:00:00.000Z`, created]);
    run('INSERT INTO leads (id, contact_name, contact_role, company, email, phone, segment, city, state, service, position_count, need, desired_timeline, status, assigned_to, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), `Contato ${index}`, 'Diretora', `Empresa ${index}`, `empresa${index}@example.test`, '+55 81 90000-0000', 'Indústria', 'Jaboatão', 'PE', 'Recrutamento e seleção', '2', 'Precisamos estruturar o processo seletivo da operação industrial.', 'Próximo trimestre', 'Novo contato', '', '', `2026-0${index}-03T12:00:00.000Z`, created]);
    run('INSERT INTO privacy_requests (id, full_name, email, request_type, details, created_at, updated_at, status, internal_notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), `Titular ${index}`, `titular${index}@example.test`, 'Acesso aos dados', '', `2026-0${index}-04T12:00:00.000Z`, created, 'Recebida', '']);
  }
  // Eventos de auditoria para a trilha também ser paginada com dados reais.
  for (let index = 1; index <= 6; index += 1) {
    run('INSERT INTO audit_log (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [crypto.randomUUID(), 'admin@example.test', `job.audit_event_${index}`, 'job', crypto.randomUUID(), JSON.stringify({ index }), `2026-0${index}-05T12:00:00.000Z`]);
  }
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
      APPLICATION_RETENTION_DAYS: '3650',
      TALENT_RETENTION_DAYS: '3650',
      LEAD_RETENTION_DAYS: '3650',
      PRIVACY_REQUEST_RETENTION_DAYS: '3650',
      AUDIT_RETENTION_DAYS: '3650',
      // Um .env local não pode mudar o cenário do teste: o dotenv não sobrescreve variáveis já definidas.
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
  assert.equal(login.status, 200, `login do administrador falhou. ${logs}`);
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

test('as listas administrativas informam o total e encontram registros fora da primeira página', { timeout: 30_000 }, async () => {
  const firstPage = await adminGet('/api/admin/applications?limit=2');
  assert.equal(firstPage.items.length, 2, 'o limite pedido é respeitado');
  assert.equal(firstPage.total, seededApplications, 'o total real da base acompanha a resposta');
  assert.equal(firstPage.limit, 2);
  assert.equal(firstPage.offset, 0);
  assert.ok(firstPage.total > firstPage.items.length, 'a resposta revela que existem mais registros do que os exibidos');

  const secondPage = await adminGet('/api/admin/applications?limit=2&offset=2');
  assert.equal(secondPage.items.length, 2);
  const firstIds = new Set(firstPage.items.map((item) => item.id));
  assert.ok(secondPage.items.every((item) => !firstIds.has(item.id)), 'a página seguinte não repete registros');

  // A pessoa procurada está fora da primeira página: a busca precisa acontecer no servidor.
  const searched = await adminGet('/api/admin/applications?limit=2&q=Pessoa Candidata 5');
  assert.equal(searched.total, 1, 'a busca alcança registros que não caberiam na página');
  assert.equal(searched.items[0].full_name, 'Pessoa Candidata 5');

  const byStatus = await adminGet('/api/admin/applications?status=Em análise');
  assert.equal(byStatus.total, 0, 'o filtro de status é aplicado antes do corte da página');

  const talent = await adminGet('/api/admin/talent?limit=1&q=Talento 4');
  assert.equal(talent.total, 1);
  assert.equal(talent.items[0].full_name, 'Talento 4');

  const leads = await adminGet('/api/admin/leads?limit=2&q=Empresa 3');
  assert.equal(leads.total, 1);
  assert.equal(leads.items[0].company, 'Empresa 3');

  const privacy = await adminGet('/api/admin/privacy-requests?limit=2');
  assert.equal(privacy.total, seededApplications);
  const privacyByType = await adminGet('/api/admin/privacy-requests?q=Acesso aos dados&limit=1');
  assert.equal(privacyByType.total, seededApplications, 'a busca por tipo de pedido também é feita no servidor');

  const audit = await adminGet('/api/admin/audit?limit=5');
  assert.ok(audit.total >= audit.items.length, 'a auditoria também devolve o total');
  assert.equal(audit.items.length, 5);
  const auditSearch = await adminGet('/api/admin/audit?q=admin@example.test');
  assert.ok(auditSearch.total >= 1, 'a busca da auditoria encontra eventos pelo usuário');

  const limited = await adminGet('/api/admin/applications?limit=0');
  assert.equal(limited.items.length, 1, 'limite inválido cai no mínimo de um registro');
  const negative = await adminGet('/api/admin/applications?offset=-10');
  assert.equal(negative.offset, 0, 'deslocamento negativo é tratado como zero');
});

test('falha de envio de e-mail fica registrada e visível no painel', { timeout: 30_000 }, async () => {
  const beforeSubmit = await adminGet('/api/admin/email-settings');
  assert.ok(Array.isArray(beforeSubmit.recent_events), 'o painel recebe o histórico de envios');
  assert.equal(beforeSubmit.health.attention, false, 'sem SMTP configurado não há alerta de falha');

  // Host inexistente: a configuração fica válida para o painel, mas a conexão falha de propósito.
  const saved = await putAdmin('/api/admin/email-settings', {
    SMTP_HOST: 'smtp.inexistente.test', SMTP_PORT: '587', SMTP_SECURE: false,
    SMTP_USER: 'contato@example.test', SMTP_PASS: smtpPassword, EMAIL_FROM: 'IM Personnel <contato@example.test>',
    LEADS_NOTIFICATION_EMAIL: 'equipe@example.test',
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.configured, true);

  const submission = await fetch(`${baseUrl}/api/privacy-requests`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ full_name: 'Titular do Teste', email: 'titular.teste@example.test', request_type: 'Correção de dados', details: 'Pedido enviado durante a verificação.' }),
  });
  assert.equal(submission.status, 201, 'o formulário responde mesmo quando o SMTP está quebrado');

  const events = await waitForEvent('privacy_customer', 'failed');
  const failure = events.find((event) => event.template_key === 'privacy_customer' && event.status === 'failed');
  assert.ok(failure, 'a tentativa de envio que falhou aparece no histórico do painel');
  assert.ok(failure.recipient.includes('titular.teste@example.test'), 'o histórico guarda o destinatário');
  assert.ok(failure.detail.length > 0, 'o motivo da falha é registrado para diagnóstico');
  assert.ok(!failure.detail.includes(smtpPassword), 'a senha do SMTP nunca aparece no detalhe da falha');

  const health = (await adminGet('/api/admin/email-settings')).health;
  assert.equal(health.attention, true, 'o painel passa a indicar que a entrega precisa de atenção');
  assert.ok(health.failures_24h >= 1);
  assert.ok(!JSON.stringify(health).includes(smtpPassword), 'a senha não vaza pelo resumo de saúde');

  const dashboard = await adminGet('/api/admin/dashboard');
  assert.equal(dashboard.email_health.attention, true, 'o dashboard mostra o alerta de entrega');
  assert.ok(dashboard.email_health.last_error.length > 0);

  const auditTrail = await adminGet('/api/admin/audit?limit=200');
  assert.ok(auditTrail.items.every((item) => !item.details.includes(smtpPassword)), 'a trilha de auditoria também não guarda a senha');

  // Volta ao estado desativado para não deixar tentativas de conexão pendentes após o teste.
  const cleared = await putAdmin('/api/admin/email-settings', { SMTP_HOST: '', EMAIL_FROM: '', SMTP_PASS: '', LEADS_NOTIFICATION_EMAIL: '' });
  assert.equal(cleared.response.status, 200);
  assert.equal(cleared.data.configured, false);

  const afterClearing = (await adminGet('/api/admin/email-settings')).health;
  assert.equal(afterClearing.attention, false, 'sem SMTP configurado o alerta de falha não fica pendurado');
  const keptHistory = await adminGet('/api/admin/email-settings');
  assert.ok(keptHistory.recent_events.some((event) => event.status === 'failed'), 'o histórico permanece para consulta depois de desligar o SMTP');
});

test('vagas e conteúdos têm prévia própria para compartilhamento', { timeout: 30_000 }, async () => {
  const job = await fetch(`${baseUrl}/vagas/vaga-de-teste`).then((response) => response.text());
  assert.match(job, /<meta property="og:title" content="Vaga de teste em Recife, PE \| IM Personnel" \/>/, 'o cargo e a cidade aparecem na prévia');
  assert.match(job, /<title>Vaga de teste em Recife, PE \| IM Personnel<\/title>/, 'o título do documento muda por rota');
  assert.match(job, /<meta property="og:url" content="https:\/\/impersonnel\.com\.br\/vagas\/vaga-de-teste" \/>/);
  assert.match(job, /<meta property="og:image" content="https:\/\/impersonnel\.com\.br\/images\/hero-team\.jpg" \/>/, 'a imagem da prévia é um endereço absoluto');
  assert.match(job, /<link rel="canonical" href="https:\/\/impersonnel\.com\.br\/vagas\/vaga-de-teste" \/>/);
  assert.doesNotMatch(job, /<meta name="robots" content="noindex/, 'vaga publicada continua indexável');

  // O slug vem da própria API: os artigos revisados são carregados pelo servidor na primeira execução.
  const published = await fetch(`${baseUrl}/api/articles`).then((response) => response.json());
  const firstArticle = published.items[0];
  const article = await fetch(`${baseUrl}/conteudos/${firstArticle.slug}`).then((response) => response.text());
  assert.match(article, /<meta property="og:type" content="article" \/>/);
  assert.ok(article.includes(`<title>${firstArticle.title} | IM Personnel</title>`), 'o título do artigo entra na prévia');
  assert.match(article, /<meta property="og:image" content="https:\/\/impersonnel\.com\.br\/images\/hero-team\.jpg" \/>/, 'sem capa própria, o artigo usa a imagem padrão');

  const missing = await fetch(`${baseUrl}/vagas/vaga-que-nao-existe`).then((response) => response.text());
  assert.match(missing, /<meta name="robots" content="noindex, follow" \/>/, 'página de vaga inexistente não é indexada');

  const admin = await fetch(`${baseUrl}/admin/dashboard`).then((response) => response.text());
  assert.match(admin, /<meta name="robots" content="noindex, nofollow" \/>/, 'o painel nunca é indexado');
  assert.match(admin, /<title>IM Personnel/, 'o painel mantém o título da marca');

  const home = await fetch(`${baseUrl}/`).then((response) => response.text());
  assert.match(home, /<link rel="canonical" href="https:\/\/impersonnel\.com\.br\/" \/>/);
  assert.ok(home.includes('id="root"'), 'o HTML entregue continua sendo o da aplicação');
});

async function waitForEvent(templateKey, status) {
  const deadline = Date.now() + 12_000;
  let events = [];
  while (Date.now() < deadline) {
    events = (await adminGet('/api/admin/email-settings')).recent_events || [];
    if (events.some((event) => event.template_key === templateKey && event.status === status)) return events;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Nenhum evento ${status} de ${templateKey} foi registrado. Registros do servidor: ${logs}`);
}

async function adminGet(route) {
  const response = await fetch(`${baseUrl}${route}`, { headers: { cookie } });
  assert.ok(response.ok, `GET ${route} respondeu ${response.status}`);
  return response.json();
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
