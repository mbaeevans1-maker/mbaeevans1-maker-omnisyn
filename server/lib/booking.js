import { all, get, run, tx, notify } from '../db.js';
import {
  newId, nowIso, localParts, localToUtc, addDaysToIsoDate, formatMinutes, conflict, badRequest,
} from './util.js';

const BLOCKING_STATUSES = ['pending', 'confirmed', 'completed'];

export const DEFAULT_BOOKING_RULES = {
  slotIntervalMin: 15,
  leadTimeMin: 60,
  maxAdvanceDays: 45,
  bufferMin: 0,
  allowStaffChoice: true,
  requireDeposit: false,
};

export function bookingRules(tenant) {
  let parsed = {};
  try { parsed = JSON.parse(tenant?.booking_rules || '{}'); } catch { parsed = {}; }
  return { ...DEFAULT_BOOKING_RULES, ...parsed };
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

export function eligibleStaff(tenantId, serviceId) {
  const staff = all(`SELECT * FROM staff WHERE tenant_id = ? AND active = 1 ORDER BY name`, [tenantId]);
  const links = all(`SELECT staff_id FROM staff_services WHERE service_id = ?`, [serviceId]).map((r) => r.staff_id);
  if (!links.length) return staff;
  return staff.filter((s) => links.includes(s.id));
}

export function serviceById(tenantId, serviceId) {
  return get(`SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1`, [serviceId, tenantId]);
}

/**
 * Real availability: staff schedules, service duration, buffers, breaks,
 * time off, blocked periods and existing appointments (double-booking safe).
 */
export function availabilityForDate({ tenant, service, dateStr, staffId = null, excludeAppointmentId = null }) {
  if (!service) throw badRequest('Select a service to view availability.');
  const tz = tenant.timezone || 'Africa/Nairobi';
  const rules = bookingRules(tenant);
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) throw badRequest('Invalid date.');

  const noon = localToUtc(tz, y, m, d, 12 * 60);
  const weekday = localParts(tz, noon).weekday;
  const staffList = eligibleStaff(tenant.id, service.id).filter((s) => !staffId || s.id === staffId);

  const now = Date.now();
  const earliest = now + rules.leadTimeMin * 60000;
  const horizon = now + rules.maxAdvanceDays * 864e5;

  const slots = [];
  for (const staff of staffList) {
    const scheduleRows = all(`SELECT * FROM schedules WHERE staff_id = ? AND weekday = ?`, [staff.id, weekday]);
    if (!scheduleRows.length) continue;

    const dayStart = localToUtc(tz, y, m, d, 0).toISOString();
    const dayEnd = localToUtc(tz, y, m, d + 1, 0).toISOString();

    const booked = all(
      `SELECT start_at, end_at FROM appointments
        WHERE tenant_id = ? AND staff_id = ? AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
          AND start_at < ? AND end_at > ? ${excludeAppointmentId ? 'AND id != ?' : ''}`,
      [tenant.id, staff.id, ...BLOCKING_STATUSES, dayEnd, dayStart, ...(excludeAppointmentId ? [excludeAppointmentId] : [])],
    ).map((r) => ({ start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime() }));

    const offBlocks = all(
      `SELECT start_at, end_at FROM time_off WHERE staff_id = ? AND start_at < ? AND end_at > ?`,
      [staff.id, dayEnd, dayStart],
    ).map((r) => ({ start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime() }));

    const blocked = all(
      `SELECT start_at, end_at FROM blocked_periods
        WHERE tenant_id = ? AND (staff_id IS NULL OR staff_id = ?) AND start_at < ? AND end_at > ?`,
      [tenant.id, staff.id, dayEnd, dayStart],
    ).map((r) => ({ start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime() }));

    const busy = [...booked, ...offBlocks, ...blocked];
    const duration = service.duration_min;
    const buffer = Math.max(service.buffer_min || 0, rules.bufferMin || 0);
    const step = Math.max(5, rules.slotIntervalMin || 15);

    for (const row of scheduleRows) {
      for (let minute = row.start_min; minute + duration <= row.end_min; minute += step) {
        const startAt = localToUtc(tz, y, m, d, minute);
        const endAt = new Date(startAt.getTime() + duration * 60000);
        const startMs = startAt.getTime();
        const endMs = endAt.getTime() + buffer * 60000;

        if (startMs < earliest || startMs > horizon) continue;
        if (row.break_start != null && row.break_end != null) {
          const bs = localToUtc(tz, y, m, d, row.break_start).getTime();
          const be = localToUtc(tz, y, m, d, row.break_end).getTime();
          if (overlaps(startMs, endMs, bs, be)) continue;
        }
        if (busy.some((b) => overlaps(startMs, endMs, b.start, b.end))) continue;

        slots.push({
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          localTime: formatMinutes(minute),
          staffId: staff.id,
          staffName: staff.name,
          staffTitle: staff.title || null,
        });
      }
    }
  }

  slots.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return { date: dateStr, timezone: tz, durationMin: service.duration_min, slots };
}

export function upcomingDaysWithAvailability({ tenant, service, staffId = null, days = 7, fromDate = null }) {
  const tz = tenant.timezone || 'Africa/Nairobi';
  const startDate = fromDate || localParts(tz, new Date()).date;
  const out = [];
  for (let i = 0; i < days; i += 1) {
    const dateStr = addDaysToIsoDate(startDate, i);
    try {
      const result = availabilityForDate({ tenant, service, dateStr, staffId });
      if (result.slots.length) out.push({ date: dateStr, slots: result.slots.slice(0, 8) });
    } catch { /* skip invalid days */ }
  }
  return out;
}

