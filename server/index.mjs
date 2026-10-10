import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import { all, get, initializeDatabase, persistDatabase, run } from './db.mjs';
import { verifyPassword } from './auth.mjs';
import { isEmailConfigured, sendMessage } from './mailer.mjs';
import insightDefaults from '../content/insights.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const storagePath = path.resolve(process.env.DATA_DIR || path.join(root, 'storage'));
const resumesPath = path.join(storagePath, 'private-resumes');
const NOTICE_VERSION = '2026-10-v1';
const app = express();
const sessions = new Map();
const sessionCleanup = setInterval(() => { const now = Date.now(); for (const [key, session] of sessions) if (session.expiresAt <= now) sessions.delete(key); }, 15 * 60 * 1000);
sessionCleanup.unref();
const isProduction = process.env.NODE_ENV === 'production';
const retentionPolicy = readRetentionPolicy(isProduction);
const allowedApplicationStatuses = ['Candidatura recebida', 'Em análise', 'Em processo seletivo', 'Encerrada'];
const allowedLeadStatuses = ['Novo contato', 'Em atendimento', 'Reunião agendada', 'Proposta enviada', 'Em negociação', 'Convertido', 'Não convertido'];
const nowIso = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
function readRetentionPolicy(required) {
  const keys = ['APPLICATION_RETENTION_DAYS', 'TALENT_RETENTION_DAYS', 'LEAD_RETENTION_DAYS', 'PRIVACY_REQUEST_RETENTION_DAYS', 'AUDIT_RETENTION_DAYS'];
  const policy = {};
  const missing = [];
  for (const key of keys) {
    const raw = process.env[key] || '';
    const days = /^\d+$/.test(raw) ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(days) || days < 1 || days > 36500) missing.push(key);
    else policy[key] = days;
  }
  if (required && missing.length) throw new Error(`Configure prazos de retenção aprovados antes da produção: ${missing.join(', ')}`);
  return policy;
}
const asText = (value, max = 4000) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const asEmail = (value) => asText(value, 254).toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const validPhone = (value) => /^[+()\d\s.-]{8,24}$/.test(value);
function validLinkedIn(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (url.hostname === 'linkedin.com' || url.hostname.endsWith('.linkedin.com')) && !url.username && !url.password;
  } catch { return false; }
}
const safeJsonArray = (value) => {
  if (Array.isArray(value)) return value.map((item) => asText(item, 500)).filter(Boolean).slice(0, 35);
  return String(value || '').split(/\r?\n/).map((item) => asText(item, 500)).filter(Boolean).slice(0, 35);
};
const slugify = (value) => asText(value, 90).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
const reference = (id) => `IM-${id.replaceAll('-', '').slice(0, 8).toUpperCase()}`;
function purgeExpiredData() {
  const retentionTargets = [
    ['applications', 'APPLICATION_RETENTION_DAYS', true],
    ['talent_profiles', 'TALENT_RETENTION_DAYS', true],
    ['leads', 'LEAD_RETENTION_DAYS', false],
    ['privacy_requests', 'PRIVACY_REQUEST_RETENTION_DAYS', false],
    ['audit_log', 'AUDIT_RETENTION_DAYS', false],
  ];
  let deleted = 0;
  for (const [table, key, hasResume] of retentionTargets) {
    const days = retentionPolicy[key];
    if (!days) continue;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const rows = all(`SELECT id${hasResume ? ', resume_key' : ''} FROM ${table} WHERE created_at < ?`, [cutoff]);
    for (const row of rows) {
      if (hasResume && row.resume_key) discardUpload({ path: path.join(resumesPath, path.basename(row.resume_key)) });
      run(`DELETE FROM ${table} WHERE id = ?`, [row.id]);
    }
    deleted += rows.length;
  }
  if (deleted) { persistDatabase(); console.log(`Retention policy removed ${deleted} expired records.`); }
}

await fs.promises.mkdir(resumesPath, { recursive: true, mode: 0o700 });
await fs.promises.chmod(resumesPath, 0o700);
await initializeDatabase();
if (Number(get('SELECT COUNT(*) AS count FROM articles')?.count || 0) === 0) {
  const created = nowIso();
  for (const article of insightDefaults) {
    const id = uuid();
    run('INSERT INTO articles (id, slug, category, title, intro, body, minutes, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)', [id, article.slug, article.category, article.title, article.intro, JSON.stringify(article.body), article.minutes, created, created]);
  }
  persistDatabase();
}
purgeExpiredData();
const retentionTimer = setInterval(() => {
  try { purgeExpiredData(); }
  catch { console.error('Periodic retention cleanup failed; verify storage permissions and database health.'); }
}, 24 * 60 * 60 * 1000);
retentionTimer.unref();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  frameguard: isProduction ? { action: 'deny' } : false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      fontSrc: ["'self'", 'data:'],
      formAction: ["'self'"],
      frameAncestors: isProduction ? ["'none'"] : ["'self'", 'https://*.e2b.app'],
      imgSrc: ["'self'", 'https://impersonnel.com.br', 'data:', 'blob:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      upgradeInsecureRequests: isProduction ? [] : null,
    },
  },
  crossOriginResourcePolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

