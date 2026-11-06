import { Router } from 'express';
import { z } from 'zod';
import { all, get, run, tx, audit, notify } from '../db.js';
import {
  validate, newId, nowIso, badRequest, notFound, conflict, forbidden,
  addDaysToIsoDate, localParts, formatMinutes, hashPassword, randomToken, slugify,
} from '../lib/util.js';
import { requireAuth, requireTenant, requirePermission, ROLES, ROLE_LABELS, permissionsFor } from '../middleware.js';
import {
  availabilityForDate, upcomingDaysWithAvailability, createAppointment, serviceById,
  bookingRules, todayRange,
} from '../lib/booking.js';
import { getAiSettings, respondToMessage, recordMessage, generateContent, aiStatus } from '../lib/ai.js';
import {
  listIntegrations, integrationView, saveCredentials, verifyIntegration,
  disconnectIntegration, sendWhatsAppMessage, publishToChannel, platformConfigStatus, PROVIDERS,
} from '../lib/integrations.js';
import { billingSummary, planById, initializeCheckout, usageFor, TRIAL_DAYS } from '../lib/billing.js';

import {
  listAutomations, listOutbox, markOutboxSent, fireEvent, enqueueMessage,
  runDueAutomations, renderTemplate, whatsappLink,
} from '../lib/automations.js';
import { insights } from '../lib/insights.js';
import { paymentInstructions, listPaymentRequests, createPaymentRequest } from '../lib/payments.js';

const router = Router();

const absoluteBase = (req) =>
  process.env.PUBLIC_BASE_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
const guard = [requireAuth, requireTenant];
const can = (perm) => requirePermission(perm);

/* ----------------------------- helpers ----------------------------- */

function tenantOf(req) {
  const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [req.tenantId]);
  if (!tenant) throw notFound('Workspace not found.');
  return tenant;
}

function safeJson(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function tenantView(t) {
  return {
    ...t,
    gallery: safeJson(t.gallery, []),
    social_links: safeJson(t.social_links, {}),
    booking_rules: bookingRules(t),
    public_path: `/business/${t.slug}`,
  };
}

function localDateOf(tenant, iso) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tenant.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(iso));
}

const APPT_SELECT = `
  SELECT a.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email,
         s.name AS service_name, s.duration_min AS service_duration,
         st.name AS staff_name, st.color AS staff_color
  FROM appointments a
  LEFT JOIN customers c ON c.id = a.customer_id
  LEFT JOIN services s ON s.id = a.service_id
  LEFT JOIN staff st ON st.id = a.staff_id`;

function apptById(tenantId, id) {
  return get(`${APPT_SELECT} WHERE a.id = ? AND a.tenant_id = ?`, [id, tenantId]);
}

function requireAppt(tenantId, id) {
  const appt = apptById(tenantId, id);
  if (!appt) throw notFound('Appointment not found.');
  return appt;
}

function applyCompletion(tenantId, appt) {
  if (!appt.customer_id) return;
  run(
    `UPDATE customers SET visits = visits + 1, total_spent_cents = total_spent_cents + ?,
       last_visit_at = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [appt.price_cents || 0, appt.start_at, nowIso(), appt.customer_id, tenantId],
  );
}

function reverseCompletion(tenantId, appt) {
  if (!appt.customer_id) return;
  run(
    `UPDATE customers SET visits = MAX(visits - 1, 0),
       total_spent_cents = MAX(total_spent_cents - ?, 0), updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
    [appt.price_cents || 0, nowIso(), appt.customer_id, tenantId],
  );
}

function monthStartIso() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

function daysAgoIso(days) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/* ----------------------------- overview ----------------------------- */

router.get('/overview', guard, can('dashboard:read'), (req, res) => {
  const tenant = tenantOf(req);
  const { start, end } = todayRange(tenant);
  const now = nowIso();
  const monthStart = monthStartIso();
  const ago30 = daysAgoIso(30);

  const today = all(`${APPT_SELECT} WHERE a.tenant_id = ? AND a.start_at >= ? AND a.start_at < ? ORDER BY a.start_at`, [tenant.id, start, end]);
  const upcoming = all(
    `${APPT_SELECT} WHERE a.tenant_id = ? AND a.start_at >= ? AND a.status IN ('pending','confirmed')
     ORDER BY a.start_at LIMIT 8`,
    [tenant.id, now],
  );

  const metric = (sql, params) => get(sql, params)?.n ?? 0;

  const revenue30 = metric(
    `SELECT COALESCE(SUM(price_cents),0) AS n FROM appointments
     WHERE tenant_id = ? AND status = 'completed' AND start_at >= ?`,
    [tenant.id, ago30],
  );
  const bookings30 = metric(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND created_at >= ?`, [tenant.id, ago30]);
  const completed30 = metric(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND status='completed' AND start_at >= ?`, [tenant.id, ago30]);
  const cancelled30 = metric(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND status='cancelled' AND start_at >= ?`, [tenant.id, ago30]);
  const noShow30 = metric(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND status='no_show' AND start_at >= ?`, [tenant.id, ago30]);
  const aiBookings30 = metric(
    `SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND created_at >= ? AND source IN ('website','whatsapp','voice')`,
    [tenant.id, ago30],
  );
  const customersTotal = metric(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?`, [tenant.id]);
  const customersNew30 = metric(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND created_at >= ?`, [tenant.id, ago30]);
  const conversationsOpen = metric(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND status = 'open'`, [tenant.id]);
  const needsHuman = metric(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND status = 'needs_human'`, [tenant.id]);
  const aiConversations30 = metric(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND created_at >= ?`, [tenant.id, ago30]);
  const contentPending = metric(`SELECT COUNT(*) AS n FROM content_items WHERE tenant_id = ? AND status IN ('draft','approved','scheduled')`, [tenant.id]);

  const topServices = all(
    `SELECT s.name, COUNT(a.id) AS bookings, COALESCE(SUM(a.price_cents),0) AS revenue_cents
     FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.tenant_id = ? AND a.start_at >= ? AND a.status IN ('confirmed','completed')
     GROUP BY s.id ORDER BY bookings DESC LIMIT 5`,
    [tenant.id, ago30],
  );

  const staffToday = all(
    `SELECT st.id, st.name, st.color,
       (SELECT COUNT(*) FROM appointments a WHERE a.staff_id = st.id AND a.start_at >= ? AND a.start_at < ? AND a.status IN ('pending','confirmed','completed')) AS bookings_today
     FROM staff st WHERE st.tenant_id = ? AND st.active = 1 ORDER BY st.name`,
    [start, end, tenant.id],
  );

  const integrations = listIntegrations(tenant.id);
  const connected = integrations.filter((i) => i.status === 'connected');
  const billing = billingSummary(tenant.id);

  const serviceCount = metric(`SELECT COUNT(*) AS n FROM services WHERE tenant_id = ? AND active = 1`, [tenant.id]);
  const staffWithSchedule = metric(
    `SELECT COUNT(DISTINCT s.id) AS n FROM staff s JOIN schedules sc ON sc.staff_id = s.id WHERE s.tenant_id = ? AND s.active = 1`,
    [tenant.id],
  );
  const knowledgeCount = metric(`SELECT COUNT(*) AS n FROM knowledge_entries WHERE tenant_id = ? AND active = 1`, [tenant.id]);

  const setup = [
    { key: 'profile', label: 'Business profile', done: Boolean(tenant.name && tenant.phone) },
    { key: 'services', label: 'Services and prices', done: serviceCount > 0 },
    { key: 'staff', label: 'Team and schedules', done: staffWithSchedule > 0 },
    { key: 'knowledge', label: 'AI knowledge base', done: knowledgeCount > 0 },
    { key: 'public', label: 'Public booking page', done: tenant.status === 'active' },
  ];

  res.json({
    tenant: tenantView(tenant),
    today: { date: start, appointments: today, count: today.length },
    upcoming,
    metrics: {
      revenue_30d_cents: revenue30,
      bookings_30d: bookings30,
      completed_30d: completed30,
      cancelled_30d: cancelled30,
      no_show_30d: noShow30,
      online_bookings_30d: aiBookings30,
      customers_total: customersTotal,
      customers_new_30d: customersNew30,
      conversations_open: conversationsOpen,
      conversations_needs_human: needsHuman,
      ai_conversations_30d: aiConversations30,
      content_pending: contentPending,
      integrations_connected: connected.length,
      integrations_total: integrations.length,
    },
    top_services: topServices,
    staff_today: staffToday,
    setup,
    setup_complete: setup.every((s) => s.done),
    ai: aiStatus(),
    billing: { subscription: billing.subscription, limits: billing.limits },
    has_data: bookings30 + customersTotal + aiConversations30 > 0,
  });
});

router.get('/analytics', guard, can('analytics:read'), (req, res) => {
  const tenant = tenantOf(req);
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
  const since = daysAgoIso(days);

  const byDay = all(
    `SELECT substr(start_at, 1, 10) AS day, COUNT(*) AS bookings,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN price_cents ELSE 0 END),0) AS revenue_cents
     FROM appointments WHERE tenant_id = ? AND start_at >= ?
     GROUP BY day ORDER BY day`,
    [tenant.id, since],
  );
  const bySource = all(
    `SELECT source, COUNT(*) AS bookings FROM appointments WHERE tenant_id = ? AND start_at >= ? GROUP BY source`,
    [tenant.id, since],
  );
  const byStatus = all(
    `SELECT status, COUNT(*) AS bookings FROM appointments WHERE tenant_id = ? AND start_at >= ? GROUP BY status`,
    [tenant.id, since],
  );
  const topServices = all(
    `SELECT s.name, COUNT(a.id) AS bookings, COALESCE(SUM(a.price_cents),0) AS revenue_cents
     FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.tenant_id = ? AND a.start_at >= ?
     GROUP BY s.id ORDER BY bookings DESC LIMIT 8`,
    [tenant.id, since],
  );
  const staffPerformance = all(
    `SELECT st.name, st.color, COUNT(a.id) AS bookings,
            COALESCE(SUM(CASE WHEN a.status='completed' THEN a.price_cents ELSE 0 END),0) AS revenue_cents
     FROM staff st LEFT JOIN appointments a ON a.staff_id = st.id AND a.start_at >= ?
     WHERE st.tenant_id = ? AND st.active = 1 GROUP BY st.id ORDER BY bookings DESC`,
    [since, tenant.id],
  );
  const channels = all(
    `SELECT channel, COUNT(*) AS conversations FROM conversations WHERE tenant_id = ? AND created_at >= ? GROUP BY channel`,
    [tenant.id, since],
  );
  const handoffs = get(
    `SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND created_at >= ? AND status = 'needs_human'`,
    [tenant.id, since],
  )?.n ?? 0;
  const returning = get(
    `SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND visits >= 2`, [tenant.id],
  )?.n ?? 0;
  const totalCustomers = get(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?`, [tenant.id])?.n ?? 0;
  const inactive = get(
    `SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND (last_visit_at IS NULL OR last_visit_at < ?)`,
    [tenant.id, daysAgoIso(60)],
  )?.n ?? 0;
  const contentByStatus = all(
    `SELECT status, COUNT(*) AS n FROM content_items WHERE tenant_id = ? GROUP BY status`, [tenant.id],
  );

  res.json({
    range_days: days,
    by_day: byDay,
    by_source: bySource,
    by_status: byStatus,
    top_services: topServices,
    staff: staffPerformance,
    channels,
    ai: { handoffs, conversations: channels.reduce((sum, c) => sum + c.conversations, 0) },
    customers: { total: totalCustomers, returning, inactive, retention_rate: totalCustomers ? Math.round((returning / totalCustomers) * 100) : null },
    content_by_status: contentByStatus,
  });
});

