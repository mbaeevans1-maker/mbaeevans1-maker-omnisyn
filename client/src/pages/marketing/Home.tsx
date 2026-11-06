import { Link } from 'react-router-dom';
import {
  ArrowRight, Bot, Boxes, CalendarCheck, ChartLine, CreditCard, Globe2, Layers,
  MessagesSquare, Plug, ShieldCheck, Sparkles, Store, Workflow,
} from 'lucide-react';
import { Button, Card, Chip, Reveal, SectionHeading, Stat } from '../../components/primitives';
import { GridBackdrop, IntelligenceField, IntelligenceStrip, InfoLine, Pathway, ProductFrame } from '../../components/visuals';
import { useSession } from '../../lib/session';

const SOLUTIONS = [
  { icon: Bot, title: 'AI Receptionist', body: 'Answers every enquiry with your services, prices, staff and policies — then books the appointment itself.' },
  { icon: CalendarCheck, title: 'Real Booking Engine', body: 'Live availability from staff schedules, service duration, breaks and holidays. Double bookings are impossible.' },
  { icon: MessagesSquare, title: 'WhatsApp Automation', body: 'Your official business number, connected through the official API, replying as your business and escalating to your team.' },
  { icon: Workflow, title: 'Business Automation', body: 'Confirmations, reminders, follow-ups and retention sequences driven by real appointment state.' },
  { icon: Store, title: 'Mini Website', body: 'A public booking page on your own slug, with QR code and an embeddable widget for any site.' },
  { icon: ChartLine, title: 'Revenue Intelligence', body: 'Bookings, completed services, no-shows and revenue computed from your own records — never invented.' },
  { icon: Sparkles, title: 'AI Content Engine', body: 'On-brand posts, offers and captions from your brand kit, with approve, schedule and publish control.' },
  { icon: Plug, title: 'Integration Centre', body: 'WhatsApp, Instagram, Facebook, TikTok, X, Google Calendar, payments and voice — with verified statuses.' },
  { icon: Layers, title: 'Vertical Architecture', body: 'One platform engineered for salons today and clinics, spas, restaurants, hotels, gyms and rentals next.' },
];

const INDUSTRIES = [
  { name: 'Salon', status: 'Available' },
  { name: 'Barber', status: 'Available' },
  { name: 'Spa', status: 'Architected' },
  { name: 'Clinic', status: 'Architected' },
  { name: 'Dental', status: 'Architected' },
  { name: 'Restaurant', status: 'Architected' },
  { name: 'Hotel', status: 'Architected' },
  { name: 'Fitness', status: 'Architected' },
  { name: 'Rentals', status: 'Architected' },
];