const createFormLimiter = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.' } });
const applicationLimiter = createFormLimiter();
const talentLimiter = createFormLimiter();
const leadLimiter = createFormLimiter();
const privacyLimiter = createFormLimiter();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.' } });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, resumesPath),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${uuid()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const valid = (ext === '.pdf' && file.mimetype === 'application/pdf') ||
      (ext === '.docx' && file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    cb(valid ? null : new Error('Envie o currículo em PDF ou DOCX.'), valid);
  },
});

function uploadLooksValid(file) {
  if (!file) return false;
  fs.chmodSync(file.path, 0o600);
  const prefix = fs.readFileSync(file.path).subarray(0, 8);
  if (file.mimetype === 'application/pdf') return prefix.subarray(0, 5).toString() === '%PDF-';
  return file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' && prefix[0] === 0x50 && prefix[1] === 0x4b;
}
function discardUpload(file) {
  if (file?.path) fs.rmSync(file.path, { force: true });
}
function parseCookie(req, name) {
  const cookies = (req.headers.cookie || '').split(';');
  const entry = cookies.map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}
function getSession(req) {
  const key = parseCookie(req, 'im_admin');
  const session = key && sessions.get(key);
  if (!session || session.expiresAt < Date.now()) {
    if (key) sessions.delete(key);
    return null;
  }
  return { key, ...session };
}
function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Sua sessão expirou. Entre novamente.' });
  req.adminSession = session;
  next();
}
function requireCsrf(req, res, next) {
  if (!req.adminSession || req.get('x-csrf-token') !== req.adminSession.csrf) return res.status(403).json({ error: 'Não foi possível validar esta solicitação. Atualize a página e tente novamente.' });
  next();
}
function audit(req, action, entityType, entityId, details = {}) {
  run('INSERT INTO audit_log (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuid(), req.adminSession.email, action, entityType, entityId, JSON.stringify(details), nowIso()]);
  persistDatabase();
}
function activeDateFilter() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function jobToPublic(row) {
  if (!row) return null;
  const { responsibilities, requirements, differentiators, benefits, ...job } = row;
  return {
    ...job,
    published: Boolean(Number(job.published)),
    featured: Boolean(Number(job.featured)),
    responsibilities: JSON.parse(responsibilities || '[]'),
    requirements: JSON.parse(requirements || '[]'),
    differentiators: JSON.parse(differentiators || '[]'),
    benefits: JSON.parse(benefits || '[]'),
  };
}
function articleToPublic(row) {
  if (!row) return null;
  return { ...row, published: Boolean(Number(row.published)), body: JSON.parse(row.body || '[]') };
}
function cleanJobInput(body, existing = {}) {
  const title = asText(body.title ?? existing.title, 140);
  const hiringOrganization = asText(body.hiring_organization ?? existing.hiring_organization, 180);
  const area = asText(body.area ?? existing.area, 90);
  const city = asText(body.city ?? existing.city, 100);
  const state = asText(body.state ?? existing.state, 2).toUpperCase();
  const modality = asText(body.modality ?? existing.modality, 40);
  const employmentType = asText(body.employment_type ?? existing.employment_type, 70);
  const summary = asText(body.summary ?? existing.summary, 1500);
  return {
    title, hiring_organization: hiringOrganization, area, city, state, modality, employment_type: employmentType, summary,
    responsibilities: JSON.stringify(safeJsonArray(body.responsibilities ?? JSON.parse(existing.responsibilities || '[]'))),
    requirements: JSON.stringify(safeJsonArray(body.requirements ?? JSON.parse(existing.requirements || '[]'))),
    differentiators: JSON.stringify(safeJsonArray(body.differentiators ?? JSON.parse(existing.differentiators || '[]'))),
    benefits: JSON.stringify(safeJsonArray(body.benefits ?? JSON.parse(existing.benefits || '[]'))),
    published: body.published === undefined ? Number(existing.published || 0) : (body.published ? 1 : 0),
    featured: body.featured === undefined ? Number(existing.featured || 0) : (body.featured ? 1 : 0),
    expires_at: body.expires_at === undefined ? (existing.expires_at || null) : (asText(body.expires_at, 10) || null),
  };
}
function validateJob(job) {
  if (!job.title || !job.area || !job.city || !job.state || job.state.length !== 2 || !job.modality || !job.employment_type || !job.summary) return 'Preencha os campos obrigatórios da vaga.';
  if (job.expires_at && !/^\d{4}-\d{2}-\d{2}$/.test(job.expires_at)) return 'Informe uma data de encerramento válida.';
  return null;
}
function cleanArticleInput(body = {}, existing = {}) {
  const title = asText(body.title ?? existing.title, 180);
  const intro = asText(body.intro ?? existing.intro, 900);
  const category = asText(body.category ?? existing.category, 100);
  const slug = slugify(body.slug || existing.slug || title);
  const oldBody = JSON.parse(existing.body || '[]');
  const paragraphs = Array.isArray(body.body)
    ? body.body.map((item) => asText(item, 4000)).filter(Boolean).slice(0, 30)
    : String(body.body ?? oldBody.join('\n\n')).split(/\r?\n\s*\r?\n/).map((item) => asText(item, 4000)).filter(Boolean).slice(0, 30);
  const minutesValue = Number.parseInt(body.minutes ?? existing.minutes ?? '4', 10);
  return { title, intro, category, slug, body: JSON.stringify(paragraphs), minutes: Math.min(30, Math.max(1, Number.isFinite(minutesValue) ? minutesValue : 4)), published: body.published === undefined ? Number(existing.published || 0) : (body.published ? 1 : 0) };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/api/articles', (req, res) => {
  const limit = Math.min(30, Math.max(1, Number.parseInt(req.query.limit || '12', 10) || 12));
  const items = all('SELECT * FROM articles WHERE published = 1 ORDER BY created_at DESC LIMIT ?', [limit]).map(articleToPublic);
  res.json({ items });
});
app.get('/api/articles/:slug', (req, res) => {
  const row = get('SELECT * FROM articles WHERE slug = ? AND published = 1', [asText(req.params.slug, 120)]);
  if (!row) return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  res.json({ article: articleToPublic(row) });
});