/* ----------------------------- bookings ----------------------------- */

router.get('/appointments', guard, can('bookings:read'), (req, res) => {
  const tenant = tenantOf(req);
  const { from, to, status, staffId, q, limit } = req.query;
  const clauses = ['a.tenant_id = ?'];
  const params = [tenant.id];
  if (from) { clauses.push('a.start_at >= ?'); params.push(String(from)); }
  if (to) { clauses.push('a.start_at <= ?'); params.push(String(to)); }
  if (status && status !== 'all') { clauses.push('a.status = ?'); params.push(String(status)); }
  if (staffId) { clauses.push('a.staff_id = ?'); params.push(String(staffId)); }
  if (q) { clauses.push('(c.name LIKE ? OR c.phone LIKE ? OR s.name LIKE ?)'); const like = `%${q}%`; params.push(like, like, like); }
  const rows = all(
    `${APPT_SELECT} WHERE ${clauses.join(' AND ')} ORDER BY a.start_at DESC LIMIT ?`,
    [...params, Math.min(Number(limit) || 200, 500)],
  );
  res.json({ appointments: rows });
});

router.get('/availability', guard, can('bookings:read'), (req, res) => {
  const tenant = tenantOf(req);
  const service = serviceById(tenant.id, String(req.query.serviceId || ''));
  if (!service) throw notFound('Service not found.');
  const dateStr = String(req.query.date || localDateOf(tenant, nowIso()));
  const staffId = req.query.staffId ? String(req.query.staffId) : null;
  const day = availabilityForDate({ tenant, service, dateStr, staffId });
  const week = upcomingDaysWithAvailability({ tenant, service, staffId, days: 7, fromDate: dateStr });
  res.json({ service, date: dateStr, ...day, upcoming: week });
});

const apptCreateSchema = z.object({
  serviceId: z.string().min(1),
  staffId: z.string().min(1).optional().nullable(),
  startAt: z.string().min(10),
  name: z.string().min(2).max(120),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  source: z.enum(['dashboard', 'walk_in', 'phone', 'website', 'whatsapp', 'voice']).optional(),
  status: z.enum(['pending', 'confirmed']).optional(),
});

router.post('/appointments', guard, can('bookings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(apptCreateSchema, req.body);
  const result = createAppointment({
    tenant,
    serviceId: data.serviceId,
    staffId: data.staffId || null,
    startAt: data.startAt,
    customer: { name: data.name, phone: data.phone || null, email: data.email || null },
    notes: data.notes || null,
    source: data.source || 'dashboard',
    createdBy: req.user.id,
    actor: req.user,
    status: data.status || 'confirmed',
  });
  const appt = apptById(tenant.id, result.appointment.id);
  notify({
    tenantId: tenant.id,
    title: 'New appointment booked',
    body: `${appt.customer_name} — ${appt.service_name} on ${appt.start_at.slice(0, 16).replace('T', ' ')}`,
    level: 'success',
  });
  res.status(201).json({ appointment: appt });
});

const apptPatchSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'completed', 'cancelled', 'no_show']).optional(),
  notes: z.string().max(1000).optional().nullable(),
  startAt: z.string().min(10).optional(),
  staffId: z.string().min(1).optional().nullable(),
  serviceId: z.string().min(1).optional(),
});

router.patch('/appointments/:id', guard, can('bookings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const appt = requireAppt(tenant.id, req.params.id);
  const data = validate(apptPatchSchema, req.body);
  const now = nowIso();

  let startAt = appt.start_at;
  let endAt = appt.end_at;
  let staffId = appt.staff_id;
  let serviceId = appt.service_id;
  let priceCents = appt.price_cents;

  const moving = Boolean(data.startAt || data.staffId || data.serviceId);
  if (moving) {
    if (['completed', 'cancelled', 'no_show'].includes(appt.status) && !data.status) {
      throw conflict('A finished appointment cannot be rescheduled.');
    }
    const service = serviceById(tenant.id, data.serviceId || appt.service_id);
    if (!service) throw notFound('Service not found.');
    const targetStaff = data.staffId === undefined ? appt.staff_id : data.staffId;
    const targetStart = data.startAt || appt.start_at;
    const dateStr = localDateOf(tenant, targetStart);
    const day = availabilityForDate({
      tenant, service, dateStr, staffId: targetStaff || null, excludeAppointmentId: appt.id,
    });
    const slot = day.slots.find((s) => s.startAt === targetStart && (!targetStaff || s.staffId === targetStaff));
    if (!slot) throw conflict('That time is no longer available. Choose another slot.');
    startAt = slot.startAt;
    endAt = slot.endAt;
    staffId = slot.staffId;
    serviceId = service.id;
    priceCents = service.price_cents;
  }

  const nextStatus = data.status || appt.status;
  run(
    `UPDATE appointments SET start_at = ?, end_at = ?, staff_id = ?, service_id = ?, price_cents = ?,
       status = ?, notes = COALESCE(?, notes), updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [startAt, endAt, staffId, serviceId, priceCents, nextStatus, data.notes ?? null, now, appt.id, tenant.id],
  );

  if (nextStatus === 'completed' && appt.status !== 'completed') applyCompletion(tenant.id, { ...appt, price_cents: priceCents });
  if (appt.status === 'completed' && nextStatus !== 'completed') reverseCompletion(tenant.id, appt);

  audit({
    tenantId: tenant.id, actor: req.user, action: 'appointment.update',
    target: appt.id, meta: { status: nextStatus, moved: moving }, ip: req.ip,
  });

  if (data.status && data.status !== appt.status) {
    notify({
      tenantId: tenant.id,
      title: `Appointment ${data.status.replace('_', ' ')}`,
      body: `${appt.customer_name || 'Customer'} — ${appt.service_name || 'Service'}`,
      level: data.status === 'cancelled' ? 'warning' : 'info',
    });

    const event =
      data.status === 'cancelled' ? 'appointment.cancelled'
        : data.status === 'completed' ? 'appointment.completed'
          : data.status === 'no_show' ? 'appointment.no_show'
            : null;
    if (event) {
      void fireEvent({
        tenant, event, appointment: apptById(tenant.id, appt.id), actor: req.user,
      }).catch((err) => console.error('[mavyron] appointment automation failed', err?.message || err));
    }
  }

  if (moving && nextStatus !== 'cancelled') {
    void fireEvent({
      tenant, event: 'appointment.rescheduled', appointment: apptById(tenant.id, appt.id), actor: req.user,
    }).catch((err) => console.error('[mavyron] reschedule automation failed', err?.message || err));
  }

  res.json({ appointment: apptById(tenant.id, appt.id) });
});

router.post('/appointments/:id/remind', guard, can('bookings:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const appt = requireAppt(tenant.id, req.params.id);
  if (!appt.customer_phone) throw badRequest('This customer has no phone number on file.');
  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone: tenant.timezone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(appt.start_at));
  const body = `Reminder from ${tenant.name}: your ${appt.service_name} appointment is on ${when}. Reply here to reschedule or cancel.`;

  const result = await sendWhatsAppMessage(tenant.id, appt.customer_phone, body);
  audit({
    tenantId: tenant.id, actor: req.user, action: 'appointment.reminder',
    target: appt.id, meta: { channel: 'whatsapp', sent: result.sent }, ip: req.ip,
  });
  if (!result.sent) {
    res.status(422).json({
      error: result.reason || 'WhatsApp is not connected for this business.',
      code: 'configuration_required',
      sent: false,
    });
    return;
  }
  notify({ tenantId: tenant.id, title: 'Reminder sent', body: `${appt.customer_name} · ${appt.service_name}`, level: 'success' });
  res.json({ sent: true, provider_ref: result.ref || null });
});

/* ----------------------------- customers ----------------------------- */

function segmentClause(segment) {
  const ago30 = daysAgoIso(30);
  const ago60 = daysAgoIso(60);
  switch (segment) {
    case 'new': return { sql: 'AND c.created_at >= ?', params: [ago30] };
    case 'returning': return { sql: 'AND c.visits >= 2', params: [] };
    case 'vip': return { sql: 'AND (c.visits >= 5 OR c.total_spent_cents >= 2000000)', params: [] };
    case 'inactive': return { sql: 'AND (c.last_visit_at IS NULL OR c.last_visit_at < ?)', params: [ago60] };
    default: return { sql: '', params: [] };
  }
}

router.get('/customers', guard, can('customers:read'), (req, res) => {
  const tenant = tenantOf(req);
  const { q, segment, limit } = req.query;
  const seg = segmentClause(segment ? String(segment) : 'all');
  const params = [tenant.id, ...seg.params];
  let search = '';
  if (q) {
    search = 'AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like);
  }
  const customers = all(
    `SELECT c.*, (SELECT COUNT(*) FROM appointments a WHERE a.customer_id = c.id) AS appointment_count
     FROM customers c WHERE c.tenant_id = ? ${seg.sql} ${search}
     ORDER BY COALESCE(c.last_visit_at, c.created_at) DESC LIMIT ?`,
    [...params, Math.min(Number(limit) || 200, 500)],
  );
  const counts = {
    all: get(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?`, [tenant.id])?.n ?? 0,
    new: get(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND created_at >= ?`, [tenant.id, daysAgoIso(30)])?.n ?? 0,
    returning: get(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND visits >= 2`, [tenant.id])?.n ?? 0,
    vip: get(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND (visits >= 5 OR total_spent_cents >= 2000000)`, [tenant.id])?.n ?? 0,
    inactive: get(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ? AND (last_visit_at IS NULL OR last_visit_at < ?)`, [tenant.id, daysAgoIso(60)])?.n ?? 0,
  };
  res.json({ customers: customers.map((c) => ({ ...c, tags: safeJson(c.tags, []) })), counts });
});

