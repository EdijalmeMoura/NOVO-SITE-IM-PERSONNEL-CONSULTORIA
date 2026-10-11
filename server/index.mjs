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
import { all, databaseFilePath, get, initializeDatabase, persistDatabase, run } from './db.mjs';
import { hashPassword, verifyPassword } from './auth.mjs';
import { ensureBootstrapAdmin } from './bootstrap.mjs';
import { emailSettings, isEmailConfigured, renderTemplate, resetMailer, sendMessage, sendTemplate, verifyTransport } from './mailer.mjs';
import insightDefaults from '../content/insights.json' with { type: 'json' };
import heroSlideDefaults from '../content/hero-slides.json' with { type: 'json' };
import emailTemplateDefaults from '../content/email-templates.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configuredDataDir = (process.env.DATA_DIR || '').trim();
const storagePath = path.resolve(configuredDataDir || path.join(root, 'storage'));
const resumesPath = path.join(storagePath, 'private-resumes');
const contentImagesPath = path.join(storagePath, 'content-images');
const NOTICE_VERSION = '2026-10-v1';
const app = express();
const sessions = new Map();
const sessionCleanup = setInterval(() => { const now = Date.now(); for (const [key, session] of sessions) if (session.expiresAt <= now) sessions.delete(key); }, 15 * 60 * 1000);
sessionCleanup.unref();
const isProduction = process.env.NODE_ENV === 'production';
if (!configuredDataDir) {
  console.warn(`DATA_DIR não configurado; usando ${storagePath}. Em ambientes com disco efêmero, SQLite e currículos privados serão perdidos após reinicializações. Defina DATA_DIR para um diretório persistente antes de publicar.`);
}
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
// Em envios multipart os booleanos chegam como texto ('true'/'on'/'false'), por isso a conversão explícita.
const asBoolean = (value) => value === true || ['true', 'on', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
const asEmail = (value) => asText(value, 254).toLowerCase();
const validEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const strongAdminPassword = (value) => typeof value === 'string' && value.length >= 14 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
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
await fs.promises.mkdir(contentImagesPath, { recursive: true, mode: 0o755 });
await initializeDatabase();
if (Number(get('SELECT COUNT(*) AS count FROM articles')?.count || 0) === 0) {
  const created = nowIso();
  for (const article of insightDefaults) {
    const id = uuid();
    run('INSERT INTO articles (id, slug, category, title, intro, body, minutes, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)', [id, article.slug, article.category, article.title, article.intro, JSON.stringify(article.body), article.minutes, created, created]);
  }
  persistDatabase();
}
if (Number(get('SELECT COUNT(*) AS count FROM hero_slides')?.count || 0) === 0) {
  const created = nowIso();
  heroSlideDefaults.forEach((slide, index) => {
    run(`INSERT INTO hero_slides (id, slug, eyebrow, location, side_label, navigation_label, title, body_text, primary_label, primary_to, secondary_label, secondary_to, footnote, image_position, image_alt, image_key, position, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, 1, ?, ?)`,
      [uuid(), slide.slug, slide.eyebrow, slide.location, slide.sideLabel, slide.navigationLabel, JSON.stringify(slide.title), slide.text, slide.primary.label, slide.primary.to, slide.secondary.label, slide.secondary.to, slide.footnote, slide.imagePosition, slide.imageAlt, index, created, created]);
  });
  persistDatabase();
}
if (Number(get('SELECT COUNT(*) AS count FROM email_templates')?.count || 0) === 0) {
  const created = nowIso();
  for (const template of emailTemplateDefaults) {
    run('INSERT INTO email_templates (key, label, audience, subject, body, enabled, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?)', [template.key, template.label, template.audience, template.subject, template.body, created]);
  }
  persistDatabase();
}
// Falha na inicialização (variáveis inconsistentes) é intencional: o erro aparece nos logs do deploy.
const bootstrapResult = ensureBootstrapAdmin();
if (bootstrapResult === 'created') console.log('Administrador inicial criado a partir de ADMIN_BOOTSTRAP_EMAIL.');
if (bootstrapResult === 'updated') console.log('Senha do administrador inicial atualizada a partir de ADMIN_BOOTSTRAP_PASSWORD_HASH.');
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
const initialAdminLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 4, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Muitas tentativas de configuração em pouco tempo. Aguarde alguns minutos e tente novamente.' } });
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

// Imagens de conteúdo são públicas: ficam em storage/content-images e são servidas em /media/content-images.
const IMAGE_LIMIT_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  ['image/jpeg', { ext: '.jpg', magic: [[0xff, 0xd8, 0xff]] }],
  ['image/png', { ext: '.png', magic: [[0x89, 0x50, 0x4e, 0x47]] }],
  ['image/webp', { ext: '.webp', magic: [[0x52, 0x49, 0x46, 0x46]] }],
  ['image/avif', { ext: '.avif', magic: [[0x66, 0x74, 0x79, 0x70]] }],
]);
const contentImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, contentImagesPath),
    filename: (_req, file, cb) => {
      const spec = IMAGE_TYPES.get(file.mimetype);
      cb(null, `${uuid()}${spec ? spec.ext : path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: IMAGE_LIMIT_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    cb(IMAGE_TYPES.has(file.mimetype) ? null : new Error('Envie a imagem em JPG, PNG, WebP ou AVIF.'), IMAGE_TYPES.has(file.mimetype));
  },
});
function imageLooksValid(file) {
  if (!file) return false;
  const spec = IMAGE_TYPES.get(file.mimetype);
  if (!spec) return false;
  try {
    fs.chmodSync(file.path, 0o644);
    const head = fs.readFileSync(file.path).subarray(0, 16);
    if (!spec.magic.some((signature) => signature.every((byte, index) => head[index] === byte))) return false;
    // WebP e AVIF compartilham o container RIFF/ISOBMFF: confira o tipo declarado dentro do arquivo.
    if (file.mimetype === 'image/webp') return head.subarray(8, 12).toString() === 'WEBP';
    if (file.mimetype === 'image/avif') return ['avif', 'avis', 'mif1'].includes(head.subarray(4, 8).toString());
    return true;
  } catch { return false; }
}
function contentImageKey(value) {
  const key = asText(value, 80);
  return /^[a-f0-9-]{36}\.(jpg|png|webp|avif)$/.test(key) ? key : '';
}
function discardContentImage(key) {
  const safe = contentImageKey(key);
  if (safe) fs.rmSync(path.join(contentImagesPath, safe), { force: true });
}
function imagePublicUrl(key) {
  return key ? `/media/content-images/${key}` : '';
}
const INVALID_IMAGE_MESSAGE = 'O arquivo enviado não parece ser uma imagem válida. Use JPG, PNG, WebP ou AVIF de até 5 MB.';
// Valores usados no botão "ver prévia" dos modelos de e-mail.
const SAMPLE_VARIABLES = { nome: 'Maria Silva', email: 'maria@exemplo.com.br', telefone: '(81) 99999-0000', vaga: 'Analista de Recursos Humanos', empresa: 'Indústria Exemplo', servico: 'Recrutamento e Seleção', area: 'Recursos Humanos', cidade: 'Recife', estado: 'PE', tipo: 'Acesso aos dados', protocolo: 'IM-EXEMPLO1' };
const sampleVariable = (name) => SAMPLE_VARIABLES[name] || `{{${name}}}`;
const PLACEHOLDER_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;
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
  // Uma conta desativada perde o acesso imediatamente, mesmo com sessão aberta.
  const account = get('SELECT name, active FROM admin_users WHERE id = ?', [session.userId]);
  if (!account || !Number(account.active)) {
    sessions.delete(key);
    return null;
  }
  return { key, ...session, name: account.name || session.name || '' };
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
  const imageKey = contentImageKey(row.image_key);
  return { ...row, image_key: imageKey, image_url: imagePublicUrl(imageKey), published: Boolean(Number(row.published)), body: JSON.parse(row.body || '[]') };
}
function adminUserToPublic(row) {
  if (!row) return null;
  return { id: row.id, email: row.email, name: row.name || '', active: Boolean(Number(row.active)), created_at: row.created_at, updated_at: row.updated_at || '', last_login_at: row.last_login_at || '' };
}
const DEFAULT_HERO_IMAGE = '/images/hero-team.jpg';
const templateVariables = new Map(emailTemplateDefaults.map((template) => [template.key, template.variables || []]));
function slideTitleLines(rawTitle) {
  try {
    const parsed = JSON.parse(rawTitle || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line) => line && String(line.text || '').trim()).map((line) => ({ text: String(line.text), accent: Boolean(line.accent) }));
  } catch { return []; }
}
function slideToPublic(row) {
  if (!row) return null;
  const lines = slideTitleLines(row.title);
  const imageKey = contentImageKey(row.image_key);
  return {
    id: row.id,
    slug: row.slug,
    eyebrow: row.eyebrow || '',
    location: row.location || '',
    sideLabel: row.side_label || '',
    navigationLabel: row.navigation_label || row.eyebrow || 'Destaque',
    title: lines,
    text: row.body_text || '',
    primary: { to: row.primary_to || '/', label: row.primary_label || '' },
    secondary: { to: row.secondary_to || '/', label: row.secondary_label || '' },
    footnote: row.footnote || '',
    imagePosition: row.image_position || 'center 52%',
    imageAlt: row.image_alt || '',
    imageKey,
    imageUrl: imageKey ? imagePublicUrl(imageKey) : DEFAULT_HERO_IMAGE,
    accentLine: lines.findIndex((line) => line.accent) + 1 || '',
    position: Number(row.position || 0),
    active: Boolean(Number(row.active)),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
function cleanSlideInput(body = {}, existing = {}) {
  const existingLines = slideTitleLines(existing.title);
  const rawLines = Array.isArray(body.title)
    ? body.title.map((line) => asText(typeof line === 'string' ? line : line?.text, 200)).filter(Boolean)
    : String(body.title ?? existingLines.map((line) => line.text).join('\n')).split(/\r?\n/).map((line) => asText(line, 200)).filter(Boolean);
  const accentLine = body.accent_line === undefined ? (existingLines.findIndex((line) => line.accent) + 1) : Number.parseInt(body.accent_line, 10);
  const title = rawLines.slice(0, 6).map((text, index) => ({ text, accent: Number.isFinite(accentLine) && accentLine === index + 1 }));
  const existingImage = contentImageKey(existing.image_key);
  const imageKey = asBoolean(body.remove_image) ? '' : (contentImageKey(body.image_key) || existingImage);
  const position = Number.parseInt(body.position ?? existing.position ?? 0, 10);
  return {
    eyebrow: asText(body.eyebrow ?? existing.eyebrow, 120),
    location: asText(body.location ?? existing.location, 120),
    side_label: asText(body.side_label ?? existing.side_label, 120),
    navigation_label: asText(body.navigation_label ?? existing.navigation_label, 160),
    title: JSON.stringify(title),
    body_text: asText(body.text ?? existing.body_text, 600),
    primary_label: asText(body.primary_label ?? existing.primary_label, 80),
    primary_to: asText(body.primary_to ?? existing.primary_to, 300),
    secondary_label: asText(body.secondary_label ?? existing.secondary_label, 80),
    secondary_to: asText(body.secondary_to ?? existing.secondary_to, 300),
    footnote: asText(body.footnote ?? existing.footnote, 200),
    image_position: asText(body.image_position ?? existing.image_position, 40) || 'center 52%',
    image_alt: imageKey || body.image_alt !== undefined ? asText(body.image_alt ?? existing.image_alt, 300) : (existing.image_alt || ''),
    image_key: imageKey,
    position: Number.isFinite(position) ? Math.min(99, Math.max(0, position)) : 0,
    active: body.active === undefined ? Number(existing.active ?? 1) : (asBoolean(body.active) ? 1 : 0),
  };
}
function validateSlide(slide) {
  if (!slide.eyebrow) return 'Preencha a etiqueta do destaque (texto pequeno acima do título).';
  if (!slide.navigation_label) return 'Preencha o nome usado na navegação e em leitores de tela.';
  if (!JSON.parse(slide.title).length) return 'Informe ao menos uma linha de título.';
  if (!slide.body_text) return 'Informe o texto de apoio do destaque.';
  if (!slide.primary_label || !slide.primary_to) return 'Informe o texto e o destino do botão principal.';
  // Destinos internos evitam redirecionamento para fora do site.
  for (const target of [slide.primary_to, slide.secondary_to]) {
    if (target && !/^\/[^\s]*$/.test(target)) return 'Os destinos dos botões devem ser caminhos internos começando com /.';
  }
  return null;
}
function setSetting(key, value) {
  if (get('SELECT key FROM settings WHERE key = ?', [key])) run('UPDATE settings SET value = ?, updated_at = ? WHERE key = ?', [value, nowIso(), key]);
  else run('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, nowIso()]);
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
  const existingImage = contentImageKey(existing.image_key);
  const removeImage = asBoolean(body.remove_image);
  const requestedImage = contentImageKey(body.image_key);
  const imageKey = removeImage ? '' : (requestedImage || existingImage);
  return { title, intro, category, slug, body: JSON.stringify(paragraphs), minutes: Math.min(30, Math.max(1, Number.isFinite(minutesValue) ? minutesValue : 4)), image_key: imageKey, image_alt: imageKey ? asText(body.image_alt ?? existing.image_alt, 300) : '', published: body.published === undefined ? Number(existing.published || 0) : (asBoolean(body.published) ? 1 : 0) };
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Imagens de conteúdo enviadas pelo painel. A chave é validada antes de tocar o disco.
app.get('/media/content-images/:key', (req, res) => {
  const key = contentImageKey(req.params.key);
  const target = key ? path.resolve(contentImagesPath, key) : '';
  if (!key || !target.startsWith(`${path.resolve(contentImagesPath)}${path.sep}`) || !fs.existsSync(target)) {
    return res.status(404).json({ error: 'Imagem não encontrada.' });
  }
  res.setHeader('Cache-Control', 'public, max-age=604800');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(target);
});

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

// Destaques da página inicial, editáveis no painel. Somente os ativos são públicos.
app.get('/api/hero-slides', (_req, res) => {
  const items = all('SELECT * FROM hero_slides WHERE active = 1 ORDER BY position ASC, created_at ASC').map(slideToPublic);
  res.json({ items, total: items.length });
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
    const variables = { nome: fullName, email, telefone: phone, vaga: job.title, protocolo: ref, cidade: city, estado: state };
    sendTemplate({ key: 'application_candidate', to: email, variables })
      .catch(() => console.warn('Falha ao enviar confirmação de candidatura.'));
    const notification = emailSettings().notification;
    if (notification) {
      sendTemplate({ key: 'application_team', to: notification, replyTo: email, variables })
        .catch(() => console.warn('Falha ao enviar notificação de candidatura.'));
    }
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
    const variables = { nome: fullName, email, telefone: phone, area, cidade: city, estado: state, protocolo: ref };
    sendTemplate({ key: 'talent_candidate', to: email, variables })
      .catch(() => console.warn('Falha ao enviar confirmação do banco de talentos.'));
    const notification = emailSettings().notification;
    if (notification) {
      sendTemplate({ key: 'talent_team', to: notification, replyTo: email, variables })
        .catch(() => console.warn('Falha ao enviar notificação de novo perfil no banco de talentos.'));
    }
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
    const variables = { nome: values.contact_name, email: values.email, telefone: values.phone, empresa: values.company, servico: values.service, cidade: values.city, estado: values.state, protocolo: reference(id) };
    sendTemplate({ key: 'lead_customer', to: values.email, variables })
      .catch(() => console.warn('Falha ao enviar confirmação de solicitação empresarial.'));
    const notification = emailSettings().notification;
    if (notification) {
      sendTemplate({ key: 'lead_team', to: notification, replyTo: values.email, variables })
        .catch(() => console.warn('Falha ao enviar notificação de lead.'));
    }
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
    sendTemplate({ key: 'privacy_customer', to: email, variables: { nome: fullName, email, tipo: requestType, protocolo: ref } })
      .catch(() => console.warn('Falha ao enviar confirmação de solicitação de privacidade.'));
  }
  res.status(201).json({ ok: true, reference: ref, message: 'Sua solicitação foi registrada para análise.' });
});

function isSameOriginRequest(req) {
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === `${req.protocol}://${req.get('host')}`;
  } catch { return false; }
}

