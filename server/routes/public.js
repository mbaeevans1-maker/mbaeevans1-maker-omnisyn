import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { all, get, run } from '../db.js';
import { validate, badRequest, notFound, rateLimit, newId, nowIso, localParts, localToUtc, formatMinutes } from '../lib/util.js';
import { availabilityForDate } from '../lib/booking.js';
import { createAppointment } from '../lib/booking.js';
import { respondToMessage, recordMessage, getAiSettings, aiStatus } from '../lib/ai.js';
import { platformConfigStatus } from '../lib/integrations.js';

import { whatsappLink, fireEvent } from '../lib/automations.js';
import { platformSettings, payoutProfile } from '../lib/payments.js';

const router = Router();

function publicBase(req) {
  return process.env.PUBLIC_BASE_URL || `${req.get('x-forwarded-proto') || req.protocol}://${req.get('host')}`;
}

function publishedTenant(slug) {
  const tenant = get(`SELECT * FROM tenants WHERE slug = ?`, [slug]);
  if (!tenant) return null;
  if (!tenant.onboarding_complete) return null;
  if (['suspended', 'deleted'].includes(tenant.status)) return null;
  return tenant;
}

function businessPayload(tenant, req) {
  const services = all(`SELECT id, name, description, category, duration_min, price_cents FROM services WHERE tenant_id = ? AND active = 1 ORDER BY sort, name`, [tenant.id]);
  const staff = all(`SELECT id, name, title, color FROM staff WHERE tenant_id = ? AND active = 1 ORDER BY name`, [tenant.id]);
  const schedules = all(
    `SELECT s.weekday, MIN(s.start_min) AS start_min, MAX(s.end_min) AS end_min
       FROM schedules s JOIN staff st ON st.id = s.staff_id
      WHERE st.tenant_id = ? AND st.active = 1 GROUP BY s.weekday ORDER BY s.weekday`,
    [tenant.id],
  );
  const hours = schedules.map((s) => ({ weekday: s.weekday, open: formatMinutes(s.start_min), close: formatMinutes(s.end_min) }));
  const subscription = get(`SELECT s.status, p.name AS plan_name FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.tenant_id = ? ORDER BY s.created_at DESC LIMIT 1`, [tenant.id]);
  return {
    business: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      industry: tenant.industry,
      tagline: tenant.tagline,
      about: tenant.about,
      logo_url: tenant.logo_url,
      brand_color: tenant.brand_color,
      accent_color: tenant.accent_color,
      address: tenant.address,
      city: tenant.city,
      country: tenant.country,
      phone: tenant.phone,
      whatsapp: tenant.whatsapp || tenant.phone,
      email: tenant.email,
      currency: tenant.currency,
      timezone: tenant.timezone,
      gallery: JSON.parse(tenant.gallery || '[]'),
      social_links: JSON.parse(tenant.social_links || '{}'),
      hours,
      booking_rules: JSON.parse(tenant.booking_rules || '{}'),
      url: `${publicBase(req)}/business/${tenant.slug}`,
      plan_name: subscription?.plan_name || null,
      ai_enabled: Boolean(getAiSettings(tenant.id).enabled),
    },
    services,
    staff,
  };
}

router.get('/plans', (_req, res) => {
  const plans = all(`SELECT * FROM plans WHERE active = 1 ORDER BY sort`);
  res.json({
    plans: plans.map((p) => ({
      ...p,
      features: JSON.parse(p.features || '[]'),
      limits: JSON.parse(p.limits || '{}'),
    })),
  });
});

router.get('/platform-status', (_req, res) => {
  res.json({ ai: aiStatus(), config: platformConfigStatus() });
});

router.get('/business/:slug', (req, res) => {
  const tenant = publishedTenant(req.params.slug);
  if (!tenant) throw notFound('This business page is not published yet.');
  res.json(businessPayload(tenant, req));
});

