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
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'im-personnel-flows-'));
const adminPassword = 'StrongAdminPass123!';
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
    env: { ...process.env, NODE_ENV: 'production', DATA_DIR: dataDir, PORT: String(port), SITE_URL: 'https://impersonnel.com.br', APPLICATION_RETENTION_DAYS: '365', TALENT_RETENTION_DAYS: '365', LEAD_RETENTION_DAYS: '365', PRIVACY_REQUEST_RETENTION_DAYS: '365', AUDIT_RETENTION_DAYS: '365', ADMIN_BOOTSTRAP_EMAIL: '', ADMIN_BOOTSTRAP_PASSWORD_HASH: '', LEADS_NOTIFICATION_EMAIL: '', SMTP_HOST: '', EMAIL_FROM: '' },
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

test('portal, applications, leads, talent, CMS and protected administration work end to end', { timeout: 30_000 }, async () => {
  const health = await fetch(`${baseUrl}/api/health`).then((response) => response.json());
  assert.equal(health.ok, true);
  const initialJobs = await fetch(`${baseUrl}/api/jobs`).then((response) => response.json());
  assert.equal(initialJobs.total, 0, 'no invented jobs should be shown');
  const defaultArticles = await fetch(`${baseUrl}/api/articles`).then((response) => response.json());
  assert.equal(defaultArticles.items.length, 3, 'editorial articles are seeded from reviewed source content');
  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  assert.equal(sitemapResponse.status, 200);
  assert.match(await sitemapResponse.text(), /<urlset/);
  assert.equal((await fetch(`${baseUrl}/api/admin/dashboard`)).status, 401, 'dashboard requires authentication');

  const lead = await postJson('/api/leads', {
    contact_name: 'Pessoa de teste', contact_role: 'RH', company: 'Empresa de teste', email: 'rh@example.test', phone: '+55 81 99999-0000',
    segment: 'Serviços', city: 'Recife', state: 'PE', service: 'Recrutamento e Seleção', position_count: '1 posição', need: 'Apoio para uma posição de teste.', desired_timeline: 'A definir em conversa',
  });
  assert.equal(lead.response.status, 201);
  assert.match(lead.data.reference, /^IM-/);
  const privacyRequest = await postJson('/api/privacy-requests', { full_name: 'Titular de teste', email: 'titular@example.test', request_type: 'Acesso aos dados', details: 'Solicitação automatizada de teste.' });
  assert.equal(privacyRequest.response.status, 201);

  const badLogin = await postJson('/api/admin/login', { email: 'admin@example.test', password: 'incorrect' });
  assert.equal(badLogin.response.status, 401);
  const loginResponse = await postJson('/api/admin/login', { email: 'admin@example.test', password: adminPassword });
  assert.equal(loginResponse.response.status, 200);
  cookie = loginResponse.response.headers.get('set-cookie').split(';')[0];
  csrf = loginResponse.data.csrf;
  assert.ok(csrf);

  const headers = { cookie, 'x-csrf-token': csrf };
  const noCsrf = await fetch(`${baseUrl}/api/admin/jobs`, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noCsrf.status, 403, 'administrative mutations require CSRF validation');

  const createdJob = await postAdmin('/api/admin/jobs', {
    title: 'Analista de Testes', hiring_organization: 'Empresa de teste', area: 'Tecnologia', city: 'Recife', state: 'PE', modality: 'Híbrido', employment_type: 'CLT',
    summary: 'Oportunidade de teste automatizado para validar o portal de carreiras.', responsibilities: ['Apoiar os testes do portal'], requirements: ['Experiência profissional'],
    differentiators: ['Conhecimento de qualidade'], benefits: [], published: false, featured: true, expires_at: '',
  });
  assert.equal(createdJob.response.status, 201);
  const job = createdJob.data.job;
  assert.equal(job.published, false);
  assert.equal((await fetch(`${baseUrl}/api/jobs`).then((response) => response.json())).total, 0, 'drafts are private');

  const publish = await putAdmin(`/api/admin/jobs/${job.id}`, { ...job, published: true, featured: true });
  assert.equal(publish.response.status, 200);
  const publicJobs = await fetch(`${baseUrl}/api/jobs?area=${encodeURIComponent('Tecnologia')}`).then((response) => response.json());
  assert.equal(publicJobs.total, 1);
  assert.equal(publicJobs.items[0].slug, job.slug);
  assert.equal(publicJobs.items[0].hiring_organization, 'Empresa de teste');
  const filterValues = await fetch(`${baseUrl}/api/jobs/filters`).then((response) => response.json());
  assert.equal(filterValues.areas[0], 'Tecnologia');
  assert.equal(filterValues.states[0], 'PE');
  assert.equal((await fetch(`${baseUrl}/api/jobs?state=PE`).then((response) => response.json())).total, 1);
  assert.equal((await fetch(`${baseUrl}/api/jobs/${job.slug}`).then((response) => response.json())).job.title, 'Analista de Testes');

  const applicationForm = new FormData();
  applicationForm.set('job_slug', job.slug); applicationForm.set('full_name', 'Candidata de teste'); applicationForm.set('email', 'candidate@example.test');
  applicationForm.set('phone', '+55 81 98888-0000'); applicationForm.set('city', 'Recife'); applicationForm.set('state', 'PE');
  applicationForm.set('linkedin', ''); applicationForm.set('cover_letter', 'Apresentação de teste automatizado.'); applicationForm.set('website', '');
  applicationForm.append('resume', new Blob(['%PDF-1.4\nIM Personnel test PDF'], { type: 'application/pdf' }), 'curriculo.pdf');
  const applicationResponse = await fetch(`${baseUrl}/api/applications`, { method: 'POST', body: applicationForm });
  const application = await applicationResponse.json();
  assert.equal(applicationResponse.status, 201);
  assert.match(application.reference, /^IM-/);

  const adminApplications = await fetch(`${baseUrl}/api/admin/applications`, { headers }).then((response) => response.json());
  assert.equal(adminApplications.items.length, 1);
  const savedApplication = adminApplications.items[0];
  const download = await fetch(`${baseUrl}/api/admin/files/${savedApplication.resume_key}`, { headers: { cookie } });
  assert.equal(download.status, 200);
  assert.match(await download.text(), /^%PDF-1\.4/);
  const updatedApplication = await putAdmin(`/api/admin/applications/${savedApplication.id}`, { status: 'Em análise', internal_notes: 'Registro de teste.' });
  assert.equal(updatedApplication.response.status, 200);

  const invalidForm = new FormData();
  invalidForm.set('job_slug', job.slug); invalidForm.set('full_name', 'Arquivo inválido'); invalidForm.set('email', 'invalid@example.test');
  invalidForm.set('phone', '+55 81 90000-0000'); invalidForm.set('city', 'Recife'); invalidForm.set('state', 'PE'); invalidForm.set('website', '');
  invalidForm.append('resume', new Blob(['not a PDF'], { type: 'application/pdf' }), 'curriculo.pdf');
  assert.equal((await fetch(`${baseUrl}/api/applications`, { method: 'POST', body: invalidForm })).status, 400, 'server verifies file signatures');
  const afterInvalidUpload = await fetch(`${baseUrl}/api/admin/applications`, { headers }).then((response) => response.json());
  assert.equal(afterInvalidUpload.items.length, 1, 'invalid documents are not stored as applications');

  const talentForm = new FormData();
  talentForm.set('full_name', 'Talento de teste'); talentForm.set('email', 'talent@example.test'); talentForm.set('phone', '+55 81 97777-0000');
  talentForm.set('city', 'Recife'); talentForm.set('state', 'PE'); talentForm.set('area', 'Recursos Humanos'); talentForm.set('linkedin', ''); talentForm.set('website', '');
  talentForm.append('resume', new Blob(['%PDF-1.4\nIM Personnel talent test'], { type: 'application/pdf' }), 'cv.pdf');
  const withoutConsent = await fetch(`${baseUrl}/api/talent`, { method: 'POST', body: talentForm });
  assert.equal(withoutConsent.status, 400, 'talent bank requires explicit authorization');
  const consentForm = new FormData();
  for (const [key, value] of talentForm.entries()) if (key !== 'resume') consentForm.set(key, value);
  consentForm.set('consent', 'true'); consentForm.append('resume', new Blob(['%PDF-1.4\nIM Personnel talent test'], { type: 'application/pdf' }), 'cv.pdf');
  assert.equal((await fetch(`${baseUrl}/api/talent`, { method: 'POST', body: consentForm })).status, 201);
  const talents = await fetch(`${baseUrl}/api/admin/talent`, { headers }).then((response) => response.json());
  assert.equal(talents.items.length, 1);
  assert.ok(talents.items[0].consent_at);
  assert.equal((await deleteAdmin(`/api/admin/talent/${talents.items[0].id}`)).status, 200);

  const adminLeads = await fetch(`${baseUrl}/api/admin/leads`, { headers }).then((response) => response.json());
  assert.equal(adminLeads.items.length, 1);
  assert.equal((await putAdmin(`/api/admin/leads/${adminLeads.items[0].id}`, { status: 'Em atendimento', assigned_to: 'Equipe de teste', notes: 'Primeiro contato.' })).response.status, 200);
  assert.equal((await deleteAdmin(`/api/admin/leads/${adminLeads.items[0].id}`)).status, 200);

  const privacyItems = await fetch(`${baseUrl}/api/admin/privacy-requests`, { headers }).then((response) => response.json());
  assert.equal(privacyItems.items.length, 1);
  assert.equal((await putAdmin(`/api/admin/privacy-requests/${privacyItems.items[0].id}`, { status: 'Em atendimento', internal_notes: 'Validar identidade.' })).response.status, 200);

  const articleCreate = await postAdmin('/api/admin/articles', {
    title: 'Conteúdo de teste do painel', category: 'Gestão', intro: 'Resumo do conteúdo de teste para validar o gerenciamento editorial.',
    body: ['Primeiro parágrafo do artigo.', 'Segundo parágrafo de teste.'], minutes: 3, published: true,
  });
  assert.equal(articleCreate.response.status, 201);
  const article = articleCreate.data.article;
  assert.equal((await fetch(`${baseUrl}/api/articles/${article.slug}`).then((response) => response.json())).article.title, article.title);
  const unpublishArticle = await putAdmin(`/api/admin/articles/${article.id}`, { ...article, published: false });
  assert.equal(unpublishArticle.response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/articles/${article.slug}`)).status, 404, 'unpublished articles are not public');

  const duplicate = await postAdmin(`/api/admin/jobs/${job.id}/duplicate`, {});
  assert.equal(duplicate.response.status, 201);
  assert.equal(duplicate.data.job.published, false);

  const expired = await putAdmin(`/api/admin/jobs/${job.id}`, { ...job, published: true, expires_at: '2020-01-01' });
  assert.equal(expired.response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/jobs/${job.slug}`)).status, 404, 'expired jobs are not public');
  const currentSitemap = await fetch(`${baseUrl}/sitemap.xml`).then((response) => response.text());
  assert.doesNotMatch(currentSitemap, new RegExp(`/vagas/${job.slug}`), 'expired opportunities are removed from the sitemap');

  const audit = await fetch(`${baseUrl}/api/admin/audit`, { headers }).then((response) => response.json());
  assert.ok(audit.items.some((item) => item.action === 'resume.downloaded'));
  assert.ok(audit.items.some((item) => item.action === 'article.created'));
  assert.equal((await postAdmin('/api/admin/logout', {})).response.status, 200);
  assert.equal((await fetch(`${baseUrl}/api/admin/dashboard`, { headers })).status, 401, 'logout revokes the session');
});

