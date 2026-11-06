/**
 * Platform payments and payout configuration.
 *
 * MAVYRON separates two money flows:
 *   1. Platform revenue (subscriptions) — collected by MAVYRON.
 *   2. Tenant customer payments — collected by the business itself.
 *
 * Subscriptions can be settled by an automated provider (Paystack/Stripe) when
 * keys exist, or manually against the owner's M-Pesa / bank details. A manual
 * payment is never auto-confirmed: it waits in `awaiting_verification` until a
 * platform admin confirms the money actually arrived. No fake "paid" states.
 */
import { all, get, run, audit } from '../db.js';
import { newId, nowIso, badRequest, notFound, conflict } from './util.js';
import { planById, settleInvoice } from './billing.js';

export const SETTING_KEYS = [
  'payout_mpesa', 'payout_mpesa_name',
  'payout_bank_name', 'payout_bank_account', 'payout_account_name', 'payout_notes',
  'support_whatsapp', 'business_whatsapp', 'owner_email', 'owner_name',
  'social_instagram', 'social_facebook', 'social_tiktok',
];

export function getSetting(key, fallback = null) {
  const row = get('SELECT value FROM platform_settings WHERE key = ?', [key]);
  return row?.value ?? fallback;
}

export function setSetting(key, value) {
  if (!SETTING_KEYS.includes(key)) throw badRequest(`Unknown platform setting: ${key}`);
  run(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES (?,?,?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value ?? '', nowIso()],
  );
  return get('SELECT * FROM platform_settings WHERE key = ?', [key]);
}

export function platformSettings() {
  const rows = all('SELECT key, value, updated_at FROM platform_settings');
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return map;
}

/** Payout profile: owner-supplied, env can override for a live account. */
export function payoutProfile() {
  const s = platformSettings();
  const mpesa = process.env.PAYOUT_MPESA || s.payout_mpesa || '';
  const bankName = process.env.PAYOUT_BANK_NAME || s.payout_bank_name || '';
  const bankAccount = process.env.PAYOUT_BANK_ACCOUNT || s.payout_bank_account || '';
  return {
    mpesa: {
      number: mpesa,
      display: mpesa,
      name: process.env.PAYOUT_MPESA_NAME || s.payout_mpesa_name || '',
      configured: Boolean(mpesa),
    },
    bank: {
      bank_name: bankName,
      account_number: bankAccount,
      account_name: process.env.PAYOUT_ACCOUNT_NAME || s.payout_account_name || '',
      configured: Boolean(bankName && bankAccount),
      awaiting_details: !(bankName && bankAccount),
    },
    notes: s.payout_notes || '',
    support_whatsapp: s.support_whatsapp || '',
    business_whatsapp: s.business_whatsapp || '',
    owner_email: s.owner_email || '',
    owner_name: s.owner_name || '',
  };
}

export function paymentInstructions(plan = null, interval = 'monthly') {
  const payout = payoutProfile();
  let amount = null;
  if (plan) {
    const kes = interval === 'yearly' ? plan.price_yearly : plan.price_monthly;
    amount = { kes, cents: Number(kes) * 100, currency: plan.currency || 'KES', interval };
  }
  return {
    amount,
    methods: [
      {
        id: 'mpesa_manual',
        label: 'M-Pesa (Paybill / Send Money)',
        available: payout.mpesa.configured,
        number: payout.mpesa.number,
        account_name: payout.mpesa.name,
        instructions: payout.mpesa.configured
          ? `Send ${amount ? `${amount.currency} ${amount.kes.toLocaleString()}` : 'the plan amount'} to M-Pesa ${payout.mpesa.number}${payout.mpesa.name ? ` (${payout.mpesa.name})` : ''}, then submit the M-Pesa confirmation code below.`
          : 'Owner M-Pesa number is not configured yet.',
      },
      {
        id: 'bank_transfer',
        label: 'Bank transfer',
        available: payout.bank.configured,
        bank_name: payout.bank.bank_name,
        account_number: payout.bank.account_number,
        account_name: payout.bank.account_name,
        instructions: payout.bank.configured
          ? `Transfer to ${payout.bank.bank_name}, account ${payout.bank.account_number} (${payout.bank.account_name}), then submit the transfer reference below.`
          : 'Bank details are pending from the platform owner. M-Pesa works today; bank transfer will appear here once the account is added.',
      },
    ],
    notes: payout.notes,
    automated: {
      configured: Boolean(process.env.PAYSTACK_SECRET_KEY || process.env.STRIPE_SECRET_KEY),
      required: ['PAYSTACK_SECRET_KEY'],
    },
  };
}

