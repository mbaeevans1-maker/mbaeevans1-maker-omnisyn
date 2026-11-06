import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Globe2, Handshake, MessagesSquare, Send, Sparkles } from 'lucide-react';
import { Alert, Button, Card, Chip, Field, Input, Reveal, SectionHeading, Select, Textarea } from '../../components/primitives';
import { EcosystemOrbit, GridBackdrop, InfoLine } from '../../components/visuals';
import { api, errorMessage } from '../../lib/api';

type FieldErrors = Record<string, string[]>;

function extractErrors(err: unknown): FieldErrors {
  const e = err as { details?: unknown };
  if (e && typeof e.details === 'object' && e.details) {
    const out: FieldErrors = {};
    for (const [k, v] of Object.entries(e.details as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.map(String);
      else if (typeof v === 'string') out[k] = [v];
    }
    return out;
  }
  return {};
}

const PARTNERSHIP_TYPES = [
  { value: 'technology', label: 'Technology / API partner' },
  { value: 'reseller', label: 'Reseller or implementation partner' },
  { value: 'agency', label: 'Agency or consultancy' },
  { value: 'integration', label: 'Integration provider' },
  { value: 'strategic', label: 'Strategic partnership' },
  { value: 'other', label: 'Other' },
];

/* --------------------------------------------------------------- CONTACT */

export function Contact() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', organisation: '', subject: '', message: '' });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [failure, setFailure] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure('');
    setErrors({});
    setState('sending');
    try {
      await api.post('/api/public/contact', form);
      setState('sent');
      setForm({ name: '', email: '', phone: '', organisation: '', subject: '', message: '' });
    } catch (err) {
      setState('idle');
      setErrors(extractErrors(err));
      setFailure(errorMessage(err));
    }
  }

  return (
    <div>
      <section className="relative border-b border-white/[0.06]">
        <GridBackdrop />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 pb-12 pt-16 sm:px-8 lg:pt-24">
          <Reveal>
            <p className="eyebrow">Contact</p>
            <h1 className="mt-5 max-w-3xl font-display text-[2.1rem] leading-[1.08] tracking-[-0.02em] text-[#f2f4f9] sm:text-[2.9rem]">
              Talk to the people building the platform.
            </h1>
            <p className="lede mt-5 max-w-2xl">
              Questions about the platform, an integration, a migration or a partnership. Every submission is
              stored as a real record — you will see a confirmation only after it is saved.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-14 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal>
            <Card className="p-6 sm:p-7">
              {state === 'sent' ? (
                <div className="py-10 text-center">
                  <CheckCircle2 size={34} className="mx-auto text-emerald-400" />
                  <h2 className="mt-4 font-display text-[1.25rem] text-[#f2f4f9]">Message received.</h2>
                  <p className="mx-auto mt-2 max-w-sm text-[0.84rem] leading-relaxed text-[#8a93a6]">
                    Your enquiry has been stored and the team will respond to the email address you provided.
                  </p>
                  <div className="mt-6 flex justify-center gap-3">
                    <Button variant="ghost" onClick={() => setState('idle')}>Send another</Button>
                    <Link to="/partnerships"><Button variant="quiet" icon={<ArrowRight size={14} />}>Partnerships</Button></Link>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <SectionHeading eyebrow="Enquiry" title="Send a message" />
                  {failure && <Alert tone="error" title="Message not sent">{failure}</Alert>}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" required error={errors.name?.[0]}>
                      <Input value={form.name} onChange={set('name')} placeholder="Full name" required autoComplete="name" />
                    </Field>
                    <Field label="Email" required error={errors.email?.[0]}>
                      <Input type="email" value={form.email} onChange={set('email')} placeholder="you@business.com" required autoComplete="email" />
                    </Field>
                    <Field label="Phone" error={errors.phone?.[0]}>
                      <Input value={form.phone} onChange={set('phone')} placeholder="+254 …" autoComplete="tel" />
                    </Field>
                    <Field label="Organisation" error={errors.organisation?.[0]}>
                      <Input value={form.organisation} onChange={set('organisation')} placeholder="Business name" autoComplete="organization" />
                    </Field>
                  </div>
                  <Field label="Subject" required error={errors.subject?.[0]}>
                    <Input value={form.subject} onChange={set('subject')} placeholder="What is this about?" required />
                  </Field>
                  <Field label="Message" required error={errors.message?.[0]} hint="Minimum 10 characters.">
                    <Textarea rows={6} value={form.message} onChange={set('message')} placeholder="Tell us what you need." required />
                  </Field>
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <p className="text-[0.68rem] leading-relaxed text-[#5f6779]">
                      Submitted data is stored securely and used only to respond to your enquiry.
                    </p>
                    <Button type="submit" loading={state === 'sending'} icon={<Send size={14} />}>Send message</Button>
                  </div>
                </form>
              )}
            </Card>
          </Reveal>

          <div className="space-y-4">
            <Reveal delay={80}>
              <Card className="p-6">
                <div className="flex items-center gap-2">
                  <MessagesSquare size={15} className="text-[#b9a8ff]" />
                  <p className="text-[0.9rem] text-[#eef1f7]">Direct channels</p>
                </div>
                <p className="mt-3 text-[0.8rem] leading-relaxed text-[#8a93a6]">
                  WhatsApp and SMS are delivered through providers configured for each business workspace. Where a
                  provider is not configured, the integration centre reports “configuration required” rather than
                  pretending a message was sent.
                </p>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <span className="text-[0.72rem] text-[#6f7889]">Business enquiries</span>
                    <Chip tone="muted">Contact form</Chip>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <span className="text-[0.72rem] text-[#6f7889]">Partnership proposals</span>
                    <Link to="/partnerships" className="text-[0.72rem] text-[#c4b7ff] hover:text-white">Open form →</Link>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                    <span className="text-[0.72rem] text-[#6f7889]">Headquarters</span>
                    <span className="text-[0.72rem] text-[#b7bfcf]">Nairobi, Kenya</span>
                  </div>
                </div>
              </Card>
            </Reveal>

            <Reveal delay={140}>
              <Card className="p-6">
                <div className="flex items-center gap-2">
                  <Sparkles size={15} className="text-gold" />
                  <p className="text-[0.9rem] text-[#eef1f7]">Already operating a business?</p>
                </div>
                <p className="mt-3 text-[0.8rem] leading-relaxed text-[#8a93a6]">
                  Create a workspace and configure your services, staff and AI receptionist yourself. Setup takes
                  minutes and the trial requires no card.
                </p>
                <Link to="/signup" className="mt-4 block">
                  <Button block variant="ghost" icon={<ArrowRight size={14} />}>Start 14-day trial</Button>
                </Link>
              </Card>
            </Reveal>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------- PARTNERSHIPS */

export function Partnerships() {
  const [form, setForm] = useState({
    name: '', organisation: '', position: '', email: '', phone: '',
    partnership_type: 'technology', proposal: '', website: '', additional: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [failure, setFailure] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFailure('');
    setErrors({});
    setState('sending');
    try {
      await api.post('/api/public/partnership', form);
      setState('sent');
    } catch (err) {
      setState('idle');
      setErrors(extractErrors(err));
      setFailure(errorMessage(err));
    }
  }

  return (
    <div>
      <section className="relative border-b border-white/[0.06]">
        <GridBackdrop />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 pb-12 pt-16 sm:px-8 lg:pt-24">
          <Reveal>
            <p className="eyebrow">Partnerships</p>
            <h1 className="mt-5 max-w-3xl font-display text-[2.1rem] leading-[1.08] tracking-[-0.02em] text-[#f2f4f9] sm:text-[2.9rem]">
              Build the operating layer for service businesses with us.
            </h1>
            <p className="lede mt-5 max-w-2xl">
              MAVYRON works with technology providers, implementation partners and agencies. Proposals are stored as
              real records and reviewed by the team.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-14 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="space-y-4">
            <Reveal>
              <Card className="p-6">
                <div className="flex items-center gap-2">
                  <Handshake size={15} className="text-gold" />
                  <p className="text-[0.9rem] text-[#eef1f7]">How we partner</p>
                </div>
                <div className="mt-4 space-y-3.5">
                  {[
                    { t: 'Technology & API', d: 'Voice, messaging, payments, calendar or AI providers integrating with the platform.' },
                    { t: 'Implementation', d: 'Partners onboarding businesses, configuring workspaces and supporting operations.' },
                    { t: 'Agency & consultancy', d: 'Teams delivering digital transformation for service businesses.' },
                    { t: 'Strategic', d: 'Distribution, vertical expansion or market partnerships.' },
                  ].map((x) => (
                    <div key={x.t}>
                      <p className="text-[0.82rem] text-[#dfe4ee]">{x.t}</p>
                      <p className="mt-1 text-[0.76rem] leading-relaxed text-[#8a93a6]">{x.d}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </Reveal>
            <Reveal delay={80}>
              <Card className="overflow-hidden p-0">
                <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
                  <span className="text-[0.72rem] uppercase tracking-[0.18em] text-[#6f7889]">Partner ecosystem</span>
                  <Globe2 size={13} className="text-[#6f7889]" />
                </div>
                <EcosystemOrbit
                  centre="MAVYRON"
                  orbiters={['WhatsApp', 'Paystack', 'Google Calendar', 'Instagram', 'TikTok', 'AI Providers']}
                  className="h-[300px] w-full"
                />
              </Card>
            </Reveal>
          </div>

          <Reveal delay={60}>
            <Card className="p-6 sm:p-7">
              {state === 'sent' ? (
                <div className="py-12 text-center">
                  <CheckCircle2 size={34} className="mx-auto text-emerald-400" />
                  <h2 className="mt-4 font-display text-[1.25rem] text-[#f2f4f9]">Partnership enquiry received.</h2>
                  <p className="mx-auto mt-2 max-w-sm text-[0.84rem] leading-relaxed text-[#8a93a6]">
                    Your proposal has been stored. The team reviews partnership submissions and will follow up by email.
                  </p>
                  <div className="mt-6 flex justify-center">
                    <Button variant="ghost" onClick={() => setState('idle')}>Submit another</Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  <SectionHeading eyebrow="Proposal" title="Partnership application" />
                  {failure && <Alert tone="error" title="Proposal not submitted">{failure}</Alert>}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name" required error={errors.name?.[0]}>
                      <Input value={form.name} onChange={set('name')} required autoComplete="name" placeholder="Full name" />
                    </Field>
                    <Field label="Position" error={errors.position?.[0]}>
                      <Input value={form.position} onChange={set('position')} placeholder="Role or title" />
                    </Field>
                    <Field label="Organisation" required error={errors.organisation?.[0]}>
                      <Input value={form.organisation} onChange={set('organisation')} required placeholder="Company name" autoComplete="organization" />
                    </Field>
                    <Field label="Email" required error={errors.email?.[0]}>
                      <Input type="email" value={form.email} onChange={set('email')} required autoComplete="email" placeholder="you@company.com" />
                    </Field>
                    <Field label="Phone" error={errors.phone?.[0]}>
                      <Input value={form.phone} onChange={set('phone')} placeholder="+254 …" autoComplete="tel" />
                    </Field>
                    <Field label="Website" error={errors.website?.[0]}>
                      <Input value={form.website} onChange={set('website')} placeholder="https://" />
                    </Field>
                  </div>
                  <Field label="Partnership type" required error={errors.partnership_type?.[0]}>
                    <Select value={form.partnership_type} onChange={set('partnership_type')} options={PARTNERSHIP_TYPES} />
                  </Field>
                  <Field label="Proposal" required error={errors.proposal?.[0]} hint="What would we build together, and why now?">
                    <Textarea rows={5} value={form.proposal} onChange={set('proposal')} required placeholder="Describe the partnership." />
                  </Field>
                  <Field label="Additional information" error={errors.additional?.[0]}>
                    <Textarea rows={3} value={form.additional} onChange={set('additional')} placeholder="Anything else the team should know." />
                  </Field>
                  <div className="flex items-center justify-between gap-4 pt-1">
                    <p className="text-[0.68rem] leading-relaxed text-[#5f6779]">Stored securely. No marketing lists.</p>
                    <Button type="submit" loading={state === 'sending'} icon={<Send size={14} />}>Submit proposal</Button>
                  </div>
                </form>
              )}
            </Card>
          </Reveal>
        </div>

        <div className="mt-14"><InfoLine text="STRATEGIC PARTNERSHIPS · NAIROBI → AFRICA → THE WORLD" reverse /></div>
      </section>
    </div>
  );
}
