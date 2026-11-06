import { all, get, run } from '../db.js';
import { formatMinutes, localParts, nowIso, newId } from './util.js';
import { availabilityForDate, bookingRules, upcomingDaysWithAvailability, createAppointment, serviceById } from './booking.js';

/* ------------------------------------------------------------------ *
 * Provider configuration (platform-level). If absent we run the
 * deterministic MAVYRON Core engine — real answers, no invented facts.
 * ------------------------------------------------------------------ */
export function aiProvider() {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '';
  const provider = (process.env.AI_PROVIDER || (apiKey ? 'openai' : '')).toLowerCase();
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  return { configured: Boolean(apiKey && provider), provider, apiKey, baseUrl, model };
}

export function aiStatus() {
  const p = aiProvider();
  return {
    external_provider: p.configured ? p.provider : null,
    model: p.configured ? p.model : null,
    engine: p.configured ? `${p.provider} · ${p.model}` : 'MAVYRON Core Intelligence (deterministic)',
    configured: p.configured,
    required_environment: p.configured ? [] : ['AI_PROVIDER', 'AI_API_KEY', 'AI_MODEL'],
  };
}

export function getAiSettings(tenantId) {
  let settings = get(`SELECT * FROM ai_settings WHERE tenant_id = ?`, [tenantId]);
  if (!settings) {
    run(
      `INSERT INTO ai_settings (tenant_id, enabled, assistant_name, tone, language, greeting, escalation_keywords, voice_enabled, updated_at)
       VALUES (?,1,'Ava','warm-professional','en',NULL,'["human","manager","owner","complaint","refund"]',0,?)`,
      [tenantId, nowIso()],
    );
    settings = get(`SELECT * FROM ai_settings WHERE tenant_id = ?`, [tenantId]);
  }
  return {
    ...settings,
    enabled: Boolean(settings.enabled),
    voice_enabled: Boolean(settings.voice_enabled),
    escalation_keywords: safeJson(settings.escalation_keywords, []),
  };
}

function safeJson(value, fallback) {
  try { return JSON.parse(value ?? ''); } catch { return fallback; }
}

export function tenantKnowledge(tenantId) {
  return all(`SELECT * FROM knowledge_entries WHERE tenant_id = ? AND active = 1 ORDER BY created_at DESC`, [tenantId]);
}

export function businessContext(tenant, { includeAvailability = true } = {}) {
  const tz = tenant.timezone || 'Africa/Nairobi';
  const parts = localParts(tz, new Date());
  const services = all(`SELECT id, name, description, duration_min, price_cents, category FROM services WHERE tenant_id = ? AND active = 1 ORDER BY sort, name`, [tenant.id]);
  const staff = all(`SELECT id, name, title FROM staff WHERE tenant_id = ? AND active = 1 ORDER BY name`, [tenant.id]);
  const knowledge = tenantKnowledge(tenant.id);
  const rules = bookingRules(tenant);

  const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const hours = [];
  for (const member of staff) {
    const rows = all(`SELECT weekday, start_min, end_min FROM schedules WHERE staff_id = ? ORDER BY weekday`, [member.id]);
    for (const r of rows) hours.push(`${member.name}: ${weekdayNames[r.weekday]} ${formatMinutes(r.start_min)}–${formatMinutes(r.end_min)}`);
  }

  let availability = [];
  if (includeAvailability && services.length) {
    availability = upcomingDaysWithAvailability({ tenant, service: services[0], days: 5 });
  }

  return { tz, today: parts.date, services, staff, knowledge, rules, hours, availability };
}

