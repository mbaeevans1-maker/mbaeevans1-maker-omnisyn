import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowRight, CalendarDays, Check, ChevronLeft, Clock3, Copy, Globe2, MapPin, MessageCircle,
  Phone, Send, Sparkles, Users, X,
} from 'lucide-react';
import { api, errorMessage } from '../lib/api';
import { addDays, dateLong, duration, money, timeOf, titleCase, todayIso, weekdayOf } from '../lib/format';
import { Button, Chip, EmptyState, Field, Input, Spinner, Textarea } from '../components/primitives';

type Business = {
  id: string; slug: string; name: string; industry: string; tagline?: string | null; about?: string | null;
  logo_url?: string | null; brand_color?: string | null; accent_color?: string | null;
  address?: string | null; city?: string | null; country?: string | null; phone?: string | null;
  whatsapp?: string | null; email?: string | null; currency: string; timezone: string;
  gallery?: string[]; social_links?: Record<string, string>;
  hours?: { weekday: number; open: number; close: number }[];
  booking_rules?: Record<string, unknown>; url?: string; plan_name?: string | null; ai_enabled?: number | boolean;
};
type Service = { id: string; name: string; description?: string | null; category?: string | null; duration_min: number; price_cents: number };
type StaffMember = { id: string; name: string; title?: string | null; color?: string | null };
type Slot = { startAt: string; endAt: string; localTime: string; staffId: string; staffName: string; staffTitle?: string | null };
type Payload = { business: Business; services: Service[]; staff: StaffMember[] };
type ChatMsg = { role: 'customer' | 'assistant'; body: string };

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const sessionKey = (slug: string) => `mavyron.chat.${slug}`;