app.get('/api/jobs', (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const perPage = Math.min(24, Math.max(1, Number.parseInt(req.query.per_page || '9', 10) || 9));
  const params = [activeDateFilter()];
  const where = ['published = 1', '(expires_at IS NULL OR expires_at >= ?)'];
  const search = asText(req.query.q, 140).toLowerCase();
  if (search) {
    const pattern = `%${search}%`;
    where.push('(lower(title) LIKE ? OR lower(area) LIKE ? OR lower(summary) LIKE ? OR lower(city) LIKE ?)');
    params.push(pattern, pattern, pattern, pattern);
  }
  const area = asText(req.query.area, 90);
  if (area) { where.push('area = ?'); params.push(area); }
  const city = asText(req.query.city, 100).toLowerCase();
  if (city) { where.push('lower(city) LIKE ?'); params.push(`%${city}%`); }
  const state = asText(req.query.state, 2).toUpperCase();
  if (state) { where.push('upper(state) = ?'); params.push(state); }
  const modality = asText(req.query.modality, 40);
  if (modality) { where.push('modality = ?'); params.push(modality); }
  const employment = asText(req.query.employment_type, 70);
  if (employment) { where.push('employment_type = ?'); params.push(employment); }
  const publishedWithin = asText(req.query.published_within, 16);
  const days = publishedWithin === 'week' ? 7 : publishedWithin === 'month' ? 30 : publishedWithin === 'today' ? 1 : 0;
  if (days) { where.push('created_at >= ?'); params.push(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()); }
  const count = Number(get(`SELECT COUNT(*) AS total FROM jobs WHERE ${where.join(' AND ')}`, params)?.total || 0);
  const sort = req.query.sort === 'oldest' ? 'created_at ASC' : 'created_at DESC';
  const rows = all(`SELECT id, slug, title, hiring_organization, area, city, state, modality, employment_type, summary, published, featured, expires_at, created_at, updated_at, responsibilities, requirements, differentiators, benefits FROM jobs WHERE ${where.join(' AND ')} ORDER BY featured DESC, ${sort} LIMIT ? OFFSET ?`, [...params, perPage, (page - 1) * perPage]);
  res.json({ items: rows.map(jobToPublic), total: count, page, per_page: perPage, pages: Math.ceil(count / perPage) });
});

app.get('/api/jobs/filters', (_req, res) => {
  const activeWhere = 'published = 1 AND (expires_at IS NULL OR expires_at >= ?)';
  const today = activeDateFilter();
  const values = (column) => all(`SELECT DISTINCT ${column} AS value FROM jobs WHERE ${activeWhere} AND ${column} <> '' ORDER BY ${column}`, [today]).map((row) => row.value);
  res.json({ areas: values('area'), cities: values('city'), states: values('state'), modalities: values('modality'), employment_types: values('employment_type') });
});

app.get('/api/jobs/:slug', (req, res) => {
  const row = get('SELECT * FROM jobs WHERE slug = ? AND published = 1 AND (expires_at IS NULL OR expires_at >= ?)', [asText(req.params.slug, 110), activeDateFilter()]);
  if (!row) return res.status(404).json({ error: 'Esta oportunidade não está disponível.' });
  res.json({ job: jobToPublic(row) });
});

