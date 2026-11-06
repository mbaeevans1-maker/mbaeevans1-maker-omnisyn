import crypto from 'node:crypto';

export const APP_SECRET = process.env.APP_SECRET || 'mavyron-dev-secret-change-in-production';

export const nowIso = () => new Date().toISOString();
export const newId = (prefix = '') => `${prefix}${crypto.randomBytes(10).toString('hex')}`;
export const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/* ------------------------------------------------------------------ *
 * Passwords — scrypt with per-password salt, constant-time comparison
 * ------------------------------------------------------------------ */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$${salt.toString('base64')}$${key.toString('base64')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, , saltB64, keyB64] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Secrets — AES-256-GCM at rest (integration credentials)
 * ------------------------------------------------------------------ */
function secretKey() {
  return crypto.createHash('sha256').update(`${APP_SECRET}:tenant-secrets`).digest();
}

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${enc.toString('base64')}`;
}

export function decryptSecret(payload) {
  try {
    const [version, ivB64, tagB64, dataB64] = String(payload).split('.');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export function maskSecret(value) {
  const v = String(value || '');
  if (!v) return '';
  if (v.length <= 6) return '••••';
  return `${v.slice(0, 3)}••••${v.slice(-2)}`;
}

/* ------------------------------------------------------------------ *
 * Errors + validation
 * ------------------------------------------------------------------ */
export class HttpError extends Error {
  constructor(status, message, code = 'error', details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (m, d) => new HttpError(400, m, 'bad_request', d);
export const unauthorized = (m = 'Authentication required') => new HttpError(401, m, 'unauthorized');
export const forbidden = (m = 'You do not have access to this resource') => new HttpError(403, m, 'forbidden');
export const notFound = (m = 'Resource not found') => new HttpError(404, m, 'not_found');
export const conflict = (m, d) => new HttpError(409, m, 'conflict', d);
export const tooMany = (m = 'Too many requests. Please slow down.') => new HttpError(429, m, 'rate_limited');
export const notConfigured = (m, d) => new HttpError(422, m, 'configuration_required', d);

export function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fieldErrors = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    throw new HttpError(422, 'Please check the highlighted fields.', 'validation_error', fieldErrors);
  }
  return result.data;
}

/* ------------------------------------------------------------------ *
 * Rate limiting (in-process sliding window; per key)
 * ------------------------------------------------------------------ */
const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 60, key = 'global' } = {}) {
  return (req, res, next) => {
    const scope = `${key}:${req.ip || 'unknown'}`;
    const now = Date.now();
    let bucket = buckets.get(scope);
    if (!bucket || now - bucket.start > windowMs) {
      bucket = { start: now, count: 0 };
      buckets.set(scope, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.start + windowMs - now) / 1000));
      return next(tooMany());
    }
    if (buckets.size > 5000) buckets.clear();
    return next();
  };
}

/* ------------------------------------------------------------------ *
 * Timezone-correct date helpers (no external deps)
 * ------------------------------------------------------------------ */
export function tzOffsetMinutes(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000;
}

/** Local wall-clock (in `timeZone`) -> real UTC Date. */
export function localToUtc(timeZone, year, month, day, minutesOfDay = 0) {
  const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay, 0, 0);
  let offset = tzOffsetMinutes(timeZone, new Date(guess));
  let utc = guess - offset * 60000;
  offset = tzOffsetMinutes(timeZone, new Date(utc));
  utc = guess - offset * 60000;
  return new Date(utc);
}

export function localParts(timeZone, date) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
  });
  const parts = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    weekday: weekdayMap[parts.weekday] ?? 0,
    minutesOfDay: (Number(parts.hour) % 24) * 60 + Number(parts.minute),
  };
}

export function addDaysToIsoDate(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function formatMinutes(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48);
}

export function money(cents, currency = 'KES') {
  const amount = (Number(cents) || 0) / 100;
  try {
    return new Intl.NumberFormat('en-KE', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

export function csvSafe(value) {
  const v = String(value ?? '');
  return /^[=+\-@]/.test(v) ? `'${v}` : v;
}