function contextPrompt(tenant, ctx) {
  const currency = tenant.currency || 'KES';
  const money = (c) => `${currency} ${(c / 100).toFixed(2)}`;
  const lines = [
    `BUSINESS: ${tenant.name} (${tenant.industry})`,
    tenant.tagline ? `TAGLINE: ${tenant.tagline}` : '',
    tenant.about ? `ABOUT: ${tenant.about}` : '',
    `LOCATION: ${[tenant.address, tenant.city, tenant.country].filter(Boolean).join(', ') || 'not provided'}`,
    `PHONE: ${tenant.phone || 'not provided'} · WHATSAPP: ${tenant.whatsapp || tenant.phone || 'not provided'}`,
    `TIMEZONE: ${ctx.tz} · TODAY: ${ctx.today}`,
    `CURRENCY: ${currency}`,
    '',
    'SERVICES (id | name | duration | price):',
    ...ctx.services.map((s) => `- ${s.id} | ${s.name} | ${s.duration_min} min | ${money(s.price_cents)}${s.description ? ` | ${s.description}` : ''}`),
    '',
    'TEAM:',
    ...ctx.staff.map((s) => `- ${s.id} | ${s.name}${s.title ? ` | ${s.title}` : ''}`),
    '',
    'OPENING HOURS:',
    ...(ctx.hours.length ? ctx.hours : ['- Not configured yet']),
    '',
    'KNOWLEDGE BASE (approved facts only):',
    ...(ctx.knowledge.length ? ctx.knowledge.map((k) => `- [${k.kind}] ${k.title}: ${k.content}`) : ['- Empty']),
    '',
    'REAL AVAILABILITY (next days):',
    ...(ctx.availability.length
      ? ctx.availability.map((d) => `- ${d.date}: ${d.slots.map((s) => s.localTime).join(', ')}`)
      : ['- No open slots in the next 5 days']),
  ];
  return lines.filter(Boolean).join('\n');
}

const SYSTEM_RULES = `You are the AI receptionist for a single business on the MAVYRON platform.
RULES:
1. Only use the facts in the BUSINESS CONTEXT. Never invent prices, staff, hours, policies, availability or services.
2. If a fact is missing, say you will confirm with the team and offer to escalate to a human.
3. Be concise (max 90 words), warm, professional and specific. Never mention internal ids.
4. To book, ONLY propose times from REAL AVAILABILITY. When the customer clearly accepts a time, append exactly one directive on its own line:
[[MAVYRON_BOOK {"serviceId":"<id>","staffId":"<id>","startAt":"<ISO8601 UTC>"}]]
5. You may propose at most 4 options at a time. Never double-book.
6. If the customer asks for a human, a complaint or anything outside your knowledge, say a team member will take over.`;

