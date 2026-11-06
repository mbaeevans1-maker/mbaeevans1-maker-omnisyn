/**
 * Business intelligence layer.
 *
 * Every number here is derived from rows the tenant actually owns. There are no
 * synthetic baselines: an empty workspace returns zeroes with `has_data: false`
 * so the UI can show a real empty state instead of a decorative chart.
 */
import { all, get } from '../db.js';

const DAY = 86400_000;

function localBuckets(timeZone) {
  const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hour12: false });
  const dayFmt = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short' });
  return {
    hour: (iso) => Number(hourFmt.format(new Date(iso))) || 0,
    day: (iso) => dayFmt.format(new Date(iso)),
  };
}

function pct(part, whole) {
  if (!whole) return null;
  return Math.round((part / whole) * 1000) / 10;
}

function delta(current, previous) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export function insights(tenant, { days = 30 } = {}) {
  const tenantId = tenant.id;
  const range = Math.min(Math.max(Number(days) || 30, 7), 365);
  const now = Date.now();
  const since = new Date(now - range * DAY).toISOString();
  const prevSince = new Date(now - range * 2 * DAY).toISOString();

  const totals = (from, to) =>
    get(
      `SELECT COUNT(*) AS bookings,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN price_cents ELSE 0 END),0) AS revenue_cents,
              COALESCE(SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END),0) AS cancelled,
              COALESCE(SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END),0) AS no_show,
              COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END),0) AS completed,
              COALESCE(AVG(CASE WHEN status = 'completed' THEN price_cents END),0) AS avg_value_cents
       FROM appointments WHERE tenant_id = ? AND start_at >= ? AND start_at < ?`,
      [tenantId, from, to],
    );

  const current = totals(since, new Date(now + DAY).toISOString());
  const previous = totals(prevSince, since);

  const series = all(
    `SELECT substr(start_at, 1, 10) AS day,
            COUNT(*) AS bookings,
            COALESCE(SUM(CASE WHEN status = 'completed' THEN price_cents ELSE 0 END),0) AS revenue_cents
     FROM appointments WHERE tenant_id = ? AND start_at >= ?
     GROUP BY day ORDER BY day`,
    [tenantId, since],
  );

  const byStatus = all(
    `SELECT status, COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND start_at >= ? GROUP BY status`,
    [tenantId, since],
  );

  const bySource = all(
    `SELECT source, COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND start_at >= ? GROUP BY source ORDER BY n DESC`,
    [tenantId, since],
  );

  const topServices = all(
    `SELECT s.id, s.name, COUNT(a.id) AS bookings,
            COALESCE(SUM(CASE WHEN a.status='completed' THEN a.price_cents ELSE 0 END),0) AS revenue_cents
     FROM appointments a JOIN services s ON s.id = a.service_id
     WHERE a.tenant_id = ? AND a.start_at >= ?
     GROUP BY s.id ORDER BY bookings DESC LIMIT 8`,
    [tenantId, since],
  );

  const staff = all(
    `SELECT st.id, st.name, st.color, COUNT(a.id) AS bookings,
            COALESCE(SUM(CASE WHEN a.status='completed' THEN a.price_cents ELSE 0 END),0) AS revenue_cents,
            COALESCE(SUM(CASE WHEN a.status='no_show' THEN 1 ELSE 0 END),0) AS no_shows
     FROM staff st LEFT JOIN appointments a ON a.staff_id = st.id AND a.start_at >= ?
     WHERE st.tenant_id = ? AND st.active = 1 GROUP BY st.id ORDER BY revenue_cents DESC`,
    [since, tenantId],
  );

  const customers = get(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN visits >= 2 THEN 1 ELSE 0 END),0) AS returning,
            COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END),0) AS new_customers,
            COALESCE(SUM(CASE WHEN last_visit_at IS NOT NULL AND last_visit_at < ? THEN 1 ELSE 0 END),0) AS at_risk,
            COALESCE(SUM(CASE WHEN visits = 0 THEN 1 ELSE 0 END),0) AS never_visited
     FROM customers WHERE tenant_id = ?`,
    [since, new Date(now - 60 * DAY).toISOString(), tenantId],
  );

  const upcoming = get(
    `SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND start_at >= ? AND status IN ('pending','confirmed')`,
    [tenantId, new Date(now).toISOString()],
  )?.n ?? 0;

  const ai = get(
    `SELECT COUNT(*) AS conversations,
            COALESCE(SUM(CASE WHEN status = 'needs_human' THEN 1 ELSE 0 END),0) AS handoffs
     FROM conversations WHERE tenant_id = ? AND created_at >= ?`,
    [tenantId, since],
  );

  const aiBookings = get(
    `SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND start_at >= ? AND source IN ('whatsapp','web','voice')`,
    [tenantId, since],
  )?.n ?? 0;

  const content = all(
    `SELECT status, COUNT(*) AS n FROM content_items WHERE tenant_id = ? GROUP BY status`,
    [tenantId],
  );

  const revenueSeries = all(
    `SELECT substr(start_at, 1, 7) AS month,
            COALESCE(SUM(CASE WHEN status='completed' THEN price_cents ELSE 0 END),0) AS revenue_cents,
            COUNT(*) AS bookings
     FROM appointments WHERE tenant_id = ? GROUP BY month ORDER BY month DESC LIMIT 6`,
    [tenantId],
  ).reverse();

  const buckets = localBuckets(tenant.timezone || 'Africa/Nairobi');
  const windowRows = all(
    `SELECT start_at, end_at, staff_id FROM appointments
     WHERE tenant_id = ? AND start_at >= ? AND status IN ('completed','confirmed','pending')`,
    [tenantId, since],
  );

  const hourCounts = Array.from({ length: 24 }, () => 0);
  const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  let bookedMinutes = 0;
  for (const row of windowRows) {
    hourCounts[buckets.hour(row.start_at)] += 1;
    const key = buckets.day(row.start_at);
    if (key in dayCounts) dayCounts[key] += 1;
    if (row.end_at) bookedMinutes += Math.max(0, (new Date(row.end_at) - new Date(row.start_at)) / 60000);
  }

  const peakHours = hourCounts
    .map((count, hour) => ({ hour, label: `${String(hour).padStart(2, '0')}:00`, count }))
    .filter((h) => h.count > 0);
  const peakDays = Object.entries(dayCounts).map(([day, count]) => ({ day, count }));

  const staffCount = staff.length || 1;
  const capacityMinutes = staffCount * range * 8 * 60; // 8 bookable hours per stylist per day
  const utilisation = capacityMinutes ? Math.round((bookedMinutes / capacityMinutes) * 1000) / 10 : null;

  const paidInvoices = get(
    `SELECT COALESCE(SUM(amount_cents),0) AS paid FROM invoices WHERE tenant_id = ? AND status = 'paid'`,
    [tenantId],
  )?.paid ?? 0;
  const openInvoices = get(
    `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amount FROM invoices WHERE tenant_id = ? AND status = 'open'`,
    [tenantId],
  );

  const busiestHour = peakHours.slice().sort((a, b) => b.count - a.count)[0] || null;

  return {
    range_days: range,
    has_data: (current.bookings || 0) > 0,
    kpis: {
      revenue_cents: current.revenue_cents,
      revenue_delta: delta(current.revenue_cents, previous.revenue_cents),
      bookings: current.bookings,
      bookings_delta: delta(current.bookings, previous.bookings),
      completed: current.completed,
      cancelled: current.cancelled,
      no_show: current.no_show,
      upcoming,
      avg_booking_value_cents: Math.round(current.avg_value_cents || 0),
      completion_rate: pct(current.completed, current.bookings),
      cancellation_rate: pct(current.cancelled, current.bookings),
      no_show_rate: pct(current.no_show, current.bookings),
      utilisation,
      paid_revenue_cents: paidInvoices,
      open_invoices: openInvoices?.n ?? 0,
      open_invoice_cents: openInvoices?.amount ?? 0,
    },
    customers: {
      total: customers?.total ?? 0,
      new: customers?.new_customers ?? 0,
      returning: customers?.returning ?? 0,
      at_risk: customers?.at_risk ?? 0,
      never_visited: customers?.never_visited ?? 0,
      retention_rate: pct(customers?.returning ?? 0, customers?.total ?? 0),
    },
    ai: {
      conversations: ai?.conversations ?? 0,
      handoffs: ai?.handoffs ?? 0,
      bookings_assisted: aiBookings,
      conversion_rate: pct(aiBookings, ai?.conversations ?? 0),
    },
    series,
    revenue_series: revenueSeries,
    by_status: byStatus,
    by_source: bySource,
    top_services: topServices,
    staff,
    peak_hours: peakHours,
    peak_days: peakDays,
    busiest_hour: busiestHour,
    content_by_status: content,
  };
}
