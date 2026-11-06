import { Router } from 'express';
import crypto from 'node:crypto';
import express from 'express';
import { all, get, run, audit, notify } from '../db.js';
import { newId, nowIso } from '../lib/util.js';
import { integrationCredentials, sendWhatsAppMessage } from '../lib/integrations.js';
import { respondToMessage, recordMessage, getAiSettings } from '../lib/ai.js';

const router = Router();

/* Twilio and Meta both post non-JSON payloads. */
router.use(express.urlencoded({ extended: false, limit: '256kb' }));

const logEvent = ({ provider, tenantId = null, verified = false, payload }) => {
  run(
    `INSERT INTO webhook_events (id, provider, tenant_id, verified, payload, created_at) VALUES (?,?,?,?,?,?)`,
    [newId('whk_'), provider, tenantId, verified ? 1 : 0, JSON.stringify(payload).slice(0, 20000), nowIso()],
  );
};

const safeEqual = (a, b) => {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

/* ------------------------------ WhatsApp Cloud API ------------------------------ */

router.get('/whatsapp/:tenantId', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = String(req.query['hub.verify_token'] || '');
  const challenge = req.query['hub.challenge'];
  const creds = integrationCredentials(req.params.tenantId, 'whatsapp');
  const expected = creds?.verifyToken;
  if (mode === 'subscribe' && expected && safeEqual(token, expected)) {
    logEvent({ provider: 'whatsapp', tenantId: req.params.tenantId, verified: true, payload: { verification: 'ok' } });
    return res.status(200).type('text/plain').send(String(challenge ?? ''));
  }
  logEvent({ provider: 'whatsapp', tenantId: req.params.tenantId, verified: false, payload: { verification: 'failed' } });
  return res.status(403).type('text/plain').send('verification failed');
});

router.post('/whatsapp/:tenantId', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [tenantId]);
    if (!tenant) return res.status(404).json({ error: { message: 'Unknown workspace.' } });

    const creds = integrationCredentials(tenantId, 'whatsapp');
    const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
    const signature = req.get('x-hub-signature-256') || '';
    let verified = false;
    if (creds?.appSecret && signature.startsWith('sha256=')) {
      const expected = `sha256=${crypto.createHmac('sha256', creds.appSecret).update(raw).digest('hex')}`;
      verified = safeEqual(signature, expected);
    }
    if (creds?.appSecret && !verified) {
      logEvent({ provider: 'whatsapp', tenantId, verified: false, payload: { reason: 'signature_mismatch' } });
      return res.status(401).json({ error: { message: 'Invalid webhook signature.' } });
    }

    const payload = req.body || {};
    logEvent({ provider: 'whatsapp', tenantId, verified, payload });

    const messages = all(
      `SELECT 1`, [],
    ) && extractMessages(payload);

    for (const msg of messages) {
      const phone = msg.from;
      const text = msg.text;
      if (!phone || !text) continue;

      let conversation = get(
        `SELECT * FROM conversations WHERE tenant_id = ? AND channel = 'whatsapp' AND contact_ref = ? ORDER BY created_at DESC LIMIT 1`,
        [tenantId, phone],
      );
      if (!conversation) {
        conversation = {
          id: newId('cnv_'),
          tenant_id: tenantId,
          channel: 'whatsapp',
          contact_name: msg.profileName || phone,
          contact_ref: phone,
          status: 'open',
          ai_enabled: 1,
        };
        run(
          `INSERT INTO conversations (id, tenant_id, channel, customer_id, contact_name, contact_ref, status, ai_enabled, meta, last_message_at, created_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
          [conversation.id, tenantId, 'whatsapp', null, conversation.contact_name, phone, 'open', 1, '{}', nowIso(), nowIso()],
        );
      }

      recordMessage({ tenantId, conversationId: conversation.id, role: 'customer', body: text, meta: { channel: 'whatsapp' } });

      if (!conversation.ai_enabled) continue;
      const settings = getAiSettings(tenantId);
      if (!settings?.enabled) continue;

      const history = all(
        `SELECT role, body FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12`,
        [conversation.id],
      ).reverse().map((m) => ({ role: m.role, body: m.body }));

      const reply = await respondToMessage({
        tenant, settings, conversation, history, text, channel: 'whatsapp',
      });

      recordMessage({
        tenantId, conversationId: conversation.id, role: 'assistant', body: reply.reply,
        meta: { generator: reply.generator, action: reply.action || null },
      });

      const delivery = await sendWhatsAppMessage(tenantId, phone, reply.reply);
      if (!delivery?.sent) {
        notify({
          tenantId, title: 'WhatsApp reply not delivered',
          body: delivery?.error || 'The WhatsApp Cloud API rejected the reply. Check integration credentials.',
          level: 'warning',
        });
      }
    }

    return res.json({ received: true, handled: messages.length });
  } catch (err) {
    return next(err);
  }
});

function extractMessages(payload) {
  const out = [];
  const entries = payload?.entry || [];
  for (const entry of entries) {
    for (const change of entry?.changes || []) {
      const value = change?.value || {};
      const profiles = value?.contacts || [];
      for (const m of value?.messages || []) {
        const text = m?.text?.body || m?.button?.text || m?.interactive?.button_reply?.title || '';
        out.push({
          from: m?.from,
          text: String(text).slice(0, 2000),
          profileName: profiles.find((c) => c.wa_id === m?.from)?.profile?.name || null,
        });
      }
    }
  }
  return out;
}

/* ------------------------------ payments ------------------------------ */

router.post('/payments/paystack', (req, res) => {
  const secret = process.env.PAYSTACK_SECRET_KEY || '';
  const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body);
  const signature = req.get('x-paystack-signature') || '';
  const verified = Boolean(secret) && safeEqual(signature, crypto.createHmac('sha512', secret).update(raw).digest('hex'));

  logEvent({ provider: 'paystack', verified, payload: req.body });

  if (!verified) return res.status(401).json({ error: { message: 'Invalid webhook signature.' } });

  const event = req.body || {};
  if (event.event !== 'charge.success') return res.json({ received: true, ignored: true });

  const reference = event.data?.reference;
  if (!reference) return res.json({ received: true, ignored: true });

  const invoice = get(`SELECT * FROM invoices WHERE provider_ref = ?`, [reference]);
  if (!invoice || invoice.status === 'paid') return res.json({ received: true, ignored: true });

  run(`UPDATE invoices SET status = 'paid', paid_at = ?, provider = 'paystack' WHERE id = ?`, [nowIso(), invoice.id]);
  const sub = get(`SELECT * FROM subscriptions WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [invoice.tenant_id]);
  if (sub) {
    const periodStart = nowIso();
    const periodEnd = new Date(Date.now() + 30 * 864e5).toISOString();
    run(`UPDATE subscriptions SET status = 'active', current_period_start = ?, current_period_end = ?, updated_at = ? WHERE id = ?`,
      [periodStart, periodEnd, nowIso(), sub.id]);
  }
  notify({
    tenantId: invoice.tenant_id, title: 'Subscription payment received',
    body: `Payment ${reference} confirmed by Paystack.`, level: 'success',
  });
  audit({
    tenantId: invoice.tenant_id, action: 'billing.webhook.paid', target: invoice.id,
    meta: { provider: 'paystack', reference }, ip: req.ip,
  });
  return res.json({ received: true });
});