export function listPaymentRequests({ tenantId = null, status = null, limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (tenantId) { clauses.push('p.tenant_id = ?'); params.push(tenantId); }
  if (status && status !== 'all') { clauses.push('p.status = ?'); params.push(status); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(
    `SELECT p.*, t.name AS tenant_name, t.slug AS tenant_slug, pl.name AS plan_name
     FROM payment_requests p
     LEFT JOIN tenants t ON t.id = p.tenant_id
     LEFT JOIN plans pl ON pl.id = p.plan_id
     ${where} ORDER BY p.created_at DESC LIMIT ?`,
    [...params, Math.min(Number(limit) || 100, 300)],
  );
}

export function createPaymentRequest({ tenant, user, planId, interval = 'monthly', method, payerReference, payerPhone, note }) {
  if (!['mpesa_manual', 'bank_transfer'].includes(method)) {
    throw badRequest('Choose M-Pesa or bank transfer.');
  }
  const instructions = paymentInstructions();
  const chosen = instructions.methods.find((m) => m.id === method);
  if (!chosen?.available) {
    throw conflict(
      method === 'bank_transfer'
        ? 'Bank details have not been added by the platform owner yet. Use M-Pesa, or contact support.'
        : 'This payment method is not configured yet.',
    );
  }
  if (!payerReference || String(payerReference).trim().length < 4) {
    throw badRequest('Enter the payment reference or M-Pesa confirmation code.');
  }

  const plan = planById(planId);
  const kes = interval === 'yearly' ? plan.price_yearly : plan.price_monthly;
  const amountCents = Number(kes) * 100;
  const now = new Date();
  const reference = `MVY-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${newId('').slice(0, 6).toUpperCase()}`;

  const invoiceId = newId('inv_');
  run(
    `INSERT INTO invoices (id, tenant_id, amount_cents, currency, status, description, provider,
       provider_ref, period_start, period_end, issued_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      invoiceId, tenant.id, amountCents, plan.currency || 'KES', 'open',
      `MAVYRON ${plan.name} — ${interval}`, 'manual', reference,
      now.toISOString(), new Date(now.getTime() + (interval === 'yearly' ? 365 : 30) * 86400_000).toISOString(),
      now.toISOString(),
    ],
  );

  const id = newId('pay_');
  run(
    `INSERT INTO payment_requests (id, tenant_id, invoice_id, plan_id, interval, amount_cents, currency,
       method, payer_reference, payer_phone, note, status, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,'awaiting_verification',?)`,
    [
      id, tenant.id, invoiceId, plan.id, interval, amountCents, plan.currency || 'KES',
      method, String(payerReference).trim(), payerPhone || null, note || null, now.toISOString(),
    ],
  );

  audit({
    tenantId: tenant.id, actor: user, action: 'payment.request', target: id,
    meta: { plan: plan.id, interval, method, amount_cents: amountCents, reference },
  });

  return {
    payment_request: get('SELECT * FROM payment_requests WHERE id = ?', [id]),
    invoice: get('SELECT * FROM invoices WHERE id = ?', [invoiceId]),
    reference,
    message: 'Payment submitted for verification. Your plan activates once the platform owner confirms the funds arrived.',
  };
}

export function verifyPaymentRequest({ requestId, admin, decision, note = null }) {
  const request = get('SELECT * FROM payment_requests WHERE id = ?', [requestId]);
  if (!request) throw notFound('Payment request not found.');
  if (request.status !== 'awaiting_verification') {
    throw conflict(`This payment is already ${request.status.replace('_', ' ')}.`);
  }
  if (!['approve', 'reject'].includes(decision)) throw badRequest('Decision must be approve or reject.');

  const invoice = get('SELECT * FROM invoices WHERE id = ?', [request.invoice_id]);
  const now = nowIso();

  if (decision === 'reject') {
    run(`UPDATE payment_requests SET status = 'rejected', verified_by = ?, verified_at = ?, note = COALESCE(?, note) WHERE id = ?`, [
      admin.id, now, note, requestId,
    ]);
    if (invoice) run(`UPDATE invoices SET status = 'void' WHERE id = ?`, [invoice.id]);
    audit({ tenantId: request.tenant_id, actor: admin, action: 'payment.reject', target: requestId, meta: { note } });
    return { status: 'rejected', settled: false };
  }

  // Approve: mark the invoice paid through the real settlement path so the
  // subscription, period and audit trail all move together.
  const settlement = settleInvoice({
    tenantId: request.tenant_id,
    reference: invoice?.provider_ref,
    provider: 'manual',
  });

  run(
    `UPDATE payment_requests SET status = 'verified', verified_by = ?, verified_at = ?, note = COALESCE(?, note) WHERE id = ?`,
    [admin.id, now, note, requestId],
  );
  audit({
    tenantId: request.tenant_id, actor: admin, action: 'payment.verify', target: requestId,
    meta: { amount_cents: request.amount_cents, settled: settlement.settled },
  });

  return { status: 'verified', settled: Boolean(settlement.settled), settlement };
}

export function paymentStats() {
  return {
    awaiting: get(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amount FROM payment_requests WHERE status = 'awaiting_verification'`),
    verified_30d: get(
      `SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amount FROM payment_requests
       WHERE status = 'verified' AND verified_at >= ?`,
      [new Date(Date.now() - 30 * 86400_000).toISOString()],
    ),
    open_invoices: get(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amount FROM invoices WHERE status = 'open'`),
    paid_invoices: get(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents),0) AS amount FROM invoices WHERE status = 'paid'`),
  };
}
