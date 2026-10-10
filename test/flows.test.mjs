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
    env: { ...process.env, NODE_ENV: 'production', DATA_DIR: dataDir, PORT: String(port), SITE_URL: 'https://impersonnel.com.br', APPLICATION_RETENTION_DAYS: '365', TALENT_RETENTION_DAYS: '365', LEAD_RETENTION_DAYS: '365', PRIVACY_REQUEST_RETENTION_DAYS: '365', AUDIT_RETENTION_DAYS: '365' },
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
