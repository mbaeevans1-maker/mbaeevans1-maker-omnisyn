import { all, get, run } from '../db.js';
import { newId, nowIso, badRequest, notConfigured } from './util.js';

export const TRIAL_DAYS = 14;

export function planView(plan) {
  if (!plan) return null;
  const safe = (v, f) => {
    try { return v ? JSON.parse(v) : f; } catch { return f; }
  };
  return {
    ...plan,
    features: safe(plan.features, []),
    limits: safe(plan.limits, {}),
  };
}

export function listPlans() {
  return all(`SELECT * FROM plans WHERE active = 1 ORDER BY sort ASC`).map(planView);
}

export function planById(id) {
  const plan = get(`SELECT * FROM plans WHERE id = ? AND active = 1`, [id]);
  if (!plan) throw badRequest('Unknown subscription plan.');
  return planView(plan);
}

/** Real payment-provider availability, derived only from platform env config. */
export function paymentProviders() {
  const env = process.env;
  return {
    paystack: Boolean(env.PAYSTACK_SECRET_KEY),
    stripe: Boolean(env.STRIPE_SECRET_KEY),
    mpesa_direct: Boolean(env.MPESA_CONSUMER_KEY && env.MPESA_CONSUMER_SECRET && env.MPESA_PASSKEY && env.MPESA_SHORTCODE),
    any: Boolean(env.PAYSTACK_SECRET_KEY || env.STRIPE_SECRET_KEY),
    required: ['PAYSTACK_SECRET_KEY'],
  };
}

export function subscriptionFor(tenantId) {
  const sub = get(
    `SELECT s.*, p.name AS plan_name, p.tagline AS plan_tagline, p.price_monthly, p.price_yearly,
            p.currency AS plan_currency, p.features AS plan_features, p.limits AS plan_limits
     FROM subscriptions s JOIN plans p ON p.id = s.plan_id
     WHERE s.tenant_id = ? ORDER BY s.created_at DESC LIMIT 1`,
    [tenantId],
  );
  if (!sub) return null;
  const plan = planView({
    id: sub.plan_id, name: sub.plan_name, tagline: sub.plan_tagline,
    price_monthly: sub.price_monthly, price_yearly: sub.price_yearly,
    currency: sub.plan_currency, features: sub.plan_features, limits: sub.plan_limits,
  });
  const trialEnds = sub.trial_ends_at ? new Date(sub.trial_ends_at).getTime() : null;
  const daysLeft = trialEnds ? Math.max(0, Math.ceil((trialEnds - Date.now()) / 86_400_000)) : 0;
  return {
    id: sub.id,
    plan_id: sub.plan_id,
    plan,
    status: sub.status,
    trial_ends_at: sub.trial_ends_at,
    trial_days_left: daysLeft,
    trialing: sub.status === 'trialing' && daysLeft > 0,
    current_period_start: sub.current_period_start,
    current_period_end: sub.current_period_end,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    provider: sub.provider,
    provider_ref: sub.provider_ref,
  };
}

const MONTH_START = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};

/** Real usage numbers, always derived from stored rows. */
export function usageFor(tenantId) {
  const monthStart = MONTH_START();
  const scalar = (sql, params = [tenantId]) => get(sql, params)?.n ?? 0;
  return {
    staff: scalar(`SELECT COUNT(*) AS n FROM staff WHERE tenant_id = ? AND active = 1`),
    services: scalar(`SELECT COUNT(*) AS n FROM services WHERE tenant_id = ? AND active = 1`),
    bookings_this_month: scalar(`SELECT COUNT(*) AS n FROM appointments WHERE tenant_id = ? AND created_at >= ?`, [tenantId, monthStart]),
    ai_conversations_this_month: scalar(`SELECT COUNT(*) AS n FROM conversations WHERE tenant_id = ? AND created_at >= ?`, [tenantId, monthStart]),
    customers: scalar(`SELECT COUNT(*) AS n FROM customers WHERE tenant_id = ?`),
    social_channels: scalar(`SELECT COUNT(*) AS n FROM integrations WHERE tenant_id = ? AND status = 'connected' AND provider IN ('instagram','facebook','tiktok','x')`),
    locations: 1,
    content_published: scalar(`SELECT COUNT(*) AS n FROM content_items WHERE tenant_id = ? AND status = 'published'`),
    team_members: scalar(`SELECT COUNT(*) AS n FROM users WHERE tenant_id = ? AND status = 'active'`),
  };
}

const LIMIT_LABELS = {
  staff: 'Team members',
  staff_seats: 'Team members',
  team_members: 'Team members',
  bookings_per_month: 'Bookings per month',
  ai_conversations: 'AI conversations per month',
  channels: 'Social channels',
  social_accounts: 'Social channels',
  locations: 'Locations',
  services: 'Services',
};

const LIMIT_USAGE_KEY = {
  staff: 'staff',
  staff_seats: 'staff',
  team_members: 'team_members',
  bookings_per_month: 'bookings_this_month',
  ai_conversations: 'ai_conversations_this_month',
  channels: 'social_channels',
  social_accounts: 'social_channels',
  locations: 'locations',
  services: 'services',
};

export function limitStates(limits, usage) {
  return Object.entries(limits || {}).map(([key, value]) => {
    const used = usage[LIMIT_USAGE_KEY[key]] ?? 0;
    const unlimited = value === null || value === 0 || value === 'unlimited';
    const percent = unlimited || !value ? 0 : Math.min(100, Math.round((used / Number(value)) * 100));
    return {
      key,
      label: LIMIT_LABELS[key] || key.replace(/_/g, ' '),
      used,
      limit: unlimited ? null : Number(value),
      percent,
      state: unlimited ? 'unlimited' : used >= Number(value) ? 'at_limit' : percent >= 80 ? 'near_limit' : 'ok',
    };
  });
}

