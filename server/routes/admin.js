import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, audit, notify } from '../db.js';
import { validate, newId, nowIso, badRequest, notFound, conflict, hashPassword, randomToken } from '../lib/util.js';
import { requireAuth, requirePlatformAdmin, ROLE_LABELS, permissionsFor } from '../middleware.js';
import { listIntegrations } from '../lib/integrations.js';
import { planById, listPlans, usageFor, TRIAL_DAYS, paymentProviders } from '../lib/billing.js';
import { aiStatus } from '../lib/ai.js';

import { launchReadiness, systemHealth } from '../lib/readiness.js';
import {
  platformSettings, setSetting, payoutProfile, listPaymentRequests,
  verifyPaymentRequest, paymentStats,
} from '../lib/payments.js';
import { listOutbox } from '../lib/automations.js';

const router = Router();
router.use(requireAuth, requirePlatformAdmin);

const safeJson = (value, fallback) => {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
};
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const count = (sql, params = []) => get(sql, params)?.n ?? 0;

/* ------------------------------ overview ------------------------------ */

router.get('/overview', (_req, res) => {
  const tenants = count(`SELECT COUNT(*) AS n FROM tenants`);
  const activeTenants = count(`SELECT COUNT(*) AS n FROM tenants WHERE status = 'active'`);
  const onboarding = count(`SELECT COUNT(*) AS n FROM tenants WHERE status = 'onboarding'`);
  const suspended = count(`SELECT COUNT(*) AS n FROM tenants WHERE status = 'suspended'`);
  const newTenants30 = count(`SELECT COUNT(*) AS n FROM tenants WHERE created_at >= ?`, [daysAgo(30)]);

  const subsByStatus = all(`SELECT status, COUNT(*) AS n FROM subscriptions GROUP BY status`);
  const planMix = all(
    `SELECT s.plan_id, p.name, COUNT(*) AS n FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.status IN ('active','past_due') GROUP BY s.plan_id ORDER BY n DESC`,
  );

  const paying = all(
    `SELECT s.plan_id, COUNT(*) AS n FROM subscriptions s WHERE s.status = 'active' GROUP BY s.plan_id`,
  );
  const mrrCents = paying.reduce((sum, row) => sum + (planById(row.plan_id)?.price_monthly || 0) * row.n, 0);

  const paidInvoices30 = count(
    `SELECT COALESCE(SUM(amount_cents),0) AS n FROM invoices WHERE status = 'paid' AND paid_at >= ?`, [daysAgo(30)],
  );
  const openInvoices = count(`SELECT COUNT(*) AS n FROM invoices WHERE status = 'open'`);

  const appts30 = count(`SELECT COUNT(*) AS n FROM appointments WHERE created_at >= ?`, [daysAgo(30)]);
  const apptsAll = count(`SELECT COUNT(*) AS n FROM appointments`);
  const customersAll = count(`SELECT COUNT(*) AS n FROM customers`);
  const conversations30 = count(`SELECT COUNT(*) AS n FROM conversations WHERE created_at >= ?`, [daysAgo(30)]);
  const handoffs = count(`SELECT COUNT(*) AS n FROM conversations WHERE status = 'needs_human'`);
  const contentPublished = count(`SELECT COUNT(*) AS n FROM content_items WHERE status = 'published'`);
  const leadsNew = count(`SELECT COUNT(*) AS n FROM platform_leads WHERE status = 'new'`);

  const integrationHealth = all(
    `SELECT provider, status, COUNT(*) AS n FROM integrations GROUP BY provider, status ORDER BY provider`,
  );

  const recentTenants = all(
    `SELECT t.id, t.name, t.slug, t.industry, t.status, t.created_at,
       (SELECT s.status FROM subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC LIMIT 1) AS sub_status,
       (SELECT s.plan_id FROM subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC LIMIT 1) AS plan_id
     FROM tenants t ORDER BY t.created_at DESC LIMIT 8`,
  );
  const recentLeads = all(`SELECT * FROM platform_leads ORDER BY created_at DESC LIMIT 6`);

  res.json({
    totals: {
      tenants, active_tenants: activeTenants, onboarding_tenants: onboarding, suspended_tenants: suspended,
      new_tenants_30d: newTenants30, appointments_total: apptsAll, appointments_30d: appts30,
      customers_total: customersAll, conversations_30d: conversations30, handoffs_open: handoffs,
      content_published: contentPublished, leads_new: leadsNew, open_invoices: openInvoices,
      mrr_cents: mrrCents, collected_30d_cents: paidInvoices30,
    },
    subscriptions_by_status: subsByStatus,
    plan_mix: planMix,
    integration_health: integrationHealth,
    recent_tenants: recentTenants,
    recent_leads: recentLeads,
    system: { ai: aiStatus(), payments: paymentProviders() },
  });
});