app.post('/api/applications', applicationLimiter, upload.single('resume'), async (req, res) => {
  if (!uploadLooksValid(req.file)) {
    discardUpload(req.file);
    return res.status(400).json({ error: 'O arquivo enviado não parece ser um PDF ou DOCX válido. Confira o currículo e tente novamente.' });
  }
  const fullName = asText(req.body.full_name, 160);
  const email = asEmail(req.body.email);
  const phone = asText(req.body.phone, 30);
  const city = asText(req.body.city, 100);
  const state = asText(req.body.state, 2).toUpperCase();
  const linkedin = asText(req.body.linkedin, 500);
  const job = get('SELECT id, slug, title FROM jobs WHERE slug = ? AND published = 1 AND (expires_at IS NULL OR expires_at >= ?)', [asText(req.body.job_slug, 110), activeDateFilter()]);
  if (req.body.website || !job || !fullName || !validEmail(email) || !validPhone(phone) || !city || state.length !== 2 || !validLinkedIn(linkedin)) {
    discardUpload(req.file);
    return res.status(400).json({ error: req.body.website ? 'Não foi possível validar o envio.' : 'Confira os campos obrigatórios, o link do LinkedIn e tente novamente. A oportunidade pode ter sido encerrada.' });
  }
  const id = uuid();
  const created = nowIso();
  run(`INSERT INTO applications (id, job_id, full_name, email, phone, city, state, linkedin, cover_letter, answers, resume_key, status, privacy_notice_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, job.id, fullName, email, phone, city, state, linkedin, asText(req.body.cover_letter, 4000), JSON.stringify({}), path.basename(req.file.filename), 'Candidatura recebida', NOTICE_VERSION, created, created]);
  persistDatabase();
  const ref = reference(id);
  if (isEmailConfigured()) {
    sendMessage({ to: email, subject: 'Recebemos sua candidatura • IM Personnel', text: `Olá, ${fullName}.\n\nSua candidatura para ${job.title} foi recebida pelo portal da IM Personnel. Protocolo: ${ref}.\n\nEsta mensagem confirma o recebimento e não representa uma decisão sobre o processo seletivo.` })
      .catch(() => console.warn('Falha ao enviar confirmação de candidatura.'));
  }
  const notification = process.env.LEADS_NOTIFICATION_EMAIL;
  if (notification && isEmailConfigured()) {
    sendMessage({ to: notification, replyTo: email, subject: `Nova candidatura • ${job.title} • ${ref}`, text: `Uma candidatura foi registrada no portal da IM Personnel.\n\nVaga: ${job.title}\nProtocolo: ${ref}\nAcesse o painel administrativo para consultar os dados e o currículo.` })
      .catch(() => console.warn('Falha ao enviar notificação de candidatura.'));
  }
  res.status(201).json({ ok: true, reference: ref, message: 'Sua candidatura foi recebida. Obrigado por compartilhar seu perfil com a IM Personnel.' });
});

app.post('/api/talent', talentLimiter, upload.single('resume'), (req, res) => {
  if (!uploadLooksValid(req.file)) {
    discardUpload(req.file);
    return res.status(400).json({ error: 'Envie um currículo válido em PDF ou DOCX.' });
  }
  const fullName = asText(req.body.full_name, 160);
  const email = asEmail(req.body.email);
  const phone = asText(req.body.phone, 30);
  const city = asText(req.body.city, 100);
  const state = asText(req.body.state, 2).toUpperCase();
  const area = asText(req.body.area, 100);
  const linkedin = asText(req.body.linkedin, 500);
  if (req.body.website || !req.body.consent || !fullName || !validEmail(email) || !validPhone(phone) || !city || state.length !== 2 || !area || !validLinkedIn(linkedin)) {
    discardUpload(req.file);
    return res.status(400).json({ error: req.body.website ? 'Não foi possível validar o envio.' : 'Preencha os campos obrigatórios e marque a autorização para participar do banco de talentos.' });
  }
  const id = uuid();
  const created = nowIso();
  run(`INSERT INTO talent_profiles (id, full_name, email, phone, city, state, area, linkedin, resume_key, consent_at, privacy_notice_version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, fullName, email, phone, city, state, area, linkedin, path.basename(req.file.filename), created, NOTICE_VERSION, created, created]);
  persistDatabase();
  const ref = reference(id);
  if (isEmailConfigured()) {
    sendMessage({ to: email, subject: 'Seu perfil foi recebido • IM Personnel', text: `Olá, ${fullName}.\n\nSeu perfil foi incluído no banco de talentos da IM Personnel com sua autorização. Protocolo: ${ref}.\n\nVocê pode pedir a atualização ou remoção dos dados pelo canal de privacidade.` })
      .catch(() => console.warn('Falha ao enviar confirmação do banco de talentos.'));
  }
  res.status(201).json({ ok: true, reference: ref, message: 'Seu perfil foi recebido. Você poderá solicitar a atualização ou remoção dos dados pelo canal de privacidade.' });
});

