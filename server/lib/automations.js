/**
 * MAVYRON automation engine.
 *
 * Automations are per-tenant database rows (not hard-coded behaviour): a business
 * owner can rename, retune, disable or re-word each workflow from the dashboard.
 *
 * Dispatch is honest by design. A message is only marked `sent` when a real
 * provider accepted it. Otherwise it is queued in the outbox with a ready-to-use
 * WhatsApp deep link, so staff can send it in one tap while credentials are
 * pending. Nothing is ever reported as delivered when it was not.
 */
import { all, get, run, audit } from '../db.js';
import { newId, nowIso } from './util.js';
import { sendWhatsAppMessage } from './integrations.js';

export const TRIGGERS = {
  'appointment.created': 'Appointment created',
  'appointment.reminder': 'Before appointment (reminder)',
  'appointment.cancelled': 'Appointment cancelled',
  'appointment.rescheduled': 'Appointment rescheduled',
  'appointment.completed': 'Appointment completed',
  'customer.created': 'New customer added',
  'customer.inactive': 'Customer gone quiet',
};

export const AUTOMATION_DEFS = [
  {
    key: 'booking_confirmation',
    name: 'Booking confirmation',
    description: 'Sent the moment a booking is confirmed, with the date, service and stylist.',
    trigger: 'appointment.created',
    audience: 'customer',
    delay_minutes: 0,
    template:
      'Hi {{customer_name}}, your {{service_name}} with {{staff_name}} at {{business_name}} is confirmed for {{when}}. Reply here to reschedule or cancel.',
  },
  {
    key: 'booking_reminder',
    name: '24-hour reminder',
    description: 'Reduces no-shows. Fires automatically 24 hours before the appointment.',
    trigger: 'appointment.reminder',
    audience: 'customer',
    delay_minutes: -1440,
    template:
      'Reminder from {{business_name}}: {{service_name}} on {{when}} with {{staff_name}}. Reply here if you need to move it.',
  },
  {
    key: 'booking_cancelled',
    name: 'Cancellation follow-up',
    description: 'Acknowledges a cancellation and invites the customer to rebook.',
    trigger: 'appointment.cancelled',
    audience: 'customer',
    delay_minutes: 0,
    template:
      'Hi {{customer_name}}, your {{service_name}} on {{when}} has been cancelled. Book again any time: {{booking_link}}',
  },
  {
    key: 'booking_rescheduled',
    name: 'Reschedule confirmation',
    description: 'Confirms the new time after an appointment is moved.',
    trigger: 'appointment.rescheduled',
    audience: 'customer',
    delay_minutes: 0,
    template:
      'Hi {{customer_name}}, your {{service_name}} has moved to {{when}} with {{staff_name}}. See you then.',
  },
  {
    key: 'review_request',
    name: 'Review request',
    description: 'Asks for a rating after a completed visit. Reviews land in your dashboard for approval.',
    trigger: 'appointment.completed',
    audience: 'customer',
    delay_minutes: 120,
    template:
      'Thank you for visiting {{business_name}}, {{customer_name}}. How was your {{service_name}}? Leave a quick review: {{review_link}}',
  },
  {
    key: 'welcome_customer',
    name: 'Welcome message',
    description: 'Greets a first-time customer and opens the door to booking.',
    trigger: 'customer.created',
    audience: 'customer',
    delay_minutes: 0,
    template:
      'Welcome to {{business_name}}, {{customer_name}}. We are at {{business_address}}. Book any time: {{booking_link}}',
  },
  {
    key: 'reengagement',
    name: 'Win-back campaign',
    description: 'Reaches customers who have not visited for 30 days.',
    trigger: 'customer.inactive',
    audience: 'customer',
    delay_minutes: 43200,
    template:
      'We have missed you at {{business_name}}, {{customer_name}}. Your next {{business_name}} visit is one message away: {{booking_link}}',
  },
  {
    key: 'business_new_booking',
    name: 'Staff booking alert',
    description: 'Alerts the business WhatsApp when a new booking lands.',
    trigger: 'appointment.created',
    audience: 'business',
    delay_minutes: 0,
    template:
      'New booking: {{customer_name}} — {{service_name}} with {{staff_name}} on {{when}}. Phone: {{customer_phone}}',
  },
];

const INACTIVE_DAYS = 30;

/* ------------------------------- helpers ------------------------------- */

export function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, '');
  if (!digits) return null;
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
}

