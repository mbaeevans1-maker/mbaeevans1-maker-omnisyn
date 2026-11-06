import { Link } from 'react-router-dom';
import {
  ArrowRight, Bot, Boxes, Building2, CalendarCheck, ChartLine, CheckCircle2, Cpu, Database,
  Fingerprint, Gauge, Globe2, KeyRound, Layers, Lock, MessagesSquare, Network, Plug, ScanLine,
  ShieldCheck, Sparkles, Store, Users, Workflow,
} from 'lucide-react';
import { Button, Card, Chip, KeyValue, Reveal, SectionHeading } from '../../components/primitives';
import { EcosystemOrbit, GridBackdrop, InfoLine, IntelligenceField, Pathway, ProductFrame } from '../../components/visuals';
import { useSession } from '../../lib/session';

function PageHero({ eyebrow, title, body, children }: { eyebrow: string; title: string; body: string; children?: React.ReactNode }) {
  return (
    <section className="relative border-b border-white/[0.06]">
      <GridBackdrop />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <Reveal>
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-5 max-w-3xl font-display text-[2.1rem] leading-[1.08] tracking-[-0.02em] text-[#f2f4f9] sm:text-[2.9rem]">{title}</h1>
          <p className="lede mt-5 max-w-2xl">{body}</p>
          {children && <div className="mt-8 flex flex-wrap gap-3">{children}</div>}
        </Reveal>
      </div>
    </section>
  );
}

function CtaBand() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.06]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_130%,rgba(123,91,255,0.18),transparent_60%)]" />
      <div className="relative mx-auto w-full max-w-[1240px] px-5 py-16 text-center sm:px-8">
        <h2 className="mx-auto max-w-2xl font-display text-[1.8rem] leading-tight text-[#f2f4f9] sm:text-[2.3rem]">
          Configure once. Operate intelligently.
        </h2>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link to="/signup"><Button size="lg" icon={<ArrowRight size={16} />}>Start 14-day trial</Button></Link>
          <Link to="/contact"><Button size="lg" variant="ghost">Talk to the team</Button></Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ ABOUT */

export function About() {
  return (
    <div>
      <PageHero
        eyebrow="About MAVYRON"
        title="An operating system for the businesses that run everyday life."
        body="MAVYRON builds the intelligence layer for service businesses: the receptionist, the calendar, the customer record, the marketing engine and the reporting — unified in one workspace per business."
      >
        <Link to="/platform"><Button icon={<ArrowRight size={15} />}>Explore the platform</Button></Link>
        <Link to="/contact"><Button variant="ghost">Contact us</Button></Link>
      </PageHero>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr]">
          <Reveal>
            <SectionHeading eyebrow="Why we exist" title="Enterprise intelligence, built for a single salon." />
            <div className="mt-6 space-y-4 text-[0.9rem] leading-relaxed text-[#9aa3b5]">
              <p>
                A salon, clinic or studio answers the same questions dozens of times a day. Which services exist,
                what they cost, who is available, when, and whether the slot is still free. That work is repetitive,
                time-sensitive and unforgiving — and it is still done manually in most businesses.
              </p>
              <p>
                MAVYRON takes that operational load. Each business receives its own isolated workspace, its own AI
                receptionist trained on its own information, and its own real booking calendar. Nothing is shared
                between businesses, and nothing is simulated.
              </p>
              <p>
                We start with salons and barbershops because their operations are unforgiving: real people, real
                times, real money. Get that right and the same architecture extends to spas, clinics, restaurants,
                hotels, gyms and rentals.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <Card className="p-6">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/30 bg-gold/[0.08] font-display text-[0.95rem] text-gold">EK</span>
                <div>
                  <p className="font-display text-[0.98rem] text-[#eef1f7]">Evans Karani Mbae</p>
                  <p className="text-[0.66rem] uppercase tracking-[0.22em] text-[#6f7889]">Founder &amp; CEO</p>
                </div>
              </div>
              <p className="mt-5 text-[0.85rem] leading-relaxed text-[#9aa3b5]">
                “The businesses that keep a city running deserve the same quality of software as the companies
                they admire. That is the whole ambition behind MAVYRON.”
              </p>
              <div className="mt-6 space-y-3 border-t border-white/[0.07] pt-5">
                <KeyValue label="Headquarters">Nairobi, Kenya</KeyValue>
                <KeyValue label="Focus">AI, automation, business infrastructure</KeyValue>
                <KeyValue label="First vertical">Salons &amp; barbershops</KeyValue>
              </div>
            </Card>
          </Reveal>
        </div>

        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { v: 'Intelligence', d: 'Decisions grounded in real business data.' },
            { v: 'Precision', d: 'Exact availability, exact records, exact reporting.' },
            { v: 'Integrity', d: 'No invented metrics. Ever.' },
            { v: 'Innovation', d: 'Ship capability, not claims.' },
            { v: 'Impact', d: 'Measured in booked appointments.' },
          ].map((x, i) => (
            <Reveal key={x.v} delay={i * 60}>
              <Card className="h-full p-5">
                <p className="font-display text-[0.95rem] text-[#eef1f7]">{x.v}</p>
                <p className="mt-2 text-[0.76rem] leading-relaxed text-[#8a93a6]">{x.d}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      <CtaBand />
    </div>
  );
}