/* ------------------------------ tenants ------------------------------ */

router.get('/tenants', (req, res) => {
  const { q, status, plan, limit } = req.query;
  const clauses = ['1=1'];
  const params = [];
  if (q) { clauses.push('(t.name LIKE ? OR t.slug LIKE ? OR t.email LIKE ?)'); const like = `%${q}%`; params.push(like, like, like); }
  if (status && status !== 'all') { clauses.push('t.status = ?'); params.push(String(status)); }
  if (plan && plan !== 'all') { clauses.push(`(SELECT plan_id FROM subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC LIMIT 1) = ?`); params.push(String(plan)); }

  const tenants = all(
    `SELECT t.*,
       (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) AS customers,
       (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = t.id) AS appointments,
       (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS team,
       (SELECT COUNT(*) FROM services sv WHERE sv.tenant_id = t.id AND sv.active = 1) AS services,
       (SELECT status FROM subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC LIMIT 1) AS subscription_status,
       (SELECT plan_id FROM subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC LIMIT 1) AS plan_id,
       (SELECT trial_ends_at FROM subscriptions s WHERE s.tenant_id = t.id ORDER BY s.created_at DESC LIMIT 1) AS trial_ends_at
     FROM tenants t WHERE ${clauses.join(' AND ')}
     ORDER BY t.created_at DESC LIMIT ?`,
    [...params, Math.min(Number(limit) || 100, 500)],
  );
  res.json({
    tenants: tenants.map((t) => ({ ...t, gallery: undefined, booking_rules: undefined })),
    counts: {
      all: count(`SELECT COUNT(*) AS n FROM tenants`),
      active: count(`SELECT COUNT(*) AS n FROM tenants WHERE status='active'`),
      onboarding: count(`SELECT COUNT(*) AS n FROM tenants WHERE status='onboarding'`),
      suspended: count(`SELECT COUNT(*) AS n FROM tenants WHERE status='suspended'`),
    },
    plans: listPlans(),
  });
});

router.get('/tenants/:id', (req, res) => {
  const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [req.params.id]);
  if (!tenant) throw notFound('Workspace not found.');
  const subscription = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenant.id]);
  const invoices = all(`SELECT * FROM invoices WHERE tenant_id = ? ORDER BY issued_at DESC LIMIT 20`, [tenant.id]);
  const users = all(
    `SELECT id, email, name, phone, role, status, last_login_at, created_at FROM users WHERE tenant_id = ? ORDER BY created_at`,
    [tenant.id],
  );
  const integrations = listIntegrations(tenant.id).map((i) => ({ provider: i.provider, name: i.name, status: i.status, connected_at: i.connected_at }));
  res.json({
    tenant: { ...tenant, gallery: safeJson(tenant.gallery, []), booking_rules: safeJson(tenant.booking_rules, {}) },
    subscription,
    plan: subscription ? planById(subscription.plan_id) : null,
    usage: usageFor(tenant.id),
    invoices,
    users: users.map((u) => ({ ...u, role_label: ROLE_LABELS[u.role] || u.role })),
    integrations,
    stats: {
      customers: count(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?`, [tenant.id]),
      appointments: count(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ?`, [tenant.id]),
      appointments_30d: count(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND created_at >= ?`, [tenant.id, daysAgo(30)]),
      revenue_cents: count(`SELECT COALESCE(SUM(price_cents),0) AS n FROM appointments WHERE tenant_id = ? AND status='completed'`, [tenant.id]),
      conversations: count(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ?`, [tenant.id]),
      content: count(`SELECT COUNT(*) AS n FROM content_items WHERE tenant_id = ?`, [tenant.id]),
    },
    audit: all(`SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20`, [tenant.id])
      .map((a) => ({ ...a, meta: safeJson(a.meta, {}) })),
  });
});