router.get('/customers/:id', guard, can('customers:read'), (req, res) => {
  const tenant = tenantOf(req);
  const customer = get(`SELECT * FROM customers WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!customer) throw notFound('Customer not found.');
  const appointments = all(`${APPT_SELECT} WHERE a.customer_id = ? AND a.tenant_id = ? ORDER BY a.start_at DESC LIMIT 25`, [customer.id, tenant.id]);
  const conversations = all(
    `SELECT id, channel, status, last_message_at FROM conversations WHERE customer_id = ? AND tenant_id = ? ORDER BY last_message_at DESC LIMIT 10`,
    [customer.id, tenant.id],
  );
  res.json({ customer: { ...customer, tags: safeJson(customer.tags, []) }, appointments, conversations });
});

const customerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  preferences: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  marketing_consent: z.boolean().optional(),
});

router.post('/customers', guard, can('customers:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(customerSchema, req.body);
  if (data.phone) {
    const dup = get(`SELECT id FROM customers WHERE tenant_id = ? AND phone = ?`, [tenant.id, data.phone]);
    if (dup) throw conflict('A customer with this phone number already exists.');
  }
  const id = newId('cus_');
  const now = nowIso();
  run(
    `INSERT INTO customers (id, tenant_id, name, email, phone, notes, preferences, tags, marketing_consent, source, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, tenant.id, data.name, data.email || null, data.phone || null, data.notes || null,
      data.preferences || null, JSON.stringify(data.tags || []), data.marketing_consent ? 1 : 0, 'dashboard', now, now],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'customer.create', target: id, ip: req.ip });
  res.status(201).json({ customer: get(`SELECT * FROM customers WHERE id = ?`, [id]) });
});

router.patch('/customers/:id', guard, can('customers:write'), (req, res) => {
  const tenant = tenantOf(req);
  const customer = get(`SELECT * FROM customers WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!customer) throw notFound('Customer not found.');
  const data = validate(customerSchema.partial(), req.body);
  run(
    `UPDATE customers SET name = ?, email = ?, phone = ?, notes = ?, preferences = ?, tags = ?,
       marketing_consent = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [
      data.name ?? customer.name,
      data.email === undefined ? customer.email : data.email,
      data.phone === undefined ? customer.phone : data.phone,
      data.notes === undefined ? customer.notes : data.notes,
      data.preferences === undefined ? customer.preferences : data.preferences,
      data.tags ? JSON.stringify(data.tags) : customer.tags,
      data.marketing_consent === undefined ? customer.marketing_consent : data.marketing_consent ? 1 : 0,
      nowIso(), customer.id, tenant.id,
    ],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'customer.update', target: customer.id, ip: req.ip });
  res.json({ customer: get(`SELECT * FROM customers WHERE id = ?`, [customer.id]) });
});

router.delete('/customers/:id', guard, can('privacy:delete'), (req, res) => {
  const tenant = tenantOf(req);
  const customer = get(`SELECT * FROM customers WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!customer) throw notFound('Customer not found.');
  run(
    `UPDATE customers SET name = 'Redacted customer', email = NULL, phone = NULL, notes = NULL,
       preferences = NULL, tags = '[]', marketing_consent = 0, updated_at = ? WHERE id = ? AND tenant_id = ?`,
    [nowIso(), customer.id, tenant.id],
  );
  audit({
    tenantId: tenant.id, actor: req.user, action: 'customer.erase',
    target: customer.id, meta: { reason: 'privacy_request' }, ip: req.ip,
  });
  res.json({ erased: true });
});

/* ----------------------------- services ----------------------------- */

const serviceSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(600).optional().nullable(),
  category: z.string().max(60).optional().nullable(),
  duration_min: z.number().int().min(5).max(480),
  buffer_min: z.number().int().min(0).max(120).optional(),
  price_cents: z.number().int().min(0).max(100_000_000),
  active: z.boolean().optional(),
});

router.get('/services', guard, can('services:read'), (req, res) => {
  const tenant = tenantOf(req);
  const services = all(`SELECT * FROM services WHERE tenant_id = ? ORDER BY sort, name`, [tenant.id]);
  const links = all(
    `SELECT ss.service_id, ss.staff_id FROM staff_services ss JOIN staff st ON st.id = ss.staff_id WHERE st.tenant_id = ?`,
    [tenant.id],
  );
  res.json({
    services: services.map((s) => ({
      ...s,
      staff_ids: links.filter((l) => l.service_id === s.id).map((l) => l.staff_id),
    })),
  });
});

router.post('/services', guard, can('services:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(serviceSchema, req.body);
  const id = newId('svc_');
  const sort = get(`SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM services WHERE tenant_id = ?`, [tenant.id])?.n ?? 1;
  run(
    `INSERT INTO services (id, tenant_id, name, description, category, duration_min, buffer_min, price_cents, active, sort, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [id, tenant.id, data.name, data.description || null, data.category || null, data.duration_min,
      data.buffer_min ?? 0, data.price_cents, data.active === false ? 0 : 1, sort, nowIso()],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'service.create', target: id, ip: req.ip });
  res.status(201).json({ service: get(`SELECT * FROM services WHERE id = ?`, [id]) });
});

router.patch('/services/:id', guard, can('services:write'), (req, res) => {
  const tenant = tenantOf(req);
  const service = get(`SELECT * FROM services WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!service) throw notFound('Service not found.');
  const data = validate(serviceSchema.partial(), req.body);
  run(
    `UPDATE services SET name = ?, description = ?, category = ?, duration_min = ?, buffer_min = ?,
       price_cents = ?, active = ? WHERE id = ? AND tenant_id = ?`,
    [
      data.name ?? service.name,
      data.description === undefined ? service.description : data.description,
      data.category === undefined ? service.category : data.category,
      data.duration_min ?? service.duration_min,
      data.buffer_min ?? service.buffer_min,
      data.price_cents ?? service.price_cents,
      data.active === undefined ? service.active : data.active ? 1 : 0,
      service.id, tenant.id,
    ],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'service.update', target: service.id, ip: req.ip });
  res.json({ service: get(`SELECT * FROM services WHERE id = ?`, [service.id]) });
});

router.delete('/services/:id', guard, can('services:write'), (req, res) => {
  const tenant = tenantOf(req);
  const service = get(`SELECT * FROM services WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!service) throw notFound('Service not found.');
  run(`UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ?`, [service.id, tenant.id]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'service.archive', target: service.id, ip: req.ip });
  res.json({ archived: true });
});

/* ----------------------------- staff ----------------------------- */

router.get('/staff', guard, can('staff:read'), (req, res) => {
  const tenant = tenantOf(req);
  const staff = all(`SELECT * FROM staff WHERE tenant_id = ? ORDER BY active DESC, name`, [tenant.id]);
  const schedules = all(
    `SELECT sc.* FROM schedules sc JOIN staff s ON s.id = sc.staff_id WHERE s.tenant_id = ? ORDER BY sc.weekday, sc.start_min`,
    [tenant.id],
  );
  const links = all(
    `SELECT ss.staff_id, ss.service_id FROM staff_services ss JOIN staff s ON s.id = ss.staff_id WHERE s.tenant_id = ?`,
    [tenant.id],
  );
  const timeOff = all(
    `SELECT t.* FROM time_off t JOIN staff s ON s.id = t.staff_id WHERE s.tenant_id = ? AND t.end_at >= ? ORDER BY t.start_at`,
    [tenant.id, nowIso()],
  );
  res.json({
    staff: staff.map((s) => ({
      ...s,
      schedules: schedules.filter((x) => x.staff_id === s.id),
      service_ids: links.filter((l) => l.staff_id === s.id).map((l) => l.service_id),
      time_off: timeOff.filter((t) => t.staff_id === s.id),
    })),
  });
});

const staffSchema = z.object({
  name: z.string().min(2).max(120),
  title: z.string().max(80).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  active: z.boolean().optional(),
  service_ids: z.array(z.string()).optional(),
});