/* -------------------------------------------------------------- SOLUTIONS */

const SOLUTION_DETAIL = [
  { icon: Bot, t: 'AI Receptionist', d: 'Configurable personality, escalation rules and knowledge base. It answers from your services, prices, hours and policies — and says so when it does not know.', tags: ['Grounded answers', 'Human handoff', 'Test console'] },
  { icon: CalendarCheck, t: 'Booking Engine', d: 'Availability computed from staff schedules, service duration, buffers, time off, blocked periods and existing appointments in the tenant timezone.', tags: ['No double booking', 'Multi-staff', 'Walk-in & online'] },
  { icon: MessagesSquare, t: 'Conversations', d: 'A shared inbox across web chat and connected channels, with AI/human switching, message history and booking context attached to the customer record.', tags: ['Web chat', 'WhatsApp', 'Inbox SLA'] },
  { icon: Users, t: 'CRM', d: 'Customer profiles with visit history, spend, preferences, notes, consent and segmentation based on real activity.', tags: ['Segments', 'Consent', 'Notes'] },
  { icon: Sparkles, t: 'AI Content Engine', d: 'Brand kit driven generation with an approval workflow: draft, approved, scheduled, publishing, published or failed — nothing published silently.', tags: ['Brand kit', 'Approval', 'Scheduling'] },
  { icon: Plug, t: 'Integration Centre', d: 'Provider credentials are encrypted at rest, verified before being marked connected, and re-verified on demand. Missing configuration is shown as missing.', tags: ['Verified status', 'Encrypted', 'Webhooks'] },
  { icon: Store, t: 'Mini Website', d: 'Every launched business receives a public page on its own slug with services, staff, hours, location, AI assistant and real booking.', tags: ['Public slug', 'QR code', 'Widget'] },
  { icon: ChartLine, t: 'Analytics', d: 'Revenue, bookings, utilisation, no-shows, AI conversations and content performance computed from the tenant’s own tables.', tags: ['30-day view', 'Per staff', 'Per service'] },
  { icon: Layers, t: 'Multi-Vertical Core', d: 'Industry-aware configuration so the same platform can serve salons today and clinics, restaurants, hotels, gyms or rentals next.', tags: ['Vertical-ready', 'Templates', 'Scalable'] },
];

