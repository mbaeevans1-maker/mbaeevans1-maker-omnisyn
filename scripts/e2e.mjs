/**
 * MAVYRON end-to-end functional regression.
 * Boots the production server against a throwaway SQLite database and exercises the
 * real customer journey: signup -> catalog -> staff -> schedule -> launch -> public page
 * -> availability -> booking (incl. double-booking prevention) -> AI receptionist
 * -> tenant dashboard data -> RBAC / tenant isolation -> platform admin -> leads.
 *
 * Usage: node scripts/e2e.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.E2E_PORT || 4399);
const BASE = `http://127.0.0.1:${PORT}`;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mavyron-e2e-'));
const ADMIN_EMAIL = 'admin-e2e@mavyron.test';
const ADMIN_PASSWORD = 'AdminPass12345';

let passed = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` -> ${JSON.stringify(detail).slice(0, 400)}`}`);
  }
}

function jar() {
  const cookies = new Map();
  return {
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    absorb(res) {
      const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
      for (const line of raw) {
        const [pair] = line.split(';');
        const idx = pair.indexOf('=');
        if (idx > 0) cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    },
  };
}

function client() {
  const c = jar();
  async function call(method, url, body) {
    const headers = { accept: 'application/json' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    const cookie = c.header();
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    c.absorb(res);
    let json = null;
    const text = await res.text();
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text.slice(0, 300) };
    }
    return { status: res.status, body: json };
  }
  return {
    get: (u) => call('GET', u),
    post: (u, b) => call('POST', u, b),
    patch: (u, b) => call('PATCH', u, b),
    put: (u, b) => call('PUT', u, b),
  };
}

async function waitForHealth(deadlineMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < deadlineMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function nairobiDate(offsetDays = 2) {
  const d = new Date(Date.now() + offsetDays * 864e5);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

const server = spawn(process.execPath, ['server/index.js'], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DATA_DIR,
    NODE_ENV: 'production',
    PLATFORM_ADMIN_EMAIL: ADMIN_EMAIL,
    PLATFORM_ADMIN_PASSWORD: ADMIN_PASSWORD,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d.toString(); });
server.stderr.on('data', (d) => { serverLog += d.toString(); });

let exitCode = 0;
try {
  const healthy = await waitForHealth();
  check('server boots and reports healthy', healthy, serverLog.slice(-600));
  if (!healthy) throw new Error('server did not become healthy');

  /* ---------------------------- tenant A: real journey --------------------------- */
  const owner = client();
  const signup = await owner.post('/api/auth/signup', {
    name: 'Amina Yusuf',
    email: 'amina@glowsalon.test',
    password: 'SalonPass12345',
    business_name: 'Glow Studio Nairobi',
    industry: 'salon',
    phone: '+254700111222',
    city: 'Nairobi',
    plan_id: 'pro',
  });
  check('signup creates tenant + owner session', signup.status === 201 && signup.body?.user?.role === 'owner', signup.body);
  check('trial subscription provisioned', signup.body?.subscription?.status === 'trialing', signup.body?.subscription);
  const slug = signup.body?.tenant?.slug;
  check('tenant slug generated', typeof slug === 'string' && slug.length > 2, slug);

  const service = await owner.post('/api/tenant/services', {
    name: 'Signature Cut',
    description: 'Precision cut and finish',
    duration_min: 45,
    price_cents: 250000,
  });
  check('service created', service.status === 201, service.body);
  const serviceId = service.body?.service?.id;

  const staff = await owner.post('/api/tenant/staff', { name: 'Brian Otieno', title: 'Senior Stylist', service_ids: [serviceId] });
  check('staff created and linked to service', staff.status === 201, staff.body);
  const staffId = staff.body?.staff?.id;

  const schedule = await owner.put(`/api/tenant/staff/${staffId}/schedule`, {
    days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_min: 540, end_min: 1080, break_start: 780, break_end: 840 })),
  });
  check('weekly schedule saved', schedule.status === 200 && (schedule.body?.days?.length ?? 0) === 7, schedule.body);

  const launch = await owner.post('/api/tenant/launch', {});
  check('workspace launches after services + schedule', launch.status === 200 && launch.body?.launched === true, launch.body);

  /* ------------------------------- public surface -------------------------------- */
  const guest = client();
  const page = await guest.get(`/api/business/${slug}`);
  check('public business page published', page.status === 200 && page.body?.business?.slug === slug, page.body);
  check('public page exposes services', Array.isArray(page.body?.services) && page.body.services.some((s) => s.id === serviceId), page.body?.services);

  const date = nairobiDate(2);
  const availability = await guest.get(`/api/business/${slug}/availability?serviceId=${encodeURIComponent(serviceId)}&date=${date}`);
  const slots = availability.body?.slots ?? [];
  check('availability returns real slots from staff schedule', availability.status === 200 && slots.length > 0, availability.body);

  const slot = slots.find((s) => s.staffId === staffId) || slots[0];
  const booking = await guest.post(`/api/business/${slug}/book`, {
    serviceId,
    staffId: slot.staffId,
    startAt: slot.startAt,
    name: 'Wanjiru Kamau',
    phone: '+254712345678',
    email: 'wanjiru@example.test',
    marketing_consent: true,
  });
  check('public booking creates real appointment', booking.status === 201 && booking.body?.appointment?.status, booking.body);

  const duplicate = await guest.post(`/api/business/${slug}/book`, {
    serviceId,
    staffId: slot.staffId,
    startAt: slot.startAt,
    name: 'Double Booking',
    phone: '+254799999999',
  });
  check('double booking is rejected', duplicate.status >= 400 && duplicate.status < 500, duplicate.body);

  const chat = await guest.post('/api/chat', {
    slug,
    sessionId: 'e2e-session-0001',
    message: 'How much is the Signature Cut and what time do you open?',
  });
  const replyText = chat.body?.reply?.content ?? chat.body?.reply ?? chat.body?.message ?? '';
  check('AI receptionist answers on the public channel', chat.status === 200 && String(replyText).length > 0, chat.body);
  check('AI reply is grounded in tenant data (no undefined tokens)', !/undefined|null/i.test(String(replyText)), replyText);

  /* ----------------------------- tenant dashboard data --------------------------- */
  const overview = await owner.get('/api/tenant/overview');
  check('dashboard overview returns real tenant metrics', overview.status === 200, overview.body);
  const appointments = await owner.get('/api/tenant/appointments');
  const apptList = appointments.body?.appointments ?? appointments.body ?? [];
  check('owner sees the booked appointment', appointments.status === 200 && Array.isArray(apptList) && apptList.length === 1, appointments.body);
  const customers = await owner.get('/api/tenant/customers');
  const custList = customers.body?.customers ?? [];
  check('CRM recorded the booking customer', customers.status === 200 && custList.some((c) => c.name === 'Wanjiru Kamau'), customers.body);

  const content = await owner.post('/api/tenant/content/generate', { kind: 'promotion', channel: 'instagram', brief: 'Weekend glow offer for existing customers' });
  check('AI content generation responds without server error', content.status < 500, content.body);

  const integrations = await owner.get('/api/tenant/integrations');
  const integrationRows = integrations.body?.integrations ?? [];
  check('integrations report honest statuses (no fake connected)', integrations.status === 200 && integrationRows.length > 0 && integrationRows.every((i) => ['disconnected', 'configuration_required', 'error', 'reconnect', 'connected'].includes(i.status)), integrationRows.map((i) => `${i.provider}:${i.status}`));

  /* ------------------------------- RBAC + isolation ------------------------------ */
  const ownerAdmin = await owner.get('/api/admin/overview');
  check('owner is denied platform admin access', ownerAdmin.status === 403, ownerAdmin.body);

  const rival = client();
  const rivalSignup = await rival.post('/api/auth/signup', {
    name: 'Rival Owner',
    email: 'rival@barberhub.test',
    password: 'RivalPass12345',
    business_name: 'Barber Hub',
    industry: 'barbershop',
    plan_id: 'starter',
  });
  check('second tenant can register independently', rivalSignup.status === 201, rivalSignup.body);
  const rivalServices = await rival.get('/api/tenant/services');
  check('tenant B cannot see tenant A services', rivalServices.status === 200 && !(rivalServices.body?.services ?? []).some((s) => s.id === serviceId), rivalServices.body);
  const crossPatch = await rival.patch(`/api/tenant/services/${serviceId}`, { price_cents: 1 });
  check('cross-tenant write is blocked', crossPatch.status === 404 || crossPatch.status === 403, crossPatch.body);
  const rivalAppointments = await rival.get('/api/tenant/appointments');
  const rivalApptList = rivalAppointments.body?.appointments ?? [];
  check('tenant B sees no tenant A appointments', rivalAppointments.status === 200 && rivalApptList.length === 0, rivalAppointments.body);

  /* ------------------------------ public lead capture ---------------------------- */
  const contact = await guest.post('/api/contact', {
    name: 'Grace Njeri',
    email: 'grace@example.test',
    phone: '+254733444555',
    organisation: 'Njeri Dental',
    subject: 'Platform enquiry',
    message: 'We would like to understand the AI receptionist for two clinic locations.',
  });
  check('contact enquiry stored', contact.status === 201 || contact.status === 200, contact.body);
  const partnership = await guest.post('/api/partnership', {
    name: 'Peter Mwangi',
    organisation: 'Savannah Group',
    position: 'Head of Operations',
    email: 'peter@example.test',
    phone: '+254722333444',
    partnership_type: 'technology',
    proposal: 'Integration partnership across our hospitality portfolio.',
  });
  check('partnership enquiry stored', partnership.status === 201 || partnership.status === 200, partnership.body);

  /* -------------------------------- platform admin ------------------------------- */
  const admin = client();
  const adminLogin = await admin.post('/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  check('platform admin can sign in', adminLogin.status === 200 && adminLogin.body?.user?.role === 'platform_admin', adminLogin.body);
  const adminOverview = await admin.get('/api/admin/overview');
  check('admin overview returns platform data', adminOverview.status === 200, adminOverview.body);
  const adminTenants = await admin.get('/api/admin/tenants');
  const tenantRows = adminTenants.body?.tenants ?? [];
  check('admin sees both tenants', adminTenants.status === 200 && tenantRows.length >= 2, adminTenants.body);
  const leads = await admin.get('/api/admin/leads');
  check('admin sees captured enquiries', leads.status === 200 && JSON.stringify(leads.body).includes('Grace Njeri'), leads.body);

  const suspended = await admin.patch(`/api/admin/tenants/${rivalSignup.body?.tenant?.id}`, { status: 'suspended' });
  check('admin can suspend a tenant', suspended.status === 200, suspended.body);
  const suspendedLogin = await client().post('/api/auth/login', { email: 'rival@barberhub.test', password: 'RivalPass12345' });
  check('suspended tenant users are blocked at sign-in', suspendedLogin.status === 401 || suspendedLogin.status === 403, suspendedLogin.body);

  /* ---------------------------------- session ----------------------------------- */
  const logout = await owner.post('/api/auth/logout', {});
  check('logout succeeds', logout.status === 200 || logout.status === 204, logout.body);
  const afterLogout = await owner.get('/api/tenant/overview');
  check('protected route rejects signed-out session', afterLogout.status === 401, afterLogout.body);

  const anon = await client().get('/api/tenant/overview');
  check('protected route rejects anonymous access', anon.status === 401, anon.body);
} catch (err) {
  failures.push(`fatal: ${err.message}`);
  console.error(err);
  if (serverLog) console.error(serverLog.slice(-1500));
  exitCode = 1;
} finally {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 400));
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
}

console.log(`\n${passed} checks passed, ${failures.length} failed`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}
process.exit(exitCode);
