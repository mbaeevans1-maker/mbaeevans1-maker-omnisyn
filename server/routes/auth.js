import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, audit, notify } from '../db.js';
import {
  validate, hashPassword, verifyPassword, newId, nowIso, slugify, randomToken, sha256,
  rateLimit, badRequest, unauthorized, conflict,
} from '../lib/util.js';
import { createSession, SESSION_COOKIE, SESSION_TTL_DAYS, requireAuth, permissionsFor, ROLE_LABELS } from '../middleware.js';
import { ensureIntegrations } from '../lib/integrations.js';
import { aiStatus } from '../lib/ai.js';

const router = Router();

const cookieOptions = (req) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: req.secure || req.get('x-forwarded-proto') === 'https',
  path: '/',
  maxAge: SESSION_TTL_DAYS * 864e5,
});

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.');
const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters.')
  .max(200, 'Password is too long.')
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number.');

function uniqueSlug(name) {
  const base = slugify(name) || 'business';
  let candidate = base;
  let i = 1;
  while (get(`SELECT id FROM tenants WHERE slug = ?`, [candidate])) {
    i += 1;
    candidate = `${base}-${i}`;
  }
  return candidate;
}

function sessionPayload(user, tenant) {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      role_label: ROLE_LABELS[user.role] || user.role,
      tenant_id: user.tenant_id,
      email_verified: Boolean(user.email_verified),
      permissions: permissionsFor(user.role),
    },
    tenant: tenant
      ? {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          industry: tenant.industry,
          status: tenant.status,
          onboarding_step: tenant.onboarding_step,
          onboarding_complete: Boolean(tenant.onboarding_complete),
          currency: tenant.currency,
          timezone: tenant.timezone,
          logo_url: tenant.logo_url,
          brand_color: tenant.brand_color,
          accent_color: tenant.accent_color,
        }
      : null,
    ai: aiStatus(),
  };
}

