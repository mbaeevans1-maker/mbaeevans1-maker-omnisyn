import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { hashPassword, newId, nowIso, randomToken } from './lib/util.js';

const DATA_DIR = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const DB_PATH = path.join(DATA_DIR, 'mavyron.db');
export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL,
  price_monthly INTEGER NOT NULL,
  price_yearly INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  features TEXT NOT NULL DEFAULT '[]',
  limits TEXT NOT NULL DEFAULT '{}',
  sort INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  industry TEXT NOT NULL DEFAULT 'salon',
  legal_name TEXT,
  email TEXT,
  phone TEXT,
  whatsapp TEXT,
  address TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'Kenya',
  timezone TEXT NOT NULL DEFAULT 'Africa/Nairobi',
  currency TEXT NOT NULL DEFAULT 'KES',
  logo_url TEXT,
  brand_color TEXT DEFAULT '#7B5BFF',
  accent_color TEXT DEFAULT '#D8C6A3',
  tagline TEXT,
  about TEXT,
  gallery TEXT NOT NULL DEFAULT '[]',
  social_links TEXT NOT NULL DEFAULT '{}',
  booking_rules TEXT NOT NULL DEFAULT '{}',
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'onboarding',
  launched_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'owner',
  status TEXT NOT NULL DEFAULT 'active',
  email_verified INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  ip TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  color TEXT DEFAULT '#7B5BFF',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  duration_min INTEGER NOT NULL DEFAULT 30,
  buffer_min INTEGER NOT NULL DEFAULT 0,
  price_cents INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_services (
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

CREATE TABLE IF NOT EXISTS schedules (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  start_min INTEGER NOT NULL,
  end_min INTEGER NOT NULL,
  break_start INTEGER,
  break_end INTEGER
);

CREATE TABLE IF NOT EXISTS time_off (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_periods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  staff_id TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  notes TEXT,
  preferences TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  marketing_consent INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  visits INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  last_visit_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed',
  source TEXT NOT NULL DEFAULT 'dashboard',
  price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'KES',
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_tenant_start ON appointments(tenant_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appt_staff_start ON appointments(staff_id, start_at);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'web',
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  contact_name TEXT,
  contact_ref TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  ai_enabled INTEGER NOT NULL DEFAULT 1,
  assigned_user_id TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  last_message_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conv_tenant ON conversations(tenant_id, last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  body TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS knowledge_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'faq',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 1,
  assistant_name TEXT NOT NULL DEFAULT 'Ava',
  tone TEXT NOT NULL DEFAULT 'warm-professional',
  language TEXT NOT NULL DEFAULT 'en',
  greeting TEXT,
  escalation_keywords TEXT NOT NULL DEFAULT '[]',
  voice_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'caption',
  channel TEXT NOT NULL DEFAULT 'instagram',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  hashtags TEXT,
  media_style TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  external_ref TEXT,
  error TEXT,
  generator TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_tenant ON content_items(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  goal TEXT,
  audience TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  account_ref TEXT,
  last_error TEXT,
  last_checked_at TEXT,
  connected_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, provider)
);

CREATE TABLE IF NOT EXISTS integration_secrets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  key TEXT NOT NULL,
  value_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (tenant_id, provider, key)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'trialing',
  trial_ends_at TEXT,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  provider TEXT,
  provider_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'KES',
  status TEXT NOT NULL DEFAULT 'open',
  description TEXT,
  provider TEXT,
  provider_ref TEXT,
  period_start TEXT,
  period_end TEXT,
  issued_at TEXT NOT NULL,
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  level TEXT NOT NULL DEFAULT 'info',
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  actor_id TEXT,
  actor_email TEXT,
  action TEXT NOT NULL,
  target TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  ip TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_logs(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS platform_leads (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'contact',
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  organisation TEXT,
  position TEXT,
  website TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  tenant_id TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  payload TEXT,
  created_at TEXT NOT NULL
);
`);

export const get = (sql, params = []) => db.prepare(sql).get(...params);
export const all = (sql, params = []) => db.prepare(sql).all(...params);
export const run = (sql, params = []) => db.prepare(sql).run(...params);
export const tx = (fn) => db.transaction(fn)();

export function audit({ tenantId = null, actor = null, action, target = null, meta = {}, ip = null }) {
  run(
    `INSERT INTO audit_logs (id, tenant_id, actor_id, actor_email, action, target, meta, ip, created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [newId('aud_'), tenantId, actor?.id ?? null, actor?.email ?? null, action, target, JSON.stringify(meta), ip, nowIso()],
  );
}

export function notify({ tenantId = null, userId = null, title, body = null, level = 'info' }) {
  run(
    `INSERT INTO notifications (id, tenant_id, user_id, title, body, level, created_at) VALUES (?,?,?,?,?,?,?)`,
    [newId('ntf_'), tenantId, userId, title, body, level, nowIso()],
  );
}

/* ------------------------------------------------------------------ *
 * Seed — real product configuration only (no fabricated business data)
 * ------------------------------------------------------------------ */
const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'For a single location finding its rhythm.',
    price_monthly: 390000,
    price_yearly: 3900000,
    features: [
      '1 business location',
      '2 staff calendars',
      'AI receptionist (web + WhatsApp)',
      'Real-time booking engine',
      'Public booking page + QR code',
      'CRM and customer history',
      '1,000 AI conversations / month',
    ],
    limits: { staff: 2, locations: 1, ai_messages: 1000, content_items: 30, channels: ['web', 'whatsapp'] },
    sort: 1,
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing teams that live in their calendar.',
    price_monthly: 890000,
    price_yearly: 8900000,
    features: [
      'Up to 3 locations',
      '10 staff calendars',
      'AI receptionist + AI voice architecture',
      'WhatsApp Business integration',
      'AI marketing and content engine',
      'Social scheduling workflow',
      'Analytics and retention intelligence',
      '6,000 AI conversations / month',
    ],
    limits: { staff: 10, locations: 3, ai_messages: 6000, content_items: 200, channels: ['web', 'whatsapp', 'voice', 'instagram', 'facebook'] },
    sort: 2,
  },
  {
    id: 'scale',
    name: 'Scale',
    tagline: 'For multi-branch operators and franchises.',
    price_monthly: 1890000,
    price_yearly: 18900000,
    features: [
      'Unlimited locations',
      'Unlimited staff calendars',
      'All AI channels including voice',
      'Advanced integrations and API access',
      'Priority support and onboarding',
      'Audit logs and data export',
      '25,000 AI conversations / month',
    ],
    limits: { staff: 200, locations: 50, ai_messages: 25000, content_items: 2000, channels: ['web', 'whatsapp', 'voice', 'instagram', 'facebook', 'tiktok', 'x'] },
    sort: 3,
  },
];

export function seed() {
  const insertPlan = db.prepare(
    `INSERT INTO plans (id, name, tagline, price_monthly, price_yearly, currency, features, limits, sort, active)
     VALUES (@id, @name, @tagline, @price_monthly, @price_yearly, 'KES', @features, @limits, @sort, 1)
     ON CONFLICT(id) DO UPDATE SET
       name=excluded.name, tagline=excluded.tagline, price_monthly=excluded.price_monthly,
       price_yearly=excluded.price_yearly, features=excluded.features, limits=excluded.limits, sort=excluded.sort`,
  );
  for (const plan of PLANS) {
    insertPlan.run({
      ...plan,
      features: JSON.stringify(plan.features),
      limits: JSON.stringify(plan.limits),
    });
  }

  const adminExists = get(`SELECT id FROM users WHERE role = 'platform_admin' LIMIT 1`);
  if (!adminExists) {
    const email = (process.env.PLATFORM_ADMIN_EMAIL || 'admin@mavyron.app').toLowerCase();
    const generated = !process.env.PLATFORM_ADMIN_PASSWORD;
    const password = process.env.PLATFORM_ADMIN_PASSWORD || randomToken().slice(0, 18);
    const emailTaken = get(`SELECT id FROM users WHERE email = ?`, [email]);
    if (!emailTaken) {
      run(
        `INSERT INTO users (id, tenant_id, email, name, password_hash, role, status, email_verified, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [newId('usr_'), null, email, 'MAVYRON Platform Admin', hashPassword(password), 'platform_admin', 'active', 1, nowIso()],
      );
      if (generated) {
        fs.writeFileSync(
          path.join(DATA_DIR, 'PLATFORM_ADMIN.txt'),
          `MAVYRON platform administrator provisioned ${nowIso()}\nemail: ${email}\npassword: ${password}\n\nSet PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD to control these values.\n`,
          { mode: 0o600 },
        );
        console.log(`[mavyron] platform admin provisioned: ${email} (generated password written to ${DATA_DIR}/PLATFORM_ADMIN.txt)`);
      } else {
        console.log(`[mavyron] platform admin provisioned: ${email}`);
      }
    }
  }
}

seed();