app.post('/api/leads', leadLimiter, async (req, res) => {
  const body = req.body || {};
  if (body.website) return res.status(400).json({ error: 'Não foi possível validar o envio.' });
  const values = {
    contact_name: asText(body.contact_name, 160), contact_role: asText(body.contact_role, 120), company: asText(body.company, 180),
    email: asEmail(body.email), phone: asText(body.phone, 30), segment: asText(body.segment, 120), city: asText(body.city, 100),
    state: asText(body.state, 2).toUpperCase(), service: asText(body.service, 120), position_count: asText(body.position_count, 60),
    need: asText(body.need, 3000), desired_timeline: asText(body.desired_timeline, 100),
  };
  if (!values.contact_name || !values.company || !validEmail(values.email) || !validPhone(values.phone) || !values.city || values.state.length !== 2 || !values.service || values.need.length < 15) {
    return res.status(400).json({ error: 'Confira os campos obrigatórios e descreva brevemente a necessidade da sua empresa.' });
  }
  const id = uuid();
  const created = nowIso();
  run(`INSERT INTO leads (id, contact_name, contact_role, company, email, phone, segment, city, state, service, position_count, need, desired_timeline, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, values.contact_name, values.contact_role, values.company, values.email, values.phone, values.segment, values.city, values.state, values.service, values.position_count, values.need, values.desired_timeline, created, created]);
  persistDatabase();
  if (isEmailConfigured()) {
    sendMessage({ to: values.email, subject: `Recebemos sua solicitação • ${reference(id)}`, text: `Olá, ${values.contact_name}.\n\nSua solicitação sobre ${values.service} foi registrada pela IM Personnel. Protocolo: ${reference(id)}.\n\nA equipe poderá retornar pelos dados informados.` })
      .catch(() => console.warn('Falha ao enviar confirmação de solicitação empresarial.'));
  }
  const notification = process.env.LEADS_NOTIFICATION_EMAIL;
  if (notification && isEmailConfigured()) {
    sendMessage({ to: notification, replyTo: values.email, subject: `Nova solicitação empresarial • ${values.company} • ${reference(id)}`, text: `Nova solicitação recebida pelo site da IM Personnel.\n\nEmpresa: ${values.company}\nContato: ${values.contact_name}\nServiço: ${values.service}\nProtocolo: ${reference(id)}\n\nAcesse o painel administrativo para acompanhar este lead.` })
      .catch(() => console.warn('Falha ao enviar notificação de lead.'));
  }
  res.status(201).json({ ok: true, reference: reference(id), message: 'Sua solicitação foi registrada. A equipe da IM Personnel poderá entrar em contato pelos dados informados.' });
});

app.post('/api/privacy-requests', privacyLimiter, (req, res) => {
  const fullName = asText(req.body?.full_name, 160);
  const email = asEmail(req.body?.email);
  const requestType = asText(req.body?.request_type, 100);
  const details = asText(req.body?.details, 2000);
  if (req.body?.website || !fullName || !validEmail(email) || !requestType) return res.status(400).json({ error: 'Preencha nome, e-mail e tipo de solicitação.' });
  const id = uuid();
  const created = nowIso();
  run('INSERT INTO privacy_requests (id, full_name, email, request_type, details, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, fullName, email, requestType, details, created, created]);
  persistDatabase();
  const ref = reference(id);
  if (isEmailConfigured()) {
    sendMessage({ to: email, subject: `Solicitação de privacidade recebida • ${ref}`, text: `Olá, ${fullName}.\n\nRecebemos sua solicitação relativa a dados pessoais. Protocolo: ${ref}.\n\nA equipe responsável poderá entrar em contato para dar andamento ao pedido.` })
      .catch(() => console.warn('Falha ao enviar confirmação de solicitação de privacidade.'));
  }
  res.status(201).json({ ok: true, reference: ref, message: 'Sua solicitação foi registrada para análise.' });
});

app.get('/api/admin/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, csrf: session.csrf, user: { email: session.email } });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const email = asEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = get('SELECT id, email, salt, password_hash FROM admin_users WHERE email = ?', [email]);
  const passwordOkay = user ? verifyPassword(password, user.salt, user.password_hash) : false;
  if (!user || !passwordOkay) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  const key = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  const session = { userId: user.id, email: user.email, csrf, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  sessions.set(key, session);
  res.cookie('im_admin', key, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: 12 * 60 * 60 * 1000 });
  res.json({ authenticated: true, csrf, user: { email: user.email } });
});

app.post('/api/admin/logout', requireAdmin, requireCsrf, (req, res) => {
  sessions.delete(req.adminSession.key);
  res.clearCookie('im_admin', { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/dashboard', requireAdmin, (_req, res) => {
  const today = activeDateFilter();
  const counts = {
    active_jobs: Number(get('SELECT COUNT(*) AS count FROM jobs WHERE published = 1 AND (expires_at IS NULL OR expires_at >= ?)', [today])?.count || 0),
    applications: Number(get('SELECT COUNT(*) AS count FROM applications')?.count || 0),
    new_leads: Number(get("SELECT COUNT(*) AS count FROM leads WHERE status = 'Novo contato'")?.count || 0),
    expiring_jobs: Number(get("SELECT COUNT(*) AS count FROM jobs WHERE published = 1 AND expires_at BETWEEN ? AND date(?, '+7 day')", [today, today])?.count || 0),
  };
  const recentApplications = all(`SELECT a.id, a.full_name, a.email, a.status, a.created_at, j.title AS job_title, j.slug AS job_slug
    FROM applications a JOIN jobs j ON j.id = a.job_id ORDER BY a.created_at DESC LIMIT 6`);
  const recentLeads = all('SELECT id, contact_name, company, service, status, created_at FROM leads ORDER BY created_at DESC LIMIT 6');
  const applicationsByJob = all(`SELECT j.id, j.title, COUNT(a.id) AS total FROM jobs j LEFT JOIN applications a ON a.job_id = j.id GROUP BY j.id ORDER BY total DESC, j.created_at DESC LIMIT 6`);
  const publicationMonths = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(); date.setDate(1); date.setHours(12, 0, 0, 0); date.setMonth(date.getMonth() - (5 - index));
    return { month: date.toISOString().slice(0, 7), label: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', ''), total: 0 };
  });
  const publicationMap = new Map(publicationMonths.map((month) => [month.month, month]));
  const publishedEvents = all("SELECT action, details, created_at FROM audit_log WHERE action IN ('job.created', 'job.published') AND created_at >= ?", [new Date(Date.now() - 190 * 24 * 60 * 60 * 1000).toISOString()]);
  for (const event of publishedEvents) {
    if (event.action === 'job.created' && !JSON.parse(event.details || '{}').published) continue;
    const month = publicationMap.get(event.created_at.slice(0, 7));
    if (month) month.total += 1;
  }
  res.json({ counts, recent_applications: recentApplications, recent_leads: recentLeads, applications_by_job: applicationsByJob, publication_timeline: publicationMonths });
});

app.get('/api/admin/jobs', requireAdmin, (req, res) => {
  const rows = all('SELECT * FROM jobs ORDER BY created_at DESC');
  res.json({ items: rows.map(jobToPublic) });
});
app.post('/api/admin/jobs', requireAdmin, requireCsrf, (req, res) => {
  const job = cleanJobInput(req.body || {});
  const invalid = validateJob(job);
  if (invalid) return res.status(400).json({ error: invalid });
  const id = uuid();
  const slug = `${slugify(job.title) || 'oportunidade'}-${id.slice(0, 6)}`;
  const created = nowIso();
  run(`INSERT INTO jobs (id, slug, title, hiring_organization, area, city, state, modality, employment_type, summary, responsibilities, requirements, differentiators, benefits, published, featured, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, slug, job.title, job.hiring_organization, job.area, job.city, job.state, job.modality, job.employment_type, job.summary, job.responsibilities, job.requirements, job.differentiators, job.benefits, job.published, job.featured, job.expires_at, created, created]);
  audit(req, 'job.created', 'job', id, { published: Boolean(job.published) });
  res.status(201).json({ job: jobToPublic(get('SELECT * FROM jobs WHERE id = ?', [id])) });
});
app.put('/api/admin/jobs/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT * FROM jobs WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Vaga não encontrada.' });
  const job = cleanJobInput(req.body || {}, existing);
  const invalid = validateJob(job);
  if (invalid) return res.status(400).json({ error: invalid });
  const updated = nowIso();
  run(`UPDATE jobs SET title=?, hiring_organization=?, area=?, city=?, state=?, modality=?, employment_type=?, summary=?, responsibilities=?, requirements=?, differentiators=?, benefits=?, published=?, featured=?, expires_at=?, updated_at=? WHERE id=?`, [job.title, job.hiring_organization, job.area, job.city, job.state, job.modality, job.employment_type, job.summary, job.responsibilities, job.requirements, job.differentiators, job.benefits, job.published, job.featured, job.expires_at, updated, existing.id]);
  const jobAction = Number(existing.published) !== job.published ? (job.published ? 'job.published' : 'job.unpublished') : 'job.updated';
  audit(req, jobAction, 'job', existing.id, { published: Boolean(job.published) });
  res.json({ job: jobToPublic(get('SELECT * FROM jobs WHERE id = ?', [existing.id])) });
});
app.post('/api/admin/jobs/:id/duplicate', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT * FROM jobs WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Vaga não encontrada.' });
  const id = uuid();
  const slug = `${slugify(existing.title) || 'oportunidade'}-${id.slice(0, 6)}`;
  const created = nowIso();
  run(`INSERT INTO jobs (id, slug, title, hiring_organization, area, city, state, modality, employment_type, summary, responsibilities, requirements, differentiators, benefits, published, featured, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, NULL, ?, ?)`, [id, slug, existing.title, existing.hiring_organization, existing.area, existing.city, existing.state, existing.modality, existing.employment_type, existing.summary, existing.responsibilities, existing.requirements, existing.differentiators, existing.benefits, created, created]);
  audit(req, 'job.duplicated', 'job', id, { source_id: existing.id });
  res.status(201).json({ job: jobToPublic(get('SELECT * FROM jobs WHERE id = ?', [id])) });
});