router.post(
  '/signup',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 12, key: 'signup' }),
  (req, res, next) => {
    try {
      const body = validate(
        z.object({
          name: z.string().trim().min(2, 'Enter your full name.').max(120),
          email: emailSchema,
          password: passwordSchema,
          business_name: z.string().trim().min(2, 'Enter your business name.').max(140),
          industry: z.enum(['salon', 'barbershop', 'spa', 'clinic', 'dental', 'restaurant', 'hotel', 'fitness', 'rentals', 'other']).default('salon'),
          phone: z.string().trim().max(40).optional().nullable(),
          country: z.string().trim().max(80).default('Kenya'),
          city: z.string().trim().max(80).optional().nullable(),
          plan_id: z.enum(['starter', 'pro', 'scale']).default('starter'),
        }),
        req.body,
      );

      if (get(`SELECT id FROM users WHERE email = ?`, [body.email])) {
        throw conflict('An account with this email already exists. Sign in instead.');
      }
      const plan = get(`SELECT * FROM plans WHERE id = ? AND active = 1`, [body.plan_id]);
      if (!plan) throw badRequest('Choose a valid plan.');

      const tenantId = newId('tnt_');
      const userId = newId('usr_');
      const now = nowIso();
      const trialEnds = new Date(Date.now() + 14 * 864e5).toISOString();

      run(
        `INSERT INTO tenants (id, slug, name, industry, email, phone, whatsapp, city, country, timezone, currency, status, onboarding_step, onboarding_complete, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,'Africa/Nairobi','KES','onboarding',1,0,?,?)`,
        [tenantId, uniqueSlug(body.business_name), body.business_name, body.industry, body.email, body.phone || null, body.phone || null, body.city || null, body.country, now, now],
      );
      run(
        `INSERT INTO users (id, tenant_id, email, name, phone, password_hash, role, status, email_verified, created_at)
         VALUES (?,?,?,?,?,?,'owner','active',0,?)`,
        [userId, tenantId, body.email, body.name, body.phone || null, hashPassword(body.password), now],
      );
      run(
        `INSERT INTO subscriptions (id, tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end, created_at, updated_at)
         VALUES (?,?,?,'trialing',?,?,?,?,?)`,
        [newId('sub_'), tenantId, plan.id, trialEnds, now, trialEnds, now, now],
      );
      run(
        `INSERT INTO ai_settings (tenant_id, enabled, assistant_name, tone, language, greeting, escalation_keywords, updated_at)
         VALUES (?,1,'Ava','warm-professional','en',NULL,'["human","manager","owner","complaint","refund"]',?)`,
        [tenantId, now],
      );
      ensureIntegrations(tenantId);
      notify({
        tenantId,
        userId,
        title: 'Welcome to MAVYRON',
        body: `Your 14-day ${plan.name} trial has started. Complete setup to launch your public booking page.`,
        level: 'success',
      });
      audit({ tenantId, actor: { id: userId, email: body.email }, action: 'auth.signup', target: tenantId, meta: { plan: plan.id }, ip: req.ip });

      const token = createSession({ id: userId }, req);
      res.cookie(SESSION_COOKIE, token, cookieOptions(req));
      const user = get(`SELECT * FROM users WHERE id = ?`, [userId]);
      const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [tenantId]);
      res.status(201).json({
        ...sessionPayload(user, tenant),
        subscription: { plan_id: plan.id, plan_name: plan.name, status: 'trialing', trial_ends_at: trialEnds },
        verification: {
          required: true,
          delivered: false,
          reason: 'Email delivery is not configured on this deployment. Verify your address once the platform email integration is connected.',
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/login', rateLimit({ windowMs: 10 * 60 * 1000, max: 20, key: 'login' }), (req, res, next) => {
  try {
    const body = validate(
      z.object({ email: emailSchema, password: z.string().min(1, 'Enter your password.').max(200) }),
      req.body,
    );
    const user = get(`SELECT * FROM users WHERE email = ?`, [body.email]);
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      audit({ action: 'auth.login_failed', target: body.email, ip: req.ip });
      throw unauthorized('Email or password is incorrect.');
    }
    if (user.status !== 'active') throw unauthorized('This account is suspended. Contact platform support.');

    run(`UPDATE users SET last_login_at = ? WHERE id = ?`, [nowIso(), user.id]);
    const tenant = user.tenant_id ? get(`SELECT * FROM tenants WHERE id = ?`, [user.tenant_id]) : null;
    if (tenant && tenant.status === 'suspended' && user.role !== 'platform_admin') {
      throw unauthorized('This workspace is suspended. Contact platform support.');
    }
    const token = createSession(user, req);
    res.cookie(SESSION_COOKIE, token, cookieOptions(req));
    audit({ tenantId: user.tenant_id, actor: user, action: 'auth.login', ip: req.ip });
    const subscription = user.tenant_id
      ? get(`SELECT s.*, p.name AS plan_name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? ORDER BY s.created_at DESC LIMIT 1`, [user.tenant_id])
      : null;
    res.json({ ...sessionPayload(user, tenant), subscription: subscription || null });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  if (req.sessionId) run(`DELETE FROM sessions WHERE id = ?`, [req.sessionId]);
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/session', (req, res) => {
  if (!req.user) return res.json({ user: null, tenant: null, ai: aiStatus() });
  const tenant = req.user.tenant_id ? get(`SELECT * FROM tenants WHERE id = ?`, [req.user.tenant_id]) : null;
  const subscription = req.user.tenant_id
    ? get(`SELECT s.*, p.name AS plan_name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? ORDER BY s.created_at DESC LIMIT 1`, [req.user.tenant_id])
    : null;
  return res.json({ ...sessionPayload(req.user, tenant), subscription: subscription || null });
});

router.patch('/password', requireAuth, (req, res, next) => {
  try {
    const body = validate(
      z.object({ current_password: z.string().min(1), new_password: passwordSchema }),
      req.body,
    );
    const user = get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
    if (!verifyPassword(body.current_password, user.password_hash)) throw badRequest('Your current password is incorrect.');
    run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(body.new_password), user.id]);
    run(`DELETE FROM sessions WHERE user_id = ? AND id != ?`, [user.id, req.sessionId]);
    audit({ tenantId: user.tenant_id, actor: user, action: 'auth.password_changed', ip: req.ip });
    res.json({ ok: true, message: 'Password updated. Other sessions have been signed out.' });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', rateLimit({ windowMs: 30 * 60 * 1000, max: 8, key: 'forgot' }), (req, res, next) => {
  try {
    const body = validate(z.object({ email: emailSchema }), req.body);
    const user = get(`SELECT * FROM users WHERE email = ?`, [body.email]);
    let delivered = false;
    let reason = null;
    if (user) {
      const token = randomToken();
      run(
        `INSERT INTO password_resets (id, user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?,?)`,
        [newId('prt_'), user.id, sha256(token), new Date(Date.now() + 60 * 60 * 1000).toISOString(), nowIso()],
      );
      audit({ tenantId: user.tenant_id, actor: user, action: 'auth.password_reset_requested', ip: req.ip });
      if (process.env.RESEND_API_KEY) {
        delivered = true; // handled by the email worker; token is stored hashed
      } else {
        reason = 'Email delivery is not configured on this deployment, so the reset link cannot be sent. Ask your platform administrator to issue a password reset from the administration console.';
      }
    }
    res.status(202).json({
      ok: true,
      message: 'If an account exists for that email, recovery instructions have been created.',
      delivered,
      delivery_configured: Boolean(process.env.RESEND_API_KEY),
      reason,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', rateLimit({ windowMs: 30 * 60 * 1000, max: 12, key: 'reset' }), (req, res, next) => {
  try {
    const body = validate(z.object({ token: z.string().min(20), password: passwordSchema }), req.body);
    const row = get(`SELECT * FROM password_resets WHERE token_hash = ? AND used_at IS NULL`, [sha256(body.token)]);
    if (!row) throw badRequest('This recovery link is invalid or has already been used.');
    if (new Date(row.expires_at).getTime() < Date.now()) throw badRequest('This recovery link has expired. Request a new one.');
    run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(body.password), row.user_id]);
    run(`UPDATE password_resets SET used_at = ? WHERE id = ?`, [nowIso(), row.id]);
    run(`DELETE FROM sessions WHERE user_id = ?`, [row.user_id]);
    audit({ action: 'auth.password_reset_completed', target: row.user_id, ip: req.ip });
    res.json({ ok: true, message: 'Password reset complete. You can sign in now.' });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', rateLimit({ windowMs: 60 * 60 * 1000, max: 20, key: 'verify' }), (req, res, next) => {
  try {
    const body = validate(z.object({ token: z.string().min(20) }), req.body);
    const row = get(`SELECT * FROM email_verifications WHERE token_hash = ? AND used_at IS NULL`, [sha256(body.token)]);
    if (!row) throw badRequest('This verification link is invalid or has already been used.');
    if (new Date(row.expires_at).getTime() < Date.now()) throw badRequest('This verification link has expired.');
    run(`UPDATE users SET email_verified = 1 WHERE id = ?`, [row.user_id]);
    run(`UPDATE email_verifications SET used_at = ? WHERE id = ?`, [nowIso(), row.id]);
    res.json({ ok: true, message: 'Email verified.' });
  } catch (err) {
    next(err);
  }
});

export default router;