export function billingSummary(tenantId) {
  const subscription = subscriptionFor(tenantId);
  const usage = usageFor(tenantId);
  const invoices = all(`SELECT * FROM invoices WHERE tenant_id = ? ORDER BY issued_at DESC LIMIT 24`, [tenantId]);
  const openInvoice = invoices.find((i) => i.status === 'open') || null;
  return {
    subscription,
    plans: listPlans(),
    usage,
    limits: limitStates(subscription?.plan?.limits, usage),
    invoices,
    open_invoice: openInvoice,
    payments: paymentProviders(),
    trial_days: TRIAL_DAYS,
  };
}

function siteBase() {
  return (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

/**
 * Creates a real checkout with the configured provider and returns its hosted
 * payment URL. Throws a configuration_required error when no provider exists —
 * MAVYRON never simulates a successful payment.
 */
export async function initializeCheckout({ tenant, plan, interval = 'monthly', email, purpose = 'subscription' }) {
  const providers = paymentProviders();
  const amount = interval === 'yearly' ? plan.price_yearly : plan.price_monthly;
  if (!amount || amount <= 0) throw badRequest('This plan has no payable amount.');
  if (!providers.any) {
    throw notConfigured(
      'Subscription checkout requires a payment provider to be configured for this platform. No payment has been taken.',
      { required: ['PAYSTACK_SECRET_KEY'] },
    );
  }

  const reference = `MVY-${Date.now().toString(36).toUpperCase()}-${newId('').slice(0, 6).toUpperCase()}`;
  const base = siteBase();
  const callbackUrl = `${base}/app/billing?reference=${encodeURIComponent(reference)}`;
  const now = nowIso();

  if (providers.paystack) {
    const res = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount,
        currency: plan.currency || 'KES',
        reference,
        callback_url: callbackUrl,
        metadata: {
          tenant_id: tenant.id,
          tenant_slug: tenant.slug,
          plan_id: plan.id,
          interval,
          purpose,
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.status) {
      throw badRequest(`Payment provider rejected the checkout: ${data?.message || res.status}`);
    }
    run(
      `INSERT INTO invoices (id, tenant_id, amount_cents, currency, status, description, provider, provider_ref, issued_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [newId('inv_'), tenant.id, amount, plan.currency || 'KES', 'open',
        `${plan.name} — ${interval === 'yearly' ? 'annual' : 'monthly'} subscription`, 'paystack', reference, now],
    );
    return {
      provider: 'paystack',
      reference,
      url: data.data.authorization_url,
      access_code: data.data.access_code,
      amount,
      currency: plan.currency || 'KES',
    };
  }

  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', callbackUrl);
  params.set('cancel_url', `${base}/pricing?checkout=cancelled`);
  params.set('client_reference_id', tenant.id);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', (plan.currency || 'KES').toLowerCase());
  params.set('line_items[0][price_data][unit_amount]', String(amount));
  params.set('line_items[0][price_data][product_data][name]', `MAVYRON ${plan.name}`);
  params.set('metadata[reference]', reference);
  params.set('metadata[plan_id]', plan.id);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.url) {
    throw badRequest(`Payment provider rejected the checkout: ${data?.error?.message || res.status}`);
  }
  run(
    `INSERT INTO invoices (id, tenant_id, amount_cents, currency, status, description, provider, provider_ref, issued_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [newId('inv_'), tenant.id, amount, plan.currency || 'KES', 'open',
      `${plan.name} — ${interval === 'yearly' ? 'annual' : 'monthly'} subscription`, 'stripe', reference, now],
  );
  return { provider: 'stripe', reference, url: data.url, amount, currency: plan.currency || 'KES' };
}

export async function verifyPaystackPayment(reference) {
  if (!process.env.PAYSTACK_SECRET_KEY) return { verified: false, reason: 'Paystack is not configured.' };
  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const data = await res.json().catch(() => ({}));
  const ok = Boolean(res.ok && data?.status && data?.data?.status === 'success');
  return {
    verified: ok,
    reason: ok ? null : data?.data?.gateway_response || data?.message || 'Payment not verified.',
    amount: data?.data?.amount ?? null,
    currency: data?.data?.currency ?? null,
    metadata: data?.data?.metadata ?? null,
  };
}

/** Marks an invoice paid and activates the subscription it belongs to. */
export function settleInvoice({ tenantId, reference, provider }) {
  const invoice = get(`SELECT * FROM invoices WHERE tenant_id = ? AND provider_ref = ?`, [tenantId, reference]);
  if (!invoice) return { settled: false, reason: 'Invoice not found for this reference.' };
  if (invoice.status === 'paid') return { settled: true, already: true, invoice };
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 86_400_000);
  run(`UPDATE invoices SET status = 'paid', paid_at = ? WHERE id = ?`, [now.toISOString(), invoice.id]);
  const sub = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenantId]);
  if (sub) {
    run(
      `UPDATE subscriptions SET status = 'active', current_period_start = ?, current_period_end = ?,
        cancel_at_period_end = 0, provider = ?, provider_ref = ?, updated_at = ? WHERE id = ?`,
      [now.toISOString(), periodEnd.toISOString(), provider, reference, now.toISOString(), sub.id],
    );
  }
  return { settled: true, invoice, subscription_id: sub?.id || null };
}