app.get('/api/admin/articles', requireAdmin, (_req, res) => {
  res.json({ items: all('SELECT * FROM articles ORDER BY updated_at DESC').map(articleToPublic) });
});
app.post('/api/admin/articles', requireAdmin, requireCsrf, (req, res) => {
  const article = cleanArticleInput(req.body || {});
  if (!article.title || !article.category || !article.intro || !article.body || !JSON.parse(article.body).length || !article.slug) return res.status(400).json({ error: 'Preencha título, categoria, resumo, slug e pelo menos um parágrafo.' });
  if (get('SELECT id FROM articles WHERE slug = ?', [article.slug])) return res.status(409).json({ error: 'Já existe um conteúdo com este endereço amigável.' });
  const id = uuid(); const created = nowIso();
  run('INSERT INTO articles (id, slug, category, title, intro, body, minutes, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, article.slug, article.category, article.title, article.intro, article.body, article.minutes, article.published, created, created]);
  audit(req, 'article.created', 'article', id, { published: Boolean(article.published) });
  res.status(201).json({ article: articleToPublic(get('SELECT * FROM articles WHERE id = ?', [id])) });
});
app.put('/api/admin/articles/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT * FROM articles WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  const article = cleanArticleInput(req.body || {}, existing);
  if (!article.title || !article.category || !article.intro || !JSON.parse(article.body).length || !article.slug) return res.status(400).json({ error: 'Preencha título, categoria, resumo, slug e pelo menos um parágrafo.' });
  if (get('SELECT id FROM articles WHERE slug = ? AND id <> ?', [article.slug, existing.id])) return res.status(409).json({ error: 'Já existe um conteúdo com este endereço amigável.' });
  const updated = nowIso();
  run('UPDATE articles SET slug=?, category=?, title=?, intro=?, body=?, minutes=?, published=?, updated_at=? WHERE id=?', [article.slug, article.category, article.title, article.intro, article.body, article.minutes, article.published, updated, existing.id]);
  audit(req, 'article.updated', 'article', existing.id, { published: Boolean(article.published) });
  res.json({ article: articleToPublic(get('SELECT * FROM articles WHERE id = ?', [existing.id])) });
});

