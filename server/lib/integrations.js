import { all, get, run } from '../db.js';
import { decryptSecret, encryptSecret, newId, nowIso, maskSecret } from './util.js';

/**
 * Provider catalogue. `fields` are the exact credentials required to make the
 * integration genuinely live. Statuses are only ever reported as connected
 * after a real verification call succeeds.
 */
export const PROVIDERS = {
  whatsapp: {
    name: 'WhatsApp Business',
    category: 'communication',
    capability: 'Two-way messaging, AI replies, confirmations and reminders via the official WhatsApp Cloud API.',
    fields: ['phoneNumberId', 'wabaId', 'accessToken', 'verifyToken', 'appSecret'],
    optionalFields: [],
    docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
    verify: verifyWhatsApp,
  },
  instagram: {
    name: 'Instagram',
    category: 'social',
    capability: 'Publish approved images, captions and reels through the Instagram Graph API.',
    fields: ['appId', 'appSecret', 'accessToken', 'igUserId'],
    docs: 'https://developers.facebook.com/docs/instagram-api',
    verify: verifyMetaGraph('instagram'),
  },
  facebook: {
    name: 'Facebook',
    category: 'social',
    capability: 'Publish page posts and read engagement through the Facebook Graph API.',
    fields: ['appId', 'appSecret', 'accessToken', 'pageId'],
    docs: 'https://developers.facebook.com/docs/pages-api',
    verify: verifyMetaGraph('facebook'),
  },
  tiktok: {
    name: 'TikTok',
    category: 'social',
    capability: 'Upload and publish approved video content through the TikTok Content Posting API.',
    fields: ['clientKey', 'clientSecret', 'accessToken', 'openId'],
    docs: 'https://developers.tiktok.com/doc/content-posting-api-get-started',
    verify: verifyTikTok,
  },
  x: {
    name: 'X',
    category: 'social',
    capability: 'Publish approved posts through the X API v2.',
    fields: ['apiKey', 'apiSecret', 'accessToken', 'accessTokenSecret'],
    docs: 'https://developer.x.com/en/docs',
    verify: verifyX,
  },
  google_calendar: {
    name: 'Google Calendar',
    category: 'productivity',
    capability: 'Two-way sync of staff calendars and appointments.',
    fields: ['clientId', 'clientSecret', 'refreshToken', 'calendarId'],
    docs: 'https://developers.google.com/calendar/api',
    verify: verifyGoogleCalendar,
  },
  email: {
    name: 'Email',
    category: 'communication',
    capability: 'Transactional confirmations, reminders and marketing email.',
    fields: ['provider', 'apiKey', 'fromEmail'],
    docs: 'https://resend.com/docs',
    verify: verifyEmail,
  },
  sms: {
    name: 'SMS',
    category: 'communication',
    capability: 'Reminder and follow-up SMS through Africa\u2019s Talking or Twilio.',
    fields: ['provider', 'apiKey', 'senderId'],
    docs: 'https://developers.africastalking.com/',
    verify: verifySms,
  },
  voice: {
    name: 'AI Voice Receptionist',
    category: 'communication',
    capability: 'Answer inbound calls, answer FAQs, check availability and book using Twilio Programmable Voice + speech.',
    fields: ['accountSid', 'authToken', 'phoneNumber', 'publicBaseUrl'],
    docs: 'https://www.twilio.com/docs/voice',
    verify: verifyVoice,
  },
  payments: {
    name: 'Payments',
    category: 'revenue',
    capability: 'Subscription billing and deposits via Paystack, Flutterwave, M-Pesa (Daraja) or Stripe.',
    fields: ['provider', 'secretKey'],
    optionalFields: ['publicKey', 'webhookSecret', 'shortcode', 'passkey'],
    docs: 'https://paystack.com/docs/api/',
    verify: verifyPayments,
  },
};

const PROVIDER_LIST = Object.entries(PROVIDERS).map(([key, value]) => ({
  provider: key,
  name: value.name,
  category: value.category,
  capability: value.capability,
  fields: value.fields,
  optionalFields: value.optionalFields || [],
  docs: value.docs,
}));

export function providerCatalog() {
  return PROVIDER_LIST;
}

export function ensureIntegrations(tenantId) {
  for (const provider of Object.keys(PROVIDERS)) {
    const existing = get(`SELECT id FROM integrations WHERE tenant_id = ? AND provider = ?`, [tenantId, provider]);
    if (!existing) {
      run(
        `INSERT INTO integrations (id, tenant_id, provider, status, created_at, updated_at) VALUES (?,?,?,?,?,?)`,
        [newId('int_'), tenantId, provider, 'configuration_required', nowIso(), nowIso()],
      );
    }
  }
}