export function Solutions() {
  return (
    <div>
      <PageHero
        eyebrow="Solutions"
        title="Nine systems. One operating workspace."
        body="Every capability below is implemented in the product. Where an external provider is required, the integration architecture is built and its status is reported honestly."
      >
        <Link to="/signup"><Button icon={<ArrowRight size={15} />}>Start free trial</Button></Link>
        <Link to="/platform"><Button variant="ghost">See the platform</Button></Link>
      </PageHero>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SOLUTION_DETAIL.map((s, i) => (
            <Reveal key={s.t} delay={(i % 3) * 70}>
              <Card lift className="group h-full p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-[#b9a8ff] transition-colors group-hover:border-violet/40">
                  <s.icon size={17} />
                </div>
                <h3 className="mt-5 font-display text-[1.05rem] text-[#eef1f7]">{s.t}</h3>
                <p className="mt-2.5 text-[0.82rem] leading-relaxed text-[#8a93a6]">{s.d}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {s.tags.map((t) => <Chip key={t} tone="muted">{t}</Chip>)}
                </div>
              </Card>
            </Reveal>
          ))}
        </div>
        <div className="mt-16 space-y-8">
          <InfoLine text="BUILD · INTEGRATE · AUTOMATE · SCALE" />
        </div>
      </section>

      <CtaBand />
    </div>
  );
}

/* --------------------------------------------------------------- PLATFORM */