app.get('/api/admin/applications', requireAdmin, (req, res) => {
  const status = asText(req.query.status, 80);
  const search = asText(req.query.q, 140).toLowerCase();
  const conditions = [];
  const params = [];
  if (status) { conditions.push('a.status = ?'); params.push(status); }
  if (search) { conditions.push('(lower(a.full_name) LIKE ? OR lower(a.email) LIKE ? OR lower(j.title) LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const items = all(`SELECT a.id, a.full_name, a.email, a.phone, a.city, a.state, a.linkedin, a.cover_letter, a.status, a.internal_notes, a.resume_key, a.privacy_notice_version, a.created_at, a.updated_at, j.title AS job_title, j.slug AS job_slug
    FROM applications a JOIN jobs j ON j.id = a.job_id ${where} ORDER BY a.created_at DESC LIMIT 300`, params);
  res.json({ items });
});
app.put('/api/admin/applications/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id FROM applications WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Candidatura não encontrada.' });
  const status = asText(req.body?.status, 80);
  if (!allowedApplicationStatuses.includes(status)) return res.status(400).json({ error: 'Status de candidatura inválido.' });
  run('UPDATE applications SET status = ?, internal_notes = ?, updated_at = ? WHERE id = ?', [status, asText(req.body?.internal_notes, 4000), nowIso(), existing.id]);
  audit(req, 'application.updated', 'application', existing.id, { status });
  res.json({ ok: true });
});
app.delete('/api/admin/applications/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id, resume_key FROM applications WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Candidatura não encontrada.' });
  audit(req, 'application.deleted', 'application', existing.id);
  run('DELETE FROM applications WHERE id = ?', [existing.id]);
  persistDatabase();
  discardUpload({ path: path.join(resumesPath, path.basename(existing.resume_key)) });
  res.json({ ok: true });
});
app.get('/api/admin/talent', requireAdmin, (req, res) => {
  const search = `%${asText(req.query.q, 140).toLowerCase()}%`;
  const rows = all(`SELECT id, full_name, email, phone, city, state, area, linkedin, resume_key, consent_at, privacy_notice_version, created_at, updated_at
    FROM talent_profiles WHERE lower(full_name) LIKE ? OR lower(email) LIKE ? OR lower(area) LIKE ? ORDER BY created_at DESC LIMIT 300`, [search, search, search]);
  res.json({ items: rows });
});
app.delete('/api/admin/talent/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id, resume_key FROM talent_profiles WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Perfil não encontrado.' });
  audit(req, 'talent.deleted', 'talent_profile', existing.id);
  run('DELETE FROM talent_profiles WHERE id = ?', [existing.id]);
  persistDatabase();
  discardUpload({ path: path.join(resumesPath, path.basename(existing.resume_key)) });
  res.json({ ok: true });
});
app.get('/api/admin/leads', requireAdmin, (req, res) => {
  const status = asText(req.query.status, 80);
  const search = asText(req.query.q, 140).toLowerCase();
  const conditions = [];
  const params = [];
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (search) { conditions.push('(lower(company) LIKE ? OR lower(contact_name) LIKE ? OR lower(email) LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  res.json({ items: all(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT 300`, params) });
});
app.put('/api/admin/leads/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id FROM leads WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Lead não encontrado.' });
  const status = asText(req.body?.status, 80);
  if (!allowedLeadStatuses.includes(status)) return res.status(400).json({ error: 'Etapa comercial inválida.' });
  run('UPDATE leads SET status = ?, assigned_to = ?, notes = ?, updated_at = ? WHERE id = ?', [status, asText(req.body?.assigned_to, 160), asText(req.body?.notes, 4000), nowIso(), existing.id]);
  audit(req, 'lead.updated', 'lead', existing.id, { status });
  res.json({ ok: true });
});
app.delete('/api/admin/leads/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id FROM leads WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Lead não encontrado.' });
  audit(req, 'lead.deleted', 'lead', existing.id);
  run('DELETE FROM leads WHERE id = ?', [existing.id]);
  persistDatabase();
  res.json({ ok: true });
});
app.get('/api/admin/privacy-requests', requireAdmin, (req, res) => {
  res.json({ items: all('SELECT * FROM privacy_requests ORDER BY created_at DESC LIMIT 300') });
});
app.put('/api/admin/privacy-requests/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id FROM privacy_requests WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Solicitação não encontrada.' });
  const status = asText(req.body?.status, 80);
  if (!['Recebida', 'Em atendimento', 'Aguardando validação', 'Concluída'].includes(status)) return res.status(400).json({ error: 'Status de solicitação inválido.' });
  run('UPDATE privacy_requests SET status = ?, internal_notes = ?, updated_at = ? WHERE id = ?', [status, asText(req.body?.internal_notes, 3000), nowIso(), existing.id]);
  audit(req, 'privacy_request.updated', 'privacy_request', existing.id, { status });
  res.json({ ok: true });
});
app.get('/api/admin/audit', requireAdmin, (_req, res) => {
  res.json({ items: all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200') });
});
app.get('/api/admin/files/:key', requireAdmin, (req, res) => {
  const key = asText(req.params.key, 64);
  if (!/^[a-f0-9-]{36}\.(pdf|docx)$/.test(key)) return res.status(400).json({ error: 'Arquivo inválido.' });
  const authorized = get('SELECT id FROM applications WHERE resume_key = ? UNION SELECT id FROM talent_profiles WHERE resume_key = ? LIMIT 1', [key, key]);
  const target = path.resolve(resumesPath, key);
  if (!authorized || !target.startsWith(`${path.resolve(resumesPath)}${path.sep}`) || !fs.existsSync(target)) return res.status(404).json({ error: 'Arquivo não encontrado.' });
  audit(req, 'resume.downloaded', 'resume', key);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.download(target, `curriculo.${path.extname(key).slice(1)}`);
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint não encontrado.' }));
app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE' ? 'O currículo deve ter no máximo 5 MB.' : 'Não foi possível processar o arquivo enviado.';
    return res.status(400).json({ error: message });
  }
  if (error) {
    if (error.message === 'Envie o currículo em PDF ou DOCX.') return res.status(400).json({ error: error.message });
    console.error('Erro interno ao processar a solicitação:', error.message);
    return res.status(500).json({ error: 'Não foi possível concluir agora. Tente novamente em instantes.' });
  }
  res.status(500).json({ error: 'Erro inesperado.' });
});

app.get('/sitemap.xml', (_req, res) => {
  const origin = (process.env.SITE_URL || 'https://impersonnel.com.br').replace(/\/$/, '');
  const staticRoutes = ['/', '/sobre', '/solucoes', '/solicitar-proposta', '/contato', '/vagas', '/banco-de-talentos', '/conteudos', '/privacidade', '/cookies', ...['recrutamento-e-selecao', 'executive-search', 'selecao-industrial', 'consultoria-de-rh', 'gestao-de-pessoas-e-desempenho', 'mapeamento-de-processos', 'gestao-de-negocios-e-processos'].map((slug) => `/servicos/${slug}`)];
  const today = activeDateFilter();
  const liveJobs = all('SELECT slug, updated_at FROM jobs WHERE published = 1 AND (expires_at IS NULL OR expires_at >= ?)', [today]);
  const liveArticles = all('SELECT slug, updated_at FROM articles WHERE published = 1');
  const entries = [
    ...staticRoutes.map((route) => ({ url: `${origin}${route}`, lastmod: today })),
    ...liveJobs.map((job) => ({ url: `${origin}/vagas/${job.slug}`, lastmod: job.updated_at.slice(0, 10) })),
    ...liveArticles.map((article) => ({ url: `${origin}/conteudos/${article.slug}`, lastmod: article.updated_at.slice(0, 10) })),
  ];
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((entry) => `  <url><loc>${entry.url.replaceAll('&', '&amp;')}</loc><lastmod>${entry.lastmod}</lastmod></url>`),
    '</urlset>',
  ].join('\n');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).send(xml);
});

if (isProduction) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist, { etag: true, maxAge: '1h', setHeaders(res, file) {
    if (file.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
  } }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const vite = await createViteServer({ configFile: path.join(root, 'vite.config.ts'), server: { middlewareMode: true, allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'], hmr: { host: undefined } }, appType: 'custom' });
  app.use(vite.middlewares);
  app.get(/^(?!\/api\/).*/, async (req, res, next) => {
    try {
      const template = await fs.promises.readFile(path.join(root, 'index.html'), 'utf-8');
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).setHeader('Content-Type', 'text/html').end(html);
    } catch (error) { next(error); }
  });
}

const port = Number(process.env.PORT || 5173);
app.listen(port, '0.0.0.0', () => {
  console.log(`IM Personnel web app listening on 0.0.0.0:${port} (${isProduction ? 'production' : 'development'})`);
  console.log(`SQLite database: ${path.join(storagePath, process.env.DB_FILE || 'im-personnel.sqlite')}`);
});