router.get('/business/:slug/availability', (req, res, next) => {
  try {
    const tenant = publishedTenant(req.params.slug);
    if (!tenant) throw notFound('This business page is not published yet.');
    const serviceId = String(req.query.serviceId || '');
    const service = get(`SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1`, [serviceId, tenant.id]);
    if (!service) throw badRequest('Choose a service to see availability.');
    const tz = tenant.timezone || 'Africa/Nairobi';
    const date = String(req.query.date || localParts(tz, new Date()).date);
    const staffId = req.query.staffId ? String(req.query.staffId) : null;
    const result = availabilityForDate({ tenant, service, dateStr: date, staffId });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/business/:slug/book',
  rateLimit({ windowMs: 60 * 60 * 1000, max: 30, key: 'public-book' }),
  (req, res, next) => {
    try {
      const tenant = publishedTenant(req.params.slug);
      if (!tenant) throw notFound('This business page is not published yet.');
      const body = validate(
        z.object({
          serviceId: z.string().min(3),
          staffId: z.string().min(3),
          startAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
          name: z.string().trim().min(2, 'Enter your name.').max(120),
          phone: z.string().trim().min(7, 'Enter a contact number.').max(40),
          email: z.string().trim().email().optional().nullable().or(z.literal('')),
          notes: z.string().trim().max(500).optional().nullable(),
          marketing_consent: z.boolean().optional().default(false),
        }),
        req.body,
      );
      const service = get(`SELECT * FROM services WHERE id = ? AND tenant_id = ? AND active = 1`, [body.serviceId, tenant.id]);
      if (!service) throw badRequest('That service is no longer available.');
      const tz = tenant.timezone || 'Africa/Nairobi';
      const parts = localParts(tz, new Date(body.startAt));
      const availability = availabilityForDate({ tenant, service, dateStr: parts.date, staffId: body.staffId });
      const match = availability.slots.find((s) => new Date(s.startAt).getTime() === new Date(body.startAt).getTime() && s.staffId === body.staffId);
      if (!match) throw badRequest('That time is no longer available. Please choose another slot.');

      const created = createAppointment({
        tenant,
        serviceId: service.id,
        staffId: body.staffId,
        startAt: body.startAt,
        customer: { name: body.name, phone: body.phone, email: body.email || null },
        notes: body.notes || null,
        source: 'website',
      });
      if (body.marketing_consent) {
        run(`UPDATE customers SET marketing_consent = 1 WHERE id = ?`, [created.customer.id]);
      }
      res.status(201).json({
        ok: true,
        appointment: {
          id: created.appointment.id,
          reference: created.appointment.id.slice(-6).toUpperCase(),
          start_at: created.appointment.start_at,
          end_at: created.appointment.end_at,
          status: created.appointment.status,
          service: created.service.name,
          staff: created.staff.name,
          price_cents: created.service.price_cents,
          currency: tenant.currency,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get('/business/:slug/qr', async (req, res, next) => {
  try {
    const tenant = publishedTenant(req.params.slug);
    if (!tenant) throw notFound('This business page is not published yet.');
    const target = `${publicBase(req)}/business/${tenant.slug}?utm_source=qr`;
    const png = await QRCode.toBuffer(target, { width: 720, margin: 2, color: { dark: '#0B0B12', light: '#FFFFFF' } });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(png);
  } catch (err) {
    next(err);
  }
});

router.get('/business/:slug/widget.js', (req, res) => {
  const tenant = publishedTenant(req.params.slug);
  if (!tenant) {
    res.type('application/javascript').send('/* MAVYRON booking widget — business not published */');
    return;
  }
  const url = `${publicBase(req)}/business/${tenant.slug}?embed=1`;
  res.type('application/javascript').set('Cache-Control', 'public, max-age=600');
  res.send(`(function(){
  var url = ${JSON.stringify(url)};
  var brand = ${JSON.stringify(tenant.brand_color || '#7B5BFF')};
  function mount(){
    if (document.getElementById('mavyron-book-btn')) return;
    var b = document.createElement('button');
    b.id = 'mavyron-book-btn';
    b.type = 'button';
    b.textContent = 'Book appointment';
    b.setAttribute('aria-label', 'Book an appointment with ' + ${JSON.stringify(tenant.name)});
    b.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483000;padding:14px 20px;border:0;border-radius:999px;font:600 14px/1 system-ui,sans-serif;color:#fff;background:' + brand + ';box-shadow:0 12px 32px rgba(11,11,18,.28);cursor:pointer';
    var overlay = document.createElement('div');
    overlay.style.cssText = 'display:none;position:fixed;inset:0;z-index:2147483001;background:rgba(6,6,12,.62);backdrop-filter:blur(6px)';
    var frame = document.createElement('iframe');
    frame.title = 'Booking';
    frame.src = 'about:blank';
    frame.style.cssText = 'position:absolute;inset:5% 5%;width:90%;height:90%;border:0;border-radius:18px;background:#0B0B12;box-shadow:0 40px 120px rgba(0,0,0,.6)';
    overlay.appendChild(frame);
    overlay.addEventListener('click', function(e){ if(e.target===overlay){ overlay.style.display='none'; } });
    b.addEventListener('click', function(){ frame.src = url; overlay.style.display='block'; frame.focus(); });
    document.body.appendChild(b);
    document.body.appendChild(overlay);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();`);
});

/* --------------------------- AI chat (public) --------------------------- */
router.post('/chat', rateLimit({ windowMs: 60 * 1000, max: 20, key: 'public-chat' }), async (req, res, next) => {
  try {
    const body = validate(
      z.object({
        slug: z.string().min(1),
        message: z.string().trim().min(1, 'Type a message.').max(2000),
        sessionId: z.string().trim().min(6).max(80),
        name: z.string().trim().max(120).optional().nullable(),
        phone: z.string().trim().max(40).optional().nullable(),
      }),
      req.body,
    );
    const tenant = publishedTenant(body.slug);
    if (!tenant) throw notFound('This business page is not published yet.');
    const settings = getAiSettings(tenant.id);
    if (!settings.enabled) throw badRequest('The AI assistant is currently switched off for this business.');

    let conversation = get(`SELECT * FROM conversations WHERE id = ? AND tenant_id = ?`, [body.sessionId, tenant.id]);
    if (!conversation) {
      run(
        `INSERT INTO conversations (id, tenant_id, channel, contact_name, contact_ref, status, ai_enabled, meta, last_message_at, created_at)
         VALUES (?,?,?,?,?,?,1,'{}',?,?)`,
        [body.sessionId, tenant.id, 'web', body.name || 'Website guest', body.phone || null, 'open', nowIso(), nowIso()],
      );
      conversation = get(`SELECT * FROM conversations WHERE id = ?`, [body.sessionId]);
    } else if ((body.name && !conversation.contact_name) || (body.phone && !conversation.contact_ref)) {
      run(`UPDATE conversations SET contact_name = COALESCE(?, contact_name), contact_ref = COALESCE(?, contact_ref) WHERE id = ?`, [
        body.name || null, body.phone || null, conversation.id,
      ]);
      conversation = get(`SELECT * FROM conversations WHERE id = ?`, [conversation.id]);
    }

    recordMessage({ tenantId: tenant.id, conversationId: conversation.id, role: 'customer', body: body.message });
    const history = all(`SELECT role, body FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`, [conversation.id]);

    const result = await respondToMessage({ tenant, settings, conversation, history, text: body.message, channel: 'web' });
    const assistant = recordMessage({
      tenantId: tenant.id,
      conversationId: conversation.id,
      role: 'assistant',
      body: result.reply,
      meta: { generator: result.generator, handoff: result.handoff, booking: result.booking?.id || null },
    });
    if (result.metaPatch) {
      run(`UPDATE conversations SET meta = ? WHERE id = ?`, [JSON.stringify(result.metaPatch), conversation.id]);
    }
    if (result.handoff) {
      run(`UPDATE conversations SET status = 'needs_human' WHERE id = ?`, [conversation.id]);
    }
    if (result.booking) {
      run(`UPDATE conversations SET customer_id = (SELECT customer_id FROM appointments WHERE id = ?) WHERE id = ?`, [result.booking.id, conversation.id]);
    }
    res.json({
      reply: assistant.body,
      messageId: assistant.id,
      handoff: result.handoff,
      booking: result.booking
        ? { id: result.booking.id, reference: result.booking.id.slice(-6).toUpperCase(), start_at: result.booking.start_at }
        : null,
      generator: result.generator,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/chat/:sessionId', (req, res) => {
  const conversation = get(`SELECT * FROM conversations WHERE id = ?`, [req.params.sessionId]);
  if (!conversation) return res.json({ messages: [] });
  const messages = all(`SELECT id, role, body, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`, [conversation.id]);
  return res.json({ messages, status: conversation.status });
});

/* ------------------------- platform leads ------------------------- */
const leadRate = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, key: 'lead' });

router.post('/contact', leadRate, (req, res, next) => {
  try {
    const body = validate(
      z.object({
        name: z.string().trim().min(2, 'Enter your name.').max(120),
        email: z.string().trim().email('Enter a valid email.').max(160),
        phone: z.string().trim().max(40).optional().nullable(),
        organisation: z.string().trim().max(160).optional().nullable(),
        subject: z.string().trim().min(2, 'Add a subject.').max(160),
        message: z.string().trim().min(10, 'Tell us a little more.').max(4000),
      }),
      req.body,
    );
    const id = newId('lead_');
    run(
      `INSERT INTO platform_leads (id, kind, name, email, phone, organisation, subject, message, status, meta, created_at)
       VALUES (?,?,?,?,?,?,?,?,'new','{}',?)`,
      [id, 'contact', body.name, body.email, body.phone || null, body.organisation || null, body.subject, body.message, nowIso()],
    );
    res.status(201).json({ ok: true, id, message: 'Message received. The MAVYRON team will respond.' });
  } catch (err) {
    next(err);
  }
});

router.post('/partnership', leadRate, (req, res, next) => {
  try {
    const body = validate(
      z.object({
        name: z.string().trim().min(2, 'Enter your name.').max(120),
        organisation: z.string().trim().min(2, 'Enter your organisation.').max(160),
        position: z.string().trim().max(120).optional().nullable(),
        email: z.string().trim().email('Enter a valid email.').max(160),
        phone: z.string().trim().max(40).optional().nullable(),
        partnership_type: z.string().trim().min(2, 'Select a partnership type.').max(80),
        proposal: z.string().trim().min(20, 'Describe the partnership in at least 20 characters.').max(4000),
        website: z.string().trim().max(200).optional().nullable(),
        additional: z.string().trim().max(2000).optional().nullable(),
      }),
      req.body,
    );
    const id = newId('lead_');
    run(
      `INSERT INTO platform_leads (id, kind, name, email, phone, organisation, position, website, subject, message, status, meta, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,'new',?,?)`,
      [
        id, 'partnership', body.name, body.email, body.phone || null, body.organisation, body.position || null,
        body.website || null, body.partnership_type, body.proposal,
        JSON.stringify({ partnership_type: body.partnership_type, additional: body.additional || null }), nowIso(),
      ],
    );
    res.status(201).json({ ok: true, id, message: 'Partnership enquiry received.' });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- public reviews --------------------------- */

router.get('/business/:slug/reviews', (req, res) => {
  const tenant = publishedTenant(req.params.slug);
  if (!tenant) throw notFound('Business not found.');
  const reviews = all(
    `SELECT id, rating, comment, author_name, created_at, reply
       FROM reviews WHERE tenant_id = ? AND status = 'published'
      ORDER BY created_at DESC LIMIT 50`,
    [tenant.id],
  );
  const summary = get(
    `SELECT COUNT(*) AS total, COALESCE(AVG(rating), 0) AS average
       FROM reviews WHERE tenant_id = ? AND status = 'published'`,
    [tenant.id],
  );
  res.json({
    reviews,
    summary: { total: summary?.total ?? 0, average: Math.round((summary?.average ?? 0) * 10) / 10 },
  });
});

router.post('/business/:slug/reviews', rateLimit({ windowMs: 60_000, max: 5 }), (req, res) => {
  const tenant = publishedTenant(req.params.slug);
  if (!tenant) throw notFound('Business not found.');
  const data = validate(z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    authorName: z.string().trim().min(2, 'Add your name.').max(80),
    phone: z.string().trim().min(7, 'Add the phone number used for the booking.').max(40),
    appointmentId: z.string().trim().min(4).max(60),
  }), req.body || {});

  // A review is only accepted against a real appointment belonging to this
  // business, and the phone must match the booking. No invented reviews.
  const appointment = get(
    `SELECT a.*, c.name AS customer_name, c.phone AS customer_phone
       FROM appointments a JOIN customers c ON c.id = a.customer_id
      WHERE a.id = ? AND a.tenant_id = ?`,
    [data.appointmentId, tenant.id],
  );
  if (!appointment) throw notFound('We could not find that booking for this business.');
  const digits = (value) => String(value || '').replace(/\D/g, '').slice(-9);
  if (digits(appointment.customer_phone) !== digits(data.phone)) {
    throw badRequest('That phone number does not match the booking.');
  }
  if (appointment.status !== 'completed') {
    throw badRequest('Reviews open once your appointment is completed.');
  }
  const existing = get(`SELECT id FROM reviews WHERE appointment_id = ?`, [appointment.id]);
  if (existing) throw conflict('This appointment already has a review.');

  const id = newId('rev_');
  run(
    `INSERT INTO reviews (id, tenant_id, appointment_id, customer_id, author_name, rating, comment, status, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,'published',?,?)`,
    [id, tenant.id, appointment.id, appointment.customer_id, data.authorName, data.rating,
      data.comment || null, nowIso(), nowIso()],
  );
  void fireEvent({
    tenant,
    event: 'review.received',
    appointment,
    customer: { name: data.authorName, phone: appointment.customer_phone },
  }).catch(() => {});
  res.status(201).json({ review: get(`SELECT * FROM reviews WHERE id = ?`, [id]) });
});

/* ----------------------- platform contact channels ----------------------- */

router.get('/channels', (_req, res) => {
  const settings = platformSettings();
  const payout = payoutProfile();
  const support = settings.support_whatsapp || payout.mpesa || '0748734197';
  res.json({
    support_whatsapp: support,
    support_email: settings.support_email || 'mbaeevans1@gmail.com',
    ceo_whatsapp: settings.ceo_whatsapp || '0748734197',
    payout_mpesa: payout.mpesa,
    social: {
      instagram: settings.social_instagram || 'Evans mbae',
      tiktok: settings.social_tiktok || null,
      facebook: settings.social_facebook || 'Mbae Evans',
    },
    whatsapp_url: whatsappLink(support, 'Hello MAVYRON — I would like to speak to the team.'),
  });
});

export default router;