// Esta rota só cria o primeiro acesso. Depois que uma conta existe, a administração volta a exigir sessão e CSRF.
app.post('/api/setup/initial-admin', initialAdminLimiter, (req, res) => {
  if (!isSameOriginRequest(req)) return res.status(403).json({ error: 'Esta configuração precisa ser enviada pela página deste site.' });
  if (get('SELECT id FROM admin_users LIMIT 1')) return res.status(409).json({ error: 'A configuração inicial já foi concluída. Entre no painel com uma conta administrativa existente.' });

  const email = asEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!validEmail(email)) return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
  if (!strongAdminPassword(password)) return res.status(400).json({ error: 'A senha deve ter ao menos 14 caracteres, com letras maiúsculas, minúsculas e números.' });

  const id = uuid();
  const created = nowIso();
  const { salt, digest } = hashPassword(password);
  run('INSERT INTO admin_users (id, email, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)', [id, email, salt, digest, created]);
  run('INSERT INTO audit_log (id, actor_email, action, entity_type, entity_id, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [uuid(), 'initial-setup', 'admin.initial_setup_created', 'admin_user', id, JSON.stringify({ email }), created]);
  persistDatabase();
  console.log(`Administrador inicial criado pela configuração inicial: ${email}`);
  res.status(201).json({ ok: true, message: 'Administrador inicial criado. Agora você pode entrar no painel.' });
});