export default function BusinessPage() {
  const { slug = '' } = useParams();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get<Payload>(`/public/business/${slug}`)
      .then((res) => { if (alive) { setData(res); setError(null); } })
      .catch((err) => { if (alive) setError(errorMessage(err)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (data?.business?.name) document.title = `${data.business.name} — Book online`;
  }, [data]);

  const brand = data?.business?.brand_color || '#7B5BFF';
  const accent = data?.business?.accent_color || '#C8A96A';

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-[#07070c]"><Spinner label="Loading business" /></div>;
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#07070c] px-6">
        <div className="max-w-md text-center">
          <p className="text-[0.66rem] uppercase tracking-[0.28em] text-[#6f7889]">MAVYRON</p>
          <h1 className="mt-3 font-display text-2xl text-white">This business page is not available</h1>
          <p className="mt-2 text-sm text-[#8d97a8]">{error || 'The workspace may still be onboarding or unpublished.'}</p>
          <Link to="/" className="mt-6 inline-block"><Button variant="ghost">Return to MAVYRON</Button></Link>
        </div>
      </div>
    );
  }

  const { business, services, staff } = data;

  return (
    <div className="min-h-screen bg-[#07070c] text-[#e8ecf4]" style={{ ['--brand' as string]: brand, ['--accent' as string]: accent }}>
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#07070c]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          {business.logo_url
            ? <img src={business.logo_url} alt={business.name} className="h-9 w-9 rounded-lg object-cover" />
            : <div className="grid h-9 w-9 place-items-center rounded-lg text-sm font-semibold text-white" style={{ background: `linear-gradient(140deg, ${brand}, ${brand}55)` }}>{business.name.slice(0, 1)}</div>}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{business.name}</p>
            <p className="truncate text-[0.66rem] text-[#7d8798]">{business.tagline || titleCase(business.industry)}</p>
          </div>
          <a href="#book" className="hidden sm:block"><Button size="sm">Book appointment</Button></a>
          {business.whatsapp && (
            <a href={`https://wa.me/${business.whatsapp.replace(/[^\d]/g, '')}`} target="_blank" rel="noreferrer" aria-label="WhatsApp">
              <Button size="sm" variant="ghost" icon={<MessageCircle size={14} />}>WhatsApp</Button>
            </a>
          )}
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35]" style={{ background: `radial-gradient(900px 420px at 20% -10%, ${brand}44, transparent 65%), radial-gradient(700px 380px at 85% 0%, ${accent}22, transparent 60%)` }} />
        <div className="relative mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <Chip tone="violet">{titleCase(business.industry)}</Chip>
          <h1 className="mt-5 max-w-2xl font-display text-3xl leading-[1.1] text-white sm:text-5xl">{business.name}</h1>
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-[#9aa3b2] sm:text-base">
            {business.about || business.tagline || 'Book your appointment online in under a minute.'}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a href="#book"><Button icon={<CalendarDays size={15} />}>Book appointment</Button></a>
            {business.phone && <a href={`tel:${business.phone}`}><Button variant="ghost" icon={<Phone size={14} />}>{business.phone}</Button></a>}
            {business.ai_enabled ? <span className="flex items-center gap-1.5 text-[0.7rem] text-[#8d97a8]"><Sparkles size={12} className="text-[#a9a2ff]" /> AI assistant available</span> : null}
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-[0.75rem] text-[#7d8798]">
            {(business.address || business.city) && <span className="flex items-center gap-1.5"><MapPin size={13} />{[business.address, business.city, business.country].filter(Boolean).join(', ')}</span>}
            {business.email && <span className="flex items-center gap-1.5"><Globe2 size={13} />{business.email}</span>}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        <section className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <div>
              <h2 className="font-display text-xl text-white">Services</h2>
              <div className="mt-4 space-y-2">
                {services.length === 0 && <EmptyState title="No services published" body="This business has not published services yet." />}
                {services.map((s) => (
                  <a key={s.id} href="#book" className="flex items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 transition hover:border-white/15">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white">{s.name}</p>
                      {s.description && <p className="mt-0.5 line-clamp-1 text-[0.72rem] text-[#7d8798]">{s.description}</p>}
                    </div>
                    <span className="text-[0.7rem] text-[#7d8798]">{duration(s.duration_min)}</span>
                    <span className="text-sm text-[#e8ecf4]">{s.price_cents ? money(s.price_cents, business.currency) : '—'}</span>
                  </a>
                ))}
              </div>
            </div>

            {staff.length > 0 && (
              <div>
                <h2 className="font-display text-xl text-white">Team</h2>
                <div className="mt-4 flex flex-wrap gap-3">
                  {staff.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 rounded-full border border-white/[0.06] px-3 py-2">
                      <span className="grid h-7 w-7 place-items-center rounded-full text-[0.66rem] font-medium text-white" style={{ background: `${m.color || brand}44` }}>
                        {m.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                      </span>
                      <div>
                        <p className="text-[0.78rem] text-white">{m.name}</p>
                        {m.title && <p className="text-[0.62rem] text-[#6f7889]">{m.title}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.2em] text-[#6f7889]"><Clock3 size={13} /> Opening hours</p>
              <div className="mt-3 space-y-1.5">
                {(business.hours || []).length === 0 && <p className="text-[0.75rem] text-[#7d8798]">Hours not published.</p>}
                {DAYS.map((label, i) => {
                  const rows = (business.hours || []).filter((h) => h.weekday === i);
                  return (
                    <div key={label} className="flex justify-between text-[0.75rem]">
                      <span className="text-[#8d97a8]">{label}</span>
                      <span className="text-[#c9d0dc]">{rows.length ? rows.map((r) => `${r.open}–${r.close}`).join(', ') : 'Closed'}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {business.gallery && business.gallery.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {business.gallery.slice(0, 4).map((src) => <img key={src} src={src} alt="" loading="lazy" className="h-24 w-full rounded-lg object-cover" />)}
              </div>
            )}

            <div className="rounded-xl border border-white/[0.06] p-4">
              <p className="text-[0.7rem] uppercase tracking-[0.2em] text-[#6f7889]">Share</p>
              <div className="mt-3 flex items-center gap-2">
                <img src={`/api/public/business/${business.slug}/qr`} alt="Booking QR code" className="h-20 w-20 rounded-md bg-white p-1" />
                <p className="text-[0.7rem] leading-relaxed text-[#7d8798]">Scan to open this booking page.</p>
              </div>
            </div>
          </aside>
        </section>

        <BookingSection slug={business.slug} services={services} currency={business.currency} brand={brand} rules={business.booking_rules || {}} />

        <EmbedBlock slug={business.slug} />
      </main>

      <footer className="border-t border-white/[0.06] py-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 text-[0.72rem] text-[#6f7889] sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span>© {new Date().getFullYear()} {business.name}. Bookings powered by MAVYRON.</span>
          <div className="flex flex-wrap gap-3">
            {Object.entries(business.social_links || {}).filter(([, v]) => v).map(([k, v]) => (
              <a key={k} href={v} target="_blank" rel="noreferrer" className="hover:text-white">{titleCase(k)}</a>
            ))}
            <Link to="/" className="hover:text-white">MAVYRON</Link>
          </div>
        </div>
      </footer>

      {business.ai_enabled ? <ChatWidget slug={business.slug} brand={brand} name={business.name} /> : null}
    </div>
  );
}

/* ------------------------------ booking ------------------------------ */

function BookingSection({ slug, services, currency, brand, rules }: {
  slug: string; services: Service[]; currency: string; brand: string; rules: Record<string, unknown>;
}) {
  const [serviceId, setServiceId] = useState(services[0]?.id || '');
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '', consent: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ reference: string; start_at: string; service: string; staff: string; price_cents: number } | null>(null);

  const days = useMemo(() => Array.from({ length: 10 }, (_, i) => addDays(todayIso(), i)), []);
  const service = services.find((s) => s.id === serviceId);

  const loadSlots = useCallback(async () => {
    if (!serviceId) return;
    setLoadingSlots(true);
    setSlot(null);
    try {
      const res = await api.get<{ slots: Slot[] }>(`/public/business/${slug}/availability?serviceId=${serviceId}&date=${date}`);
      setSlots(res.slots || []);
      setError(null);
    } catch (err) {
      setSlots([]);
      setError(errorMessage(err));
    } finally {
      setLoadingSlots(false);
    }
  }, [slug, serviceId, date]);

  useEffect(() => { void loadSlots(); }, [loadSlots]);

  const submit = async () => {
    if (!slot || !service) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ appointment: { reference: string; start_at: string; service: string; staff: string; price_cents: number } }>(
        `/public/business/${slug}/book`,
        {
          serviceId: service.id, staffId: slot.staffId, startAt: slot.startAt,
          name: form.name.trim(), phone: form.phone.trim(),
          email: form.email.trim() || null, notes: form.notes.trim() || null,
          marketing_consent: form.consent,
        },
      );
      setConfirmed(res.appointment);
      setSlots((rows) => rows.filter((s) => s.startAt !== slot.startAt));
      setSlot(null);
      setForm({ name: '', phone: '', email: '', notes: '', consent: false });
    } catch (err) {
      setError(errorMessage(err));
      void loadSlots();
    } finally {
      setBusy(false);
    }
  };

  if (confirmed) {
    return (
      <section id="book" className="mt-12 scroll-mt-24 rounded-2xl border border-emerald-400/25 bg-emerald-400/[0.05] p-6 sm:p-8">
        <div className="flex items-center gap-2 text-emerald-200"><Check size={18} /> <span className="text-[0.7rem] uppercase tracking-[0.24em]">Appointment confirmed</span></div>
        <h2 className="mt-3 font-display text-2xl text-white">Reference {confirmed.reference}</h2>
        <div className="mt-3 space-y-1 text-sm text-[#c9d0dc]">
          <p>{confirmed.service} with {confirmed.staff}</p>
          <p>{dateLong(confirmed.start_at)} · {timeOf(confirmed.start_at)}</p>
          <p>{confirmed.price_cents ? money(confirmed.price_cents, currency) : 'Price confirmed in salon'}</p>
        </div>
        <p className="mt-4 text-[0.72rem] text-[#8d97a8]">A confirmation was recorded against your number. Reply to the business WhatsApp line to reschedule.</p>
        <Button className="mt-5" variant="ghost" onClick={() => setConfirmed(null)}>Book another appointment</Button>
      </section>
    );
  }

  return (
    <section id="book" className="mt-12 scroll-mt-24 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 sm:p-7">
      <h2 className="font-display text-xl text-white">Book an appointment</h2>
      <p className="mt-1 text-[0.75rem] text-[#7d8798]">Availability is calculated live from staff schedules and existing bookings.</p>

      {services.length === 0 ? (
        <div className="mt-4"><EmptyState title="Booking is not open yet" body="No services have been published for online booking." /></div>
      ) : (
        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[0.66rem] uppercase tracking-[0.2em] text-[#6f7889]">1 · Service</p>
              <div className="space-y-2">
                {services.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setServiceId(s.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${serviceId === s.id ? 'border-white/25 bg-white/[0.06]' : 'border-white/[0.06] hover:border-white/15'}`}
                  >
                    <span className="flex-1 text-[0.8rem] text-white">{s.name}</span>
                    <span className="text-[0.68rem] text-[#7d8798]">{duration(s.duration_min)}</span>
                    <span className="text-[0.78rem] text-[#c9d0dc]">{s.price_cents ? money(s.price_cents, currency) : '—'}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[0.66rem] uppercase tracking-[0.2em] text-[#6f7889]">2 · Date</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((d) => (
                  <button
                    key={d}
                    onClick={() => setDate(d)}
                    className={`min-w-[58px] rounded-lg border px-2 py-2 text-center transition ${date === d ? 'border-white/25 bg-white/[0.07] text-white' : 'border-white/[0.06] text-[#8d97a8] hover:border-white/15'}`}
                  >
                    <span className="block text-[0.6rem] uppercase tracking-wider">{weekdayOf(d).slice(0, 3)}</span>
                    <span className="block text-[0.85rem]">{d.slice(-2)}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[0.66rem] uppercase tracking-[0.2em] text-[#6f7889]">3 · Time</p>
              {loadingSlots ? <Spinner label="Checking availability" /> : slots.length === 0 ? (
                <p className="rounded-lg border border-white/[0.06] px-3 py-3 text-[0.75rem] text-[#7d8798]">
                  No open slots on this day. Try another date or contact the business directly.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((s) => (
                    <button
                      key={`${s.startAt}-${s.staffId}`}
                      onClick={() => setSlot(s)}
                      className={`rounded-md border px-2.5 py-1.5 text-[0.72rem] transition ${slot?.startAt === s.startAt && slot?.staffId === s.staffId ? 'border-white/30 bg-white/[0.09] text-white' : 'border-white/[0.08] text-[#c9d0dc] hover:border-white/20'}`}
                      title={s.staffName}
                    >
                      {s.localTime}
                    </button>
                  ))}
                </div>
              )}
              {slot && <p className="mt-2 text-[0.7rem] text-[#8d97a8]">With {slot.staffName}{slot.staffTitle ? ` · ${slot.staffTitle}` : ''}</p>}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/[0.06] bg-black/20 p-4">
            <p className="text-[0.66rem] uppercase tracking-[0.2em] text-[#6f7889]">4 · Your details</p>
            <Field label="Full name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Your name" /></Field>
            <Field label="Phone" required><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254 7xx xxx xxx" inputMode="tel" /></Field>
            <Field label="Email" hint={rules.requireEmail ? 'Required by this business.' : 'Optional'}><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Anything the team should know" /></Field>
            <label className="flex items-start gap-2 text-[0.7rem] text-[#8d97a8]">
              <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} className="mt-0.5 h-3.5 w-3.5 rounded border-white/20 bg-transparent" />
              I agree to receive appointment updates and occasional offers.
            </label>
            {error && <p className="text-[0.72rem] text-red-300">{error}</p>}
            <Button
              block
              loading={busy}
              disabled={!slot || !form.name.trim() || !form.phone.trim() || (rules.requireEmail === true && !form.email.trim())}
              onClick={() => void submit()}
              icon={<ArrowRight size={15} />}
            >
              {slot ? `Confirm ${slot.localTime}` : 'Select a time'}
            </Button>
            <p className="text-[0.66rem] leading-relaxed text-[#5c6577]">
              Your details are stored only for this booking and are never sold. Powered by MAVYRON.
            </p>
          </div>
        </div>
      )}
      <div className="mt-4 h-px w-full" style={{ background: `linear-gradient(90deg, transparent, ${brand}55, transparent)` }} />
    </section>
  );
}

/* ------------------------------ chat ------------------------------ */

function ChatWidget({ slug, brand, name }: { slug: string; brand: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const session = useRef<string>('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const key = sessionKey(slug);
    const existing = localStorage.getItem(key);
    const id = existing && existing.length >= 6 ? existing : (globalThis.crypto?.randomUUID?.() || `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    localStorage.setItem(key, id);
    session.current = id;
  }, [slug]);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [messages, open]);

  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setText('');
    setMessages((rows) => [...rows, { role: 'customer', body }]);
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ reply: string }>('/public/chat', { slug, message: body, sessionId: session.current });
      setMessages((rows) => [...rows, { role: 'assistant', body: res.reply }]);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close assistant' : 'Open assistant'}
        className="fixed bottom-5 right-5 z-40 grid h-12 w-12 place-items-center rounded-full text-white shadow-[0_18px_45px_-12px_rgba(0,0,0,0.8)] transition hover:scale-105"
        style={{ background: `linear-gradient(140deg, ${brand}, ${brand}88)` }}
      >
        {open ? <X size={18} /> : <MessageCircle size={18} />}
      </button>

      {open && (
        <div className="fixed bottom-20 right-4 z-40 flex h-[26rem] w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12]/97 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
            <Sparkles size={14} style={{ color: brand }} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8rem] text-white">{name} assistant</p>
              <p className="text-[0.6rem] text-[#6f7889]">Answers from this business's own information</p>
            </div>
          </div>
          <div ref={scroller} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[0.72rem] leading-relaxed text-[#9aa3b2]">
                Ask about services, prices, opening hours or booking. If something needs a human, I'll hand you over.
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-[0.75rem] leading-relaxed ${m.role === 'customer' ? 'ml-auto bg-white/[0.08] text-white' : 'bg-white/[0.03] text-[#c9d0dc]'}`}>
                {m.body}
              </div>
            ))}
            {busy && <div className="text-[0.7rem] text-[#6f7889]">Typing…</div>}
            {error && <p className="text-[0.7rem] text-red-300">{error}</p>}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex items-center gap-2 border-t border-white/[0.07] p-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ask a question…"
              className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.75rem] text-white outline-none focus:border-white/25"
            />
            <button type="submit" disabled={!text.trim() || busy} aria-label="Send" className="grid h-8 w-8 place-items-center rounded-lg text-white disabled:opacity-40" style={{ background: brand }}>
              <Send size={14} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}

/* ------------------------------ embed ------------------------------ */

function EmbedBlock({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  const snippet = `<script src="${window.location.origin}/api/public/business/${slug}/widget.js" async></script>`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <section className="mt-10 rounded-2xl border border-white/[0.06] p-5">
      <div className="flex flex-wrap items-center gap-3">
        <Users size={15} className="text-[#a9a2ff]" />
        <div className="min-w-0 flex-1">
          <p className="text-[0.8rem] text-white">Embed this booking widget</p>
          <p className="text-[0.7rem] text-[#7d8798]">Add the snippet to any site to accept bookings.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void copy()} icon={copied ? <Check size={13} /> : <Copy size={13} />}>{copied ? 'Copied' : 'Copy snippet'}</Button>
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 text-[0.68rem] text-[#9aa3b2]">{snippet}</pre>
      <Link to="/" className="mt-3 inline-flex items-center gap-1 text-[0.7rem] text-[#7d8798] hover:text-white"><ChevronLeft size={12} /> Powered by MAVYRON</Link>
    </section>
  );
}
