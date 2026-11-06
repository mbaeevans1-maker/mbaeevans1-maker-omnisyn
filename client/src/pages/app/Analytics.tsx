import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, MessageSquare, TrendingUp, Users, Wallet } from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  Card, CardHeader, Chip, EmptyState, PageHeader, SkeletonRows, StatusChip, Tabs, useToast,
} from '../../components/primitives';
import { compactMoney, money, num, titleCase } from '../../lib/format';

type DayRow = { day: string; bookings: number; revenue_cents: number };
type Named = { name: string; bookings: number; revenue_cents: number; color?: string | null };
type Analytics = {
  range_days: number;
  by_day: DayRow[];
  by_source: { source: string; bookings: number }[];
  by_status: { status: string; n: number }[];
  top_services: Named[];
  staff: Named[];
  channels: { channel: string; conversations: number }[];
  ai: { handoffs: number; conversations: number; bookings?: number };
  customers: { total: number; returning: number; inactive: number; retention_rate: number };
  content_by_status: { status: string; n: number }[];
};

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

export function Analytics() {
  const toast = useToast();
  const [days, setDays] = useState<'7' | '30' | '90'>('30');
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<Analytics>(`/tenant/analytics?days=${days}`));
    } catch (err) {
      toast.error('Could not load analytics', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [days, toast]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const bookings = (data?.by_day || []).reduce((s, d) => s + d.bookings, 0);
    const revenue = (data?.by_day || []).reduce((s, d) => s + d.revenue_cents, 0);
    return { bookings, revenue };
  }, [data]);

  const peak = useMemo(() => Math.max(1, ...(data?.by_day || []).map((d) => d.bookings)), [data]);
  const empty = !data || (totals.bookings === 0 && (data.ai?.conversations || 0) === 0);

  const kpis = [
    { label: 'Bookings', value: num(totals.bookings), icon: CalendarDays, hint: `Last ${days} days` },
    { label: 'Completed revenue', value: compactMoney(totals.revenue), icon: Wallet, hint: 'Completed appointments only' },
    { label: 'AI conversations', value: num(data?.ai?.conversations || 0), icon: MessageSquare, hint: `${data?.ai?.handoffs || 0} handed to a human` },
    { label: 'Retention', value: `${data?.customers.retention_rate ?? 0}%`, icon: Users, hint: `${data?.customers.returning || 0} returning of ${data?.customers.total || 0}` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        description="Real operating data from this workspace — no estimated or illustrative figures."
        action={<Tabs value={days} onChange={setDays} tabs={RANGES} />}
      />

      {loading ? (
        <Card><SkeletonRows rows={6} /></Card>
      ) : empty ? (
        <Card>
          <EmptyState
            icon={<BarChart3 size={20} />}
            title="Your intelligence workspace is ready"
            body="Analytics appear as soon as real appointments and AI conversations exist. Nothing here is pre-filled."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {kpis.map((k) => (
              <Card key={k.label} className="p-5">
                <div className="flex items-start justify-between">
                  <span className="text-[0.66rem] uppercase tracking-[0.18em] text-[#7d8798]">{k.label}</span>
                  <k.icon size={15} className="text-[#a9a2ff]" />
                </div>
                <p className="mt-3 font-display text-2xl text-[#f2f4f9]">{k.value}</p>
                <p className="mt-1 text-[0.68rem] text-[#6f7889]">{k.hint}</p>
              </Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Booking activity" subtitle="Appointments created per day" />
            <div className="px-5 pb-5 pt-2">
              <div className="flex h-44 items-end gap-1.5">
                {(data?.by_day || []).map((d) => (
                  <div key={d.day} className="group relative flex flex-1 flex-col items-center justify-end gap-1">
                    <span className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded-md border border-white/10 bg-[#0b0e16] px-2 py-1 text-[0.62rem] text-[#dde2ec] group-hover:block">
                      {d.bookings} · {money(d.revenue_cents)}
                    </span>
                    <div
                      className="w-full rounded-t-[3px] bg-gradient-to-t from-violet/25 to-violet/80 transition-all group-hover:from-violet/40 group-hover:to-violet"
                      style={{ height: `${Math.max(3, (d.bookings / peak) * 100)}%` }}
                    />
                    <span className="text-[0.55rem] text-[#5f6878]">{d.day.slice(8, 10)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-[0.66rem] text-[#6f7889]">
                <span>{data?.by_day[0]?.day}</span>
                <span>{data?.by_day[data.by_day.length - 1]?.day}</span>
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="overflow-hidden">
              <CardHeader title="Top services" subtitle="Ranked by bookings in range" />
              {(data?.top_services || []).length === 0 ? (
                <p className="px-5 py-6 text-xs text-[#6f7889]">No service activity in this range.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {data!.top_services.map((s) => (
                    <li key={s.name} className="px-5 py-3">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-[#dde2ec]">{s.name}</span>
                        <span className="shrink-0 text-[#8a93a6]">{s.bookings} · {money(s.revenue_cents)}</span>
                      </div>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                        <div className="h-full rounded-full bg-gradient-to-r from-violet/60 to-violet" style={{ width: `${(s.bookings / Math.max(1, data!.top_services[0].bookings)) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Team performance" subtitle="Bookings handled per staff member" />
              {(data?.staff || []).length === 0 ? (
                <p className="px-5 py-6 text-xs text-[#6f7889]">Add staff to see individual performance.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {data!.staff.map((s) => (
                    <li key={s.name} className="flex items-center justify-between gap-3 px-5 py-3">
                      <span className="inline-flex items-center gap-2 text-xs text-[#dde2ec]">
                        <span className="h-2 w-2 rounded-full" style={{ background: s.color || '#8b7bff' }} />
                        {s.name}
                      </span>
                      <span className="text-xs text-[#8a93a6]">{s.bookings} bookings · {money(s.revenue_cents)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Channels" subtitle="Where conversations start" />
              {(data?.channels || []).length === 0 ? (
                <p className="px-5 py-6 text-xs text-[#6f7889]">No conversations in this range.</p>
              ) : (
                <ul className="divide-y divide-white/[0.05]">
                  {data!.channels.map((c) => (
                    <li key={c.channel} className="flex items-center justify-between px-5 py-3 text-xs">
                      <span className="text-[#dde2ec]">{titleCase(c.channel)}</span>
                      <Chip tone="muted">{c.conversations} conversations</Chip>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Operating mix" subtitle="Appointment states and content pipeline" />
              <div className="space-y-3 px-5 py-4">
                <div>
                  <p className="mb-2 text-[0.66rem] uppercase tracking-[0.16em] text-[#7d8798]">Appointments</p>
                  <div className="flex flex-wrap gap-2">
                    {(data?.by_status || []).map((s) => <Chip key={s.status} tone="muted">{titleCase(s.status)}: {s.n}</Chip>)}
                    {(data?.by_status || []).length === 0 && <span className="text-xs text-[#6f7889]">None</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[0.66rem] uppercase tracking-[0.16em] text-[#7d8798]">Sources</p>
                  <div className="flex flex-wrap gap-2">
                    {(data?.by_source || []).map((s) => <Chip key={s.source} tone="violet">{titleCase(s.source)}: {s.bookings}</Chip>)}
                    {(data?.by_source || []).length === 0 && <span className="text-xs text-[#6f7889]">None</span>}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-[0.66rem] uppercase tracking-[0.16em] text-[#7d8798]">Content pipeline</p>
                  <div className="flex flex-wrap gap-2">
                    {(data?.content_by_status || []).map((s) => (
                      <span key={s.status} className="inline-flex items-center gap-1.5">
                        <StatusChip status={s.status} /><span className="text-[0.68rem] text-[#8a93a6]">{s.n}</span>
                      </span>
                    ))}
                    {(data?.content_by_status || []).length === 0 && <span className="text-xs text-[#6f7889]">No content yet</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3 text-[0.7rem] text-[#8a93a6]">
                  <TrendingUp size={13} className="text-[#a9a2ff]" />
                  {data?.customers.inactive || 0} customers inactive · {data?.customers.returning || 0} returning
                </div>
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