async function getFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}
async function postJson(route, body) {
  const response = await fetch(`${baseUrl}${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json() };
}
async function postAdmin(route, body) {
  const response = await fetch(`${baseUrl}${route}`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json() };
}
async function putAdmin(route, body) {
  const response = await fetch(`${baseUrl}${route}`, { method: 'PUT', headers: { cookie, 'x-csrf-token': csrf, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { response, data: await response.json() };
}
async function deleteAdmin(route) {
  return fetch(`${baseUrl}${route}`, { method: 'DELETE', headers: { cookie, 'x-csrf-token': csrf } });
}

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const strongPassword = 'NovaSenhaForte2026!';

async function loginAs(email, password) {
  const response = await fetch(`${baseUrl}/api/admin/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const data = await response.json().catch(() => ({}));
  return { response, data, cookie: response.headers.get('set-cookie')?.split(';')[0] || '', csrf: data.csrf || '' };
}
async function useMainAdmin() {
  const result = await loginAs('admin@example.test', adminPassword);
  assert.equal(result.response.status, 200, 'o administrador principal continua acessando o painel');
  cookie = result.cookie; csrf = result.csrf;
  return result;
}
function articleForm(overrides = {}) {
  const form = new FormData();
  form.set('title', 'Conteúdo com imagem de capa');
  form.set('category', 'Cultura');
  form.set('intro', 'Resumo do conteúdo usado para validar o envio de imagem pelo painel.');
  form.set('body', 'Primeiro parágrafo do conteúdo.\n\nSegundo parágrafo do conteúdo.');
  form.set('minutes', '5');
  form.set('published', 'true');
  form.set('remove_image', 'false');
  form.set('image_alt', 'Imagem de teste do painel');
  for (const [key, value] of Object.entries(overrides)) form.set(key, String(value));
  return form;
}

test('conteúdos aceitam imagem de capa enviada pelo painel', { timeout: 30_000 }, async () => {
  await useMainAdmin();
  const form = articleForm();
  form.append('image', new Blob([PNG_1x1], { type: 'image/png' }), 'capa.png');
  const createResponse = await fetch(`${baseUrl}/api/admin/articles`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf }, body: form });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201);
  const article = created.article;
  assert.match(article.image_key, /^[a-f0-9-]{36}\.png$/, 'a imagem recebe uma chave uuid com a extensão correta');
  assert.equal(article.image_url, `/media/content-images/${article.image_key}`);
  assert.equal(article.image_alt, 'Imagem de teste do painel');
  assert.equal(article.published, true);

  const publicArticle = await fetch(`${baseUrl}/api/articles/${article.slug}`).then((response) => response.json());
  assert.equal(publicArticle.article.image_url, article.image_url, 'a imagem é exposta no conteúdo público');

  const imageResponse = await fetch(`${baseUrl}${article.image_url}`);
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers.get('content-type'), /image\/png/);
  assert.equal(Buffer.compare(Buffer.from(await imageResponse.arrayBuffer()), PNG_1x1), 0, 'a imagem servida é a mesma enviada');

  const invalid = articleForm({ title: 'Conteúdo com arquivo inválido' });
  invalid.append('image', new Blob(['isto não é uma imagem'], { type: 'image/png' }), 'falsa.png');
  assert.equal((await fetch(`${baseUrl}/api/admin/articles`, { method: 'POST', headers: { cookie, 'x-csrf-token': csrf }, body: invalid })).status, 400, 'a assinatura da imagem é validada no servidor');

  const traversal = await fetch(`${baseUrl}/media/content-images/..%2f..%2fim-personnel.sqlite`);
  assert.equal(traversal.status, 404, 'chaves inválidas não alcançam o disco');

  const keepForm = articleForm({ title: 'Título revisado do conteúdo' });
  const updateResponse = await fetch(`${baseUrl}/api/admin/articles/${article.id}`, { method: 'PUT', headers: { cookie, 'x-csrf-token': csrf }, body: keepForm });
  const updated = await updateResponse.json();
  assert.equal(updateResponse.status, 200);
  assert.equal(updated.article.image_key, article.image_key, 'editar sem enviar arquivo mantém a imagem atual');
  assert.equal(updated.article.title, 'Título revisado do conteúdo');

  const removeForm = articleForm({ remove_image: 'true' });
  const removed = await (await fetch(`${baseUrl}/api/admin/articles/${article.id}`, { method: 'PUT', headers: { cookie, 'x-csrf-token': csrf }, body: removeForm })).json();
  assert.equal(removed.article.image_url, '', 'remover a imagem limpa o campo');
  assert.equal((await fetch(`${baseUrl}${article.image_url}`)).status, 404, 'o arquivo da imagem removida sai do ar');
});

