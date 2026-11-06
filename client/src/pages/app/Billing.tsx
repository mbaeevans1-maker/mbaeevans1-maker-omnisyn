import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight, Check, CreditCard, Download, FileText, Info, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Button, Card, CardHeader, Chip, EmptyState, PageHeader, Progress, SkeletonRows,
  StatusChip, Tabs, useToast,
} from '../../components/primitives';
import { dateLong, money, num, titleCase } from '../../lib/format';

type Plan = {
  id: string; name: string; tagline?: string | null;
  price_monthly: number; price_yearly: number; currency?: string;
  features: string[]; limits: Record<string, number | string | null>;
};

type Subscription = {
  id: string; plan_id: string; plan: Plan; status: string;
  trial_ends_at?: string | null; trial_days_left: number; trialing: boolean;
  current_period_start?: string | null; current_period_end?: string | null;
  cancel_at_period_end: boolean; provider?: string | null; provider_ref?: string | null;
};

type LimitState = { key: string; label: string; used: number; limit: number | null; percent: number; state: string };
type Invoice = {
  id: string; number?: string | null; amount_cents: number; currency?: string;
  status: string; issued_at: string; paid_at?: string | null; description?: string | null;
  period_start?: string | null; period_end?: string | null; hosted_url?: string | null;
};

type Billing = {
  subscription: Subscription | null;
  plans: Plan[];
  usage: Record<string, number>;
  limits: LimitState[];
  invoices: Invoice[];
  open_invoice: Invoice | null;
  payments: { paystack?: boolean; stripe?: boolean; mpesa_direct?: boolean; any: boolean; required: string[] };
  trial_days: number;
};

const PLAN_BLURB: Record<string, string> = {
  starter: 'For a single location finding its operating rhythm.',
  pro: 'For growing teams running AI, marketing and multi-channel booking.',
  scale: 'For multi-site operations with higher volume and custom requirements.',
};