app.get('/api/admin/session', (req, res) => {
  const session = getSession(req);
  if (!session) return res.json({ authenticated: false });
  res.json({ authenticated: true, csrf: session.csrf, user: { email: session.email, name: session.name || '' } });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const email = asEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = get('SELECT id, email, name, salt, password_hash, active FROM admin_users WHERE email = ?', [email]);
  const passwordOkay = user ? verifyPassword(password, user.salt, user.password_hash) : false;
  if (!user || !passwordOkay) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
  if (!Number(user.active)) return res.status(403).json({ error: 'Esta conta administrativa está desativada. Procure quem gerencia os acessos do painel.' });
  const key = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(24).toString('hex');
  const session = { userId: user.id, email: user.email, name: user.name || '', csrf, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
  sessions.set(key, session);
  run('UPDATE admin_users SET last_login_at = ? WHERE id = ?', [nowIso(), user.id]);
  persistDatabase();
  res.cookie('im_admin', key, { httpOnly: true, secure: isProduction, sameSite: 'strict', path: '/', maxAge: 12 * 60 * 60 * 1000 });
  res.json({ authenticated: true, csrf, user: { email: user.email, name: user.name || '' } });
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
  res.json({ counts, recent_applications: recentApplications, recent_leads: recentLeads, applications_by_job: applicationsByJob, publication_timeline: publicationMonths, email_configured: isEmailConfigured(), notification_email: emailSettings().notification });
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
app.post('/api/admin/articles', requireAdmin, requireCsrf, contentImageUpload.single('image'), (req, res) => {
  const uploaded = req.file;
  const body = { ...(req.body || {}) };
  if (uploaded) {
    if (!imageLooksValid(uploaded)) {
      discardUpload(uploaded);
      return res.status(400).json({ error: 'O arquivo enviado não parece ser uma imagem válida. Use JPG, PNG, WebP ou AVIF de até 5 MB.' });
    }
    body.image_key = path.basename(uploaded.filename);
  }
  const article = cleanArticleInput(body);
  if (!article.title || !article.category || !article.intro || !article.body || !JSON.parse(article.body).length || !article.slug) {
    discardUpload(uploaded);
    return res.status(400).json({ error: 'Preencha título, categoria, resumo, slug e pelo menos um parágrafo.' });
  }
  if (get('SELECT id FROM articles WHERE slug = ?', [article.slug])) {
    discardUpload(uploaded);
    return res.status(409).json({ error: 'Já existe um conteúdo com este endereço amigável.' });
  }
  const id = uuid(); const created = nowIso();
  run('INSERT INTO articles (id, slug, category, title, intro, body, minutes, image_key, image_alt, published, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, article.slug, article.category, article.title, article.intro, article.body, article.minutes, article.image_key, article.image_alt, article.published, created, created]);
  persistDatabase();
  audit(req, 'article.created', 'article', id, { published: Boolean(article.published), has_image: Boolean(article.image_key) });
  res.status(201).json({ article: articleToPublic(get('SELECT * FROM articles WHERE id = ?', [id])) });
});
app.put('/api/admin/articles/:id', requireAdmin, requireCsrf, contentImageUpload.single('image'), (req, res) => {
  const existing = get('SELECT * FROM articles WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) {
    discardUpload(req.file);
    return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  }
  const uploaded = req.file;
  const body = { ...(req.body || {}) };
  if (uploaded) {
    if (!imageLooksValid(uploaded)) {
      discardUpload(uploaded);
      return res.status(400).json({ error: 'O arquivo enviado não parece ser uma imagem válida. Use JPG, PNG, WebP ou AVIF de até 5 MB.' });
    }
    body.image_key = path.basename(uploaded.filename);
  }
  const article = cleanArticleInput(body, existing);
  if (!article.title || !article.category || !article.intro || !JSON.parse(article.body).length || !article.slug) {
    discardUpload(uploaded);
    return res.status(400).json({ error: 'Preencha título, categoria, resumo, slug e pelo menos um parágrafo.' });
  }
  if (get('SELECT id FROM articles WHERE slug = ? AND id <> ?', [article.slug, existing.id])) {
    discardUpload(uploaded);
    return res.status(409).json({ error: 'Já existe um conteúdo com este endereço amigável.' });
  }
  const updated = nowIso();
  run('UPDATE articles SET slug=?, category=?, title=?, intro=?, body=?, minutes=?, image_key=?, image_alt=?, published=?, updated_at=? WHERE id=?', [article.slug, article.category, article.title, article.intro, article.body, article.minutes, article.image_key, article.image_alt, article.published, updated, existing.id]);
  persistDatabase();
  const previousImage = contentImageKey(existing.image_key);
  if (previousImage && previousImage !== article.image_key) discardContentImage(previousImage);
  audit(req, 'article.updated', 'article', existing.id, { published: Boolean(article.published), has_image: Boolean(article.image_key), image_changed: previousImage !== article.image_key });
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
const adminUserColumns = 'id, email, name, active, created_at, updated_at, last_login_at';
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = all(`SELECT ${adminUserColumns} FROM admin_users ORDER BY active DESC, created_at ASC`).map(adminUserToPublic);
  res.json({ items: users, current_user_id: req.adminSession.userId });
});
app.post('/api/admin/users', requireAdmin, requireCsrf, (req, res) => {
  const name = asText(req.body?.name, 160);
  const email = asEmail(req.body?.email);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!name) return res.status(400).json({ error: 'Informe o nome de quem vai usar o painel.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'Informe um endereço de e-mail válido.' });
  if (!strongAdminPassword(password)) return res.status(400).json({ error: 'A senha deve ter ao menos 14 caracteres, com letras maiúsculas, minúsculas e números.' });
  if (get('SELECT id FROM admin_users WHERE email = ?', [email])) return res.status(409).json({ error: 'Já existe uma conta administrativa com este e-mail.' });
  const active = req.body?.active === undefined ? true : Boolean(req.body.active);
  const id = uuid(); const created = nowIso();
  const { salt, digest } = hashPassword(password);
  run('INSERT INTO admin_users (id, email, name, salt, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, email, name, salt, digest, active ? 1 : 0, created, created]);
  persistDatabase();
  audit(req, 'admin_user.created', 'admin_user', id, { email, name, active });
  res.status(201).json({ user: adminUserToPublic(get(`SELECT ${adminUserColumns} FROM admin_users WHERE id = ?`, [id])) });
});
app.put('/api/admin/users/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id, email, name, salt, password_hash, active FROM admin_users WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Usuário não encontrado.' });
  // O nome só é obrigatório quando vem no corpo: alternar acesso de uma conta antiga (sem nome) não pode falhar.
  const name = asText(req.body?.name ?? existing.name, 160);
  if (req.body?.name !== undefined && !name) return res.status(400).json({ error: 'Informe o nome de quem vai usar o painel.' });
  const wasActive = Boolean(Number(existing.active));
  const nextActive = req.body?.active === undefined ? wasActive : Boolean(req.body.active);
  const isSelf = existing.id === req.adminSession.userId;
  if (isSelf && !nextActive) return res.status(409).json({ error: 'Você não pode desativar a sua própria conta. Peça a outra pessoa administradora.' });
  if (wasActive && !nextActive) {
    const otherActive = Number(get('SELECT COUNT(*) AS count FROM admin_users WHERE active = 1 AND id <> ?', [existing.id])?.count || 0);
    if (otherActive === 0) return res.status(409).json({ error: 'Mantenha ao menos uma conta administrativa ativa. Ative outra pessoa antes de desativar esta.' });
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  let salt = existing.salt;
  let passwordHash = existing.password_hash;
  if (password) {
    if (!strongAdminPassword(password)) return res.status(400).json({ error: 'A senha deve ter ao menos 14 caracteres, com letras maiúsculas, minúsculas e números.' });
    const hashed = hashPassword(password);
    salt = hashed.salt; passwordHash = hashed.digest;
  }
  run('UPDATE admin_users SET name=?, salt=?, password_hash=?, active=?, updated_at=? WHERE id=?', [name, salt, passwordHash, nextActive ? 1 : 0, nowIso(), existing.id]);
  persistDatabase();
  if (!nextActive) for (const [key, session] of sessions) if (session.userId === existing.id) sessions.delete(key);
  const action = wasActive === nextActive ? (password ? 'admin_user.password_reset' : 'admin_user.updated') : (nextActive ? 'admin_user.activated' : 'admin_user.deactivated');
  audit(req, action, 'admin_user', existing.id, { email: existing.email, name, active: nextActive, password_changed: Boolean(password) });
  // Troca de senha merece evento próprio na trilha, mesmo quando vem junto de outra alteração.
  if (password && action !== 'admin_user.password_reset') audit(req, 'admin_user.password_reset', 'admin_user', existing.id, { email: existing.email });
  res.json({ user: adminUserToPublic(get(`SELECT ${adminUserColumns} FROM admin_users WHERE id = ?`, [existing.id])) });
});
app.get('/api/admin/audit', requireAdmin, (_req, res) => {
  res.json({ items: all('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200') });
});

const slideColumns = 'eyebrow, location, side_label, navigation_label, title, body_text, primary_label, primary_to, secondary_label, secondary_to, footnote, image_position, image_alt, image_key, position, active';
app.get('/api/admin/hero-slides', requireAdmin, (_req, res) => {
  res.json({ items: all('SELECT * FROM hero_slides ORDER BY position ASC, created_at ASC').map(slideToPublic) });
});
app.post('/api/admin/hero-slides', requireAdmin, requireCsrf, contentImageUpload.single('image'), (req, res) => {
  const uploaded = req.file;
  const body = { ...(req.body || {}) };
  if (uploaded) {
    if (!imageLooksValid(uploaded)) { discardUpload(uploaded); return res.status(400).json({ error: INVALID_IMAGE_MESSAGE }); }
    body.image_key = path.basename(uploaded.filename);
  }
  const slide = cleanSlideInput(body);
  const invalid = validateSlide(slide);
  if (invalid) { discardUpload(uploaded); return res.status(400).json({ error: invalid }); }
  const id = uuid(); const created = nowIso();
  const slug = `${slugify(slide.navigation_label) || 'destaque'}-${id.slice(0, 6)}`;
  if (get('SELECT id FROM hero_slides WHERE slug = ?', [slug])) { discardUpload(uploaded); return res.status(409).json({ error: 'Já existe um destaque com este identificador.' }); }
  const total = Number(get('SELECT COUNT(*) AS count FROM hero_slides')?.count || 0);
  const position = body.position === undefined ? total : slide.position;
  run(`INSERT INTO hero_slides (id, slug, ${slideColumns}, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, slug, slide.eyebrow, slide.location, slide.side_label, slide.navigation_label, slide.title, slide.body_text, slide.primary_label, slide.primary_to, slide.secondary_label, slide.secondary_to, slide.footnote, slide.image_position, slide.image_alt, slide.image_key, position, slide.active, created, created]);
  persistDatabase();
  audit(req, 'hero_slide.created', 'hero_slide', id, { active: Boolean(slide.active) });
  res.status(201).json({ slide: slideToPublic(get('SELECT * FROM hero_slides WHERE id = ?', [id])) });
});
app.put('/api/admin/hero-slides/:id', requireAdmin, requireCsrf, contentImageUpload.single('image'), (req, res) => {
  const existing = get('SELECT * FROM hero_slides WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) { discardUpload(req.file); return res.status(404).json({ error: 'Destaque não encontrado.' }); }
  const uploaded = req.file;
  const body = { ...(req.body || {}) };
  if (uploaded) {
    if (!imageLooksValid(uploaded)) { discardUpload(uploaded); return res.status(400).json({ error: INVALID_IMAGE_MESSAGE }); }
    body.image_key = path.basename(uploaded.filename);
  }
  const slide = cleanSlideInput(body, existing);
  const invalid = validateSlide(slide);
  if (invalid) { discardUpload(uploaded); return res.status(400).json({ error: invalid }); }
  run(`UPDATE hero_slides SET eyebrow=?, location=?, side_label=?, navigation_label=?, title=?, body_text=?, primary_label=?, primary_to=?, secondary_label=?, secondary_to=?, footnote=?, image_position=?, image_alt=?, image_key=?, position=?, active=?, updated_at=? WHERE id=?`,
    [slide.eyebrow, slide.location, slide.side_label, slide.navigation_label, slide.title, slide.body_text, slide.primary_label, slide.primary_to, slide.secondary_label, slide.secondary_to, slide.footnote, slide.image_position, slide.image_alt, slide.image_key, slide.position, slide.active, nowIso(), existing.id]);
  persistDatabase();
  const previousImage = contentImageKey(existing.image_key);
  if (previousImage && previousImage !== slide.image_key) discardContentImage(previousImage);
  audit(req, 'hero_slide.updated', 'hero_slide', existing.id, { active: Boolean(slide.active), image_changed: previousImage !== slide.image_key });
  res.json({ slide: slideToPublic(get('SELECT * FROM hero_slides WHERE id = ?', [existing.id])) });
});
app.post('/api/admin/hero-slides/reorder', requireAdmin, requireCsrf, (req, res) => {
  const order = Array.isArray(req.body?.order) ? req.body.order.map((id) => asText(id, 64)).filter(Boolean) : [];
  if (!order.length) return res.status(400).json({ error: 'Informe a nova ordem dos destaques.' });
  const known = new Set(all('SELECT id FROM hero_slides').map((row) => row.id));
  if (order.length !== known.size || !order.every((id) => known.has(id))) return res.status(400).json({ error: 'A nova ordem precisa listar exatamente os destaques existentes.' });
  order.forEach((id, index) => run('UPDATE hero_slides SET position = ?, updated_at = ? WHERE id = ?', [index, nowIso(), id]));
  persistDatabase();
  audit(req, 'hero_slide.reordered', 'hero_slide', 'reorder', { count: order.length });
  res.json({ items: all('SELECT * FROM hero_slides ORDER BY position ASC, created_at ASC').map(slideToPublic) });
});
app.delete('/api/admin/hero-slides/:id', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT id, image_key FROM hero_slides WHERE id = ?', [asText(req.params.id, 64)]);
  if (!existing) return res.status(404).json({ error: 'Destaque não encontrado.' });
  if (Number(get('SELECT COUNT(*) AS count FROM hero_slides')?.count || 0) <= 1) return res.status(409).json({ error: 'Mantenha ao menos um destaque na página inicial. Prefira desativar.' });
  audit(req, 'hero_slide.deleted', 'hero_slide', existing.id);
  run('DELETE FROM hero_slides WHERE id = ?', [existing.id]);
  persistDatabase();
  discardContentImage(existing.image_key);
  res.json({ ok: true });
});

const EMAIL_SETTING_LIMITS = { SMTP_HOST: 253, SMTP_PORT: 5, SMTP_SECURE: 5, SMTP_USER: 254, SMTP_PASS: 512, EMAIL_FROM: 254, LEADS_NOTIFICATION_EMAIL: 254 };
app.get('/api/admin/email-settings', requireAdmin, (_req, res) => {
  const settings = emailSettings();
  // Só conta como "definido no painel" o que foi gravado com valor; campo limpo volta a usar o ambiente.
  const storedInPanel = all('SELECT key, value FROM settings')
    .filter((row) => row.key in EMAIL_SETTING_LIMITS && String(row.value ?? '').trim() !== '')
    .map((row) => row.key);
  res.json({
    SMTP_HOST: settings.host, SMTP_PORT: settings.port, SMTP_SECURE: settings.secure, SMTP_USER: settings.user,
    SMTP_PASS_SET: Boolean(settings.pass), EMAIL_FROM: settings.from, LEADS_NOTIFICATION_EMAIL: settings.notification,
    configured: isEmailConfigured(), stored_in_panel: storedInPanel,
    templates: all('SELECT key, label, audience, subject, body, enabled, updated_at FROM email_templates ORDER BY rowid ASC').map((row) => ({ ...row, enabled: Boolean(Number(row.enabled)), variables: templateVariables.get(row.key) || [] })),
  });
});
app.put('/api/admin/email-settings', requireAdmin, requireCsrf, (req, res) => {
  const body = req.body || {};
  const changes = {};
  for (const key of Object.keys(EMAIL_SETTING_LIMITS)) {
    if (body[key] === undefined) continue;
    // O painel envia SMTP_SECURE como booleano e SMTP_PORT como número; asText só aproveita texto.
    const received = body[key];
    let value = asText(typeof received === 'boolean' || typeof received === 'number' ? String(received) : received, EMAIL_SETTING_LIMITS[key]);
    if (key === 'SMTP_PORT' && value) {
      const port = Number.parseInt(value, 10);
      if (!/^\d{1,5}$/.test(value) || port < 1 || port > 65535) return res.status(400).json({ error: 'A porta SMTP deve ser um número entre 1 e 65535.' });
    }
    if (key === 'SMTP_SECURE') value = asBoolean(value) ? 'true' : 'false';
    if (key === 'EMAIL_FROM' && value && !/^[^@\s]+@[^@\s]+$/.test(value.replace(/^[^<]*<([^>]*)>$/, '$1'))) return res.status(400).json({ error: 'Informe um remetente válido, como IM Personnel <contato@dominio.com.br>.' });
    if (key === 'LEADS_NOTIFICATION_EMAIL' && value && !validEmail(value)) return res.status(400).json({ error: 'Informe um e-mail válido para receber os avisos da equipe.' });
    setSetting(key, value);
    // A senha nunca volta em resposta nem entra na trilha de auditoria.
    changes[key] = key === 'SMTP_PASS' ? (value ? 'definida' : 'removida') : value;
  }
  if (!Object.keys(changes).length) return res.status(400).json({ error: 'Nenhuma configuração foi enviada.' });
  persistDatabase();
  resetMailer();
  audit(req, 'email_settings.updated', 'settings', 'email', changes);
  // Devolve o mesmo retrato do GET (sem os modelos) para o painel atualizar sem nova consulta.
  const updated = emailSettings();
  res.json({
    ok: true,
    SMTP_HOST: updated.host, SMTP_PORT: updated.port, SMTP_SECURE: updated.secure, SMTP_USER: updated.user,
    SMTP_PASS_SET: Boolean(updated.pass), EMAIL_FROM: updated.from, LEADS_NOTIFICATION_EMAIL: updated.notification,
    configured: isEmailConfigured(),
    stored_in_panel: all('SELECT key, value FROM settings')
      .filter((row) => row.key in EMAIL_SETTING_LIMITS && String(row.value ?? '').trim() !== '')
      .map((row) => row.key),
  });
});
app.post('/api/admin/email-settings/test', requireAdmin, requireCsrf, async (req, res) => {
  const settings = emailSettings();
  const to = asEmail(req.body?.to) || settings.notification || settings.from.replace(/^[^<]*<([^>]*)>$/, '$1');
  if (!validEmail(to)) return res.status(400).json({ error: 'Informe um destinatário válido para o teste.' });
  if (!isEmailConfigured()) return res.status(400).json({ error: 'Configure o servidor SMTP e o remetente antes de testar.' });
  const redact = (message) => (settings.pass ? message.split(settings.pass).join('***') : message);
  try {
    await verifyTransport();
    const sent = await sendMessage({ to, subject: 'Teste de configuração de e-mail • IM Personnel', text: `Mensagem de teste enviada pelo painel administrativo em ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}.\n\nSe você recebeu esta mensagem, o SMTP está configurado corretamente.` });
    audit(req, 'email_settings.test_sent', 'settings', 'email', { to });
    res.json({ ok: Boolean(sent), message: `Enviamos uma mensagem de teste para ${to}.` });
  } catch (error) {
    res.status(400).json({ error: `Não foi possível enviar o teste: ${redact(error?.message || 'falha desconhecida')}` });
  }
});
app.get('/api/admin/email-templates', requireAdmin, (_req, res) => {
  res.json({ items: all('SELECT key, label, audience, subject, body, enabled, updated_at FROM email_templates ORDER BY rowid ASC').map((row) => ({ ...row, enabled: Boolean(Number(row.enabled)), variables: templateVariables.get(row.key) || [] })) });
});
app.put('/api/admin/email-templates/:key', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT key, subject, body, enabled FROM email_templates WHERE key = ?', [asText(req.params.key, 60)]);
  if (!existing) return res.status(404).json({ error: 'Modelo não encontrado.' });
  const subject = asText(req.body?.subject ?? existing.subject, 200);
  const body = typeof req.body?.body === 'string' ? req.body.body.slice(0, 4000) : existing.body;
  const enabled = req.body?.enabled === undefined ? Boolean(Number(existing.enabled)) : asBoolean(req.body.enabled);
  if (!subject) return res.status(400).json({ error: 'O assunto não pode ficar vazio.' });
  const available = templateVariables.get(existing.key) || [];
  const used = [...new Set([...`${subject}\n${body}`.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]))];
  const unknown = used.filter((name) => !available.includes(name));
  if (unknown.length) return res.status(400).json({ error: `Variáveis desconhecidas: ${unknown.map((name) => `{{${name}}}`).join(', ')}. Disponíveis neste modelo: ${available.map((name) => `{{${name}}}`).join(', ')}.` });
  run('UPDATE email_templates SET subject=?, body=?, enabled=?, updated_at=? WHERE key=?', [subject, body, enabled ? 1 : 0, nowIso(), existing.key]);
  persistDatabase();
  audit(req, 'email_template.updated', 'email_template', existing.key, { enabled });
  const saved = get('SELECT key, label, audience, subject, body, enabled, updated_at FROM email_templates WHERE key = ?', [existing.key]);
  res.json({ template: { ...saved, enabled: Boolean(Number(saved.enabled)), variables: available } });
});
app.post('/api/admin/email-templates/:key/preview', requireAdmin, requireCsrf, (req, res) => {
  const existing = get('SELECT key, subject, body FROM email_templates WHERE key = ?', [asText(req.params.key, 60)]);
  if (!existing) return res.status(404).json({ error: 'Modelo não encontrado.' });
  const variables = Object.fromEntries((templateVariables.get(existing.key) || []).map((name) => [name, sampleVariable(name)]));
  const overrides = req.body?.variables && typeof req.body.variables === 'object' ? req.body.variables : {};
  for (const [name, value] of Object.entries(overrides)) if (name in variables) variables[name] = asText(value, 200);
  res.json({ subject: renderTemplate(existing.subject, variables), body: renderTemplate(existing.body, variables), variables });
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
  console.log(`SQLite database: ${databaseFilePath()}`);
});
