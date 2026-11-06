import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowUpRight, CalendarPlus, Check, CircleDashed, Clock, CreditCard, MessagesSquare, Plug,
  Sparkles, TrendingUp, Users, Wand2,
} from 'lucide-react';
import { api, errorMessage, type Appointment } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Avatar, Button, Card, CardHeader, Chip, EmptyState, PageHeader, Progress, SkeletonRows,
  Stat, StatusChip, useToast,
} from '../../components/primitives';
import { money, num, relative, timeOf, todayIso, titleCase } from '../../lib/format';

type Overview = {
  tenant: { name: string; slug: string; status: string; currency: string; industry: string };
  today: { date: string; appointments: Appointment[]; count: number };
  upcoming: Appointment[];
  metrics: Record<string, number>;
  top_services: { name: string; bookings: number; revenue_cents: number }[];
  staff_today: { id: string; name: string; color: string | null; bookings_today: number }[];
  setup: { key: string; label: string; done: boolean }[];
  setup_complete: boolean;
  ai: { configured: boolean; provider: string; mode: string };
  billing: { subscription: { status: string; trial_days_left: number; trialing: boolean; plan: { name: string; price_monthly: number } } | null; limits: { key: string; label: string; used: number; limit: number | null; percent: number; state: string }[] };
  has_data: boolean;
};