router.post('/staff', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(staffSchema, req.body);
  const id = newId('stf_');
  tx(() => {
    run(
      `INSERT INTO staff (id, tenant_id, name, title, email, phone, color, active, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, tenant.id, data.name, data.title || null, data.email || null, data.phone || null,
        data.color || '#7B5BFF', data.active === false ? 0 : 1, nowIso()],
    );
    for (const serviceId of data.service_ids || []) {
      const owns = get(`SELECT id FROM services WHERE id = ? AND tenant_id = ?`, [serviceId, tenant.id]);
      if (owns) run(`INSERT OR IGNORE INTO staff_services (staff_id, service_id) VALUES (?,?)`, [id, serviceId]);
    }
  });
  audit({ tenantId: tenant.id, actor: req.user, action: 'staff.create', target: id, ip: req.ip });
  res.status(201).json({ staff: get(`SELECT * FROM staff WHERE id = ?`, [id]) });
});

router.patch('/staff/:id', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const member = get(`SELECT * FROM staff WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!member) throw notFound('Team member not found.');
  const data = validate(staffSchema.partial(), req.body);
  tx(() => {
    run(
      `UPDATE staff SET name = ?, title = ?, email = ?, phone = ?, color = ?, active = ? WHERE id = ? AND tenant_id = ?`,
      [data.name ?? member.name, data.title === undefined ? member.title : data.title,
        data.email === undefined ? member.email : data.email,
        data.phone === undefined ? member.phone : data.phone,
        data.color ?? member.color,
        data.active === undefined ? member.active : data.active ? 1 : 0,
        member.id, tenant.id],
    );
    if (data.service_ids) {
      run(`DELETE FROM staff_services WHERE staff_id = ?`, [member.id]);
      for (const serviceId of data.service_ids) {
        const owns = get(`SELECT id FROM services WHERE id = ? AND tenant_id = ?`, [serviceId, tenant.id]);
        if (owns) run(`INSERT OR IGNORE INTO staff_services (staff_id, service_id) VALUES (?,?)`, [member.id, serviceId]);
      }
    }
  });
  audit({ tenantId: tenant.id, actor: req.user, action: 'staff.update', target: member.id, ip: req.ip });
  res.json({ staff: get(`SELECT * FROM staff WHERE id = ?`, [member.id]) });
});

router.delete('/staff/:id', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const member = get(`SELECT * FROM staff WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!member) throw notFound('Team member not found.');
  run(`UPDATE staff SET active = 0 WHERE id = ? AND tenant_id = ?`, [member.id, tenant.id]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'staff.archive', target: member.id, ip: req.ip });
  res.json({ archived: true });
});

const scheduleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  start_min: z.number().int().min(0).max(1439),
  end_min: z.number().int().min(1).max(1440),
  break_start: z.number().int().min(0).max(1439).optional().nullable(),
  break_end: z.number().int().min(0).max(1440).optional().nullable(),
});

router.put('/staff/:id/schedule', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const member = get(`SELECT * FROM staff WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!member) throw notFound('Team member not found.');
  const days = validate(z.array(scheduleSchema).max(7), req.body?.days ?? req.body);
  tx(() => {
    run(`DELETE FROM schedules WHERE staff_id = ?`, [member.id]);
    for (const d of days) {
      if (d.end_min <= d.start_min) throw badRequest('Shift end must be after shift start.');
      run(
        `INSERT INTO schedules (id, staff_id, weekday, start_min, end_min, break_start, break_end) VALUES (?,?,?,?,?,?,?)`,
        [newId('sch_'), member.id, d.weekday, d.start_min, d.end_min, d.break_start ?? null, d.break_end ?? null],
      );
    }
  });
  audit({ tenantId: tenant.id, actor: req.user, action: 'staff.schedule', target: member.id, ip: req.ip });
  res.json({ days: all(`SELECT * FROM schedules WHERE staff_id = ? ORDER BY weekday`, [member.id]) });
});

const timeOffSchema = z.object({
  start_at: z.string().min(10),
  end_at: z.string().min(10),
  reason: z.string().max(200).optional().nullable(),
});

router.post('/staff/:id/time-off', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const member = get(`SELECT * FROM staff WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!member) throw notFound('Team member not found.');
  const data = validate(timeOffSchema, req.body);
  if (new Date(data.end_at) <= new Date(data.start_at)) throw badRequest('End time must be after the start time.');
  const id = newId('tof_');
  run(`INSERT INTO time_off (id, staff_id, start_at, end_at, reason, created_at) VALUES (?,?,?,?,?,?)`,
    [id, member.id, data.start_at, data.end_at, data.reason || null, nowIso()]);
  res.status(201).json({ time_off: get(`SELECT * FROM time_off WHERE id = ?`, [id]) });
});

router.delete('/time-off/:id', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const row = get(
    `SELECT t.* FROM time_off t JOIN staff s ON s.id = t.staff_id WHERE t.id = ? AND s.tenant_id = ?`,
    [req.params.id, tenant.id],
  );
  if (!row) throw notFound('Time off entry not found.');
  run(`DELETE FROM time_off WHERE id = ?`, [row.id]);
  res.json({ removed: true });
});

router.get('/blocked-periods', guard, can('staff:read'), (req, res) => {
  const tenant = tenantOf(req);
  res.json({
    blocked: all(`SELECT * FROM blocked_periods WHERE tenant_id = ? AND end_at >= ? ORDER BY start_at`, [tenant.id, nowIso()]),
  });
});

router.post('/blocked-periods', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({
    start_at: z.string().min(10),
    end_at: z.string().min(10),
    reason: z.string().max(200).optional().nullable(),
    staff_id: z.string().optional().nullable(),
  }), req.body);
  if (new Date(data.end_at) <= new Date(data.start_at)) throw badRequest('End time must be after the start time.');
  const id = newId('blk_');
  run(`INSERT INTO blocked_periods (id, tenant_id, staff_id, start_at, end_at, reason, created_at) VALUES (?,?,?,?,?,?,?)`,
    [id, tenant.id, data.staff_id || null, data.start_at, data.end_at, data.reason || null, nowIso()]);
  res.status(201).json({ blocked: get(`SELECT * FROM blocked_periods WHERE id = ?`, [id]) });
});

router.delete('/blocked-periods/:id', guard, can('staff:write'), (req, res) => {
  const tenant = tenantOf(req);
  const row = get(`SELECT * FROM blocked_periods WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!row) throw notFound('Blocked period not found.');
  run(`DELETE FROM blocked_periods WHERE id = ?`, [row.id]);
  res.json({ removed: true });
});

/* ----------------------------- AI receptionist ----------------------------- */

router.get('/ai', guard, can('ai:read'), (req, res) => {
  const tenant = tenantOf(req);
  const settings = getAiSettings(tenant.id);
  res.json({
    settings,
    provider: aiStatus(),
    knowledge: all(`SELECT * FROM knowledge_entries WHERE tenant_id = ? ORDER BY kind, title`, [tenant.id]),
    escalation_keywords: safeJson(settings.escalation_keywords, []),
  });
});

router.patch('/ai', guard, can('ai:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({
    enabled: z.boolean().optional(),
    assistant_name: z.string().min(1).max(40).optional(),
    tone: z.enum(['warm-professional', 'concise', 'luxury', 'friendly']).optional(),
    language: z.enum(['en', 'sw', 'en-sw']).optional(),
    greeting: z.string().max(400).optional().nullable(),
    escalation_keywords: z.array(z.string().max(40)).max(30).optional(),
    voice_enabled: z.boolean().optional(),
  }), req.body);
  const current = getAiSettings(tenant.id);
  run(
    `UPDATE ai_settings SET enabled = ?, assistant_name = ?, tone = ?, language = ?, greeting = ?,
       escalation_keywords = ?, voice_enabled = ?, updated_at = ? WHERE tenant_id = ?`,
    [
      data.enabled === undefined ? current.enabled : data.enabled ? 1 : 0,
      data.assistant_name ?? current.assistant_name,
      data.tone ?? current.tone,
      data.language ?? current.language,
      data.greeting === undefined ? current.greeting : data.greeting,
      data.escalation_keywords ? JSON.stringify(data.escalation_keywords) : current.escalation_keywords,
      data.voice_enabled === undefined ? current.voice_enabled : data.voice_enabled ? 1 : 0,
      nowIso(), tenant.id,
    ],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'ai.settings', target: tenant.id, ip: req.ip });
  res.json({ settings: getAiSettings(tenant.id) });
});

router.post('/ai/preview', guard, can('ai:read'), async (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({ text: z.string().min(1).max(1000) }), req.body);
  const settings = getAiSettings(tenant.id);
  const result = await respondToMessage({
    tenant, settings, conversation: { id: 'preview', channel: 'web' }, history: [], text: data.text, channel: 'web', dryRun: true,
  });
  res.json({
    reply: result.reply,
    generator: result.generator || 'deterministic',
    handoff: Boolean(result.handoff),
    action: result.action || null,
    provider_error: result.provider_error || null,
  });
});

const knowledgeSchema = z.object({
  kind: z.enum(['faq', 'policy', 'service_info', 'promotion', 'document']).optional(),
  title: z.string().min(2).max(160),
  content: z.string().min(2).max(4000),
  active: z.boolean().optional(),
});

router.get('/knowledge', guard, can('ai:read'), (req, res) => {
  const tenant = tenantOf(req);
  const kind = typeof req.query.kind === 'string' ? req.query.kind : null;
  const rows = kind
    ? all(`SELECT * FROM knowledge_entries WHERE tenant_id = ? AND kind = ? ORDER BY title`, [tenant.id, kind])
    : all(`SELECT * FROM knowledge_entries WHERE tenant_id = ? ORDER BY kind, title`, [tenant.id]);
  res.json({ knowledge: rows, total: rows.length });
});

router.post('/knowledge', guard, can('ai:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(knowledgeSchema, req.body);
  const id = newId('knw_');
  run(`INSERT INTO knowledge_entries (id, tenant_id, kind, title, content, active, created_at) VALUES (?,?,?,?,?,?,?)`,
    [id, tenant.id, data.kind || 'faq', data.title, data.content, data.active === false ? 0 : 1, nowIso()]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'knowledge.create', target: id, ip: req.ip });
  res.status(201).json({ entry: get(`SELECT * FROM knowledge_entries WHERE id = ?`, [id]) });
});