router.patch('/tenants/:id', (req, res) => {
  const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [req.params.id]);
  if (!tenant) throw notFound('Workspace not found.');
  const data = validate(z.object({
    status: z.enum(['onboarding', 'active', 'suspended']).optional(),
    name: z.string().min(2).max(140).optional(),
    industry: z.string().max(40).optional(),
  }), req.body);
  run(`UPDATE tenants SET status = ?, name = ?, industry = ?, updated_at = ? WHERE id = ?`,
    [data.status ?? tenant.status, data.name ?? tenant.name, data.industry ?? tenant.industry, nowIso(), tenant.id]);
  audit({
    tenantId: tenant.id, actor: req.user, action: 'admin.tenant.update',
    target: tenant.id, meta: { status: data.status || tenant.status }, ip: req.ip,
  });
  if (data.status === 'suspended') {
    run(`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE tenant_id = ?)`, [tenant.id]);
    notify({ tenantId: tenant.id, title: 'Workspace suspended', body: 'Contact platform support to restore access.', level: 'warning' });
  }
  res.json({ tenant: get(`SELECT * FROM tenants WHERE id = ?`, [tenant.id]) });
});

router.post('/tenants/:id/subscription', (req, res) => {
  const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [req.params.id]);
  if (!tenant) throw notFound('Workspace not found.');
  const data = validate(z.object({
    planId: z.string().min(1).optional(),
    status: z.enum(['trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended']).optional(),
    extendTrialDays: z.number().int().min(1).max(90).optional(),
    note: z.string().max(300).optional(),
  }), req.body);

  const sub = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenant.id]);
  if (!sub) {
    const plan = planById(data.planId || 'starter');
    const now = nowIso();
    const id = newId('sub_');
    run(`INSERT INTO subscriptions (id, tenant_id, plan_id, status, trial_ends_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?)`,
      [id, tenant.id, plan.id, data.status || 'trialing',
        new Date(Date.now() + TRIAL_DAYS * 864e5).toISOString(), now, now]);
  } else {
    let trialEnds = sub.trial_ends_at;
    if (data.extendTrialDays) {
      const base = trialEnds && new Date(trialEnds) > new Date() ? new Date(trialEnds) : new Date();
      trialEnds = new Date(base.getTime() + data.extendTrialDays * 864e5).toISOString();
    }
    run(`UPDATE subscriptions SET plan_id = ?, status = ?, trial_ends_at = ?, updated_at = ? WHERE id = ?`,
      [data.planId || sub.plan_id, data.status || sub.status, trialEnds, nowIso(), sub.id]);
  }

  audit({
    tenantId: tenant.id, actor: req.user, action: 'admin.subscription.update', target: tenant.id,
    meta: { planId: data.planId, status: data.status, extendTrialDays: data.extendTrialDays, note: data.note }, ip: req.ip,
  });
  notify({
    tenantId: tenant.id,
    title: 'Subscription updated by MAVYRON',
    body: data.note || `Your plan is now ${planById(data.planId || sub?.plan_id)?.name || 'updated'}.`,
    level: 'info',
  });
  res.json({ subscription: get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenant.id]) });
});

router.post('/tenants/:id/notify', (req, res) => {
  const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [req.params.id]);
  if (!tenant) throw notFound('Workspace not found.');
  const data = validate(z.object({
    title: z.string().min(2).max(120),
    body: z.string().min(2).max(600),
    level: z.enum(['info', 'success', 'warning']).optional(),
  }), req.body);
  notify({ tenantId: tenant.id, title: data.title, body: data.body, level: data.level || 'info' });
  audit({ tenantId: tenant.id, actor: req.user, action: 'admin.notify', target: tenant.id, meta: { title: data.title }, ip: req.ip });
  res.status(201).json({ sent: true });
});

/* ------------------------------ billing ------------------------------ */