test('o painel cria e desativa usuários administrativos', { timeout: 30_000 }, async () => {
  await useMainAdmin();
  const listing = await fetch(`${baseUrl}/api/admin/users`, { headers: { cookie } }).then((response) => response.json());
  assert.ok(listing.items.some((user) => user.email === 'admin@example.test'));
  assert.ok(listing.current_user_id, 'a lista informa quem está operando o painel');
  assert.ok(listing.items.every((user) => !('password_hash' in user) && !('salt' in user)), 'credenciais nunca são expostas');

  const weak = await postAdmin('/api/admin/users', { name: 'Senha Fraca', email: 'fraco@example.test', password: 'curta1' });
  assert.equal(weak.response.status, 400);

  const created = await postAdmin('/api/admin/users', { name: 'Pessoa Recrutadora', email: 'recrutadora@example.test', password: strongPassword });
  assert.equal(created.response.status, 201);
  assert.equal(created.data.user.active, true);
  assert.equal(created.data.user.name, 'Pessoa Recrutadora');

  const duplicate = await postAdmin('/api/admin/users', { name: 'Duplicada', email: 'recrutadora@example.test', password: strongPassword });
  assert.equal(duplicate.response.status, 409, 'e-mail administrativo é único');

  const newUser = await loginAs('recrutadora@example.test', strongPassword);
  assert.equal(newUser.response.status, 200, 'a nova conta entra no painel');
  assert.equal(newUser.data.user.name, 'Pessoa Recrutadora');
  const asNewUser = await fetch(`${baseUrl}/api/admin/jobs`, { headers: { cookie: newUser.cookie } });
  assert.equal(asNewUser.status, 200, 'a nova conta lê dados administrativos');

  assert.equal((await putAdmin(`/api/admin/users/${listing.current_user_id}`, { active: false })).response.status, 409, 'ninguém desativa a própria conta em uso');

  const deactivated = await putAdmin(`/api/admin/users/${created.data.user.id}`, { active: false });
  assert.equal(deactivated.response.status, 200);
  assert.equal(deactivated.data.user.active, false);

  const revokedSession = await fetch(`${baseUrl}/api/admin/session`, { headers: { cookie: newUser.cookie } }).then((response) => response.json());
  assert.equal(revokedSession.authenticated, false, 'desativar derruba a sessão que estava aberta');
  assert.equal((await fetch(`${baseUrl}/api/admin/jobs`, { headers: { cookie: newUser.cookie } })).status, 401);

  const blockedLogin = await loginAs('recrutadora@example.test', strongPassword);
  assert.equal(blockedLogin.response.status, 403, 'conta desativada não entra mais');
  assert.match(blockedLogin.data.error, /desativada/i);

  const reactivated = await putAdmin(`/api/admin/users/${created.data.user.id}`, { active: true, name: 'Pessoa Recrutadora Sênior', password: 'OutraSenhaForte2026!' });
  assert.equal(reactivated.response.status, 200);
  assert.equal(reactivated.data.user.active, true);
  assert.equal(reactivated.data.user.name, 'Pessoa Recrutadora Sênior');
  // Um único login aqui comprova ao mesmo tempo a reativação e a troca de senha.
  const afterReset = await loginAs('recrutadora@example.test', 'OutraSenhaForte2026!');
  assert.equal(afterReset.response.status, 200, 'reativar devolve o acesso e a nova senha passa a valer');

  await putAdmin(`/api/admin/users/${created.data.user.id}`, { active: false });
  const finalListing = await fetch(`${baseUrl}/api/admin/users`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(finalListing.items.filter((user) => user.active).length, 1, 'sempre resta ao menos uma conta ativa');

  const auditTrail = await fetch(`${baseUrl}/api/admin/audit`, { headers: { cookie } }).then((response) => response.json());
  for (const action of ['admin_user.created', 'admin_user.deactivated', 'admin_user.activated', 'admin_user.password_reset', 'article.created', 'article.updated']) {
    assert.ok(auditTrail.items.some((item) => item.action === action), `a auditoria registra ${action}`);
  }
});