router.patch('/knowledge/:id', guard, can('ai:write'), (req, res) => {
  const tenant = tenantOf(req);
  const entry = get(`SELECT * FROM knowledge_entries WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!entry) throw notFound('Knowledge entry not found.');
  const data = validate(knowledgeSchema.partial(), req.body);
  run(`UPDATE knowledge_entries SET kind = ?, title = ?, content = ?, active = ? WHERE id = ? AND tenant_id = ?`,
    [data.kind ?? entry.kind, data.title ?? entry.title, data.content ?? entry.content,
      data.active === undefined ? entry.active : data.active ? 1 : 0, entry.id, tenant.id]);
  res.json({ entry: get(`SELECT * FROM knowledge_entries WHERE id = ?`, [entry.id]) });
});

router.delete('/knowledge/:id', guard, can('ai:write'), (req, res) => {
  const tenant = tenantOf(req);
  const entry = get(`SELECT * FROM knowledge_entries WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!entry) throw notFound('Knowledge entry not found.');
  run(`DELETE FROM knowledge_entries WHERE id = ? AND tenant_id = ?`, [entry.id, tenant.id]);
  res.json({ removed: true });
});

/* ----------------------------- AI inbox ----------------------------- */

router.get('/conversations', guard, can('ai:read'), (req, res) => {
  const tenant = tenantOf(req);
  const status = req.query.status ? String(req.query.status) : 'all';
  const rows = all(
    `SELECT cv.*, c.name AS customer_name, c.phone AS customer_phone,
       (SELECT body FROM messages m WHERE m.conversation_id = cv.id ORDER BY m.created_at DESC LIMIT 1) AS last_message,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id) AS message_count
     FROM conversations cv LEFT JOIN customers c ON c.id = cv.customer_id
     WHERE cv.tenant_id = ? ${status !== 'all' ? 'AND cv.status = ?' : ''}
     ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC LIMIT 100`,
    status !== 'all' ? [tenant.id, status] : [tenant.id],
  );
  res.json({
    conversations: rows,
    counts: {
      all: get(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ?`, [tenant.id])?.n ?? 0,
      open: get(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND status = 'open'`, [tenant.id])?.n ?? 0,
      needs_human: get(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND status = 'needs_human'`, [tenant.id])?.n ?? 0,
      closed: get(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND status = 'closed'`, [tenant.id])?.n ?? 0,
    },
  });
});

router.get('/conversations/:id', guard, can('ai:read'), (req, res) => {
  const tenant = tenantOf(req);
  const conversation = get(`SELECT * FROM conversations WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!conversation) throw notFound('Conversation not found.');
  res.json({
    conversation: { ...conversation, meta: safeJson(conversation.meta, {}) },
    messages: all(`SELECT * FROM messages WHERE conversation_id = ? AND tenant_id = ? ORDER BY created_at`, [conversation.id, tenant.id]),
  });
});

router.post('/conversations/:id/reply', guard, can('ai:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const conversation = get(`SELECT * FROM conversations WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!conversation) throw notFound('Conversation not found.');
  const data = validate(z.object({ body: z.string().min(1).max(4000) }), req.body);
  recordMessage({ tenantId: tenant.id, conversationId: conversation.id, role: 'staff', body: data.body, meta: { user_id: req.user.id } });
  run(`UPDATE conversations SET last_message_at = ?, status = 'open' WHERE id = ? AND tenant_id = ?`, [nowIso(), conversation.id, tenant.id]);

  let delivered = null;
  if (conversation.channel === 'whatsapp' && conversation.contact_ref) {
    delivered = await sendWhatsAppMessage(tenant.id, conversation.contact_ref, data.body);
  }
  res.json({ sent: true, whatsapp: delivered ? { sent: delivered.sent, reason: delivered.reason || null } : null });
});

router.patch('/conversations/:id', guard, can('ai:write'), (req, res) => {
  const tenant = tenantOf(req);
  const conversation = get(`SELECT * FROM conversations WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!conversation) throw notFound('Conversation not found.');
  const data = validate(z.object({
    ai_enabled: z.boolean().optional(),
    status: z.enum(['open', 'needs_human', 'closed']).optional(),
  }), req.body);
  run(`UPDATE conversations SET ai_enabled = ?, status = ? WHERE id = ? AND tenant_id = ?`,
    [data.ai_enabled === undefined ? conversation.ai_enabled : data.ai_enabled ? 1 : 0,
      data.status ?? conversation.status, conversation.id, tenant.id]);
  res.json({ conversation: get(`SELECT * FROM conversations WHERE id = ?`, [conversation.id]) });
});

/* ----------------------------- marketing ----------------------------- */

router.get('/content', guard, can('marketing:read'), (req, res) => {
  const tenant = tenantOf(req);
  const items = all(`SELECT * FROM content_items WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 120`, [tenant.id]);
  res.json({
    items,
    counts: {
      draft: items.filter((i) => i.status === 'draft').length,
      approved: items.filter((i) => i.status === 'approved').length,
      scheduled: items.filter((i) => i.status === 'scheduled').length,
      published: items.filter((i) => i.status === 'published').length,
      failed: items.filter((i) => i.status === 'failed').length,
    },
    campaigns: all(`SELECT * FROM campaigns WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 40`, [tenant.id]),
    channels: listIntegrations(tenant.id).filter((i) => ['instagram', 'facebook', 'tiktok', 'x'].includes(i.provider)),
  });
});

router.post('/content/generate', guard, can('marketing:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({
    kind: z.enum(['caption', 'offer', 'promotion', 'educational', 'retention', 'script', 'voiceover', 'subtitles']),
    channel: z.enum(['instagram', 'facebook', 'tiktok', 'x', 'whatsapp']),
    brief: z.string().max(600).optional().nullable(),
    serviceId: z.string().optional().nullable(),
  }), req.body);
  const generated = await generateContent({
    tenant, kind: data.kind, channel: data.channel, brief: data.brief || null, serviceId: data.serviceId || null,
  });
  const id = newId('cnt_');
  const now = nowIso();
  run(
    `INSERT INTO content_items (id, tenant_id, kind, channel, title, body, hashtags, status, generator, created_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [id, tenant.id, data.kind, data.channel, generated.title, generated.body, generated.hashtags || '',
      'draft', generated.generator || 'deterministic', req.user.id, now, now],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'content.generate', target: id, meta: { kind: data.kind, channel: data.channel }, ip: req.ip });
  res.status(201).json({ item: get(`SELECT * FROM content_items WHERE id = ?`, [id]), provider_error: generated.provider_error || null });
});

router.patch('/content/:id', guard, can('marketing:write'), (req, res) => {
  const tenant = tenantOf(req);
  const item = get(`SELECT * FROM content_items WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!item) throw notFound('Content item not found.');
  const data = validate(z.object({
    title: z.string().min(1).max(200).optional(),
    body: z.string().min(1).max(4000).optional(),
    hashtags: z.string().max(600).optional().nullable(),
    status: z.enum(['draft', 'approved', 'scheduled', 'published', 'failed']).optional(),
    scheduled_at: z.string().min(10).optional().nullable(),
  }), req.body);
  if (data.status === 'scheduled' && !(data.scheduled_at || item.scheduled_at)) {
    throw badRequest('Choose a schedule date and time before scheduling.');
  }
  run(
    `UPDATE content_items SET title = ?, body = ?, hashtags = ?, status = ?, scheduled_at = ?, updated_at = ?
     WHERE id = ? AND tenant_id = ?`,
    [data.title ?? item.title, data.body ?? item.body, data.hashtags === undefined ? item.hashtags : data.hashtags,
      data.status ?? item.status, data.scheduled_at === undefined ? item.scheduled_at : data.scheduled_at,
      nowIso(), item.id, tenant.id],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'content.update', target: item.id, meta: { status: data.status || item.status }, ip: req.ip });
  res.json({ item: get(`SELECT * FROM content_items WHERE id = ?`, [item.id]) });
});

router.post('/content/:id/publish', guard, can('marketing:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const item = get(`SELECT * FROM content_items WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!item) throw notFound('Content item not found.');
  if (!['approved', 'scheduled'].includes(item.status)) {
    throw conflict('Approve the content before publishing.');
  }
  const result = await publishToChannel(tenant.id, item.channel, item);
  if (!result.published) {
    run(`UPDATE content_items SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`,
      [result.reason || 'Publishing failed.', nowIso(), item.id, tenant.id]);
    audit({ tenantId: tenant.id, actor: req.user, action: 'content.publish_failed', target: item.id, meta: { reason: result.reason }, ip: req.ip });
    res.status(422).json({
      error: result.reason || 'This channel is not connected.',
      code: 'configuration_required',
      item: get(`SELECT * FROM content_items WHERE id = ?`, [item.id]),
    });
    return;
  }
  const now = nowIso();
  run(`UPDATE content_items SET status = 'published', published_at = ?, external_ref = ?, error = NULL, updated_at = ?
       WHERE id = ? AND tenant_id = ?`, [now, result.ref || null, now, item.id, tenant.id]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'content.publish', target: item.id, meta: { channel: item.channel, ref: result.ref }, ip: req.ip });
  notify({ tenantId: tenant.id, title: 'Content published', body: `${item.channel} · ${item.title}`, level: 'success' });
  res.json({ item: get(`SELECT * FROM content_items WHERE id = ?`, [item.id]) });
});

router.delete('/content/:id', guard, can('marketing:write'), (req, res) => {
  const tenant = tenantOf(req);
  const item = get(`SELECT * FROM content_items WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!item) throw notFound('Content item not found.');
  if (item.status === 'published') throw conflict('Published content is kept for your audit trail.');
  run(`DELETE FROM content_items WHERE id = ? AND tenant_id = ?`, [item.id, tenant.id]);
  res.json({ removed: true });
});

const campaignSchema = z.object({
  name: z.string().min(2).max(140),
  goal: z.string().max(300).optional().nullable(),
  audience: z.enum(['all', 'new', 'returning', 'vip', 'inactive']).optional(),
  message: z.string().max(2000).optional().nullable(),
  scheduled_at: z.string().min(10).optional().nullable(),
});

router.post('/campaigns', guard, can('marketing:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(campaignSchema, req.body);
  const id = newId('cmp_');
  const now = nowIso();
  run(`INSERT INTO campaigns (id, tenant_id, name, goal, audience, message, status, scheduled_at, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [id, tenant.id, data.name, data.goal || null, data.audience || 'all', data.message || null,
      data.scheduled_at ? 'scheduled' : 'draft', data.scheduled_at || null, now, now]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'campaign.create', target: id, ip: req.ip });
  res.status(201).json({ campaign: get(`SELECT * FROM campaigns WHERE id = ?`, [id]) });
});