export function Platform() {
  const { platform } = useSession();
  const config = (platform?.config || {}) as Record<string, unknown>;
  const rows = [
    { k: 'AI provider', v: String(config.ai_provider || 'Configuration required') },
    { k: 'Payments', v: String(config.payments || 'Configuration required') },
    { k: 'WhatsApp', v: String(config.whatsapp || 'Configuration required') },
    { k: 'Email delivery', v: String(config.email || 'Configuration required') },
  ];

  return (
    <div>
      <PageHero
        eyebrow="The platform"
        title="The intelligent business operating system."
        body="A workspace per business, a calendar that cannot double-book, an AI receptionist that stays inside the facts, and an admin console that respects tenant boundaries."
      >
        <Link to="/signup"><Button icon={<ArrowRight size={15} />}>Create workspace</Button></Link>
        <Link to="/pricing"><Button variant="ghost">Compare plans</Button></Link>
      </PageHero>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Database, t: 'Tenant isolation', d: 'Every query is scoped by tenant id at the data layer, not only in the UI.' },
            { icon: Fingerprint, t: 'Role-based access', d: 'Owner, manager, receptionist and staff permissions enforced server-side.' },
            { icon: Gauge, t: 'Real-time availability', d: 'Slots derived from schedules, durations, time off and blocked periods.' },
            { icon: KeyRound, t: 'Encrypted secrets', d: 'Provider credentials are encrypted at rest and never returned to the browser.' },
          ].map((x, i) => (
            <Reveal key={x.t} delay={i * 70}>
              <Card className="h-full p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#b9a8ff]"><x.icon size={16} /></span>
                <p className="mt-4 text-[0.92rem] text-[#eef1f7]">{x.t}</p>
                <p className="mt-2 text-[0.78rem] leading-relaxed text-[#8a93a6]">{x.d}</p>
              </Card>
            </Reveal>
          ))}
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-[1fr_0.85fr]">
          <Reveal>
            <SectionHeading eyebrow="Inside the workspace" title="Built for daily operation, not a demo." />
            <div className="mt-8 space-y-4">
              <Pathway
                steps={[
                  { title: 'Command centre', body: 'Today’s calendar, pending conversations, revenue, utilisation and outstanding setup.' },
                  { title: 'Calendar & bookings', body: 'Create, reschedule, confirm, complete, cancel and mark no-shows with real conflict checks.' },
                  { title: 'AI inbox', body: 'Every conversation with its messages, handoff state and linked booking.' },
                  { title: 'Content studio', body: 'Generate, edit, approve, schedule and publish with visible failure states.' },
                  { title: 'Integrations', body: 'Connect, verify and disconnect providers with per-field configuration reporting.' },
                ]}
              />
            </div>
          </Reveal>

          <Reveal delay={120}>
            <ProductFrame label="Platform readiness">
              <div className="p-5">
                <p className="text-[0.8rem] text-[#9aa3b5]">
                  Platform provider configuration is reported from the live server environment — never assumed.
                </p>
                <div className="mt-5 space-y-3">
                  {rows.map((r) => (
                    <div key={r.k} className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                      <span className="text-[0.76rem] text-[#8a93a6]">{r.k}</span>
                      <span className={`text-[0.7rem] ${/required/i.test(r.v) ? 'text-amber-300/90' : 'text-emerald-300'}`}>{r.v}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-2 text-[0.68rem] text-[#6f7889]">
                  <ShieldCheck size={12} className="text-emerald-400" />
                  Credentials are never exposed to the client.
                </div>
              </div>
            </ProductFrame>
          </Reveal>
        </div>
      </section>

      <section className="border-y border-white/[0.06] bg-[#070910]/60">
        <div className="mx-auto grid w-full max-w-[1240px] items-center gap-12 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:py-24">
          <Reveal>
            <SectionHeading
              eyebrow="The intelligence field"
              title="A visual language, not decoration."
              body="MAVYRON’s interface represents the flow it automates: intelligence → data → automation → business → growth. Nodes and paths respond to your pointer, at a pace that never competes with the content."
            />
          </Reveal>
          <Reveal delay={100}>
            <IntelligenceField className="h-[300px] w-full rounded-2xl border border-white/[0.08]" />
          </Reveal>
        </div>
      </section>

      <CtaBand />
    </div>
  );
}

/* -------------------------------------------------------------- INDUSTRIES */

const VERTICALS = [
  { name: 'MAVYRON SALON', icon: Store, status: 'Available now', body: 'Services, stylists, colour and treatment workflows, retention and rebooking.' },
  { name: 'MAVYRON BARBER', icon: ScanLine, status: 'Available now', body: 'Fast-turn appointments, chair utilisation and walk-in handling.' },
  { name: 'MAVYRON SPA', icon: Sparkles, status: 'Architected', body: 'Longer sessions, room allocation and package-based services.' },
  { name: 'MAVYRON CLINIC', icon: ShieldCheck, status: 'Architected', body: 'Appointment types, practitioner schedules and consent-aware records.' },
  { name: 'MAVYRON DENTAL', icon: Layers, status: 'Architected', body: 'Multi-stage treatments, recalls and procedure durations.' },
  { name: 'MAVYRON RESTAURANT', icon: Building2, status: 'Architected', body: 'Table and slot reservations mapped onto the same availability core.' },
  { name: 'MAVYRON HOTEL', icon: Globe2, status: 'Architected', body: 'Stay-based availability with service add-ons and guest history.' },
  { name: 'MAVYRON FITNESS', icon: Gauge, status: 'Architected', body: 'Class capacity, trainer schedules and membership-aware booking.' },
  { name: 'MAVYRON RENTALS', icon: Boxes, status: 'Architected', body: 'Asset availability windows and deposit-aware reservation flows.' },
];

export function Industries() {
  return (
    <div>
      <PageHero
        eyebrow="Industries"
        title="One core, engineered for many verticals."
        body="MAVYRON starts with salons and barbershops. The availability engine, tenancy model and AI knowledge system are vertical-agnostic, so new industries reuse the same foundation."
      >
        <Link to="/signup"><Button icon={<ArrowRight size={15} />}>Start with your business</Button></Link>
      </PageHero>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {VERTICALS.map((v, i) => (
            <Reveal key={v.name} delay={(i % 3) * 60}>
              <Card lift className="h-full p-5">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#b9a8ff]"><v.icon size={16} /></span>
                  <Chip tone={v.status === 'Available now' ? 'ok' : 'muted'}>{v.status}</Chip>
                </div>
                <p className="mt-4 font-display text-[0.88rem] tracking-[0.06em] text-[#eef1f7]">{v.name}</p>
                <p className="mt-2 text-[0.78rem] leading-relaxed text-[#8a93a6]">{v.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
        <div className="mt-10 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-4 py-3 text-[0.76rem] leading-relaxed text-amber-100/90">
          “Architected” means the data model and availability core support the vertical, but a dedicated vertical
          experience has not been released. We do not claim availability we have not built.
        </div>
      </section>

      <CtaBand />
    </div>
  );
}

/* ---------------------------------------------------------------- SECURITY */

export function Security() {
  return (
    <div>
      <PageHero
        eyebrow="Security"
        title="Isolation, authorisation and honesty by default."
        body="MAVYRON is built for businesses holding real customer data. This page describes what is implemented in the platform — not certifications we do not hold."
      >
        <Link to="/contact"><Button icon={<ArrowRight size={15} />}>Security questions</Button></Link>
      </PageHero>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-4 md:grid-cols-2">
          {[
            { icon: Database, t: 'Tenant isolation', d: 'Tenant-scoped queries, tenant middleware on every workspace route, and cross-tenant identifiers rejected before data is read.' },
            { icon: Lock, t: 'Authentication', d: 'Password hashing with scrypt, server-side sessions with HttpOnly cookies, session revocation on logout and password change.' },
            { icon: Fingerprint, t: 'Role-based access control', d: 'Permissions are checked on the server for every privileged action; the interface only reflects what the API allows.' },
            { icon: KeyRound, t: 'Secret handling', d: 'Integration credentials are encrypted at rest, masked in responses, and never included in client payloads or logs.' },
            { icon: ScanLine, t: 'Input validation', d: 'Every mutating endpoint validates its payload with a strict schema and returns structured, non-sensitive errors.' },
            { icon: Gauge, t: 'Rate limiting', d: 'Authentication, public booking, AI chat and lead endpoints are rate limited to protect the platform and tenants.' },
            { icon: Cpu, t: 'Audit trail', d: 'Administrative and sensitive workspace actions are written to an audit log scoped to the tenant or the platform.' },
            { icon: ShieldCheck, t: 'Webhook verification', d: 'Inbound provider webhooks are verified with configured secrets before any state is changed.' },
          ].map((x, i) => (
            <Reveal key={x.t} delay={(i % 2) * 70}>
              <Card className="h-full p-6">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300"><x.icon size={17} /></span>
                  <div>
                    <p className="text-[0.95rem] text-[#eef1f7]">{x.t}</p>
                    <p className="mt-2 text-[0.8rem] leading-relaxed text-[#8a93a6]">{x.d}</p>
                  </div>
                </div>
              </Card>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-12">
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-emerald-400" />
              <p className="text-[0.9rem] text-[#eef1f7]">What we do not claim</p>
            </div>
            <p className="mt-3 text-[0.82rem] leading-relaxed text-[#8a93b5]">
              MAVYRON does not claim ISO certification, PCI-DSS compliance of its own systems, or regulatory
              approval. Card data is never stored by MAVYRON; payments are handled by the configured payment
              provider. Where a provider is not configured, the platform states that configuration is required
              rather than simulating a successful payment.
            </p>
          </Card>
        </Reveal>
      </section>

      <CtaBand />
    </div>
  );
}

/* --------------------------------------------------------------- RESOURCES */

export function Resources() {
  return (
    <div>
      <PageHero
        eyebrow="Resources"
        title="Operational knowledge, not marketing filler."
        body="Short, practical material for businesses moving from manual scheduling and manual replies to an intelligent operating model."
      />
      <section className="mx-auto w-full max-w-[1240px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: CalendarCheck, t: 'The cost of a missed message', d: 'What happens operationally when a booking enquiry arrives after hours, and how automated reception changes the outcome.' },
            { icon: Bot, t: 'Designing an AI receptionist that stays honest', d: 'Why grounding an assistant in an approved knowledge base beats a general-purpose chatbot for service businesses.' },
            { icon: Workflow, t: 'From calendar chaos to one source of truth', d: 'How staff schedules, durations and buffers combine into availability that customers can trust.' },
            { icon: Sparkles, t: 'Content that survives approval', d: 'A workflow where generated marketing content is reviewed before it reaches a customer.' },
            { icon: Plug, t: 'Integration reality', d: 'Which channels require official API access, business verification or platform review — and what that means for timelines.' },
            { icon: ShieldCheck, t: 'Customer data, handled properly', d: 'Consent, retention, export and deletion in a multi-tenant service platform.' },
          ].map((x, i) => (
            <Reveal key={x.t} delay={(i % 3) * 60}>
              <Card lift className="h-full p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#b9a8ff]"><x.icon size={16} /></span>
                <p className="mt-4 text-[0.95rem] text-[#eef1f7]">{x.t}</p>
                <p className="mt-2 text-[0.8rem] leading-relaxed text-[#8a93a6]">{x.d}</p>
                <p className="mt-4 text-[0.64rem] uppercase tracking-[0.2em] text-[#4f5768]">Guide · forthcoming</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>
      <CtaBand />
    </div>
  );
}

/* ----------------------------------------------------------------- LEGAL */

function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[880px] px-5 py-16 sm:px-8 lg:py-24">
      <p className="eyebrow">Legal</p>
      <h1 className="mt-4 font-display text-[2rem] text-[#f2f4f9] sm:text-[2.5rem]">{title}</h1>
      <p className="mt-3 text-[0.72rem] uppercase tracking-[0.2em] text-[#6f7889]">Last updated {updated}</p>
      <div className="prose-mv mt-10 space-y-8 text-[0.88rem] leading-relaxed text-[#9aa3b5]">{children}</div>
    </div>
  );
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="6 November 2026">
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">1. Who we are</h2>
        <p className="mt-2">MAVYRON is a business operating platform operated from Nairobi, Kenya. Each business using MAVYRON is an independent data controller of its own customer records; MAVYRON acts as a processor for that data.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">2. Data we process</h2>
        <p className="mt-2">Account data (name, email, phone, organisation), workspace configuration (services, staff, hours), operational data (appointments, customers, conversations) and technical data required to operate the service securely.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">3. Tenant separation</h2>
        <p className="mt-2">Workspace data is isolated per business. Platform administrators can access account-level information required for support and billing, and actions are recorded in an audit trail.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">4. Marketing consent</h2>
        <p className="mt-2">Customer marketing consent is stored per customer record and can be withdrawn. Transactional communication about an appointment is separate from marketing communication.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">5. Retention, export and deletion</h2>
        <p className="mt-2">Workspace owners can export their workspace data and erase customer records through the platform. Deleting a customer anonymises their personal identifiers while preserving required operational history.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">6. Third-party providers</h2>
        <p className="mt-2">When a business connects WhatsApp, social platforms, calendars, payments, email or AI providers, data is exchanged with those providers under their terms. Connections are only active when credentials are configured and verified.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">7. Contact</h2>
        <p className="mt-2">Privacy enquiries can be submitted through the contact page. We respond to verified requests within a reasonable period.</p>
      </section>
    </LegalShell>
  );
}

export function Terms() {
  return (
    <LegalShell title="Terms of Service" updated="6 November 2026">
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">1. The service</h2>
        <p className="mt-2">MAVYRON provides a multi-tenant business operating platform including scheduling, customer records, AI-assisted communication, content workflows and integrations.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">2. Accounts</h2>
        <p className="mt-2">You are responsible for the accuracy of your workspace information, for the security of your credentials, and for the actions of users you invite to your workspace.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">3. Trials and subscriptions</h2>
        <p className="mt-2">New workspaces may begin with a 14-day trial. Paid plans renew according to the selected interval until cancelled. Subscription states include trial, active, past due, cancelled, expired and suspended.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">4. Payments</h2>
        <p className="mt-2">Payments are processed by configured payment providers. MAVYRON does not store raw card details. Where a provider is not configured, checkout is unavailable and the platform says so.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">5. Acceptable use</h2>
        <p className="mt-2">You may not use MAVYRON to send unsolicited bulk messages, misrepresent your business, infringe rights, or attempt to access another tenant’s data.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">6. Third-party platforms</h2>
        <p className="mt-2">WhatsApp, social networks, calendars and payment providers impose their own policies and review processes. Availability of those features depends on their approval and on your credentials.</p>
      </section>
      <section>
        <h2 className="font-display text-[1.1rem] text-[#eef1f7]">7. Liability</h2>
        <p className="mt-2">The platform is provided on an as-available basis. To the extent permitted by law, MAVYRON is not liable for indirect or consequential loss arising from use of the service.</p>
      </section>
    </LegalShell>
  );
}
