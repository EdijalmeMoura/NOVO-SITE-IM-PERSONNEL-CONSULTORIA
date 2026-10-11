import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm');
const configuredDataDir = (process.env.DATA_DIR || '').trim();
const dataDir = path.resolve(configuredDataDir || 'storage');
const databasePath = path.join(dataDir, process.env.DB_FILE || 'im-personnel.sqlite');
let db;

export async function initializeDatabase() {
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  db = fs.existsSync(databasePath)
    ? new SQL.Database(new Uint8Array(fs.readFileSync(databasePath)))
    : new SQL.Database();
  db.run('PRAGMA foreign_keys = ON;');
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      hiring_organization TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      modality TEXT NOT NULL,
      employment_type TEXT NOT NULL,
      summary TEXT NOT NULL,
      responsibilities TEXT NOT NULL DEFAULT '[]',
      requirements TEXT NOT NULL DEFAULT '[]',
      differentiators TEXT NOT NULL DEFAULT '[]',
      benefits TEXT NOT NULL DEFAULT '[]',
      published INTEGER NOT NULL DEFAULT 0,
      featured INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS jobs_public_idx ON jobs(published, expires_at, created_at);

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      intro TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '[]',
      minutes INTEGER NOT NULL DEFAULT 4,
      image_key TEXT NOT NULL DEFAULT '',
      image_alt TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS articles_public_idx ON articles(published, created_at);

    CREATE TABLE IF NOT EXISTS applications (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      linkedin TEXT,
      cover_letter TEXT,
      answers TEXT NOT NULL DEFAULT '{}',
      resume_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Candidatura recebida',
      internal_notes TEXT NOT NULL DEFAULT '',
      privacy_notice_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS applications_job_idx ON applications(job_id, created_at);
    CREATE INDEX IF NOT EXISTS applications_email_idx ON applications(email);

    CREATE TABLE IF NOT EXISTS talent_profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      area TEXT NOT NULL,
      linkedin TEXT,
      resume_key TEXT NOT NULL,
      consent_at TEXT NOT NULL,
      privacy_notice_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS talent_email_idx ON talent_profiles(email);

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      contact_name TEXT NOT NULL,
      contact_role TEXT,
      company TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      segment TEXT,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      service TEXT NOT NULL,
      position_count TEXT,
      need TEXT NOT NULL,
      desired_timeline TEXT,
      status TEXT NOT NULL DEFAULT 'Novo contato',
      assigned_to TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS leads_created_idx ON leads(created_at);

    CREATE TABLE IF NOT EXISTS privacy_requests (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      request_type TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Recebida',
      internal_notes TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT '',
      last_login_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS hero_slides (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      eyebrow TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      side_label TEXT NOT NULL DEFAULT '',
      navigation_label TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL DEFAULT '[]',
      body_text TEXT NOT NULL DEFAULT '',
      primary_label TEXT NOT NULL DEFAULT '',
      primary_to TEXT NOT NULL DEFAULT '',
      secondary_label TEXT NOT NULL DEFAULT '',
      secondary_to TEXT NOT NULL DEFAULT '',
      footnote TEXT NOT NULL DEFAULT '',
      image_position TEXT NOT NULL DEFAULT 'center 52%',
      image_alt TEXT NOT NULL DEFAULT '',
      image_key TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS hero_slides_public_idx ON hero_slides(active, position);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS email_templates (
      key TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_email TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_log(created_at);
  `);
  for (const [table, column, definition] of [
    ['jobs', 'hiring_organization', "TEXT NOT NULL DEFAULT ''"],
    ['privacy_requests', 'updated_at', "TEXT NOT NULL DEFAULT ''"],
    ['privacy_requests', 'internal_notes', "TEXT NOT NULL DEFAULT ''"],
    ['articles', 'image_key', "TEXT NOT NULL DEFAULT ''"],
    ['articles', 'image_alt', "TEXT NOT NULL DEFAULT ''"],
    ['admin_users', 'name', "TEXT NOT NULL DEFAULT ''"],
    ['admin_users', 'active', 'INTEGER NOT NULL DEFAULT 1'],
    ['admin_users', 'updated_at', "TEXT NOT NULL DEFAULT ''"],
    ['admin_users', 'last_login_at', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    const statement = db.prepare(`PRAGMA table_info(${table})`);
    let present = false;
    try { while (statement.step()) if (statement.getAsObject().name === column) present = true; }
    finally { statement.free(); }
    if (!present) db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  persistDatabase();
}

export function run(sql, params = []) {
  db.run(sql, params);
  return db.getRowsModified();
}

export function get(sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    return statement.step() ? statement.getAsObject() : null;
  } finally {
    statement.free();
  }
}

export function all(sql, params = []) {
  const statement = db.prepare(sql);
  const results = [];
  try {
    statement.bind(params);
    while (statement.step()) results.push(statement.getAsObject());
    return results;
  } finally {
    statement.free();
  }
}

export function persistDatabase() {
  if (!db) return;
  const bytes = db.export();
  const tempPath = `${databasePath}.tmp`;
  fs.writeFileSync(tempPath, Buffer.from(bytes), { mode: 0o600 });
  fs.renameSync(tempPath, databasePath);
}

export function databaseFilePath() {
  return databasePath;
}