async function callProvider(messages, { maxTokens = 400, temperature = 0.4 } = {}) {
  const p = aiProvider();
  if (!p.configured) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(`${p.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ model: p.model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`AI provider ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ *
 * Deterministic intent engine (used when no provider is configured)
 * ------------------------------------------------------------------ */
const INTENT_PATTERNS = [
  { intent: 'human', re: /\b(human|agent|person|manager|owner|speak to|talk to|call me|complaint|refund|supervisor)\b/i },
  { intent: 'booking', re: /\b(book|booking|appointment|reserve|slot|available|availability|open time|come in|walk in)\b/i },
  { intent: 'cancel', re: /\b(cancel|call off)\b/i },
  { intent: 'reschedule', re: /\b(reschedul|move my|change my|postpone)\b/i },
  { intent: 'price', re: /\b(price|prices|cost|charge|how much|rate|bei|fee)\b/i },
  { intent: 'hours', re: /\b(open|close|closing|opening|hours|what time|late|saa ngapi)\b/i },
  { intent: 'location', re: /\b(where|location|located|address|direction|directions|map|wapi|find you)\b/i },
  { intent: 'services', re: /\b(service|services|menu|offer|treatment|do you do|huduma)\b/i },
  { intent: 'greeting', re: /^(hi|hello|hey|jambo|habari|sasa|good (morning|afternoon|evening)|mambo)\b/i },
  { intent: 'thanks', re: /\b(thanks|thank you|asante|great|perfect)\b/i },
];

function detectIntent(text) {
  for (const { intent, re } of INTENT_PATTERNS) if (re.test(text)) return intent;
  return 'unknown';
}

function moneyLabel(tenant, cents) {
  return `${tenant.currency || 'KES'} ${(cents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

function matchService(text, services) {
  const lower = text.toLowerCase();
  const direct = services.find((s) => lower.includes(s.name.toLowerCase()));
  if (direct) return direct;
  const words = lower.split(/[^a-z]+/).filter((w) => w.length > 3);
  let best = null;
  for (const s of services) {
    const name = s.name.toLowerCase();
    const score = words.filter((w) => name.includes(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { service: s, score };
  }
  return best?.service || null;
}

function faqMatch(text, knowledge) {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  if (!words.length) return null;
  let best = null;
  for (const entry of knowledge) {
    const haystack = `${entry.title} ${entry.content}`.toLowerCase();
    const score = words.filter((w) => haystack.includes(w)).length;
    if (score >= 2 && (!best || score > best.score)) best = { entry, score };
  }
  return best?.entry || null;
}

function slotLabel(tz, iso) {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: true }).format(d);
  return `${day} · ${time}`;
}

function deterministicReply({ tenant, settings, ctx, text, conversation }) {
  const intent = detectIntent(text);
  const meta = safeJson(conversation.meta, {});
  const pending = meta.pending || null;
  const tz = ctx.tz;
  const services = ctx.services;

  // Continue an in-progress booking conversation
  if (pending?.stage === 'offer_slots') {
    const choice = Number((text.match(/\b([1-9])\b/) || [])[1]);
    if (choice && pending.options?.[choice - 1]) {
      const option = pending.options[choice - 1];
      const service = serviceById(tenant.id, option.serviceId);
      if (service) {
        try {
          const result = createAppointment({
            tenant,
            serviceId: option.serviceId,
            staffId: option.staffId,
            startAt: option.startAt,
            customer: pending.customer || { name: conversation.contact_name || 'Website guest', phone: conversation.contact_ref },
            source: conversation.channel === 'whatsapp' ? 'whatsapp' : conversation.channel === 'voice' ? 'voice' : 'website',
            createdBy: null,
          });
          return {
            reply: `Booked. ${service.name} with ${result.staff.name} on ${slotLabel(tz, option.startAt)}. Reference ${result.appointment.id.slice(-6).toUpperCase()}. A confirmation has been sent to the business team. Anything else I can help with?`,
            action: { type: 'appointment_created', appointmentId: result.appointment.id },
            meta: { pending: null },
            booking: result.appointment,
          };
        } catch (err) {
          return { reply: `${err.message || 'That slot is no longer available.'} Would you like me to show the next available times?`, meta: { pending: { ...pending, stage: 'choose_service' } } };
        }
      }
    }
    if (/other|another|more|different/i.test(text)) {
      const service = serviceById(tenant.id, pending.serviceId);
      const days = service ? upcomingDaysWithAvailability({ tenant, service, days: 10 }).slice(1, 6) : [];
      const options = days.flatMap((d) => d.slots.slice(0, 2)).slice(0, 4).map((s) => ({ ...s, serviceId: pending.serviceId }));
      if (options.length) {
        return {
          reply: `Here are more times:\n${options.map((o, i) => `${i + 1}. ${slotLabel(tz, o.startAt)}`).join('\n')}\nReply with a number to confirm.`,
          meta: { pending: { ...pending, stage: 'offer_slots', options } },
        };
      }
      return { reply: 'I do not have further open slots in the next 10 days. I can ask the team to contact you with options — shall I?', meta: { pending: { ...pending, stage: 'handoff_offer' } } };
    }
    return { reply: 'Reply with the number of the time that suits you, or say "other" to see more times.', meta: { pending } };
  }

  if (intent === 'human' || (settings.escalation_keywords || []).some((k) => text.toLowerCase().includes(String(k).toLowerCase()))) {
    return {
      reply: `Of course — I am handing this to the ${tenant.name} team now. A team member will reply here shortly. If it is urgent you can call ${tenant.phone || 'the business line'}.`,
      handoff: true,
      meta: { pending: null },
    };
  }

  if (intent === 'cancel' || intent === 'reschedule') {
    return {
      reply: `I can help with that. To ${intent === 'cancel' ? 'cancel' : 'reschedule'} an appointment I need the name and phone number used for the booking — or I can pass this to a team member.`,
      handoff: true,
      meta: { pending: null },
    };
  }

  if (intent === 'booking') {
    const matched = matchService(text, services);
    if (!services.length) {
      return { reply: `Booking is not open yet — ${tenant.name} has not published services. Please contact ${tenant.phone || 'the team'} and we will help directly.`, handoff: true };
    }
    const service = matched || (services.length === 1 ? services[0] : null);
    if (!service) {
      return {
        reply: `I can book you in. Which service would you like?\n${services.slice(0, 6).map((s, i) => `${i + 1}. ${s.name} — ${moneyLabel(tenant, s.price_cents)} (${s.duration_min} min)`).join('\n')}\nReply with a number or the service name.`,
        meta: { pending: { stage: 'choose_service', options: services.slice(0, 6).map((s) => s.id) } },
      };
    }
    const days = upcomingDaysWithAvailability({ tenant, service, days: 7 });
    const options = days.flatMap((d) => d.slots.slice(0, 2)).slice(0, 4).map((s) => ({ ...s, serviceId: service.id }));
    if (!options.length) {
      return {
        reply: `I do not have open ${service.name} slots in the next 7 days. I can ask the team to contact you with the next available options — would you like that?`,
        meta: { pending: { stage: 'handoff_offer', serviceId: service.id } },
      };
    }
    return {
      reply: `${service.name} is ${moneyLabel(tenant, service.price_cents)} and takes ${service.duration_min} minutes. These are the next real openings:\n${options.map((o, i) => `${i + 1}. ${slotLabel(tz, o.startAt)} with ${o.staffName}`).join('\n')}\nReply with a number to confirm.`,
      meta: { pending: { stage: 'offer_slots', serviceId: service.id, options, customer: { name: conversation.contact_name || 'Website guest', phone: conversation.contact_ref } } },
    };
  }

  if (intent === 'price' || intent === 'services') {
    if (!services.length) {
      return { reply: `Our service list is being finalised. Please contact ${tenant.phone || 'the team'} for current pricing.`, handoff: true };
    }
    const matched = matchService(text, services);
    if (matched) {
      return { reply: `${matched.name} is ${moneyLabel(tenant, matched.price_cents)} and takes ${matched.duration_min} minutes.${matched.description ? ` ${matched.description}` : ''} Would you like me to check availability?` };
    }
    return {
      reply: `Here are our services:\n${services.slice(0, 8).map((s) => `• ${s.name} — ${moneyLabel(tenant, s.price_cents)} (${s.duration_min} min)`).join('\n')}\nAsk me about any service or say "book" to see open times.`,
    };
  }

  if (intent === 'hours') {
    if (!ctx.hours.length) return { reply: `Our opening hours are being confirmed. Please call ${tenant.phone || 'the team'} and we will assist right away.`, handoff: true };
    return { reply: `Our current opening hours:\n${ctx.hours.slice(0, 8).join('\n')}` };
  }

  if (intent === 'location') {
    const address = [tenant.address, tenant.city, tenant.country].filter(Boolean).join(', ');
    if (!address) return { reply: `Our exact location is being confirmed. Please call ${tenant.phone || 'the team'} and we will direct you.`, handoff: true };
    return { reply: `We are at ${address}.${tenant.phone ? ` If you need directions, call ${tenant.phone}.` : ''}` };
  }

  if (intent === 'greeting') {
    return {
      reply: `${settings.greeting || `Hello and welcome to ${tenant.name}.`} I can help with services, prices, opening hours and bookings. What would you like to do?`,
    };
  }

  if (intent === 'thanks') {
    return { reply: `You are welcome. ${tenant.name} looks forward to seeing you.` };
  }

  const faq = faqMatch(text, ctx.knowledge);
  if (faq) return { reply: faq.content };

  const matched = matchService(text, services);
  if (matched) {
    return { reply: `${matched.name} is ${moneyLabel(tenant, matched.price_cents)} and takes ${matched.duration_min} minutes. Would you like me to check the next available times?` };
  }

  return {
    reply: `I want to give you an accurate answer, so let me pass this to the ${tenant.name} team — a person will follow up here. You can also call ${tenant.phone || 'the business'} directly.`,
    handoff: true,
  };
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */
export async function respondToMessage({ tenant, settings, conversation, history, text, channel = 'web', dryRun = false }) {
  const ctx = businessContext(tenant);
  const provider = aiProvider();
  const trimmed = String(text || '').slice(0, 2000);

  let result;
  if (provider.configured) {
    try {
      const messages = [
        { role: 'system', content: `${SYSTEM_RULES}\n\nBUSINESS CONTEXT\n${contextPrompt(tenant, ctx)}` },
        ...history.slice(-12).map((m) => ({ role: m.role === 'customer' ? 'user' : 'assistant', content: m.body })),
        { role: 'user', content: trimmed },
      ];
      const raw = await callProvider(messages);
      const directive = raw?.match(/\[\[MAVYRON_BOOK\s*(\{[\s\S]*?\})\]\]/);
      let reply = (raw || '').replace(/\[\[MAVYRON_BOOK[\s\S]*?\]\]/g, '').trim();
      let booking = null;
      let action = null;
      if (directive) {
        try {
          const payload = JSON.parse(directive[1]);
          const service = serviceById(tenant.id, payload.serviceId);
          if (service && !dryRun) {
            const created = createAppointment({
              tenant,
              serviceId: service.id,
              staffId: payload.staffId,
              startAt: payload.startAt,
              customer: { name: conversation.contact_name || 'Website guest', phone: conversation.contact_ref },
              source: channel === 'whatsapp' ? 'whatsapp' : channel === 'voice' ? 'voice' : 'website',
            });
            booking = created.appointment;
            action = { type: 'appointment_created', appointmentId: created.appointment.id };
            reply = `${reply}\n\nConfirmed: ${service.name} with ${created.staff.name} on ${slotLabel(ctx.tz, payload.startAt)}. Reference ${created.appointment.id.slice(-6).toUpperCase()}.`.trim();
          }
        } catch (err) {
          reply = `${reply}\n\nThat slot is no longer available. ${err.message || ''}`.trim();
        }
      }
      result = { reply: reply || 'Let me connect you with the team.', booking, action, generator: `${provider.provider}:${provider.model}` };
    } catch (err) {
      const fallback = deterministicReply({ tenant, settings, ctx, text: trimmed, conversation });
      result = { ...fallback, generator: 'mavyron-core', provider_error: String(err.message || err).slice(0, 300) };
    }
  } else {
    result = { ...deterministicReply({ tenant, settings, ctx, text: trimmed, conversation }), generator: 'mavyron-core' };
  }

  return {
    reply: result.reply,
    handoff: Boolean(result.handoff),
    booking: result.booking || null,
    action: result.action || null,
    metaPatch: result.meta || null,
    generator: result.generator,
    provider_error: result.provider_error || null,
  };
}

export function recordMessage({ tenantId, conversationId, role, body, meta = {} }) {
  const id = newId('msg_');
  run(
    `INSERT INTO messages (id, tenant_id, conversation_id, role, body, meta, created_at) VALUES (?,?,?,?,?,?,?)`,
    [id, tenantId, conversationId, role, body, JSON.stringify(meta), nowIso()],
  );
  run(`UPDATE conversations SET last_message_at = ? WHERE id = ?`, [nowIso(), conversationId]);
  return get(`SELECT * FROM messages WHERE id = ?`, [id]);
}

/* ------------------------------------------------------------------ *
 * AI content engine — grounded in the tenant brand kit + real services
 * ------------------------------------------------------------------ */
const CONTENT_TEMPLATES = {
  caption: ({ tenant, service }) => ({
    title: `${service?.name || 'Signature service'} — ${tenant.name}`,
    body: `${service ? `${service.name} at ${tenant.name}.` : `At ${tenant.name},`} ${service?.description || 'Precision, care and a result you can feel.'}\n\n${service ? `From ${(service.price_cents / 100).toLocaleString('en-KE')} ${tenant.currency || 'KES'} · ${service.duration_min} minutes.` : ''} Book your slot — link in bio or message us directly.`,
    hashtags: '#Mavyron #BeautyBusiness #Nairobi',
  }),
  image_brief: ({ tenant, service }) => ({
    title: `Visual brief — ${service?.name || tenant.name}`,
    body: `Scene: ${tenant.name} interior, ${service?.name || 'signature service'} moment.\nPalette: ${tenant.brand_color || '#7B5BFF'} with ${tenant.accent_color || '#D8C6A3'} accents on obsidian.\nLighting: soft volumetric, shallow depth of field.\nComposition: subject centred, negative space for the logo top-left.\nOverlay: "${service?.name || tenant.tagline || tenant.name}".`,
    hashtags: '',
  }),
  video_script: ({ tenant, service }) => ({
    title: `15s reel script — ${service?.name || tenant.name}`,
    body: `0-3s Hook: close-up detail shot. Voiceover: "This is what ${service?.name || 'great service'} should feel like."\n4-8s Process: two quick cuts of the service in progress.\n9-12s Result: reveal, client reaction.\n13-15s CTA: "${tenant.name} — book via WhatsApp." End card with logo.`,
    hashtags: '',
  }),
  retention: ({ tenant, customer }) => ({
    title: `Win-back message — ${customer?.name || 'lapsed client'}`,
    body: `Hi ${customer?.name?.split(' ')[0] || 'there'}, we have missed you at ${tenant.name}. Your last visit was a while ago — reply to this message and we will hold a slot that suits you this week.`,
    hashtags: '',
  }),
};

export async function generateContent({ tenant, kind = 'caption', channel = 'instagram', brief = '', serviceId = null }) {
  const service = serviceId ? get(`SELECT * FROM services WHERE id = ? AND tenant_id = ?`, [serviceId, tenant.id]) : null;
  const template = CONTENT_TEMPLATES[kind] || CONTENT_TEMPLATES.caption;
  const provider = aiProvider();

  if (provider.configured) {
    try {
      const ctx = businessContext(tenant, { includeAvailability: false });
      const messages = [
        {
          role: 'system',
          content: `You write on-brand social content for ${tenant.name}, a ${tenant.industry} business in ${tenant.city || 'Nairobi'}.
Brand tone: ${tenant.tagline || 'premium, warm, confident'}. Never invent prices, offers, awards, testimonials or claims.
Return strict JSON: {"title":string,"body":string,"hashtags":string}. Channel: ${channel}. Format: ${kind}.`,
        },
        { role: 'user', content: `Brief: ${brief || 'Promote our services.'}\nServices: ${ctx.services.map((s) => `${s.name} (${s.duration_min}min, ${(s.price_cents / 100).toFixed(0)} ${tenant.currency})`).join('; ') || 'none configured'}` },
      ];
      const raw = await callProvider(messages, { maxTokens: 600, temperature: 0.7 });
      const jsonText = raw?.match(/\{[\s\S]*\}/)?.[0];
      if (jsonText) {
        const parsed = JSON.parse(jsonText);
        return { title: String(parsed.title || '').slice(0, 160), body: String(parsed.body || '').slice(0, 4000), hashtags: String(parsed.hashtags || '').slice(0, 300), generator: `${provider.provider}:${provider.model}` };
      }
      return { title: `${kind} — ${tenant.name}`, body: raw.slice(0, 4000), hashtags: '', generator: `${provider.provider}:${provider.model}` };
    } catch {
      // fall through to templates, clearly labelled
    }
  }
  const t = template({ tenant, service, customer: null });
  return { ...t, generator: 'mavyron-brand-template' };
}