export default function Home() {
  const { user, tenant } = useSession();
  const appHref = user ? (user.role === 'platform_admin' ? '/admin' : tenant ? '/app' : '/app/setup') : '/signup';

  return (
    <div className="overflow-x-clip">
      {/* ---------------------------------------------------------------- HERO */}
      <section className="relative">
        <GridBackdrop />
        <div className="relative mx-auto grid w-full max-w-[1240px] items-center gap-14 px-5 pb-20 pt-16 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:pb-28 lg:pt-24">
          <div>
            <Reveal>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.5)]" />
                <span className="text-[0.62rem] uppercase tracking-[0.26em] text-[#a8b0c0]">The Intelligent Business OS</span>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-7 font-display text-[2.45rem] leading-[1.06] tracking-[-0.02em] text-[#f2f4f9] sm:text-[3.3rem] lg:text-[3.7rem]">
                Your business,
                <br />
                <span className="text-gradient-violet">operating on intelligence.</span>
              </h1>
            </Reveal>

            <Reveal delay={140}>
              <p className="mt-6 max-w-xl text-[0.95rem] leading-relaxed text-[#9aa3b5]">
                MAVYRON gives service businesses their own AI operating system — a receptionist that never misses a
                message, a booking engine that never double-books, and marketing that never stops working.
              </p>
            </Reveal>

            <Reveal delay={200}>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link to={appHref}><Button size="lg" icon={<ArrowRight size={16} />}>Start 14-day trial</Button></Link>
                <Link to="/platform"><Button size="lg" variant="ghost">See the platform</Button></Link>
              </div>
              <p className="mt-4 text-[0.72rem] text-[#6f7889]">
                No card required to start. Cancel any time. Real availability, real bookings from day one.
              </p>
            </Reveal>

            <Reveal delay={260}>
              <div className="mt-10 grid max-w-lg grid-cols-3 gap-6 border-t border-white/[0.07] pt-6">
                <Stat label="Vertical" value="Salon-first" sub="Barber · Spa · Clinic" />
                <Stat label="Tenancy" value="Isolated" sub="Per-business data" />
                <Stat label="Trial" value="14 days" sub="Configurable" />
              </div>
            </Reveal>
          </div>

          <Reveal delay={120} className="relative">
            <div className="relative rounded-[26px] border border-white/10 bg-[#080b12]/70 p-2 backdrop-blur-sm">
              <IntelligenceField className="h-[320px] w-full overflow-hidden rounded-[20px] sm:h-[400px] lg:h-[440px]" />
              <div className="pointer-events-none absolute inset-x-6 bottom-6 flex items-end justify-between gap-3">
                <div className="rounded-xl border border-white/10 bg-[#05060a]/80 px-3.5 py-2.5 backdrop-blur">
                  <p className="text-[0.55rem] uppercase tracking-[0.28em] text-[#6f7889]">AI Receptionist</p>
                  <p className="mt-1 text-[0.78rem] text-[#dde2ec]">Booking a 45-min service</p>
                </div>
                <div className="rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-3.5 py-2.5 backdrop-blur">
                  <p className="text-[0.55rem] uppercase tracking-[0.28em] text-emerald-300/70">Live</p>
                  <p className="mt-1 text-[0.78rem] text-emerald-100">Slot confirmed</p>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------- INTELLIGENCE STRIP */}
      <IntelligenceStrip items={['AI RECEPTION', 'AUTOMATION', 'BOOKINGS', 'CUSTOMERS', 'CONTENT', 'INTEGRATIONS', 'ANALYTICS']} />

      {/* ------------------------------------------------------- INTELLIGENCE LAYER */}
      <section className="relative mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
        <SectionHeading
          eyebrow="Section 01 · The intelligence layer"
          title="One system connecting AI, data and the work itself."
          body="Most tools stop at software. MAVYRON operates: it answers, decides, books, reminds, publishes and reports — inside the rules you define."
        />

        <div className="mt-14 grid gap-4 md:grid-cols-3">
          {[
            { icon: Bot, k: 'Intelligence', t: 'Grounded in your business', b: 'Your services, prices, staff, hours and policies become the only source the AI may answer from. Unknown questions escalate to a human.' },
            { icon: Boxes, k: 'Operations', t: 'Real state, not mockups', b: 'Every appointment, customer and message lives in your workspace database. Dashboards read from it directly.' },
            { icon: Globe2, k: 'Growth', t: 'Publishing with permission', b: 'Content moves through draft, approval, schedule and publish — with platform limits respected and failures visible.' },
          ].map((item, i) => (
            <Reveal key={item.k} delay={i * 90}>
              <Card lift className="h-full p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet/30 bg-violet/10 text-violet-soft">
                  <item.icon size={18} />
                </div>
                <p className="meta mt-5">{item.k}</p>
                <h3 className="mt-2 font-display text-[1.08rem] text-[#eef1f7]">{item.t}</h3>
                <p className="mt-2.5 text-[0.82rem] leading-relaxed text-[#8a93a6]">{item.b}</p>
              </Card>
            </Reveal>
          ))}
        </div>

        <div className="mt-14 space-y-10">
          <InfoLine text="INTELLIGENCE ENGINEERED FOR SCALE" />
          <InfoLine text="AI + AUTOMATION + BOOKINGS" reverse />
        </div>
      </section>

      {/* --------------------------------------------------------------- SOLUTIONS */}
      <section className="relative border-y border-white/[0.06] bg-[#070910]/60">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
          <SectionHeading
            eyebrow="Section 02 · Capabilities"
            title="Everything the business needs, in one operating system."
            body="Nine systems, one workspace. Each capability is functional in the product — not a marketing claim."
            action={<Link to="/solutions"><Button variant="ghost" icon={<ArrowRight size={15} />}>Explore solutions</Button></Link>}
          />
          <div className="mt-12 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {SOLUTIONS.map((s, i) => (
              <Reveal key={s.title} delay={(i % 3) * 70}>
                <Card lift className="group h-full p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-[#b9a8ff] transition-colors group-hover:border-violet/40 group-hover:text-violet-soft">
                      <s.icon size={16} />
                    </span>
                    <span className="text-[0.6rem] uppercase tracking-[0.22em] text-[#4f5768]">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <h3 className="mt-4 text-[0.95rem] text-[#eef1f7]">{s.title}</h3>
                  <p className="mt-2 text-[0.78rem] leading-relaxed text-[#8a93a6]">{s.body}</p>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------- HOW IT WORKS */}
      <section className="relative mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
        <SectionHeading
          eyebrow="Section 03 · How MAVYRON works"
          title="From first message to repeat customer."
          body="A guided sequence that turns a configured workspace into an operating business."
        />
        <div className="mt-14">
          <Pathway
            steps={[
              { title: 'Configure', body: 'Business profile, hours, services, staff and booking rules in a guided setup.' },
              { title: 'Connect', body: 'WhatsApp, social channels, calendar and payments — status is verified, never assumed.' },
              { title: 'Answer', body: 'The AI receptionist replies from your knowledge base and captures the customer.' },
              { title: 'Book', body: 'Availability is computed live; the appointment is written to your real calendar.' },
              { title: 'Grow', body: 'Reminders, retention, content and analytics run on the data you actually generated.' },
            ]}
          />
        </div>
        <div className="mt-16">
          <InfoLine text="FROM COMPLEXITY TO CLARITY" />
        </div>
      </section>

      {/* ------------------------------------------------------------ BUILT FOR */}
      <section className="relative border-y border-white/[0.06] bg-[#070910]/60">
        <div className="mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:py-24">
          <SectionHeading
            eyebrow="Section 04 · Built for ambitious operators"
            title="Designed for the businesses that keep a city moving."
            align="center"
          />
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {['Salons', 'Barbershops', 'Spas', 'Clinics', 'Dental studios', 'Restaurants', 'Hotels', 'Gyms', 'Rentals', 'Professional services', 'Multi-branch groups', 'Franchises'].map((cat, i) => (
              <Reveal key={cat} delay={i * 40}>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-4 text-center text-[0.75rem] text-[#a8b0c0] transition-colors hover:border-violet/30 hover:text-white">
                  {cat}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ PRODUCT PREVIEW */}
      <section className="relative mx-auto w-full max-w-[1240px] px-5 py-20 sm:px-8 lg:py-28">
        <SectionHeading
          eyebrow="Section 05 · The command centre"
          title="A workspace that reads like your business."
          body="This is the real authenticated interface: today's calendar, AI conversations awaiting a human, integration health and the setup steps still outstanding."
          action={<Link to="/platform"><Button variant="ghost" icon={<ArrowRight size={15} />}>Platform detail</Button></Link>}
        />
        <Reveal className="mt-12">
          <ProductFrame>
            <div className="grid gap-4 p-5 sm:grid-cols-[1.4fr_1fr]">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                <div className="flex items-center justify-between">
                  <p className="meta">Today</p>
                  <Chip tone="violet">Live calendar</Chip>
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    { t: '09:00', s: 'Signature service', d: '60 min' },
                    { t: '10:30', s: 'Consultation', d: '30 min' },
                    { t: '12:00', s: 'Returning client', d: '45 min' },
                  ].map((row) => (
                    <div key={row.t} className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-[#0a0d16]/60 px-3 py-2.5">
                      <span className="font-display text-[0.78rem] text-[#c9d0dc]">{row.t}</span>
                      <span className="h-6 w-px bg-white/10" />
                      <span className="min-w-0 flex-1 truncate text-[0.78rem] text-[#dde2ec]">{row.s}</span>
                      <span className="text-[0.66rem] text-[#6f7889]">{row.d}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="meta">AI inbox</p>
                  <p className="mt-2 text-[0.78rem] text-[#dde2ec]">Conversations needing a human appear here.</p>
                  <div className="mt-3 flex items-center gap-2 text-[0.66rem] text-[#6f7889]">
                    <ShieldCheck size={12} className="text-emerald-400" /> Escalation is explicit, never silent
                  </div>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
                  <p className="meta">Setup</p>
                  <div className="mt-2 space-y-1.5">
                    {['Services', 'Staff', 'WhatsApp', 'Launch'].map((s) => (
                      <div key={s} className="flex items-center justify-between text-[0.72rem] text-[#8a93a6]">
                        <span>{s}</span>
                        <span className="text-[0.62rem] text-[#4f5768]">required</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </ProductFrame>
          <p className="mt-3 text-center text-[0.66rem] text-[#4f5768]">
            Interface preview. Live workspaces display only the business's own records.
          </p>
        </Reveal>
      </section>

      {/* --------------------------------------------------------- FOUNDER + MISSION */}
      <section className="relative border-y border-white/[0.06] bg-[#070910]/60">
        <div className="mx-auto grid w-full max-w-[1240px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-2 lg:py-24">
          <Reveal>
            <p className="eyebrow mb-4">Founder</p>
            <h2 className="display-lg text-gradient-silver">Built in Nairobi, engineered for the world.</h2>
            <div className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6">
              <p className="font-display text-[1.1rem] text-[#eef1f7]">Evans Karani Mbae</p>
              <p className="mt-1 text-[0.75rem] uppercase tracking-[0.22em] text-[#6f7889]">Founder &amp; Chief Executive Officer</p>
              <p className="mt-4 text-[0.84rem] leading-relaxed text-[#8a93a6]">
                MAVYRON exists to give service businesses the same operational intelligence that global enterprises
                take for granted — without enterprise complexity or enterprise pricing.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="grid gap-4">
              <Card className="p-6">
                <p className="meta">Mission</p>
                <p className="mt-3 font-display text-[1.02rem] leading-relaxed text-[#dde2ec]">
                  To engineer intelligent systems that let service businesses operate with precision, respond
                  instantly and grow without adding administrative weight.
                </p>
              </Card>
              <Card className="p-6">
                <p className="meta">Vision</p>
                <p className="mt-3 font-display text-[1.02rem] leading-relaxed text-[#dde2ec]">
                  A world where every serious local business runs on the same class of intelligence as the largest
                  companies — across Africa first, then everywhere.
                </p>
              </Card>
              <div className="flex flex-wrap gap-2">
                {['Intelligence', 'Precision', 'Integrity', 'Innovation', 'Impact'].map((v) => (
                  <Chip key={v} tone="gold">{v}</Chip>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------------- FINAL CTA */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(123,91,255,0.2),transparent_62%)]" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 py-24 text-center sm:px-8">
          <Reveal>
            <p className="eyebrow">Innovation without limits</p>
            <h2 className="mx-auto mt-5 max-w-3xl font-display text-[2.1rem] leading-[1.1] text-[#f2f4f9] sm:text-[2.9rem]">
              Put your business on an operating system.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-[0.9rem] leading-relaxed text-[#9aa3b5]">
              Start a 14-day trial, configure your services and staff, and watch the first real booking arrive.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link to="/signup"><Button size="lg" icon={<ArrowRight size={16} />}>Start free trial</Button></Link>
              <Link to="/pricing"><Button size="lg" variant="ghost">View pricing</Button></Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[0.7rem] text-[#6f7889]">
              <span className="inline-flex items-center gap-1.5"><CreditCard size={12} /> Card &amp; mobile money architecture</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck size={12} /> Tenant-isolated data</span>
              <span className="inline-flex items-center gap-1.5"><Globe2 size={12} /> Nairobi · Kenya</span>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