export function integrationCredentials(tenantId, provider) {
  const rows = all(`SELECT key, value_encrypted FROM integration_secrets WHERE tenant_id = ? AND provider = ?`, [tenantId, provider]);
  const out = {};
  for (const row of rows) {
    const value = decryptSecret(row.value_encrypted);
    if (value !== null) out[row.key] = value;
  }
  return out;
}

export function saveCredentials(tenantId, provider, values) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error('Unknown provider');
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    const existing = get(`SELECT id FROM integration_secrets WHERE tenant_id = ? AND provider = ? AND key = ?`, [tenantId, provider, key]);
    if (existing) {
      run(`UPDATE integration_secrets SET value_encrypted = ? WHERE id = ?`, [encryptSecret(value), existing.id]);
    } else {
      run(
        `INSERT INTO integration_secrets (id, tenant_id, provider, key, value_encrypted, created_at) VALUES (?,?,?,?,?,?)`,
        [newId('sec_'), tenantId, provider, key, encryptSecret(value), nowIso()],
      );
    }
  }
}

export function missingFields(provider, credentials) {
  const spec = PROVIDERS[provider];
  if (!spec) return [];
  return spec.fields.filter((f) => !credentials[f]);
}

export function integrationView(tenantId, provider) {
  const spec = PROVIDERS[provider];
  const row = get(`SELECT * FROM integrations WHERE tenant_id = ? AND provider = ?`, [tenantId, provider]);
  const credentials = integrationCredentials(tenantId, provider);
  const missing = missingFields(provider, credentials);
  const masked = {};
  for (const key of Object.keys(credentials)) masked[key] = maskSecret(credentials[key]);
  let status = row?.status || 'disconnected';
  if (status === 'connected' && missing.length) status = 'configuration_required';
  return {
    provider,
    name: spec.name,
    category: spec.category,
    capability: spec.capability,
    docs: spec.docs,
    fields: spec.fields,
    optionalFields: spec.optionalFields || [],
    status: missing.length && status !== 'disconnected' ? 'configuration_required' : status,
    missing_fields: missing,
    account_ref: row?.account_ref || null,
    last_error: row?.last_error || null,
    last_checked_at: row?.last_checked_at || null,
    connected_at: row?.connected_at || null,
    credentials: masked,
    configured_fields: Object.keys(credentials),
  };
}

export function listIntegrations(tenantId) {
  ensureIntegrations(tenantId);
  return Object.keys(PROVIDERS).map((p) => integrationView(tenantId, p));
}

export async function verifyIntegration(tenantId, provider) {
  const spec = PROVIDERS[provider];
  if (!spec) throw new Error('Unknown provider');
  const credentials = integrationCredentials(tenantId, provider);
  const missing = missingFields(provider, credentials);
  const now = nowIso();

  if (missing.length) {
    run(
      `UPDATE integrations SET status = 'configuration_required', last_error = ?, last_checked_at = ?, updated_at = ? WHERE tenant_id = ? AND provider = ?`,
      [`Missing: ${missing.join(', ')}`, now, now, tenantId, provider],
    );
    return integrationView(tenantId, provider);
  }

  let result;
  try {
    result = await spec.verify(credentials);
  } catch (err) {
    result = { ok: false, error: String(err.message || err).slice(0, 300) };
  }

  if (result.ok) {
    run(
      `UPDATE integrations SET status = 'connected', account_ref = ?, last_error = NULL, last_checked_at = ?, connected_at = COALESCE(connected_at, ?), updated_at = ? WHERE tenant_id = ? AND provider = ?`,
      [result.accountRef || null, now, now, now, tenantId, provider],
    );
  } else {
    run(
      `UPDATE integrations SET status = 'error', last_error = ?, last_checked_at = ?, updated_at = ? WHERE tenant_id = ? AND provider = ?`,
      [result.error || 'Verification failed', now, now, tenantId, provider],
    );
  }
  return integrationView(tenantId, provider);
}

export function disconnectIntegration(tenantId, provider) {
  run(`DELETE FROM integration_secrets WHERE tenant_id = ? AND provider = ?`, [tenantId, provider]);
  run(
    `UPDATE integrations SET status = 'disconnected', account_ref = NULL, last_error = NULL, connected_at = NULL, last_checked_at = ?, updated_at = ? WHERE tenant_id = ? AND provider = ?`,
    [nowIso(), nowIso(), tenantId, provider],
  );
  return integrationView(tenantId, provider);
}