export function assertSlotFree({ tenantId, staffId, startAt, endAt, excludeAppointmentId = null }) {
  const clash = get(
    `SELECT id, start_at, end_at FROM appointments
      WHERE tenant_id = ? AND staff_id = ? AND status IN (${BLOCKING_STATUSES.map(() => '?').join(',')})
        AND start_at < ? AND end_at > ? ${excludeAppointmentId ? 'AND id != ?' : ''}
      LIMIT 1`,
    [tenantId, staffId, ...BLOCKING_STATUSES, endAt, startAt, ...(excludeAppointmentId ? [excludeAppointmentId] : [])],
  );
  if (clash) throw conflict('That time was just taken. Please choose another slot.', { conflictingAppointment: clash.id });
  const off = get(
    `SELECT id FROM time_off WHERE staff_id = ? AND start_at < ? AND end_at > ? LIMIT 1`,
    [staffId, endAt, startAt],
  );
  if (off) throw conflict('The staff member is unavailable at that time.');
  const blocked = get(
    `SELECT id FROM blocked_periods WHERE tenant_id = ? AND (staff_id IS NULL OR staff_id = ?) AND start_at < ? AND end_at > ? LIMIT 1`,
    [tenantId, staffId, endAt, startAt],
  );
  if (blocked) throw conflict('That period is blocked for this business.');
}

export function findOrCreateCustomer({ tenantId, name, email, phone, source = 'dashboard' }) {
  const cleanName = String(name || '').trim();
  if (!cleanName) throw badRequest('Customer name is required.');
  let customer = null;
  if (phone) customer = get(`SELECT * FROM customers WHERE tenant_id = ? AND phone = ?`, [tenantId, phone.trim()]);
  if (!customer && email) customer = get(`SELECT * FROM customers WHERE tenant_id = ? AND lower(email) = ?`, [tenantId, String(email).trim().toLowerCase()]);
  if (customer) {
    run(
      `UPDATE customers SET name = COALESCE(NULLIF(?,''), name), email = COALESCE(NULLIF(?,''), email), updated_at = ? WHERE id = ?`,
      [cleanName, email || '', nowIso(), customer.id],
    );
    return get(`SELECT * FROM customers WHERE id = ?`, [customer.id]);
  }
  const id = newId('cus_');
  run(
    `INSERT INTO customers (id, tenant_id, name, email, phone, marketing_consent, source, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, tenantId, cleanName, email || null, phone || null, 0, source, nowIso(), nowIso()],
  );
  return get(`SELECT * FROM customers WHERE id = ?`, [id]);
}

export function createAppointment({
  tenant, serviceId, staffId, startAt, customer, notes = null, source = 'dashboard', createdBy = null, actor = null, skipValidation = false,
}) {
  const service = serviceById(tenant.id, serviceId);
  if (!service) throw badRequest('Select a valid service.');
  const staff = get(`SELECT * FROM staff WHERE id = ? AND tenant_id = ? AND active = 1`, [staffId, tenant.id]);
  if (!staff) throw badRequest('Select a valid staff member.');
  const start = new Date(startAt);
  if (Number.isNaN(start.getTime())) throw badRequest('Invalid appointment start time.');
  if (start.getTime() < Date.now() - 60000 && !skipValidation) throw badRequest('Appointments cannot be created in the past.');
  const end = new Date(start.getTime() + service.duration_min * 60000);

  const appointment = tx(() => {
    assertSlotFree({ tenantId: tenant.id, staffId, startAt: start.toISOString(), endAt: end.toISOString() });
    const resolvedCustomer = customer?.id
      ? get(`SELECT * FROM customers WHERE id = ? AND tenant_id = ?`, [customer.id, tenant.id])
      : findOrCreateCustomer({ tenantId: tenant.id, name: customer?.name, email: customer?.email, phone: customer?.phone, source });
    if (!resolvedCustomer) throw badRequest('Customer is required.');

    const id = newId('apt_');
    run(
      `INSERT INTO appointments (id, tenant_id, customer_id, staff_id, service_id, start_at, end_at, status, source, price_cents, currency, notes, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, tenant.id, resolvedCustomer.id, staffId, serviceId, start.toISOString(), end.toISOString(), 'confirmed', source, service.price_cents, tenant.currency || 'KES', notes, createdBy, nowIso(), nowIso()],
    );
    run(`UPDATE customers SET visits = visits + 1, total_spent_cents = total_spent_cents + ?, last_visit_at = ?, updated_at = ? WHERE id = ?`,
      [service.price_cents, start.toISOString(), nowIso(), resolvedCustomer.id]);

    notify({
      tenantId: tenant.id,
      title: 'New appointment confirmed',
      body: `${resolvedCustomer.name} · ${service.name} · ${staff.name}`,
      level: 'success',
    });

    return get(`SELECT * FROM appointments WHERE id = ?`, [id]);
  });

  if (actor) {
    // audit handled by route layer to keep this module DB-focused
  }
  return { appointment, service, staff, customer: get(`SELECT * FROM customers WHERE id = ?`, [appointment.customer_id]) };
}

export function appointmentView(rows) {
  return rows.map((r) => ({ ...r }));
}

export function todayRange(tenant) {
  const tz = tenant.timezone || 'Africa/Nairobi';
  const parts = localParts(tz, new Date());
  return {
    date: parts.date,
    startIso: localToUtc(tz, parts.year, parts.month, parts.day, 0).toISOString(),
    endIso: localToUtc(tz, parts.year, parts.month, parts.day + 1, 0).toISOString(),
  };
}