/* ------------------------------ AI voice receptionist ------------------------------ */

router.post('/voice/:tenantId', async (req, res, next) => {
  try {
    const tenantId = req.params.tenantId;
    const tenant = get(`SELECT * FROM tenants WHERE id = ?`, [tenantId]);
    if (!tenant) return res.status(404).type('text/xml').send('<Response><Say>Unknown business.</Say></Response>');

    const settings = getAiSettings(tenantId);
    const creds = integrationCredentials(tenantId, 'voice');
    const verified = Boolean(creds?.authToken);
    logEvent({ provider: 'voice', tenantId, verified, payload: { hasSpeech: Boolean(req.body?.SpeechResult) } });

    const from = String(req.body?.From || 'unknown');
    const speech = String(req.body?.SpeechResult || '').slice(0, 1000);

    if (!speech) {
      const greeting = settings?.greeting
        || `Thank you for calling ${tenant.name}. This is ${settings?.assistant_name || 'Ava'}, the AI receptionist. How can I help you today?`;
      return res.type('text/xml').send(
        `<Response><Say voice="Polly.Joanna">${escapeXml(greeting)}</Say><Gather input="speech" language="${settings?.language === 'sw' ? 'sw-KE' : 'en-KE'}" speechTimeout="auto" action="/api/webhooks/voice/${tenantId}" method="POST" /></Response>`,
      );
    }

    let conversation = get(
      `SELECT * FROM conversations WHERE tenant_id = ? AND channel = 'voice' AND contact_ref = ? ORDER BY created_at DESC LIMIT 1`,
      [tenantId, from],
    );
    if (!conversation) {
      const id = newId('cnv_');
      run(
        `INSERT INTO conversations (id, tenant_id, channel, contact_name, contact_ref, status, ai_enabled, meta, last_message_at, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id, tenantId, 'voice', from, from, 'open', 1, '{}', nowIso(), nowIso()],
      );
      conversation = get(`SELECT * FROM conversations WHERE id = ?`, [id]);
    }

    recordMessage({ tenantId, conversationId: conversation.id, role: 'customer', body: speech, meta: { channel: 'voice' } });
    const history = all(
      `SELECT role, body FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12`, [conversation.id],
    ).reverse().map((m) => ({ role: m.role, body: m.body }));

    const reply = await respondToMessage({ tenant, settings, conversation, history, text: speech, channel: 'voice' });
    recordMessage({
      tenantId, conversationId: conversation.id, role: 'assistant', body: reply.reply,
      meta: { generator: reply.generator, channel: 'voice' },
    });

    const disclosure = 'This call is handled by an AI assistant. ';
    return res.type('text/xml').send(
      `<Response><Say voice="Polly.Joanna">${escapeXml(disclosure + reply.reply)}</Say>`
      + `<Gather input="speech" language="${settings?.language === 'sw' ? 'sw-KE' : 'en-KE'}" speechTimeout="auto" action="/api/webhooks/voice/${tenantId}" method="POST" />`
      + `<Say voice="Polly.Joanna">Thank you for calling ${escapeXml(tenant.name)}. Goodbye.</Say></Response>`,
    );
  } catch (err) {
    return next(err);
  }
});

function escapeXml(value) {
  return String(value || '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));
}

/* ------------------------------ social publishing callbacks ------------------------------ */

router.post('/social/:provider', (req, res) => {
  const provider = String(req.params.provider);
  logEvent({ provider: `social_${provider}`, verified: false, payload: req.body });
  res.json({ received: true, note: 'Event stored. Social platform callbacks are recorded for audit only.' });
});

export default router;