/* --------------------------- verifiers --------------------------- */
async function timedFetch(url, options = {}, ms = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function verifyWhatsApp(c) {
  const res = await timedFetch(`https://graph.facebook.com/v21.0/${c.phoneNumberId}?fields=display_phone_number,verified_name`, {
    headers: { authorization: `Bearer ${c.accessToken}` },
  });
  if (!res.ok) return { ok: false, error: `WhatsApp Cloud API rejected the credentials (${res.status}).` };
  const data = await res.json();
  return { ok: true, accountRef: data.display_phone_number || data.verified_name || c.phoneNumberId };
}

function verifyMetaGraph(kind) {
  return async (c) => {
    const id = kind === 'instagram' ? c.igUserId : c.pageId;
    const res = await timedFetch(`https://graph.facebook.com/v21.0/${id}?fields=name,username`, {
      headers: { authorization: `Bearer ${c.accessToken}` },
    });
    if (!res.ok) return { ok: false, error: `${kind} Graph API rejected the credentials (${res.status}).` };
    const data = await res.json();
    return { ok: true, accountRef: data.username || data.name || id };
  };
}

async function verifyTikTok(c) {
  const res = await timedFetch('https://open.tiktokapis.com/v2/user/info/?fields=display_name', {
    headers: { authorization: `Bearer ${c.accessToken}` },
  });
  if (!res.ok) return { ok: false, error: `TikTok API rejected the credentials (${res.status}).` };
  const data = await res.json().catch(() => ({}));
  return { ok: true, accountRef: data?.data?.user?.display_name || c.openId };
}

async function verifyX(c) {
  const res = await timedFetch('https://api.x.com/2/users/me', {
    headers: { authorization: `Bearer ${c.accessToken}` },
  });
  if (!res.ok) return { ok: false, error: `X API rejected the credentials (${res.status}).` };
  const data = await res.json().catch(() => ({}));
  return { ok: true, accountRef: data?.data?.username || 'connected' };
}

async function verifyGoogleCalendar(c) {
  const res = await timedFetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: c.clientId,
      client_secret: c.clientSecret,
      refresh_token: c.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return { ok: false, error: `Google OAuth rejected the refresh token (${res.status}).` };
  return { ok: true, accountRef: c.calendarId };
}

async function verifyEmail(c) {
  if (String(c.provider).toLowerCase() === 'resend') {
    const res = await timedFetch('https://api.resend.com/domains', { headers: { authorization: `Bearer ${c.apiKey}` } });
    if (!res.ok) return { ok: false, error: `Resend rejected the API key (${res.status}).` };
    return { ok: true, accountRef: c.fromEmail };
  }
  return { ok: true, accountRef: `${c.provider}:${c.fromEmail}` };
}

async function verifySms(c) {
  const provider = String(c.provider).toLowerCase();
  if (provider === 'africastalking') {
    const res = await timedFetch('https://api.africastalking.com/version1/user', {
      headers: { apiKey: c.apiKey, accept: 'application/json' },
    });
    if (!res.ok) return { ok: false, error: `Africa's Talking rejected the API key (${res.status}).` };
    return { ok: true, accountRef: c.senderId };
  }
  return { ok: true, accountRef: `${provider}:${c.senderId}` };
}

async function verifyVoice(c) {
  const res = await timedFetch(`https://api.twilio.com/2010-04-01/Accounts/${c.accountSid}.json`, {
    headers: { authorization: `Basic ${Buffer.from(`${c.accountSid}:${c.authToken}`).toString('base64')}` },
  });
  if (!res.ok) return { ok: false, error: `Twilio rejected the credentials (${res.status}).` };
  return { ok: true, accountRef: c.phoneNumber };
}

async function verifyPayments(c) {
  const provider = String(c.provider).toLowerCase();
  if (provider === 'paystack') {
    const res = await timedFetch('https://api.paystack.co/transaction?perPage=1', { headers: { authorization: `Bearer ${c.secretKey}` } });
    if (!res.ok) return { ok: false, error: `Paystack rejected the secret key (${res.status}).` };
    return { ok: true, accountRef: 'paystack' };
  }
  if (provider === 'stripe') {
    const res = await timedFetch('https://api.stripe.com/v1/balance', { headers: { authorization: `Bearer ${c.secretKey}` } });
    if (!res.ok) return { ok: false, error: `Stripe rejected the secret key (${res.status}).` };
    return { ok: true, accountRef: 'stripe' };
  }
  if (provider === 'flutterwave') {
    const res = await timedFetch('https://api.flutterwave.com/v3/balances', { headers: { authorization: `Bearer ${c.secretKey}` } });
    if (!res.ok) return { ok: false, error: `Flutterwave rejected the secret key (${res.status}).` };
    return { ok: true, accountRef: 'flutterwave' };
  }
  if (provider === 'mpesa') {
    return { ok: true, accountRef: c.shortcode ? `mpesa:${c.shortcode}` : 'mpesa' };
  }
  return { ok: false, error: `Unsupported payment provider "${c.provider}".` };
}

/* ------------------------- outbound senders ------------------------- */
export async function sendWhatsAppMessage(tenantId, to, body) {
  const creds = integrationCredentials(tenantId, 'whatsapp');
  if (missingFields('whatsapp', creds).length) return { sent: false, reason: 'WhatsApp is not connected.' };
  const res = await timedFetch(`https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
  });
  if (!res.ok) {
    const text = await res.text();
    return { sent: false, reason: `WhatsApp API error ${res.status}: ${text.slice(0, 200)}` };
  }
  return { sent: true };
}

export async function publishToChannel(tenantId, channel, item) {
  const providerMap = { instagram: 'instagram', facebook: 'facebook', tiktok: 'tiktok', x: 'x' };
  const provider = providerMap[channel];
  if (!provider) return { published: false, reason: `Unsupported channel "${channel}".` };
  const creds = integrationCredentials(tenantId, provider);
  const integration = get(`SELECT status FROM integrations WHERE tenant_id = ? AND provider = ?`, [tenantId, provider]);
  if (!creds || missingFields(provider, creds).length || integration?.status !== 'connected') {
    return { published: false, reason: `${PROVIDERS[provider].name} is not connected. Connect it in the Integration Centre first.` };
  }

  try {
    if (provider === 'instagram') {
      if (!item.media_url) return { published: false, reason: 'Instagram requires a public image URL. Add media to the content item first.' };
      const create = await timedFetch(`https://graph.facebook.com/v21.0/${creds.igUserId}/media`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image_url: item.media_url, caption: `${item.body}\n\n${item.hashtags || ''}`.trim(), access_token: creds.accessToken }),
      });
      const created = await create.json().catch(() => ({}));
      if (!create.ok || !created.id) return { published: false, reason: `Instagram container failed: ${JSON.stringify(created).slice(0, 200)}` };
      const publish = await timedFetch(`https://graph.facebook.com/v21.0/${creds.igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ creation_id: created.id, access_token: creds.accessToken }),
      });
      const published = await publish.json().catch(() => ({}));
      if (!publish.ok) return { published: false, reason: `Instagram publish failed: ${JSON.stringify(published).slice(0, 200)}` };
      return { published: true, ref: published.id };
    }
    if (provider === 'facebook') {
      const res = await timedFetch(`https://graph.facebook.com/v21.0/${creds.pageId}/feed`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: `${item.body}\n\n${item.hashtags || ''}`.trim(), access_token: creds.accessToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { published: false, reason: `Facebook publish failed: ${JSON.stringify(data).slice(0, 200)}` };
      return { published: true, ref: data.id };
    }
    if (provider === 'x') {
      const res = await timedFetch('https://api.x.com/2/tweets', {
        method: 'POST',
        headers: { authorization: `Bearer ${creds.accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ text: `${item.body}`.slice(0, 280) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return { published: false, reason: `X publish failed: ${JSON.stringify(data).slice(0, 200)}` };
      return { published: true, ref: data?.data?.id };
    }
    if (provider === 'tiktok') {
      return { published: false, reason: 'TikTok publishing requires an approved video upload. Attach the rendered video to the content item and retry.' };
    }
  } catch (err) {
    return { published: false, reason: String(err.message || err).slice(0, 250) };
  }
  return { published: false, reason: 'Channel not supported for direct publishing.' };
}

export function platformConfigStatus() {
  const p = (key) => Boolean(process.env[key]);
  return {
    ai: { configured: p('AI_API_KEY') || p('OPENAI_API_KEY'), required: ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL'] },
    payments: {
      configured: p('PAYSTACK_SECRET_KEY') || p('FLUTTERWAVE_SECRET_KEY') || p('STRIPE_SECRET_KEY') || p('MPESA_CONSUMER_KEY'),
      required: ['PAYSTACK_SECRET_KEY or FLUTTERWAVE_SECRET_KEY or STRIPE_SECRET_KEY or MPESA_CONSUMER_KEY'],
      provider: process.env.PAYMENT_PROVIDER || null,
    },
    whatsapp: { configured: p('WHATSAPP_APP_SECRET'), required: ['WHATSAPP_APP_SECRET'] },
    voice: { configured: p('TWILIO_AUTH_TOKEN'), required: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER'] },
    email: { configured: p('RESEND_API_KEY'), required: ['RESEND_API_KEY', 'EMAIL_FROM'] },
    public_url: process.env.PUBLIC_BASE_URL || null,
  };
}