router.get('/invoices', (req, res) => {
  const status = req.query.status ? String(req.query.status) : 'all';
  const invoices = all(
    `SELECT i.*, t.name AS tenant_name, t.slug AS tenant_slug FROM invoices i JOIN tenants t ON t.id = i.tenant_id
     ${status !== 'all' ? 'WHERE i.status = ?' : ''} ORDER BY i.issued_at DESC LIMIT 200`,
    status !== 'all' ? [status] : [],
  );
  res.json({
    invoices,
    totals: {
      paid_cents: count(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM invoices WHERE status='paid'`),
      open_cents: count(`SELECT COALESCE(SUM(amount_cents),0) AS n FROM invoices WHERE status='open'`),
      open_count: count(`SELECT COUNT(*) AS n FROM invoices WHERE status='open'`),
    },
  });
});

router.post('/invoices/:id/settle', (req, res) => {
  const invoice = get(`SELECT * FROM invoices WHERE id = ?`, [req.params.id]);
  if (!invoice) throw notFound('Invoice not found.');
  if (invoice.status === 'paid') throw conflict('This invoice is already settled.');
  const data = validate(z.object({ note: z.string().max(300).optional() }), req.body || {});
  run(`UPDATE invoices SET status = 'paid', paid_at = ?, provider = COALESCE(provider, 'manual') WHERE id = ?`, [nowIso(), invoice.id]);
  audit({
    tenantId: invoice.tenant_id, actor: req.user, action: 'admin.invoice.settle', target: invoice.id,
    meta: { note: data.note || null, amount_cents: invoice.amount_cents }, ip: req.ip,
  });
  const sub = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [invoice.tenant_id]);
  if (sub) run(`UPDATE subscriptions SET status = 'active', updated_at = ? WHERE id = ?`, [nowIso(), sub.id]);
  notify({ tenantId: invoice.tenant_id, title: 'Payment recorded', body: `Invoice ${invoice.id.slice(-6)} settled.`, level: 'success' });
  res.json({ invoice: get(`SELECT * FROM invoices WHERE id = ?`, [invoice.id]) });
});

router.get('/plans', (_req, res) => {
  res.json({ plans: listPlans() });
});

router.patch('/plans/:id', (req, res) => {
  const plan = get(`SELECT * FROM plans WHERE id = ?`, [req.params.id]);
  if (!plan) throw notFound('Plan not found.');
  const data = validate(z.object({
    name: z.string().min(2).max(60).optional(),
    tagline: z.string().min(2).max(160).optional(),
    price_monthly: z.number().int().min(0).max(100_000_000).optional(),
    price_yearly: z.number().int().min(0).max(100_000_000).optional(),
    active: z.boolean().optional(),
  }), req.body);
  run(`UPDATE plans SET name = ?, tagline = ?, price_monthly = ?, price_yearly = ?, active = ? WHERE id = ?`,
    [data.name ?? plan.name, data.tagline ?? plan.tagline, data.price_monthly ?? plan.price_monthly,
      data.price_yearly ?? plan.price_yearly, data.active === undefined ? plan.active : data.active ? 1 : 0, plan.id]);
  audit({ actor: req.user, action: 'admin.plan.update', target: plan.id, meta: data, ip: req.ip });
  res.json({ plan: planById(plan.id) });
});

/* ------------------------------ leads ------------------------------ */

router.get('/leads', (req, res) => {
  const kind = req.query.kind ? String(req.query.kind) : 'all';
  const status = req.query.status ? String(req.query.status) : 'all';
  const clauses = [];
  const params = [];
  if (kind !== 'all') { clauses.push('kind = ?'); params.push(kind); }
  if (status !== 'all') { clauses.push('status = ?'); params.push(status); }
  const rows = all(
    `SELECT * FROM platform_leads ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT 300`,
    params,
  );
  res.json({
    leads: rows.map((l) => ({ ...l, meta: safeJson(l.meta, {}) })),
    counts: {
      contact: count(`SELECT COUNT(*) AS n FROM platform_leads WHERE kind='contact'`),
      partnership: count(`SELECT COUNT(*) AS n FROM platform_leads WHERE kind='partnership'`),
      support: count(`SELECT COUNT(*) AS n FROM platform_leads WHERE kind='support'`),
      new: count(`SELECT COUNT(*) AS n FROM platform_leads WHERE status='new'`),
    },
  });
});

router.patch('/leads/:id', (req, res) => {
  const lead = get(`SELECT * FROM platform_leads WHERE id = ?`, [req.params.id]);
  if (!lead) throw notFound('Enquiry not found.');
  const data = validate(z.object({
    status: z.enum(['new', 'in_review', 'responded', 'closed']),
  }), req.body);
  run(`UPDATE platform_leads SET status = ? WHERE id = ?`, [data.status, lead.id]);
  audit({ actor: req.user, action: 'admin.lead.update', target: lead.id, meta: { status: data.status }, ip: req.ip });
  res.json({ lead: get(`SELECT * FROM platform_leads WHERE id = ?`, [lead.id]) });
});

/* ------------------------------ analytics ------------------------------ */

router.get('/analytics', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
  const since = daysAgo(days);
  const signups = all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM tenants WHERE created_at >= ? GROUP BY day ORDER BY day`,
    [since],
  );
  const appointments = all(
    `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS n FROM appointments WHERE created_at >= ? GROUP BY day ORDER BY day`,
    [since],
  );
  const byIndustry = all(`SELECT industry, COUNT(*) AS n FROM tenants GROUP BY industry ORDER BY n DESC`);
  const topTenants = all(
    `SELECT t.name, t.slug, COUNT(a.id) AS appointments
     FROM tenants t LEFT JOIN appointments a ON a.tenant_id = t.id AND a.created_at >= ?
     GROUP BY t.id ORDER BY appointments DESC LIMIT 8`,
    [since],
  );
  const revenue = all(
    `SELECT substr(paid_at, 1, 10) AS day, COALESCE(SUM(amount_cents),0) AS cents FROM invoices
     WHERE status='paid' AND paid_at >= ? GROUP BY day ORDER BY day`,
    [since],
  );
  res.json({ range_days: days, signups, appointments, by_industry: byIndustry, top_tenants: topTenants, revenue });
});

/* ------------------------------ accounts + system ------------------------------ */

router.get('/accounts', (req, res) => {
  const admins = all(
    `SELECT id, email, name, role, status, last_login_at, created_at FROM users WHERE role = 'platform_admin' ORDER BY created_at`,
  );
  res.json({ accounts: admins.map((a) => ({ ...a, permissions: permissionsFor(a) })) });
});

router.post('/accounts', (req, res) => {
  const data = validate(z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(160),
  }), req.body);
  if (get(`SELECT id FROM users WHERE lower(email) = lower(?)`, [data.email])) {
    throw conflict('An account with this email already exists.');
  }
  const password = `mvy-adm-${randomToken().slice(0, 14)}`;
  const id = newId('usr_');
  run(`INSERT INTO users (id, tenant_id, email, name, password_hash, role, status, created_at) VALUES (?,?,?,?,?,?,?,?)`,
    [id, null, data.email.toLowerCase(), data.name, hashPassword(password), 'platform_admin', 'active', nowIso()]);
  audit({ actor: req.user, action: 'admin.account.create', target: id, meta: { email: data.email }, ip: req.ip });
  res.status(201).json({
    account: get(`SELECT id, email, name, role, status FROM users WHERE id = ?`, [id]),
    temporary_password: password,
    note: 'Share this password securely; the administrator should change it after first sign-in.',
  });
});

router.delete('/accounts/:id', (req, res) => {
  const account = get(`SELECT * FROM users WHERE id = ? AND role = 'platform_admin'`, [req.params.id]);
  if (!account) throw notFound('Administrator not found.');
  if (account.id === req.user.id) throw conflict('You cannot remove your own administrator account.');
  if (count(`SELECT COUNT(*) AS n FROM users WHERE role='platform_admin' AND status='active'`) <= 1) {
    throw conflict('At least one active platform administrator is required.');
  }
  run(`DELETE FROM sessions WHERE user_id = ?`, [account.id]);
  run(`DELETE FROM users WHERE id = ?`, [account.id]);
  audit({ actor: req.user, action: 'admin.account.remove', target: account.id, meta: { email: account.email }, ip: req.ip });
  res.json({ removed: true });
});

router.get('/system', (_req, res) => {
  res.json({
    ai: aiStatus(),
    payments: paymentProviders(),
    database: {
      path: 'server-managed SQLite',
      tenants: count(`SELECT COUNT(*) AS n FROM tenants`),
      users: count(`SELECT COUNT(*) AS n FROM users`),
      appointments: count(`SELECT COUNT(*) AS n FROM appointments`),
      messages: count(`SELECT COUNT(*) AS n FROM messages`),
    },
    integrations: all(
      `SELECT provider, status, COUNT(*) AS n FROM integrations GROUP BY provider, status ORDER BY provider`,
    ),
    webhooks: all(`SELECT provider, verified, COUNT(*) AS n FROM webhook_events GROUP BY provider, verified ORDER BY provider`),
    audit_recent: all(`SELECT action, created_at, actor_email FROM audit_logs ORDER BY created_at DESC LIMIT 15`),
  });
});

router.get('/audit', (req, res) => {
  const tenantId = req.query.tenantId ? String(req.query.tenantId) : null;
  const rows = all(
    `SELECT * FROM audit_logs ${tenantId ? 'WHERE tenant_id = ?' : ''} ORDER BY created_at DESC LIMIT 200`,
    tenantId ? [tenantId] : [],
  );
  res.json({ entries: rows.map((r) => ({ ...r, meta: safeJson(r.meta, {}) })) });
});

router.get('/usage', (_req, res) => {
  const tenants = all(`SELECT id, name, slug FROM tenants ORDER BY name`);
  res.json({
    usage: tenants.map((t) => ({ ...t, ...usageFor(t.id) })),
  });
});

/* --------------------- launch readiness & health --------------------- */

router.get('/readiness', (_req, res) => {
  res.json(launchReadiness());
});

router.get('/health', (_req, res) => {
  res.json(systemHealth());
});

/* ------------------------- platform settings ------------------------- */

const SETTINGS_WHITELIST = [
  'payout_mpesa', 'payout_mpesa_name', 'payout_bank_name', 'payout_bank_account',
  'payout_account_name', 'payout_notes', 'support_whatsapp', 'support_email',
  'ceo_whatsapp', 'social_instagram', 'social_tiktok', 'social_facebook',
  'readiness_mobile_verified', 'billing_mode', 'platform_notice',
];

router.get('/settings', (_req, res) => {
  res.json({ settings: platformSettings(), payout: payoutProfile() });
});

router.patch('/settings', (req, res) => {
  const data = validate(
    z.object({
      settings: z.record(z.string(), z.string().max(500)),
    }),
    req.body || {},
  );
  const updated = [];
  const rejected = [];
  for (const [key, value] of Object.entries(data.settings)) {
    if (!SETTINGS_WHITELIST.includes(key)) {
      rejected.push(key);
      continue;
    }
    setSetting(key, value);
    updated.push(key);
  }
  audit({
    tenantId: null, actor: req.user, action: 'platform.settings.update',
    target: 'platform_settings', meta: { updated, rejected }, ip: req.ip,
  });
  res.json({ settings: platformSettings(), updated, rejected });
});

/* --------------------- subscription payments (admin) --------------------- */

router.get('/payments', (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  res.json({
    requests: listPaymentRequests({ status, limit: 200 }),
    stats: paymentStats(),
    payout: payoutProfile(),
  });
});

router.post('/payments/:id/verify', (req, res) => {
  const data = validate(
    z.object({
      decision: z.enum(['verify', 'reject']),
      note: z.string().trim().max(500).optional(),
    }),
    req.body || {},
  );
  const result = verifyPaymentRequest({
    requestId: req.params.id, admin: req.user, decision: data.decision, note: data.note || null,
  });
  audit({
    tenantId: result?.tenant_id || null, actor: req.user, action: `payment.${data.decision}`,
    target: req.params.id, meta: { amount_cents: result?.amount_cents }, ip: req.ip,
  });
  res.json({ request: result });
});

/* -------------------------- account control -------------------------- */

router.post('/tenants/:id/suspend', (req, res) => {
  const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [req.params.id]);
  if (!tenant) throw notFound('Business not found.');
  const data = validate(
    z.object({ reason: z.string().trim().min(3, 'Give a reason for suspension.').max(300) }),
    req.body || {},
  );
  run(
    `UPDATE tenants SET status = 'suspended', suspended_at = ?, suspension_reason = ?, updated_at = ? WHERE id = ?`,
    [nowIso(), data.reason, nowIso(), tenant.id],
  );
  audit({
    tenantId: tenant.id, actor: req.user, action: 'tenant.suspend',
    target: tenant.id, meta: { reason: data.reason }, ip: req.ip,
  });
  notify({
    tenantId: tenant.id, title: 'Workspace suspended',
    body: data.reason, level: 'warning',
  });
  res.json({ tenant: get(`SELECT * FROM tenants WHERE id = ?`, [tenant.id]) });
});

router.post('/tenants/:id/reactivate', (req, res) => {
  const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [req.params.id]);
  if (!tenant) throw notFound('Business not found.');
  run(
    `UPDATE tenants SET status = 'active', suspended_at = NULL, suspension_reason = NULL, updated_at = ? WHERE id = ?`,
    [nowIso(), tenant.id],
  );
  audit({
    tenantId: tenant.id, actor: req.user, action: 'tenant.reactivate', target: tenant.id, ip: req.ip,
  });
  notify({
    tenantId: tenant.id, title: 'Workspace reactivated',
    body: 'Your MAVYRON workspace is active again.', level: 'success',
  });
  res.json({ tenant: get(`SELECT * FROM tenants WHERE id = ?`, [tenant.id]) });
});

/* ----------------------- platform-wide outbox ----------------------- */

router.get('/outbox', (req, res) => {
  const status = req.query.status ? String(req.query.status) : null;
  const rows = all(
    `SELECT o.*, t.name AS tenant_name FROM outbox o
       LEFT JOIN tenants t ON t.id = o.tenant_id
      ${status ? 'WHERE o.status = ?' : ''}
      ORDER BY o.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
  res.json({ messages: rows });
});

export default router;
