import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Minus, ShieldCheck } from 'lucide-react';
import { Alert, Button, Card, Chip, Reveal, SectionHeading, Spinner } from '../../components/primitives';
import { GridBackdrop, InfoLine } from '../../components/visuals';
import { api, errorMessage, type Plan, type PlatformStatus } from '../../lib/api';

const LIMIT_LABELS: Record<string, string> = {
  bookings_per_month: 'Bookings per month',
  staff: 'Staff accounts',
  services: 'Services',
  ai_messages: 'AI conversations per month',
  content_posts: 'Content posts per month',
  channels: 'Connected channels',
  locations: 'Locations',
  customers: 'Customer records',
  integrations: 'Integrations',
  storage_mb: 'Storage',
  whatsapp_numbers: 'WhatsApp numbers',
};

function limitLabel(key: string) {
  return LIMIT_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function limitValue(v: number | null) {
  if (v === null || v === undefined) return 'Unlimited';
  if (v < 0) return 'Unlimited';
  return v.toLocaleString();
}

export default function Pricing() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const [p, s] = await Promise.all([
          api.get<{ plans: Plan[] }>('/plans'),
          api.get<PlatformStatus>('/platform-status').catch(() => null),
        ]);
        if (!live) return;
        setPlans(p.plans);
        setPlatform(s);
      } catch (err) {
        if (live) setError(errorMessage(err));
      }
    })();
    return () => { live = false; };
  }, []);

  const ordered = useMemo(() => (plans || []).slice().sort((a, b) => a.sort - b.sort), [plans]);
  const allLimitKeys = useMemo(() => {
    const keys = new Set<string>();
    ordered.forEach((p) => Object.keys(p.limits || {}).forEach((k) => keys.add(k)));
    return Array.from(keys);
  }, [ordered]);

  const paymentsConfigured = Boolean(
    (platform?.config as Record<string, unknown> | undefined)?.payments &&
    !/required/i.test(String((platform?.config as Record<string, unknown>)?.payments)),
  );

  return (
    <div>
      <section className="relative border-b border-white/[0.06]">
        <GridBackdrop />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 pb-14 pt-16 sm:px-8 lg:pt-24">
          <Reveal>
            <p className="eyebrow">Pricing</p>
            <h1 className="mt-5 max-w-3xl font-display text-[2.1rem] leading-[1.08] tracking-[-0.02em] text-[#f2f4f9] sm:text-[2.9rem]">
              A subscription for the operating system, not a template.
            </h1>
            <p className="lede mt-5 max-w-2xl">
              Start with a 14-day trial. Every plan includes the workspace, the AI receptionist, the booking engine
              and the public business page. Plans differ in capacity and support, not in whether the product works.
            </p>
          </Reveal>

          <Reveal delay={80} className="mt-8">
            <div className="inline-flex rounded-full border border-white/10 bg-white/[0.03] p-1">
              {(['monthly', 'yearly'] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCycle(c)}
                  className={`rounded-full px-4 py-1.5 text-[0.74rem] capitalize transition-all ${
                    cycle === c ? 'bg-white/[0.09] text-white shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]' : 'text-[#8a93a6] hover:text-white'
                  }`}
                >
                  {c}
                  {c === 'yearly' && <span className="ml-1.5 text-[0.62rem] text-gold">save</span>}
                </button>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[1240px] px-5 py-14 sm:px-8">
        {error && <Alert tone="error" title="Pricing unavailable">{error}</Alert>}
        {!plans && !error && (
          <div className="flex items-center gap-3 py-16 text-[0.82rem] text-[#8a93a6]"><Spinner /> Loading plans…</div>
        )}

        {ordered.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-3">
            {ordered.map((plan, i) => {
              const featured = i === 1 || ordered.length === 1;
              const price = cycle === 'monthly' ? plan.price_monthly : plan.price_yearly;
              const display = cycle === 'monthly' ? plan.price_monthly_display : plan.price_yearly_display;
              return (
                <Reveal key={plan.id} delay={i * 80}>
                  <Card className={`relative flex h-full flex-col p-6 ${featured ? 'border-violet/35 bg-[linear-gradient(180deg,rgba(123,91,255,0.10),rgba(10,15,31,0.55))]' : ''}`}>
                    {featured && (
                      <span className="absolute -top-2.5 left-6 rounded-full border border-violet/40 bg-[#0b0f1c] px-2.5 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] text-[#c4b7ff]">
                        Recommended
                      </span>
                    )}
                    <div className="flex items-baseline justify-between">
                      <h2 className="font-display text-[1.15rem] tracking-[0.02em] text-[#f2f4f9]">{plan.name}</h2>
                      <Chip tone="muted">{plan.currency}</Chip>
                    </div>
                    <p className="mt-1.5 text-[0.78rem] text-[#8a93a6]">{plan.tagline}</p>
                    <div className="mt-6 flex items-end gap-1.5">
                      <span className="font-display text-[2.1rem] leading-none text-[#f4f6fb]">
                        {display || `${plan.currency} ${price.toLocaleString()}`}
                      </span>
                      <span className="pb-1 text-[0.72rem] text-[#6f7889]">/{cycle === 'monthly' ? 'mo' : 'yr'}</span>
                    </div>
                    <div className="mt-6 space-y-2 border-t border-white/[0.07] pt-5">
                      {(plan.features || []).slice(0, 8).map((f) => (
                        <div key={f} className="flex gap-2.5 text-[0.8rem] text-[#9aa3b5]">
                          <Check size={14} className="mt-0.5 shrink-0 text-emerald-400/90" />
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 space-y-1.5">
                      {Object.entries(plan.limits || {}).slice(0, 6).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between gap-3 text-[0.73rem]">
                          <span className="text-[#6f7889]">{limitLabel(k)}</span>
                          <span className="text-[#b7bfcf]">{limitValue(v as number | null)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-7 pt-1">
                      <Link to={`/signup?plan=${plan.id}`} className="block">
                        <Button block variant={featured ? 'primary' : 'ghost'} icon={<ArrowRight size={15} />}>
                          Start with {plan.name}
                        </Button>
                      </Link>
                    </div>
                  </Card>
                </Reveal>
              );
            })}
          </div>
        )}

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <Card className="p-6">
            <SectionHeading eyebrow="Plan comparison" title="Capacity, side by side." />
            {ordered.length > 0 && allLimitKeys.length > 0 ? (
              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[440px] border-collapse text-[0.78rem]">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-left">
                      <th className="py-2.5 pr-4 font-normal text-[#6f7889]">Capacity</th>
                      {ordered.map((p) => (
                        <th key={p.id} className="py-2.5 pr-4 text-right font-normal text-[#b7bfcf]">{p.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {allLimitKeys.map((k) => (
                      <tr key={k} className="border-b border-white/[0.04]">
                        <td className="py-2.5 pr-4 text-[#8a93a6]">{limitLabel(k)}</td>
                        {ordered.map((p) => {
                          const v = p.limits?.[k];
                          return (
                            <td key={p.id} className="py-2.5 pr-4 text-right text-[#cfd6e3]">
                              {v === undefined ? <Minus size={12} className="ml-auto text-[#4f5768]" /> : limitValue(v as number | null)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-4 text-[0.8rem] text-[#8a93a6]">Plan capacity appears here once plans are configured on the platform.</p>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="p-6">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-emerald-400" />
                <p className="text-[0.9rem] text-[#eef1f7]">Payments, honestly stated</p>
              </div>
              <p className="mt-3 text-[0.8rem] leading-relaxed text-[#8a93a6]">
                {paymentsConfigured
                  ? 'A payment provider is configured on this deployment. Checkout is created through the provider and subscription state is only marked active after server-side verification.'
                  : 'No payment provider is configured on this deployment. Checkout is unavailable and the platform reports the required configuration instead of simulating a successful payment.'}
              </p>
              <div className="mt-4 flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                <span className="text-[0.72rem] text-[#6f7889]">Provider status</span>
                <Chip tone={paymentsConfigured ? 'ok' : 'warn'}>
                  {paymentsConfigured ? 'Configured' : 'Configuration required'}
                </Chip>
              </div>
            </Card>
            <Card className="p-6">
              <p className="text-[0.9rem] text-[#eef1f7]">Trial behaviour</p>
              <ul className="mt-3 space-y-2 text-[0.79rem] text-[#8a93a6]">
                <li>· 14 days of full workspace access from signup.</li>
                <li>· Subscription states: trial, active, past due, cancelled, expired, suspended.</li>
                <li>· No card required to begin the trial.</li>
                <li>· Workspace data remains exportable from settings.</li>
              </ul>
            </Card>
          </div>
        </div>

        <div className="mt-14"><InfoLine text="ONE WORKSPACE · ONE AI RECEPTIONIST · ONE SOURCE OF TRUTH" /></div>
      </section>

      <section className="relative overflow-hidden border-t border-white/[0.06]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_130%,rgba(123,91,255,0.18),transparent_60%)]" />
        <div className="relative mx-auto w-full max-w-[1240px] px-5 py-16 text-center sm:px-8">
          <h2 className="mx-auto max-w-2xl font-display text-[1.8rem] leading-tight text-[#f2f4f9] sm:text-[2.3rem]">
            Bring your business online in an afternoon.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-[0.86rem] leading-relaxed text-[#8a93a6]">
            Guided setup covers your business details, services, staff, hours, booking rules, AI personality and
            knowledge base — then you launch your public page.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link to="/signup"><Button size="lg" icon={<ArrowRight size={16} />}>Create your workspace</Button></Link>
            <Link to="/contact"><Button size="lg" variant="ghost">Ask a question</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}