export function whatsappLink(phone, body) {
  const digits = normalisePhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(body)}`;
}

export function businessPhone(tenant) {
  return tenant?.whatsapp_number || tenant?.whatsapp || tenant?.phone || null;
}

export function renderTemplate(template, vars) {
  return String(template).replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, key) => {
    const value = vars[key];
    return value === undefined || value === null || value === '' ? '—' : String(value);
  });
}

export function ensureAutomations(tenantId) {
  const existing = new Set(
    all('SELECT key FROM automations WHERE tenant_id = ?', [tenantId]).map((r) => r.key),
  );
  const now = nowIso();
  for (const def of AUTOMATION_DEFS) {
    if (existing.has(def.key)) continue;
    run(
      `INSERT INTO automations (id, tenant_id, key, name, description, trigger, audience, channel,
        delay_minutes, template, enabled, run_count, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,1,0,?,?)`,
      [
        newId('aut_'), tenantId, def.key, def.name, def.description, def.trigger,
        def.audience, 'whatsapp', def.delay_minutes, def.template, now, now,
      ],
    );
  }
}

export function automationView(row) {
  return {
    ...row,
    enabled: Boolean(row.enabled),
    trigger_label: TRIGGERS[row.trigger] || row.trigger,
  };
}

export function listAutomations(tenantId) {
  ensureAutomations(tenantId);
  return all('SELECT * FROM automations WHERE tenant_id = ? ORDER BY created_at', [tenantId])
    .map(automationView);
}

export function listOutbox(tenantId, { limit = 100, status } = {}) {
  const params = [tenantId];
  let clause = '';
  if (status && status !== 'all') {
    clause = 'AND status = ?';
    params.push(status);
  }
  return all(
    `SELECT * FROM outbox WHERE tenant_id = ? ${clause} ORDER BY created_at DESC LIMIT ?`,
    [...params, Math.min(Number(limit) || 100, 300)],
  );
}

/* ------------------------------- dispatch ------------------------------- */

export async function enqueueMessage({
  tenant,
  automationKey = null,
  channel = 'whatsapp',
  recipient,
  recipientName = null,
  body,
  relatedType = null,
  relatedId = null,
}) {
  const id = newId('out_');
  const createdAt = nowIso();
  const link = channel === 'whatsapp' ? whatsappLink(recipient, body) : null;

  let status = 'queued';
  let dispatchMode = 'manual';
  let providerRef = null;
  let error = null;

  if (channel === 'whatsapp' && recipient) {
    try {
      const result = await sendWhatsAppMessage(tenant.id, recipient, body);
      if (result?.sent) {
        status = 'sent';
        dispatchMode = 'api';
        providerRef = result.ref || null;
      } else {
        error = result?.reason || 'WhatsApp API is not connected for this business.';
      }
    } catch (err) {
      error = err?.message || 'WhatsApp dispatch failed.';
    }
  } else if (!recipient) {
    error = 'No phone number on file.';
    status = 'blocked';
  }

  run(
    `INSERT INTO outbox (id, tenant_id, automation_key, channel, recipient, recipient_name, body,
       status, dispatch_mode, provider_ref, wa_link, error, related_type, related_id, created_at, sent_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, tenant.id, automationKey, channel, recipient, recipientName, body, status, dispatchMode,
      providerRef, link, error, relatedType, relatedId, createdAt, status === 'sent' ? createdAt : null,
    ],
  );

  return get('SELECT * FROM outbox WHERE id = ?', [id]);
}

function appointmentVars(tenant, appt) {
  const when = appt?.start_at
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: tenant.timezone || 'Africa/Nairobi',
        weekday: 'short', day: 'numeric', month: 'short',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).format(new Date(appt.start_at))
    : '';
  const base = tenant.public_base_url || '';
  return {
    business_name: tenant.name,
    business_address: tenant.address || tenant.location || '',
    business_phone: businessPhone(tenant) || '',
    customer_name: appt?.customer_name || 'there',
    customer_phone: appt?.customer_phone || '',
    service_name: appt?.service_name || 'appointment',
    staff_name: appt?.staff_name || 'our team',
    when,
    booking_link: `${base}/business/${tenant.slug}`,
    review_link: `${base}/business/${tenant.slug}#review`,
  };
}