export function OverviewPage() {
  const { user, tenant, can } = useSession();
  const toast = useToast();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    api.get<Overview>('/tenant/overview')
      .then((res) => { if (live) { setData(res); setError(null); } })
      .catch((err) => { if (live) setError(errorMessage(err)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const complete = async (appt: Appointment) => {
    try {
      await api.patch(`/tenant/appointments/${appt.id}`, { status: 'completed' });
      toast.push({ title: 'Appointment completed', body: `${appt.customer_name || 'Customer'} marked complete.`, tone: 'ok' });
      const res = await api.get<Overview>('/tenant/overview');
      setData(res);
    } catch (err) {
      toast.push({ title: 'Could not update', body: errorMessage(err), tone: 'danger' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Command centre" title="Loading workspace" description="Reading your live business data." />
        <Card><SkeletonRows rows={6} /></Card>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <PageHeader eyebrow="Command centre" title="Workspace unavailable" />
        <Alert tone="danger" title="Could not load your dashboard">{error || 'Unknown error.'}</Alert>
      </div>
    );
  }

  const m = data.metrics;
  const setupDone = data.setup.filter((s) => s.done).length;
  const firstName = (user?.name || '').split(' ')[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow">Command centre · {titleCase(data.tenant.industry)}</p>
          <h1 className="mt-2 font-display text-[1.65rem] leading-tight text-white sm:text-[2rem]">
            {firstName ? `Good to see you, ${firstName}.` : 'Your business, operating.'}
          </h1>
          <p className="mt-1.5 max-w-xl text-[0.85rem] leading-relaxed text-[#8e97a8]">
            {data.has_data
              ? 'Live bookings, AI conversations and revenue for your workspace — nothing simulated.'
              : 'Your workspace is ready. Add services and staff, then share your booking page to begin.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('bookings:write') && (
            <Link to="/app/calendar"><Button icon={<CalendarPlus size={15} />}>New booking</Button></Link>
          )}
          <Link to="/app/inbox"><Button variant="ghost" icon={<MessagesSquare size={15} />}>AI inbox</Button></Link>
        </div>
      </div>

      {!data.setup_complete && (
        <Card className="border-violet/25 bg-violet/[0.05]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[0.9rem] font-medium text-white">
                <Sparkles size={15} className="text-violet-soft" /> Setup {setupDone}/{data.setup.length} complete
              </p>
              <p className="mt-1 text-[0.8rem] text-[#98a1b3]">
                {data.setup.find((s) => !s.done)?.label} is the next step toward a live booking page.
              </p>
              <div className="mt-3 max-w-md"><Progress value={setupDone} max={data.setup.length} /></div>
            </div>
            <Link to="/app/setup" className="shrink-0">
              <Button variant="gold" size="sm" icon={<Check size={14} />}>Continue setup</Button>
            </Link>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue · 30d" value={money(m.revenue_30d_cents, data.tenant.currency)} sub={`${num(m.completed_30d)} completed appointments`} tone="gold" />
        <Stat label="Bookings · 30d" value={num(m.bookings_30d)} sub={`${num(m.online_bookings_30d)} via AI / online`} />
        <Stat label="Customers" value={num(m.customers_total)} sub={`${num(m.customers_new_30d)} new in 30 days`} />
        <Stat label="AI conversations" value={num(m.ai_conversations_30d)} sub={m.conversations_needs_human > 0 ? `${num(m.conversations_needs_human)} need a human` : 'No handoffs pending'} tone={m.conversations_needs_human > 0 ? 'violet' : 'default'} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            eyebrow="Today"
            title="Schedule"
            subtitle={`${data.today.count} appointment${data.today.count === 1 ? '' : 's'} on ${data.today.date}`}
            action={<Link to="/app/calendar" className="text-[0.75rem] text-violet-soft hover:underline">Open calendar</Link>}
          />
          {data.today.appointments.length === 0 ? (
            <EmptyState
              icon={<Clock size={18} />}
              title="No appointments today"
              body="Bookings made by your AI receptionist, your public page or your team appear here in real time."
              action={can('bookings:write') ? <Link to="/app/calendar"><Button size="sm" variant="ghost">Create a booking</Button></Link> : undefined}
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {data.today.appointments.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-3">
                  <div className="w-14 shrink-0 text-center">
                    <p className="font-display text-[0.92rem] text-white">{timeOf(a.start_at)}</p>
                    <p className="text-[0.62rem] uppercase tracking-wider text-[#5d6678]">{a.duration_min || ''}{a.duration_min ? 'm' : ''}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.86rem] text-white">{a.customer_name || 'Walk-in customer'}</p>
                    <p className="truncate text-[0.74rem] text-[#8e97a8]">
                      {a.service_name || 'Service'} · {a.staff_name || 'Unassigned'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusChip status={a.status} />
                    {can('bookings:write') && a.status !== 'completed' && a.status !== 'cancelled' && (
                      <button
                        onClick={() => complete(a)}
                        aria-label="Mark completed"
                        className="rounded-md border border-white/10 p-1.5 text-[#98a1b3] transition hover:border-emerald-400/40 hover:text-emerald-300"
                      >
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader eyebrow="Subscription" title={data.billing.subscription?.plan.name || 'No plan'} subtitle={data.billing.subscription ? titleCase(data.billing.subscription.status) : 'Not configured'} action={<Link to="/app/billing" className="text-[0.75rem] text-violet-soft hover:underline">Manage</Link>} />
            {data.billing.subscription?.trialing && (
              <p className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[0.75rem] text-amber-200">
                Trial ends in {data.billing.subscription.trial_days_left} day{data.billing.subscription.trial_days_left === 1 ? '' : 's'}.
              </p>
            )}
            <div className="space-y-3">
              {data.billing.limits.slice(0, 4).map((l) => (
                <div key={l.key}>
                  <div className="mb-1 flex items-center justify-between text-[0.74rem]">
                    <span className="text-[#98a1b3]">{l.label}</span>
                    <span className="text-[#c8cfdc]">{l.limit === null ? `${num(l.used)} · unlimited` : `${num(l.used)} / ${num(l.limit)}`}</span>
                  </div>
                  <Progress value={l.percent} tone={l.state === 'at_limit' ? 'danger' : l.state === 'near_limit' ? 'gold' : 'violet'} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader eyebrow="AI receptionist" title={data.ai.configured ? 'Connected' : 'Knowledge mode'} subtitle={data.ai.configured ? `Provider: ${titleCase(data.ai.provider)}` : 'Deterministic answers from your knowledge base'} action={<Link to="/app/inbox" className="text-[0.75rem] text-violet-soft hover:underline">Open</Link>} />
            <div className="flex flex-wrap gap-2">
              <Chip tone={data.ai.configured ? 'ok' : 'warn'}>{data.ai.configured ? 'Live model' : 'No provider key'}</Chip>
              <Chip tone="violet">{num(m.conversations_open)} open</Chip>
              <Chip tone={m.conversations_needs_human ? 'danger' : 'muted'}>{num(m.conversations_needs_human)} handoffs</Chip>
            </div>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader eyebrow="Demand" title="Top services" subtitle="Last 30 days" />
          {data.top_services.length === 0 ? (
            <p className="py-6 text-center text-[0.8rem] text-[#7d8798]">No service demand recorded yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.top_services.map((s) => (
                <li key={s.name}>
                  <div className="flex items-center justify-between text-[0.8rem]">
                    <span className="truncate text-[#d3d9e4]">{s.name}</span>
                    <span className="text-[#8e97a8]">{num(s.bookings)}</span>
                  </div>
                  <Progress value={s.bookings} max={Math.max(...data.top_services.map((x) => x.bookings))} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Team" title="Today's load" subtitle={`${data.staff_today.length} active staff`} action={<Link to="/app/catalog" className="text-[0.75rem] text-violet-soft hover:underline">Manage</Link>} />
          {data.staff_today.length === 0 ? (
            <p className="py-6 text-center text-[0.8rem] text-[#7d8798]">No staff added yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {data.staff_today.map((s) => (
                <li key={s.id} className="flex items-center gap-3">
                  <Avatar name={s.name} color={s.color} size={30} />
                  <span className="min-w-0 flex-1 truncate text-[0.82rem] text-[#d3d9e4]">{s.name}</span>
                  <span className="text-[0.75rem] text-[#8e97a8]">{num(s.bookings_today)} today</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader eyebrow="Attention" title="Needs review" subtitle="Real operational signals" />
          <ul className="space-y-2.5 text-[0.8rem]">
            <AttentionRow to="/app/inbox" icon={<MessagesSquare size={14} />} label="AI handoffs waiting" value={m.conversations_needs_human} />
            <AttentionRow to="/app/marketing" icon={<Wand2 size={14} />} label="Content awaiting approval" value={m.content_pending} />
            <AttentionRow to="/app/calendar?status=no_show" icon={<CircleDashed size={14} />} label="No-shows · 30d" value={m.no_show_30d} />
            <AttentionRow to="/app/calendar?status=cancelled" icon={<TrendingUp size={14} />} label="Cancellations · 30d" value={m.cancelled_30d} />
            <AttentionRow to="/app/integrations" icon={<Plug size={14} />} label="Integrations connected" value={`${m.integrations_connected}/${m.integrations_total}`} />
            <AttentionRow to="/app/customers" icon={<Users size={14} />} label="Customers" value={m.customers_total} />
            <AttentionRow to="/app/billing" icon={<CreditCard size={14} />} label="Plan" value={data.billing.subscription?.plan.name || '—'} />
          </ul>
        </Card>
      </div>

      {data.upcoming.length > 0 && (
        <Card>
          <CardHeader eyebrow="Pipeline" title="Upcoming appointments" subtitle="Confirmed and pending, in order" action={<Link to="/app/calendar" className="text-[0.75rem] text-violet-soft hover:underline">View all</Link>} />
          <div className="-mx-1 overflow-x-auto no-scrollbar">
            <table className="mv-table min-w-[640px]">
              <thead>
                <tr>
                  <th>When</th><th>Customer</th><th>Service</th><th>Staff</th><th>Source</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.upcoming.map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-[#c8cfdc]">{relative(a.start_at)}</td>
                    <td className="text-white">{a.customer_name || '—'}</td>
                    <td>{a.service_name || '—'}</td>
                    <td>{a.staff_name || '—'}</td>
                    <td><Chip tone="muted">{titleCase(a.source)}</Chip></td>
                    <td><StatusChip status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!data.has_data && (
        <Card className="text-center">
          <div className="mx-auto max-w-md py-4">
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-violet/30 bg-violet/10 text-violet-soft">
              <Sparkles size={18} />
            </div>
            <p className="font-display text-[1.05rem] text-white">Your intelligence workspace is ready</p>
            <p className="mt-1.5 text-[0.82rem] leading-relaxed text-[#8e97a8]">
              Activity appears here once real bookings, customers and conversations begin. Nothing is simulated.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link to="/app/setup"><Button size="sm">Complete setup</Button></Link>
              {tenant?.slug && (
                <a href={`/business/${tenant.slug}`} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost" icon={<ArrowUpRight size={14} />}>Preview public page</Button>
                </a>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function AttentionRow({ to, icon, label, value }: { to: string; icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 transition hover:bg-white/[0.03]">
        <span className="text-[#6f7a8d]">{icon}</span>
        <span className="flex-1 truncate text-[#b9c1d0]">{label}</span>
        <span className="font-medium text-white">{value}</span>
      </Link>
    </li>
  );
}