export function Billing() {
  const toast = useToast();
  const { refresh } = useSession();
  const [data, setData] = useState<Billing | null>(null);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.get<Billing>('/tenant/billing'));
    } catch (err) {
      toast.error('Could not load billing', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const currentPlanId = data?.subscription?.plan_id || null;

  const changePlan = async (planId: string) => {
    setBusy(planId);
    try {
      const result = await api.post<{ mode: string; checkout?: { authorization_url?: string }; message?: string }>(
        '/tenant/billing/change-plan', { planId, interval },
      );
      if (result.mode === 'checkout' && result.checkout?.authorization_url) {
        window.location.href = result.checkout.authorization_url;
        return;
      }
      toast.ok('Plan updated', result.message || 'Your subscription record was updated.');
      await load();
      await refresh();
    } catch (err) {
      toast.error('Plan change failed', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    try {
      await api.post('/tenant/billing/cancel');
      toast.ok('Subscription will end at period end', 'You keep access until the current period closes.');
      await load();
      await refresh();
    } catch (err) {
      toast.error('Could not cancel', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const resume = async () => {
    setBusy('resume');
    try {
      await api.post('/tenant/billing/resume');
      toast.ok('Subscription resumed');
      await load();
      await refresh();
    } catch (err) {
      toast.error('Could not resume', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const planPrice = (plan: Plan) => (interval === 'yearly' ? plan.price_yearly : plan.price_monthly);
  const paidInvoices = useMemo(
    () => (data?.invoices || []).filter((i) => i.status === 'paid'),
    [data],
  );

  if (loading) return <div className="space-y-6"><PageHeader eyebrow="Account" title="Billing" /><Card><SkeletonRows rows={8} /></Card></div>;

  const sub = data?.subscription;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Billing &amp; subscription"
        description="Every figure below comes from your subscription record and stored invoices."
        action={<Tabs value={interval} onChange={setInterval} tabs={[{ value: 'monthly', label: 'Monthly' }, { value: 'yearly', label: 'Yearly' }]} />}
      />

      {!data?.payments.any && (
        <Alert tone="warning" title="Payment provider not configured">
          This platform has no payment provider keys, so MAVYRON cannot take a real payment or simulate one.
          Configure <code className="rounded bg-black/30 px-1 py-0.5 text-[0.7rem]">PAYSTACK_SECRET_KEY</code> (or a supported
          alternative) to enable live checkout. Until then, plan changes only update your trial subscription record.
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[0.64rem] uppercase tracking-[0.2em] text-[#7d8798]">Current plan</p>
              <h2 className="mt-2 font-display text-2xl text-[#f4f6fb]">{sub?.plan?.name || 'No plan'}</h2>
              <p className="mt-1 text-xs text-[#8a93a6]">{sub?.plan?.tagline || PLAN_BLURB[String(sub?.plan_id)] || ''}</p>
            </div>
            <StatusChip status={sub?.status || 'inactive'} />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#7d8798]">Price</p>
              <p className="mt-1 text-sm text-[#eef1f7]">
                {sub?.plan ? `${money(interval === 'yearly' ? sub.plan.price_yearly : sub.plan.price_monthly, sub.plan.currency)}` : '—'}
                <span className="text-[0.68rem] text-[#6f7889]"> /{interval === 'yearly' ? 'yr' : 'mo'}</span>
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#7d8798]">Renews</p>
              <p className="mt-1 text-sm text-[#eef1f7]">
                {sub?.cancel_at_period_end ? 'Ends' : 'Renews'} {sub?.current_period_end ? dateLong(sub.current_period_end) : '—'}
              </p>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <p className="text-[0.62rem] uppercase tracking-[0.16em] text-[#7d8798]">Trial</p>
              <p className="mt-1 text-sm text-[#eef1f7]">
                {sub?.trialing ? `${sub.trial_days_left} days left` : sub?.trial_ends_at ? 'Ended' : '—'}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {sub?.cancel_at_period_end ? (
              <Button variant="secondary" onClick={() => void resume()} loading={busy === 'resume'}>Resume subscription</Button>
            ) : (
              <Button variant="ghost" onClick={() => void cancel()} loading={busy === 'cancel'}>
                <X size={14} /> Cancel at period end
              </Button>
            )}
            {sub?.provider && <Chip tone="muted">Provider: {titleCase(sub.provider)}</Chip>}
            {sub?.provider_ref && <Chip tone="violet">Ref {sub.provider_ref}</Chip>}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-[#a9a2ff]" />
            <p className="text-sm text-[#eef1f7]">Payment provider status</p>
          </div>
          <ul className="mt-4 space-y-2.5 text-xs">
            {[
              ['Paystack (cards, M-Pesa, bank)', data?.payments.paystack],
              ['Stripe (cards)', data?.payments.stripe],
              ['M-Pesa Daraja (direct)', data?.payments.mpesa_direct],
            ].map(([label, ok]) => (
              <li key={String(label)} className="flex items-center justify-between gap-3">
                <span className="text-[#8a93a6]">{label}</span>
                <span className={ok ? 'inline-flex items-center gap-1 text-emerald-300' : 'text-[#6f7889]'}>
                  {ok ? <><Check size={12} /> Configured</> : 'Configuration required'}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 text-[0.68rem] leading-relaxed text-[#6f7889]">
            <Info size={12} className="mt-0.5 shrink-0" />
            MAVYRON never stores card details. Checkout happens on the provider's hosted page and invoices are only marked
            paid after a verified webhook.
          </p>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Plan usage" subtitle="Measured against your current plan limits this month" />
        {data?.limits.length === 0 ? (
          <p className="px-5 py-6 text-xs text-[#6f7889]">This plan has no configured limits.</p>
        ) : (
          <div className="grid gap-4 px-5 pb-5 sm:grid-cols-2 xl:grid-cols-3">
            {data?.limits.map((l) => (
              <div key={l.key} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                <div className="flex items-center justify-between">
                  <span className="text-[0.72rem] text-[#dde2ec]">{l.label}</span>
                  <span className="text-[0.68rem] text-[#8a93a6]">{l.limit === null ? 'Unlimited' : `${num(l.used)} / ${num(l.limit)}`}</span>
                </div>
                <div className="mt-3"><Progress value={l.limit === null ? 6 : l.percent} tone={l.state === 'at_limit' ? 'warn' : l.state === 'near_limit' ? 'warn' : 'violet'} /></div>
                <p className="mt-2 text-[0.66rem] text-[#6f7889]">
                  {l.state === 'unlimited' ? 'No cap on this plan' : l.state === 'at_limit' ? 'Limit reached — upgrade to continue' : `${num(l.used)} used this month`}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {(data?.plans || []).map((plan) => {
          const isCurrent = plan.id === currentPlanId;
          const features = Array.isArray(plan.features) ? plan.features : [];
          return (
            <Card key={plan.id} className={`relative flex flex-col p-6 ${isCurrent ? 'border-violet/40' : ''}`}>
              {isCurrent && (
                <span className="absolute right-4 top-4 rounded-full border border-violet/40 bg-violet/10 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-[#c7c1ff]">Current</span>
              )}
              <p className="text-[0.64rem] uppercase tracking-[0.2em] text-[#7d8798]">{titleCase(plan.id)}</p>
              <p className="mt-3 font-display text-2xl text-[#f4f6fb]">
                {money(planPrice(plan), plan.currency)}
                <span className="ml-1 text-[0.7rem] font-sans text-[#6f7889]">/{interval === 'yearly' ? 'year' : 'month'}</span>
              </p>
              <p className="mt-2 text-[0.78rem] leading-relaxed text-[#8a93a6]">{PLAN_BLURB[plan.id] || plan.tagline || ''}</p>
              <ul className="mt-4 flex-1 space-y-2 text-[0.78rem]">
                {features.slice(0, 8).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[#b9c1d1]">
                    <Check size={13} className="mt-0.5 shrink-0 text-[#a9a2ff]" /> {f}
                  </li>
                ))}
              </ul>
              <Button
                className="mt-5 w-full"
                variant={isCurrent ? 'ghost' : 'primary'}
                disabled={isCurrent}
                loading={busy === plan.id}
                onClick={() => void changePlan(plan.id)}
              >
                {isCurrent ? 'Active plan' : <><ArrowUpRight size={14} /> Choose {plan.name}</>}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Invoices"
          subtitle="Issued against this workspace"
          action={<span className="text-[0.68rem] text-[#6f7889]">{paidInvoices.length} paid</span>}
        />
        {(data?.invoices || []).length === 0 ? (
          <EmptyState icon={<FileText size={18} />} title="No invoices yet" body="Invoices appear here after a verified payment. Nothing is generated ahead of a real transaction." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-y border-white/[0.06] text-[0.62rem] uppercase tracking-[0.16em] text-[#6f7889]">
                  <th className="px-5 py-2.5 font-normal">Invoice</th>
                  <th className="px-3 py-2.5 font-normal">Issued</th>
                  <th className="px-3 py-2.5 font-normal">Period</th>
                  <th className="px-3 py-2.5 font-normal">Amount</th>
                  <th className="px-3 py-2.5 font-normal">Status</th>
                  <th className="px-5 py-2.5 font-normal" />
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {data?.invoices.map((inv) => (
                  <tr key={inv.id} className="text-[#c3cad8]">
                    <td className="px-5 py-3">
                      <span className="text-[#eef1f7]">{inv.number || inv.id.slice(0, 10)}</span>
                      {inv.description && <span className="block text-[0.66rem] text-[#6f7889]">{inv.description}</span>}
                    </td>
                    <td className="px-3 py-3">{dateLong(inv.issued_at)}</td>
                    <td className="px-3 py-3">{inv.period_start ? `${dateLong(inv.period_start)} → ${dateLong(inv.period_end || inv.period_start)}` : '—'}</td>
                    <td className="px-3 py-3">{money(inv.amount_cents, inv.currency)}</td>
                    <td className="px-3 py-3"><StatusChip status={inv.status} /></td>
                    <td className="px-5 py-3 text-right">
                      {inv.hosted_url ? (
                        <a href={inv.hosted_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#a9a2ff] hover:text-white">
                          <Download size={12} /> View
                        </a>
                      ) : <span className="text-[#5f6878]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Alert tone="info" title="How billing stays honest">
        Trial, active, past-due, cancelled and expired states are stored on your subscription record. Plan upgrades
        require a verified provider payment; nothing is marked successful locally.
      </Alert>
    </div>
  );
}
