import { get, run } from './db.js';
import { sha256, unauthorized, forbidden, nowIso } from './lib/util.js';

export const SESSION_COOKIE = 'mavyron_session';
export const SESSION_TTL_DAYS = 14;

export const ROLES = ['owner', 'manager', 'receptionist', 'staff'];
export const ROLE_LABELS = {
  owner: 'Owner',
  manager: 'Manager',
  receptionist: 'Receptionist',
  staff: 'Staff',
  platform_admin: 'Platform Admin',
};

/** Capability matrix — enforced server-side on every tenant route. */
export const PERMISSIONS = {
  owner: [
    'dashboard:read', 'bookings:read', 'bookings:write', 'customers:read', 'customers:write',
    'services:read', 'services:write', 'staff:read', 'staff:write', 'ai:read', 'ai:write',
    'marketing:read', 'marketing:write', 'analytics:read', 'integrations:read', 'integrations:write',
    'billing:read', 'billing:write', 'settings:read', 'settings:write', 'team:read', 'team:write',
    'privacy:export', 'privacy:delete',
  ],
  manager: [
    'dashboard:read', 'bookings:read', 'bookings:write', 'customers:read', 'customers:write',
    'services:read', 'services:write', 'staff:read', 'staff:write', 'ai:read', 'ai:write',
    'marketing:read', 'marketing:write', 'analytics:read', 'integrations:read', 'integrations:write',
    'billing:read', 'settings:read', 'team:read', 'privacy:export',
  ],
  receptionist: [
    'dashboard:read', 'bookings:read', 'bookings:write', 'customers:read', 'customers:write',
    'services:read', 'staff:read', 'ai:read', 'ai:write', 'marketing:read', 'settings:read',
  ],
  staff: ['dashboard:read', 'bookings:read', 'customers:read', 'services:read', 'staff:read'],
  platform_admin: ['platform:admin'],
};

export function permissionsFor(role) {
  return PERMISSIONS[role] || [];
}

export function attachUser(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  req.user = null;
  if (!token) return next();
  const session = get(
    `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.name, u.role, u.tenant_id, u.status, u.email_verified, u.phone
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    [sha256(token)],
  );
  if (!session) return next();
  if (new Date(session.expires_at).getTime() < Date.now()) {
    run(`DELETE FROM sessions WHERE id = ?`, [session.session_id]);
    return next();
  }
  if (session.status !== 'active') return next();
  req.user = session;
  req.tenantId = session.tenant_id || null;
  req.sessionId = session.session_id;
  return next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  return next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    return next();
  };
}

export function requirePermission(permission) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    const granted = permissionsFor(req.user.role);
    if (!granted.includes(permission)) return next(forbidden(`Your role (${ROLE_LABELS[req.user.role] || req.user.role}) cannot perform this action.`));
    return next();
  };
}

export function requireTenant(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role === 'platform_admin') return next(forbidden('Platform administrators use the administration console.'));
  if (!req.user.tenant_id) return next(forbidden('No workspace is attached to this account.'));
  req.tenantId = req.user.tenant_id;
  return next();
}

export function requirePlatformAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== 'platform_admin') return next(forbidden('Platform administration only.'));
  return next();
}

/** Basic CSRF defence: same-origin check + JSON-only mutations. */
export function originGuard(req, res, next) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try { host = new URL(origin).host; } catch { host = ''; }
    if (host && host !== req.get('host')) {
      return res.status(403).json({ error: { message: 'Cross-origin request blocked.', code: 'csrf' } });
    }
  }
  if (req.path.startsWith('/api/webhooks')) return next();
  const type = req.get('content-type') || '';
  if (req.method !== 'DELETE' && req.body !== undefined && !type.includes('application/json') && !type.includes('multipart/form-data')) {
    return res.status(415).json({ error: { message: 'Expected application/json.', code: 'unsupported_media_type' } });
  }
  return next();
}

export function createSession(user, req) {
  const token = (await_import_randomToken());
  run(
    `INSERT INTO sessions (id, user_id, token_hash, ip, user_agent, expires_at, created_at) VALUES (?,?,?,?,?,?,?)`,
    [
      `ses_${token.slice(0, 16)}`,
      user.id,
      sha256(token),
      req.ip || null,
      (req.get('user-agent') || '').slice(0, 240),
      new Date(Date.now() + SESSION_TTL_DAYS * 864e5).toISOString(),
      nowIso(),
    ],
  );
  return token;
}

function await_import_randomToken() {
  // local alias keeps imports tidy
  // eslint-disable-next-line
  return randomTokenImpl();
}

import { randomToken as randomTokenImpl } from './lib/util.js';