/** Fire every enabled automation matching an event. Returns the queued rows. */
export async function fireEvent({ tenant, event, appointment = null, customer = null, actor = null }) {
  ensureAutomations(tenant.id);
  const rows = all(
    'SELECT * FROM automations WHERE tenant_id = ? AND trigger = ? AND enabled = 1',
    [tenant.id, event],
  );
  if (!rows.length) return [];

  const vars = appointmentVars(tenant, appointment);
  if (customer && !appointment) {
    vars.customer_name = customer.name || 'there';
    vars.customer_phone = customer.phone || '';
  }

  const queued = [];
  for (const automation of rows) {
    const isBusiness = automation.audience === 'business';
    const recipient = isBusiness ? businessPhone(tenant) : (appointment?.customer_phone || customer?.phone || null);
    const body = renderTemplate(automation.template, vars);
    const row = await enqueueMessage({
      tenant,
      automationKey: automation.key,
      channel: automation.channel,
      recipient,
      recipientName: isBusiness ? tenant.name : (appointment?.customer_name || customer?.name || null),
      body,
      relatedType: appointment ? 'appointment' : 'customer',
      relatedId: appointment?.id || customer?.id || null,
    });
    run('UPDATE automations SET run_count = run_count + 1, last_run_at = ?, updated_at = ? WHERE id = ?', [
      nowIso(), nowIso(), automation.id,
    ]);
    queued.push(row);
  }

  if (queued.length) {
    audit({
      tenantId: tenant.id, actor, action: 'automation.dispatch', target: event,
      meta: { queued: queued.length, sent: queued.filter((q) => q.status === 'sent').length },
    });
  }
  return queued;
}

/**
 * Background sweep: reminders due in the next 24h and customers who have gone
 * quiet. Bounded per tenant so a large workspace cannot stall the loop.
 */
export async function runDueAutomations({ tenantLimit = 200, perTenantLimit = 25, tenantId = null } = {}) {
  const now = Date.now();
  const from = new Date(now + 23 * 3600_000).toISOString();
  const to = new Date(now + 25 * 3600_000).toISOString();

  const tenants = all(
    `SELECT * FROM tenants WHERE suspended_at IS NULL ${tenantId ? 'AND id = ?' : ''} ORDER BY created_at LIMIT ?`,
    tenantId ? [tenantId, tenantLimit] : [tenantLimit],
  );

  let reminders = 0;
  let winbacks = 0;

  for (const tenant of tenants) {
    const due = all(
      `SELECT a.id, a.start_at, a.customer_id, c.name AS customer_name, c.phone AS customer_phone,
              s.name AS service_name, st.name AS staff_name
       FROM appointments a
       JOIN customers c ON c.id = a.customer_id
       LEFT JOIN services s ON s.id = a.service_id
       LEFT JOIN staff st ON st.id = a.staff_id
       WHERE a.tenant_id = ? AND a.status IN ('pending','confirmed')
         AND a.start_at >= ? AND a.start_at <= ? AND a.reminder_sent_at IS NULL
       LIMIT ?`,
      [tenant.id, from, to, perTenantLimit],
    );
    for (const appt of due) {
      await fireEvent({ tenant, event: 'appointment.reminder', appointment: appt });
      run('UPDATE appointments SET reminder_sent_at = ? WHERE id = ? AND tenant_id = ?', [
        nowIso(), appt.id, tenant.id,
      ]);
      reminders += 1;
    }

    const quiet = all(
      `SELECT * FROM customers
       WHERE tenant_id = ? AND phone IS NOT NULL
         AND last_visit_at IS NOT NULL AND last_visit_at < ?
         AND (last_reengagement_at IS NULL OR last_reengagement_at < ?)
       LIMIT ?`,
      [tenant.id, new Date(now - INACTIVE_DAYS * 86400_000).toISOString(),
        new Date(now - INACTIVE_DAYS * 86400_000).toISOString(), 5],
    );
    for (const customer of quiet) {
      await fireEvent({ tenant, event: 'customer.inactive', customer });
      run('UPDATE customers SET last_reengagement_at = ? WHERE id = ? AND tenant_id = ?', [
        nowIso(), customer.id, tenant.id,
      ]);
      winbacks += 1;
    }
  }

  return { reminders, winbacks, tenants: tenants.length };
}

export function markOutboxSent(tenantId, id, actor) {
  const row = get('SELECT * FROM outbox WHERE id = ? AND tenant_id = ?', [id, tenantId]);
  if (!row) return null;
  if (row.status === 'sent') return row;
  run(`UPDATE outbox SET status = 'sent', dispatch_mode = 'manual', sent_at = ? WHERE id = ?`, [
    nowIso(), id,
  ]);
  audit({ tenantId, actor, action: 'outbox.manual_send', target: id, meta: { channel: row.channel } });
  return get('SELECT * FROM outbox WHERE id = ?', [id]);
}