router.get('/campaigns/:id/audience', guard, can('marketing:read'), (req, res) => {
  const tenant = tenantOf(req);
  const campaign = get(`SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!campaign) throw notFound('Campaign not found.');
  const seg = segmentClause(campaign.audience);
  const rows = all(
    `SELECT id, name, phone, email, visits, last_visit_at FROM customers c
     WHERE c.tenant_id = ? AND c.marketing_consent = 1 ${seg.sql} ORDER BY c.name LIMIT 500`,
    [tenant.id, ...seg.params],
  );
  res.json({
    audience: campaign.audience,
    consenting_customers: rows.length,
    customers: rows,
    note: rows.length === 0 ? 'No customers have granted marketing consent for this segment yet.' : null,
  });
});

/* ----------------------------- integrations ----------------------------- */

router.get('/integrations', guard, can('integrations:read'), (req, res) => {
  const tenant = tenantOf(req);
  res.json({ integrations: listIntegrations(tenant.id), platform: platformConfigStatus() });
});

router.post('/integrations/:provider', guard, can('integrations:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const provider = String(req.params.provider);
  if (!PROVIDERS[provider]) throw notFound('Unknown integration.');
  const values = req.body && typeof req.body === 'object' ? req.body : {};
  const cleaned = {};
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim()) cleaned[key] = value.trim();
  }
  if (Object.keys(cleaned).length) saveCredentials(tenant.id, provider, cleaned);
  const verification = await verifyIntegration(tenant.id, provider);
  audit({
    tenantId: tenant.id, actor: req.user, action: 'integration.connect',
    target: provider, meta: { status: verification.status }, ip: req.ip,
  });
  res.json({ integration: integrationView(tenant.id, provider), verification });
});

router.post('/integrations/:provider/verify', guard, can('integrations:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const provider = String(req.params.provider);
  if (!PROVIDERS[provider]) throw notFound('Unknown integration.');
  const verification = await verifyIntegration(tenant.id, provider);
  res.json({ integration: integrationView(tenant.id, provider), verification });
});

router.delete('/integrations/:provider', guard, can('integrations:write'), (req, res) => {
  const tenant = tenantOf(req);
  const provider = String(req.params.provider);
  if (!PROVIDERS[provider]) throw notFound('Unknown integration.');
  disconnectIntegration(tenant.id, provider);
  audit({ tenantId: tenant.id, actor: req.user, action: 'integration.disconnect', target: provider, ip: req.ip });
  res.json({ integration: integrationView(tenant.id, provider) });
});

/* ----------------------------- billing ----------------------------- */

router.get('/billing', guard, can('billing:read'), (req, res) => {
  const tenant = tenantOf(req);
  res.json(billingSummary(tenant.id));
});

router.post('/billing/change-plan', guard, can('billing:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({
    planId: z.string().min(1),
    interval: z.enum(['monthly', 'yearly']).optional(),
  }), req.body);
  const plan = planById(data.planId);
  const current = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenant.id]);

  if (current?.status === 'trialing') {
    run(`UPDATE subscriptions SET plan_id = ?, updated_at = ? WHERE id = ?`, [plan.id, nowIso(), current.id]);
    audit({ tenantId: tenant.id, actor: req.user, action: 'subscription.plan_change', target: plan.id, meta: { during_trial: true }, ip: req.ip });
    res.json({ mode: 'trial_updated', subscription: billingSummary(tenant.id).subscription });
    return;
  }

  const checkout = await initializeCheckout({
    tenant, plan, interval: data.interval || 'monthly', email: req.user.email, purpose: 'plan_change',
  });
  audit({ tenantId: tenant.id, actor: req.user, action: 'subscription.checkout', target: plan.id, meta: { reference: checkout.reference }, ip: req.ip });
  res.json({ mode: 'checkout', checkout, subscription: billingSummary(tenant.id).subscription });
});

router.post('/billing/cancel', guard, can('billing:write'), (req, res) => {
  const tenant = tenantOf(req);
  const sub = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenant.id]);
  if (!sub) throw notFound('No subscription found.');
  run(`UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = ? WHERE id = ?`, [nowIso(), sub.id]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'subscription.cancel', target: sub.id, ip: req.ip });
  res.json({ subscription: billingSummary(tenant.id).subscription });
});

router.post('/billing/resume', guard, can('billing:write'), (req, res) => {
  const tenant = tenantOf(req);
  const sub = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenant.id]);
  if (!sub) throw notFound('No subscription found.');
  run(`UPDATE subscriptions SET cancel_at_period_end = 0, updated_at = ? WHERE id = ?`, [nowIso(), sub.id]);
  res.json({ subscription: billingSummary(tenant.id).subscription });
});

/* ----------------------------- settings ----------------------------- */

router.get('/settings', guard, can('settings:read'), (req, res) => {
  const tenant = tenantOf(req);
  res.json({
    tenant: tenantView(tenant),
    permissions: permissionsFor(req.user),
    role_labels: ROLE_LABELS,
    ai: aiStatus(),
    platform: platformConfigStatus(),
  });
});

const tenantSchema = z.object({
  name: z.string().min(2).max(140).optional(),
  industry: z.enum(['salon', 'barbershop', 'spa', 'clinic', 'dental', 'restaurant', 'hotel', 'fitness', 'rentals', 'other']).optional(),
  legal_name: z.string().max(160).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  whatsapp: z.string().max(40).optional().nullable(),
  address: z.string().max(240).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  country: z.string().max(120).optional(),
  timezone: z.string().max(60).optional(),
  currency: z.string().length(3).optional(),
  logo_url: z.string().max(600).optional().nullable(),
  brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  tagline: z.string().max(200).optional().nullable(),
  about: z.string().max(2000).optional().nullable(),
  gallery: z.array(z.string().max(600)).max(12).optional(),
  social_links: z.record(z.string(), z.string().max(600)).optional(),
  booking_rules: z.object({
    slotIntervalMin: z.number().int().min(5).max(120).optional(),
    leadTimeMin: z.number().int().min(0).max(10080).optional(),
    maxAdvanceDays: z.number().int().min(1).max(365).optional(),
    bufferMin: z.number().int().min(0).max(120).optional(),
    allowStaffChoice: z.boolean().optional(),
    requireEmail: z.boolean().optional(),
  }).optional(),
});

router.patch('/settings', guard, can('settings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(tenantSchema, req.body);
  const rules = data.booking_rules ? { ...bookingRules(tenant), ...data.booking_rules } : bookingRules(tenant);
  run(
    `UPDATE tenants SET name = ?, industry = ?, legal_name = ?, email = ?, phone = ?, whatsapp = ?,
       address = ?, city = ?, country = ?, timezone = ?, currency = ?, logo_url = ?, brand_color = ?,
       accent_color = ?, tagline = ?, about = ?, gallery = ?, social_links = ?, booking_rules = ?, updated_at = ?
     WHERE id = ?`,
    [
      data.name ?? tenant.name, data.industry ?? tenant.industry,
      data.legal_name === undefined ? tenant.legal_name : data.legal_name,
      data.email === undefined ? tenant.email : data.email,
      data.phone === undefined ? tenant.phone : data.phone,
      data.whatsapp === undefined ? tenant.whatsapp : data.whatsapp,
      data.address === undefined ? tenant.address : data.address,
      data.city === undefined ? tenant.city : data.city,
      data.country ?? tenant.country, data.timezone ?? tenant.timezone, data.currency ?? tenant.currency,
      data.logo_url === undefined ? tenant.logo_url : data.logo_url,
      data.brand_color ?? tenant.brand_color, data.accent_color ?? tenant.accent_color,
      data.tagline === undefined ? tenant.tagline : data.tagline,
      data.about === undefined ? tenant.about : data.about,
      data.gallery ? JSON.stringify(data.gallery) : tenant.gallery,
      data.social_links ? JSON.stringify(data.social_links) : tenant.social_links,
      JSON.stringify(rules), nowIso(), tenant.id,
    ],
  );
  audit({ tenantId: tenant.id, actor: req.user, action: 'tenant.update', target: tenant.id, ip: req.ip });
  res.json({ tenant: tenantView(get(`SELECT * FROM tenants WHERE id = ?`, [tenant.id])) });
});

router.patch('/onboarding', guard, can('settings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({ step: z.number().int().min(1).max(11) }), req.body);
  run(`UPDATE tenants SET onboarding_step = ?, updated_at = ? WHERE id = ?`, [data.step, nowIso(), tenant.id]);
  res.json({ tenant: tenantView(get(`SELECT * FROM tenants WHERE id = ?`, [tenant.id])) });
});

const INDUSTRY_TEMPLATES = {
  salon: [
    { name: 'Signature haircut', duration_min: 45, category: 'Hair' },
    { name: 'Wash, cut & finish', duration_min: 60, category: 'Hair' },
    { name: 'Braiding', duration_min: 120, category: 'Hair' },
    { name: 'Manicure', duration_min: 45, category: 'Nails' },
    { name: 'Facial treatment', duration_min: 60, category: 'Skin' },
  ],
  barbershop: [
    { name: 'Skin fade', duration_min: 45, category: 'Cut' },
    { name: 'Beard sculpt', duration_min: 30, category: 'Beard' },
    { name: 'Cut & beard', duration_min: 60, category: 'Cut' },
    { name: 'Hot towel shave', duration_min: 30, category: 'Shave' },
  ],
  spa: [
    { name: 'Deep tissue massage', duration_min: 60, category: 'Massage' },
    { name: 'Full body massage', duration_min: 90, category: 'Massage' },
    { name: 'Body scrub', duration_min: 45, category: 'Body' },
  ],
  clinic: [
    { name: 'General consultation', duration_min: 30, category: 'Consultation' },
    { name: 'Follow-up review', duration_min: 20, category: 'Consultation' },
  ],
  dental: [
    { name: 'Dental check-up', duration_min: 30, category: 'Check-up' },
    { name: 'Scale & polish', duration_min: 45, category: 'Hygiene' },
  ],
  restaurant: [
    { name: 'Table reservation', duration_min: 90, category: 'Dining' },
  ],
  hotel: [
    { name: 'Room viewing', duration_min: 30, category: 'Stay' },
  ],
  fitness: [
    { name: 'Personal training session', duration_min: 60, category: 'Training' },
    { name: 'Assessment', duration_min: 45, category: 'Training' },
  ],
  rentals: [
    { name: 'Property viewing', duration_min: 45, category: 'Viewing' },
  ],
  other: [
    { name: 'Appointment', duration_min: 30, category: 'General' },
  ],
};

router.post('/onboarding/template', guard, can('settings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const industry = INDUSTRY_TEMPLATES[tenant.industry] ? tenant.industry : 'other';
  const existing = get(`SELECT COUNT(*) AS n FROM services WHERE tenant_id = ?`, [tenant.id])?.n ?? 0;
  if (existing > 0) throw conflict('You already have services. Edit those instead of loading a template.');
  tx(() => {
    INDUSTRY_TEMPLATES[industry].forEach((svc, index) => {
      run(
        `INSERT INTO services (id, tenant_id, name, description, category, duration_min, buffer_min, price_cents, active, sort, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [newId('svc_'), tenant.id, svc.name, null, svc.category, svc.duration_min, 0, 0, 1, index + 1, nowIso()],
      );
    });
    run(
      `INSERT INTO knowledge_entries (id, tenant_id, kind, title, content, active, created_at) VALUES (?,?,?,?,?,?,?)`,
      [newId('knw_'), tenant.id, 'policy', 'Cancellation policy',
        'Please edit this policy so the AI answers exactly as your business requires. Default: we ask for at least 4 hours notice to reschedule or cancel an appointment.', 1, nowIso()],
    );
  });
  audit({ tenantId: tenant.id, actor: req.user, action: 'onboarding.template', meta: { industry }, ip: req.ip });
  res.status(201).json({
    services: all(`SELECT * FROM services WHERE tenant_id = ? ORDER BY sort`, [tenant.id]),
    knowledge: all(`SELECT * FROM knowledge_entries WHERE tenant_id = ?`, [tenant.id]),
    note: 'Prices start at zero — set your real prices before launching.',
  });
});

router.post('/launch', guard, can('settings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const services = get(`SELECT COUNT(*) AS n FROM services WHERE tenant_id = ? AND active = 1`, [tenant.id])?.n ?? 0;
  const staff = get(
    `SELECT COUNT(DISTINCT s.id) AS n FROM staff s JOIN schedules sc ON sc.staff_id = s.id WHERE s.tenant_id = ? AND s.active = 1`,
    [tenant.id],
  )?.n ?? 0;
  if (!services) throw badRequest('Add at least one service before launching.');
  if (!staff) throw badRequest('Add at least one team member with working hours before launching.');
  const now = nowIso();
  run(`UPDATE tenants SET status = 'active', onboarding_complete = 1, onboarding_step = 11, launched_at = COALESCE(launched_at, ?), updated_at = ? WHERE id = ?`,
    [now, now, tenant.id]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'tenant.launch', target: tenant.id, ip: req.ip });
  notify({ tenantId: tenant.id, title: 'Workspace launched', body: `${tenant.name} is now live at /business/${tenant.slug}`, level: 'success' });
  res.json({ launched: true, tenant: tenantView(get(`SELECT * FROM tenants WHERE id = ?`, [tenant.id])) });
});

/* ----------------------------- team ----------------------------- */

router.get('/team', guard, can('team:read'), (req, res) => {
  const tenant = tenantOf(req);
  const members = all(
    `SELECT id, email, name, phone, role, status, last_login_at, created_at FROM users WHERE tenant_id = ? ORDER BY created_at`,
    [tenant.id],
  );
  res.json({ members: members.map((m) => ({ ...m, role_label: ROLE_LABELS[m.role] || m.role, permissions: permissionsFor(m) })) });
});

router.post('/team', guard, can('team:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({
    name: z.string().min(2).max(120),
    email: z.string().email().max(160),
    role: z.enum(['manager', 'receptionist', 'staff']),
    phone: z.string().max(40).optional().nullable(),
  }), req.body);
  const existing = get(`SELECT id FROM users WHERE lower(email) = lower(?)`, [data.email]);
  if (existing) throw conflict('An account with this email already exists.');
  const tempPassword = `mvy-${randomToken().slice(0, 12)}`;
  const id = newId('usr_');
  tx(() => {
    run(`INSERT INTO users (id, tenant_id, email, name, phone, password_hash, role, status, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      [id, tenant.id, data.email.toLowerCase(), data.name, data.phone || null,
        hashPassword(tempPassword), data.role, 'active', nowIso()]);
    run(`INSERT INTO staff (id, tenant_id, user_id, name, email, phone, active, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [newId('stf_'), tenant.id, id, data.name, data.email.toLowerCase(), data.phone || null, 1, nowIso()]);
  });
  audit({ tenantId: tenant.id, actor: req.user, action: 'team.invite', target: id, meta: { role: data.role }, ip: req.ip });
  notify({ tenantId: tenant.id, title: 'Team member added', body: `${data.name} · ${ROLE_LABELS[data.role]}`, level: 'info' });
  res.status(201).json({
    member: get(`SELECT id, email, name, role, status FROM users WHERE id = ?`, [id]),
    temporary_password: tempPassword,
    note: 'Share this temporary password securely. The member can change it after signing in.',
  });
});

router.patch('/team/:id', guard, can('team:write'), (req, res) => {
  const tenant = tenantOf(req);
  const member = get(`SELECT * FROM users WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!member) throw notFound('Team member not found.');
  const data = validate(z.object({
    role: z.enum(['owner', 'manager', 'receptionist', 'staff']).optional(),
    status: z.enum(['active', 'suspended']).optional(),
    name: z.string().min(2).max(120).optional(),
  }), req.body);
  if (member.role === 'owner' && data.role && data.role !== 'owner') {
    const owners = get(`SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND role = 'owner' AND status = 'active'`, [tenant.id])?.n ?? 0;
    if (owners <= 1) throw conflict('A workspace needs at least one owner.');
  }
  if (member.id === req.user.id && data.status === 'suspended') throw conflict('You cannot suspend your own account.');
  run(`UPDATE users SET role = ?, status = ?, name = ? WHERE id = ? AND tenant_id = ?`,
    [data.role ?? member.role, data.status ?? member.status, data.name ?? member.name, member.id, tenant.id]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'team.update', target: member.id, meta: { role: data.role, status: data.status }, ip: req.ip });
  res.json({ member: get(`SELECT id, email, name, role, status FROM users WHERE id = ?`, [member.id]) });
});

router.delete('/team/:id', guard, can('team:write'), (req, res) => {
  const tenant = tenantOf(req);
  const member = get(`SELECT * FROM users WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!member) throw notFound('Team member not found.');
  if (member.id === req.user.id) throw conflict('You cannot remove your own account.');
  if (member.role === 'owner') {
    const owners = get(`SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND role = 'owner' AND status = 'active'`, [tenant.id])?.n ?? 0;
    if (owners <= 1) throw conflict('A workspace needs at least one owner.');
  }
  run(`DELETE FROM sessions WHERE user_id = ?`, [member.id]);
  run(`UPDATE users SET status = 'suspended', tenant_id = NULL WHERE id = ?`, [member.id]);
  run(`UPDATE staff SET active = 0, user_id = NULL WHERE user_id = ?`, [member.id]);
  audit({ tenantId: tenant.id, actor: req.user, action: 'team.remove', target: member.id, ip: req.ip });
  res.json({ removed: true });
});

/* ----------------------------- notifications / audit / export ----------------------------- */

router.get('/notifications', guard, can('dashboard:read'), (req, res) => {
  const tenant = tenantOf(req);
  const rows = all(
    `SELECT * FROM notifications WHERE tenant_id = ? AND (user_id IS NULL OR user_id = ?) ORDER BY created_at DESC LIMIT 50`,
    [tenant.id, req.user.id],
  );
  res.json({ notifications: rows, unread: rows.filter((n) => !n.read_at).length });
});

router.post('/notifications/read', guard, can('dashboard:read'), (req, res) => {
  const tenant = tenantOf(req);
  run(`UPDATE notifications SET read_at = ? WHERE tenant_id = ? AND read_at IS NULL AND (user_id IS NULL OR user_id = ?)`,
    [nowIso(), tenant.id, req.user.id]);
  res.json({ ok: true });
});

router.get('/audit', guard, can('settings:read'), (req, res) => {
  const tenant = tenantOf(req);
  res.json({
    entries: all(`SELECT * FROM audit_logs WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100`, [tenant.id])
      .map((e) => ({ ...e, meta: safeJson(e.meta, {}) })),
  });
});

router.get('/export', guard, can('privacy:export'), (req, res) => {
  const tenant = tenantOf(req);
  const dataset = {
    exported_at: nowIso(),
    tenant: tenantView(tenant),
    services: all(`SELECT * FROM services WHERE tenant_id = ?`, [tenant.id]),
    staff: all(`SELECT * FROM staff WHERE tenant_id = ?`, [tenant.id]),
    schedules: all(`SELECT sc.* FROM schedules sc JOIN staff s ON s.id = sc.staff_id WHERE s.tenant_id = ?`, [tenant.id]),
    customers: all(`SELECT * FROM customers WHERE tenant_id = ?`, [tenant.id]),
    appointments: all(`SELECT * FROM appointments WHERE tenant_id = ?`, [tenant.id]),
    conversations: all(`SELECT * FROM conversations WHERE tenant_id = ?`, [tenant.id]),
    messages: all(`SELECT * FROM messages WHERE tenant_id = ?`, [tenant.id]),
    knowledge: all(`SELECT * FROM knowledge_entries WHERE tenant_id = ?`, [tenant.id]),
    content: all(`SELECT * FROM content_items WHERE tenant_id = ?`, [tenant.id]),
    invoices: all(`SELECT * FROM invoices WHERE tenant_id = ?`, [tenant.id]),
    subscription: get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenant.id]) || null,
  };
  audit({ tenantId: tenant.id, actor: req.user, action: 'tenant.export', target: tenant.id, ip: req.ip });
  res.setHeader('content-disposition', `attachment; filename="mavyron-${tenant.slug}-export.json"`);
  res.json(dataset);
});

/* ----------------------------- workspace bootstrap ----------------------------- */

router.get('/me', requireAuth, (req, res) => {
  const tenant = req.tenantId ? tenantView(get(`SELECT * FROM tenants WHERE id = ?`, [req.tenantId]) || {}) : null;
  const usage = req.tenantId ? usageFor(req.tenantId) : null;
  const sub = req.tenantId ? billingSummary(req.tenantId).subscription : null;
  res.json({
    user: { id: req.user.id, email: req.user.email, name: req.user.name, role: req.user.role, phone: req.user.phone },
    permissions: permissionsFor(req.user),
    role_label: ROLE_LABELS[req.user.role] || req.user.role,
    tenant,
    usage,
    subscription: sub,
    ai: aiStatus(),
    trial_days: TRIAL_DAYS,
  });
});

/* -------------------- automation centre & outbox -------------------- */

router.get('/automations', guard, (req, res) => {
  const tenant = tenantOf(req);
  const automations = listAutomations(tenant.id);
  const whatsapp = get(
    `SELECT status FROM integrations WHERE tenant_id = ? AND provider = 'whatsapp' LIMIT 1`,
    [tenant.id],
  );
  const counts = get(
    `SELECT
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
       SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued,
       SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked,
       COUNT(*) AS total
     FROM outbox WHERE tenant_id = ?`,
    [tenant.id],
  );
  res.json({
    automations,
    whatsapp_status: whatsapp?.status || 'not_connected',
    outbox_counts: {
      sent: counts?.sent ?? 0,
      queued: counts?.queued ?? 0,
      blocked: counts?.blocked ?? 0,
      total: counts?.total ?? 0,
    },
  });
});

router.patch('/automations/:id', guard, can('bookings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const row = get(`SELECT * FROM automations WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!row) throw notFound('Automation not found.');
  const data = validate(z.object({
    enabled: z.boolean().optional(),
    name: z.string().trim().min(2).max(80).optional(),
    template: z.string().trim().min(10, 'Message must be at least 10 characters.').max(1200).optional(),
    delay_minutes: z.number().int().min(-10080).max(100000).optional(),
  }), req.body || {});
  run(
    `UPDATE automations SET enabled = ?, name = ?, template = ?, delay_minutes = ?, updated_at = ?
      WHERE id = ? AND tenant_id = ?`,
    [
      data.enabled === undefined ? row.enabled : (data.enabled ? 1 : 0),
      data.name ?? row.name,
      data.template ?? row.template,
      data.delay_minutes ?? row.delay_minutes,
      nowIso(), row.id, tenant.id,
    ],
  );
  audit({
    tenantId: tenant.id, actor: req.user, action: 'automation.update', target: row.key,
    meta: { enabled: data.enabled, template_changed: Boolean(data.template) }, ip: req.ip,
  });
  res.json({ automation: listAutomations(tenant.id).find((a) => a.id === row.id) });
});

router.post('/automations/run-now', guard, can('bookings:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const result = await runDueAutomations({ tenantId: tenant.id });
  audit({
    tenantId: tenant.id, actor: req.user, action: 'automation.run_now',
    target: 'sweep', meta: result, ip: req.ip,
  });
  res.json({ ...result, messages: listOutbox(tenant.id, { limit: 10 }) });
});

router.post('/automations/:id/test', guard, can('bookings:write'), async (req, res) => {
  const tenant = tenantOf(req);
  const row = get(`SELECT * FROM automations WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!row) throw notFound('Automation not found.');
  const data = validate(z.object({ to: z.string().trim().min(7).max(40).optional() }), req.body || {});
  const recipient = data.to || tenant.whatsapp || tenant.phone;
  if (!recipient) throw badRequest('Add a WhatsApp number for this business first.');
  const base = absoluteBase(req);
  const body = renderTemplate(row.template, {
    business_name: tenant.name,
    business_address: tenant.address || tenant.city || '',
    business_phone: tenant.whatsapp || tenant.phone || '',
    customer_name: 'Test customer',
    customer_phone: recipient,
    service_name: 'Signature service',
    staff_name: 'our team',
    when: new Intl.DateTimeFormat('en-GB', {
      timeZone: tenant.timezone || 'Africa/Nairobi',
      weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date()),
    booking_link: `${base}/business/${tenant.slug}`,
    review_link: `${base}/business/${tenant.slug}#review`,
  });
  const message = await enqueueMessage({
    tenant, automationKey: row.key, recipient, recipientName: tenant.name, body,
    relatedType: 'automation_test', relatedId: row.id,
  });
  audit({
    tenantId: tenant.id, actor: req.user, action: 'automation.test', target: row.key,
    meta: { status: message.status }, ip: req.ip,
  });
  res.status(201).json({ message, sent: message.status === 'sent' });
});

router.get('/outbox', guard, (req, res) => {
  const tenant = tenantOf(req);
  const status = req.query.status ? String(req.query.status) : 'all';
  res.json({
    messages: listOutbox(tenant.id, { limit: req.query.limit, status }),
    whatsapp_link_ready: true,
  });
});

router.post('/outbox/:id/sent', guard, can('bookings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const row = markOutboxSent(tenant.id, req.params.id, req.user);
  if (!row) throw notFound('Message not found.');
  res.json({ message: row });
});

/* --------------------------- intelligence --------------------------- */

router.get('/insights', guard, can('analytics:read'), (req, res) => {
  const tenant = tenantOf(req);
  const days = Math.min(Math.max(Number(req.query.days) || 30, 7), 365);
  res.json(insights(tenant, { days }));
});

/* ------------------------------ reviews ------------------------------ */

router.get('/reviews', guard, (req, res) => {
  const tenant = tenantOf(req);
  const rows = all(
    `SELECT * FROM reviews WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200`,
    [tenant.id],
  );
  const summary = get(
    `SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0) AS average
       FROM reviews WHERE tenant_id = ? AND status = 'published'`,
    [tenant.id],
  );
  const pending = get(
    `SELECT COUNT(*) AS n FROM reviews WHERE tenant_id = ? AND status = 'pending'`,
    [tenant.id],
  );
  res.json({
    reviews: rows,
    summary: {
      published: summary?.total ?? 0,
      average: Math.round((summary?.average ?? 0) * 10) / 10,
      pending: pending?.n ?? 0,
    },
  });
});

router.patch('/reviews/:id', guard, can('bookings:write'), (req, res) => {
  const tenant = tenantOf(req);
  const row = get(`SELECT * FROM reviews WHERE id = ? AND tenant_id = ?`, [req.params.id, tenant.id]);
  if (!row) throw notFound('Review not found.');
  const data = validate(z.object({
    status: z.enum(['pending', 'published', 'hidden']).optional(),
    reply: z.string().trim().max(1000).optional(),
  }), req.body || {});
  run(`UPDATE reviews SET status = ?, reply = ?, updated_at = ? WHERE id = ? AND tenant_id = ?`, [
    data.status ?? row.status, data.reply ?? row.reply, nowIso(), row.id, tenant.id,
  ]);
  audit({
    tenantId: tenant.id, actor: req.user, action: 'review.update', target: row.id,
    meta: { status: data.status ?? row.status }, ip: req.ip,
  });
  res.json({ review: get(`SELECT * FROM reviews WHERE id = ?`, [row.id]) });
});

/* ----------------------- subscription payments ----------------------- */

router.get('/payments', guard, can('billing:read'), (req, res) => {
  const tenant = tenantOf(req);
  const subscription = get(
    `SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`,
    [tenant.id],
  );
  const plan = subscription ? planById(subscription.plan_id) : null;
  res.json({
    instructions: paymentInstructions(plan, subscription?.interval || 'monthly'),
    requests: listPaymentRequests({ tenantId: tenant.id }),
    plan: plan ? { id: plan.id, name: plan.name, price_monthly: plan.price_monthly, price_yearly: plan.price_yearly } : null,
    subscription: subscription
      ? { status: subscription.status, interval: subscription.interval, current_period_end: subscription.current_period_end }
      : null,
  });
});

router.post('/payments/request', guard, can('billing:write'), (req, res) => {
  const tenant = tenantOf(req);
  const data = validate(z.object({
    planId: z.string().min(1),
    interval: z.enum(['monthly', 'yearly']).optional(),
    method: z.enum(['mpesa', 'bank', 'card']),
    payerReference: z.string().trim().min(3, 'Enter the M-Pesa or bank reference.').max(80),
    payerPhone: z.string().trim().max(40).optional(),
    note: z.string().trim().max(500).optional(),
  }), req.body || {});
  const request = createPaymentRequest({ tenant, user: req.user, ...data });
  audit({
    tenantId: tenant.id, actor: req.user, action: 'payment.submitted', target: request.id,
    meta: { method: data.method, amount_cents: request.amount_cents }, ip: req.ip,
  });
  res.status(201).json({
    request,
    message: 'Payment submitted. It appears as pending until the platform owner verifies it — nothing is marked paid automatically.',
  });
});

export default router;
