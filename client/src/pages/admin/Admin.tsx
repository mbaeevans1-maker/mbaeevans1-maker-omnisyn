import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowUpRight, Building2, CreditCard, FileText, Inbox, Layers, Search, ShieldCheck,
  Trash2, Users, Wallet, Zap,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import {
  Alert, Button, Card, CardHeader, Chip, EmptyState, Input, Modal, PageHeader, Select,
  SkeletonRows, StatusChip, Tabs, Textarea, useToast,
} from '../../components/primitives';
import { money, timeAgo, titleCase } from '../../lib/format';

type Totals = {
  tenants: number; active_tenants: number; onboarding_tenants: number; suspended_tenants: number;
  new_tenants_30d: number; appointments_total: number; appointments_30d: number; customers_total: number;
  conversations_30d: number; handoffs_open: number; content_published: number; leads_new: number;
  open_invoices: number; mrr_cents: number; collected_30d_cents: number;
};
type Overview = {
  totals: Totals;
  subscriptions_by_status: { status: string; n: number }[];
  plan_mix: { plan_id?: string; name?: string; n: number }[];
  integration_health: { provider: string; status: string; n: number }[];
  recent_tenants: any[];
  recent_leads: any[];
};
type TenantRow = {
  id: string; name: string; slug: string; industry: string; status: string; plan_id?: string | null;
  created_at: string; city?: string | null; country?: string | null; onboarding_complete?: number;
  plan_name?: string | null; subscription_status?: string | null;
};
type Plan = { id: string; name: string; price_cents: number; currency?: string; limits?: Record<string, number | null>; features?: string[]; description?: string | null };

const TABS = [
  { key: 'overview', label: 'Overview', icon: Activity },
  { key: 'tenants', label: 'Workspaces', icon: Building2 },
  { key: 'invoices', label: 'Billing', icon: CreditCard },
  { key: 'plans', label: 'Plans', icon: Layers },
  { key: 'leads', label: 'Enquiries', icon: Inbox },
  { key: 'usage', label: 'Usage', icon: Zap },
  { key: 'accounts', label: 'Accounts', icon: ShieldCheck },
  { key: 'system', label: 'System', icon: Layers },
  { key: 'audit', label: 'Audit log', icon: FileText },
];

export default function Admin() {
  const toast = useToast();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [plans, setPlans] = useState<Plan[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [invoiceTotals, setInvoiceTotals] = useState<{ paid_cents: number; open_cents: number; open_count: number }>({ paid_cents: 0, open_cents: 0, open_count: 0 });
  const [leads, setLeads] = useState<any[]>([]);
  const [usage, setUsage] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [system, setSystem] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [detail, setDetail] = useState<any>(null);
  const [newAccount, setNewAccount] = useState({ name: '', email: '' });
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, tn, pl] = await Promise.all([
        api.get<Overview>('/admin/overview'),
        api.get<{ tenants: TenantRow[]; counts: Record<string, number>; plans: Plan[] }>(`/admin/tenants?status=${statusFilter}&q=${encodeURIComponent(query)}`),
        api.get<{ plans: Plan[] }>('/admin/plans'),
      ]);
      setOverview(ov);
      setTenants(tn.tenants);
      setCounts(tn.counts);
      setPlans(pl.plans);
    } catch (err) {
      toast.error('Could not load admin data', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, query, toast]);

  useEffect(() => { void load(); }, [load]);

  const loadTab = useCallback(async (key: string) => {
    setBusy(true);
    try {
      if (key === 'invoices') {
        const res = await api.get<{ invoices: any[]; totals: typeof invoiceTotals }>('/admin/invoices');
        setInvoices(res.invoices); setInvoiceTotals(res.totals);
      } else if (key === 'leads') {
        const res = await api.get<{ leads: any[] }>('/admin/leads');
        setLeads(res.leads);
      } else if (key === 'usage') {
        const res = await api.get<{ usage: any[] }>('/admin/usage');
        setUsage(res.usage);
      } else if (key === 'accounts') {
        const res = await api.get<{ accounts: any[] }>('/admin/accounts');
        setAccounts(res.accounts);
      } else if (key === 'system') {
        setSystem(await api.get('/admin/system'));
      } else if (key === 'audit') {
        const res = await api.get<{ entries: any[] }>('/admin/audit');
        setAudit(res.entries);
      }
    } catch (err) {
      toast.error('Could not load section', errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [toast]);

  useEffect(() => { void loadTab(tab); }, [tab, loadTab]);

  const openTenant = async (id: string) => {
    setBusy(true);
    try {
      setDetail(await api.get(`/admin/tenants/${id}`));
    } catch (err) {
      toast.error('Could not open workspace', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const changeSubscription = async (payload: Record<string, unknown>) => {
    if (!detail) return;
    setBusy(true);
    try {
      await api.post(`/admin/tenants/${detail.tenant.id}/subscription`, payload);
      toast.ok('Subscription updated', 'The workspace sees the change immediately.');
      await openTenant(detail.tenant.id);
      await load();
    } catch (err) {
      toast.error('Update failed', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const notify = async (title: string, body: string, level: string) => {
    if (!detail) return;
    try {
      await api.post(`/admin/tenants/${detail.tenant.id}/notify`, { title, body, level });
      toast.ok('Notification sent', 'It appears in the customer dashboard.');
    } catch (err) {
      toast.error('Could not send', errorMessage(err));
    }
  };

  const settleInvoice = async (id: string) => {
    try {
      await api.post(`/admin/invoices/${id}/settle`, {});
      toast.ok('Invoice settled', 'Recorded against the subscription.');
      await loadTab('invoices');
    } catch (err) {
      toast.error('Could not settle', errorMessage(err));
    }
  };

  const updateLead = async (id: string, status: string) => {
    try {
      await api.patch(`/admin/leads/${id}`, { status });
      await loadTab('leads');
    } catch (err) {
      toast.error('Could not update enquiry', errorMessage(err));
    }
  };

  const createAccount = async () => {
    if (!newAccount.name.trim() || !newAccount.email.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ account: any; temporary_password: string }>('/admin/accounts', newAccount);
      setAccounts((rows) => [...rows, res.account]);
      setCredential({ email: res.account.email, password: res.temporary_password });
      setNewAccount({ name: '', email: '' });
    } catch (err) {
      toast.error('Could not create administrator', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async (id: string) => {
    try {
      await api.del(`/admin/accounts/${id}`);
      setAccounts((rows) => rows.filter((a) => a.id !== id));
    } catch (err) {
      toast.error('Could not remove administrator', errorMessage(err));
    }
  };

  const total = overview?.totals;
  const kpis = useMemo(() => total ? [
    { label: 'Workspaces', value: total.tenants, detail: `${total.active_tenants} active · ${total.onboarding_tenants} onboarding` },
    { label: 'MRR', value: money(total.mrr_cents), detail: `${money(total.collected_30d_cents)} collected (30d)` },
    { label: 'Appointments (30d)', value: total.appointments_30d, detail: `${total.appointments_total} all time` },
    { label: 'AI conversations (30d)', value: total.conversations_30d, detail: `${total.handoffs_open} awaiting human` },
    { label: 'Customers', value: total.customers_total, detail: `${total.content_published} posts published` },
    { label: 'Open invoices', value: total.open_invoices, detail: `${total.leads_new} new enquiries` },
  ] : [], [total]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Platform administration"
        title="MAVYRON control centre"
        description="Every figure below is read from live platform data. No demo metrics are generated."
        action={<Chip tone="violet">Platform admin</Chip>}
      />

      <Card><div className="p-2"><Tabs tabs={TABS.map((t) => ({ value: t.key, label: t.label }))} value={tab} onChange={setTab} /></div></Card>

      {loading && <Card><SkeletonRows rows={6} /></Card>}

      {!loading && tab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {kpis.map((k) => (
              <Card key={k.label}>
                <div className="p-5">
                  <p className="text-[0.66rem] uppercase tracking-[0.22em] text-[#6f7889]">{k.label}</p>
                  <p className="mt-2 font-display text-2xl text-white">{k.value}</p>
                  <p className="mt-1 text-[0.72rem] text-[#7d8798]">{k.detail}</p>
                </div>
              </Card>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Subscriptions" subtitle="Distribution of workspace states." />
              <div className="space-y-2 p-5">
                {overview.subscriptions_by_status.length === 0 && <EmptyState title="No subscriptions yet" description="They appear once a business registers." />}
                {overview.subscriptions_by_status.map((s) => (
                  <div key={s.status} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
                    <StatusChip status={s.status} />
                    <span className="text-sm text-[#eef1f7]">{s.n}</span>
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Integration health" subtitle="Verified connection states across tenants." />
              <div className="space-y-2 p-5">
                {overview.integration_health.length === 0 && <EmptyState title="No integrations configured" description="Providers appear here as tenants connect them." />}
                {overview.integration_health.map((i) => (
                  <div key={`${i.provider}-${i.status}`} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
                    <span className="text-sm text-[#c9d0dc]">{titleCase(i.provider)}</span>
                    <span className="flex items-center gap-2 text-[0.7rem] text-[#7d8798]"><StatusChip status={i.status} /> {i.n}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader title="Newest workspaces" subtitle="Most recent registrations." />
            <div className="divide-y divide-white/[0.05]">
              {overview.recent_tenants.length === 0 && <div className="p-5"><EmptyState title="No workspaces yet" description="Register a business to see it here." /></div>}
              {overview.recent_tenants.map((t) => (
                <button key={t.id} onClick={() => void openTenant(t.id)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-white/[0.02]">
                  <Building2 size={14} className="text-[#a9a2ff]" />
                  <span className="flex-1 text-sm text-[#eef1f7]">{t.name}</span>
                  <span className="text-[0.7rem] text-[#7d8798]">{titleCase(t.industry)}</span>
                  <StatusChip status={t.status} />
                  <span className="text-[0.66rem] text-[#5c6577]">{timeAgo(t.created_at)}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!loading && tab === 'tenants' && (
        <Card>
          <CardHeader
            title="Workspaces"
            subtitle="Tenant data is isolated; opening a workspace shows only that tenant's records."
            action={<div className="flex gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5c6577]" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or slug" className="w-48 rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-8 pr-3 text-[0.75rem] text-white outline-none focus:border-[#7B5BFF]/50" />
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[0.75rem] text-white outline-none">
                {['all', 'active', 'onboarding', 'suspended'].map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </select>
            </div>}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="text-[0.64rem] uppercase tracking-[0.18em] text-[#6f7889]">
                <tr className="border-b border-white/[0.06]">
                  <th className="px-5 py-3">Business</th><th className="px-5 py-3">Industry</th>
                  <th className="px-5 py-3">Plan</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {tenants.map((t) => (
                  <tr key={t.id} className="cursor-pointer hover:bg-white/[0.02]" onClick={() => void openTenant(t.id)}>
                    <td className="px-5 py-3">
                      <p className="text-[#eef1f7]">{t.name}</p>
                      <p className="text-[0.66rem] text-[#5c6577]">/{t.slug}</p>
                    </td>
                    <td className="px-5 py-3 text-[#9aa3b2]">{titleCase(t.industry)}</td>
                    <td className="px-5 py-3 text-[#c9d0dc]">{t.plan_name || 'Trial'}</td>
                    <td className="px-5 py-3"><StatusChip status={t.subscription_status || t.status} /></td>
                    <td className="px-5 py-3 text-[0.7rem] text-[#7d8798]">{timeAgo(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {tenants.length === 0 && <div className="p-6"><EmptyState title="No workspaces match" description="Adjust the filter or search query." /></div>}
          <div className="flex gap-4 border-t border-white/[0.06] px-5 py-3 text-[0.7rem] text-[#7d8798]">
            <span>{counts.all ?? 0} total</span><span>{counts.active ?? 0} active</span>
            <span>{counts.onboarding ?? 0} onboarding</span><span>{counts.suspended ?? 0} suspended</span>
          </div>
        </Card>
      )}

      {!loading && tab === 'invoices' && (
        <Card>
          <CardHeader title="Invoices" subtitle={`${money(invoiceTotals.open_cents)} outstanding across ${invoiceTotals.open_count} invoices.`} />
          <div className="divide-y divide-white/[0.05]">
            {invoices.length === 0 && <div className="p-6"><EmptyState title="No invoices yet" description="Invoices are created by the subscription engine, not manually." /></div>}
            {invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Wallet size={14} className="text-[#a9a2ff]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-[#eef1f7]">{inv.tenant_name || inv.tenant_id}</p>
                  <p className="text-[0.66rem] text-[#5c6577]">{inv.id} · {titleCase(inv.kind || 'subscription')}</p>
                </div>
                <span className="text-sm text-[#eef1f7]">{money(inv.amount_cents, inv.currency || 'KES')}</span>
                <StatusChip status={inv.status} />
                {inv.status === 'open' && <Button size="sm" variant="secondary" onClick={() => void settleInvoice(inv.id)}>Settle</Button>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading && tab === 'plans' && (
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((p) => (
            <Card key={p.id}>
              <div className="p-5">
                <p className="text-[0.66rem] uppercase tracking-[0.22em] text-[#6f7889]">{p.name}</p>
                <p className="mt-2 font-display text-2xl text-white">{money(p.price_cents, p.currency || 'KES')}<span className="text-[0.7rem] text-[#7d8798]">/mo</span></p>
                <p className="mt-2 text-[0.75rem] leading-relaxed text-[#9aa3b2]">{p.description || 'Plan limits are enforced by the platform.'}</p>
                <div className="mt-4 space-y-1.5">
                  {Object.entries(p.limits || {}).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-[0.7rem]">
                      <span className="text-[#7d8798]">{titleCase(k.replace(/_/g, ' '))}</span>
                      <span className="text-[#c9d0dc]">{v === null ? 'Unlimited' : v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
          {plans.length === 0 && <Card><div className="p-6"><EmptyState title="No plans defined" description="Plans are seeded by the platform." /></div></Card>}
        </div>
      )}

      {!loading && tab === 'leads' && (
        <Card>
          <CardHeader title="Enquiries" subtitle="Contact and partnership submissions from the public site." />
          <div className="divide-y divide-white/[0.05]">
            {leads.length === 0 && <div className="p-6"><EmptyState title="No enquiries" description="Submissions from /contact and /partnerships appear here." /></div>}
            {leads.map((l) => (
              <div key={l.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={l.kind === 'partnership' ? 'violet' : 'muted'}>{titleCase(l.kind)}</Chip>
                  <span className="text-sm text-[#eef1f7]">{l.name}</span>
                  <span className="text-[0.7rem] text-[#7d8798]">{l.email}</span>
                  <span className="ml-auto text-[0.66rem] text-[#5c6577]">{timeAgo(l.created_at)}</span>
                </div>
                {l.subject && <p className="mt-2 text-[0.78rem] text-[#c9d0dc]">{l.subject}</p>}
                {l.message && <p className="mt-1 line-clamp-3 text-[0.75rem] leading-relaxed text-[#8d97a8]">{l.message}</p>}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {['new', 'in_review', 'responded', 'closed'].map((s) => (
                    <button key={s} onClick={() => void updateLead(l.id, s)} className={`rounded-md px-2 py-1 text-[0.66rem] transition ${l.status === s ? 'bg-[#7B5BFF]/20 text-white ring-1 ring-[#7B5BFF]/40' : 'text-[#6f7889] ring-1 ring-white/[0.07] hover:text-white'}`}>
                      {titleCase(s.replace(/_/g, ' '))}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {!loading && tab === 'usage' && (
        <Card>
          <CardHeader title="Usage by workspace" subtitle="Counted from real records against plan limits." />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="text-[0.64rem] uppercase tracking-[0.18em] text-[#6f7889]">
                <tr className="border-b border-white/[0.06]">
                  <th className="px-5 py-3">Workspace</th><th className="px-5 py-3">Staff</th>
                  <th className="px-5 py-3">Appointments</th><th className="px-5 py-3">AI messages</th><th className="px-5 py-3">Content</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {usage.map((u) => (
                  <tr key={u.id}>
                    <td className="px-5 py-3 text-[#eef1f7]">{u.name}</td>
                    <td className="px-5 py-3 text-[#9aa3b2]">{u.staff ?? u.staff_count ?? 0}</td>
                    <td className="px-5 py-3 text-[#9aa3b2]">{u.appointments ?? u.appointments_count ?? 0}</td>
                    <td className="px-5 py-3 text-[#9aa3b2]">{u.messages ?? u.ai_messages ?? 0}</td>
                    <td className="px-5 py-3 text-[#9aa3b2]">{u.content ?? u.content_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {usage.length === 0 && <div className="p-6"><EmptyState title="No usage recorded" description="Usage appears once workspaces start operating." /></div>}
        </Card>
      )}

      {!loading && tab === 'accounts' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Platform administrators" subtitle="Only these accounts can access this console." />
            <div className="divide-y divide-white/[0.05]">
              {accounts.map((a) => (
                <div key={a.id} className="flex items-center gap-3 px-5 py-3">
                  <Users size={14} className="text-[#a9a2ff]" />
                  <div className="flex-1"><p className="text-sm text-[#eef1f7]">{a.name}</p><p className="text-[0.66rem] text-[#5c6577]">{a.email}</p></div>
                  <span className="text-[0.66rem] text-[#7d8798]">{a.last_login_at ? timeAgo(a.last_login_at) : 'Never signed in'}</span>
                  <Button size="sm" variant="ghost" onClick={() => void removeAccount(a.id)} icon={<Trash2 size={13} />}>Remove</Button>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Add administrator" subtitle="A one-time password is generated and shown once." />
            <div className="grid gap-3 p-5 sm:grid-cols-[1fr_1fr_auto]">
              <Input label="Name" value={newAccount.name} onChange={(e) => setNewAccount({ ...newAccount, name: e.target.value })} />
              <Input label="Email" type="email" value={newAccount.email} onChange={(e) => setNewAccount({ ...newAccount, email: e.target.value })} />
              <div className="flex items-end"><Button loading={busy} onClick={() => void createAccount()}>Create</Button></div>
            </div>
          </Card>
        </div>
      )}

      {!loading && tab === 'system' && system && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader title="Runtime" subtitle="Provider configuration as detected at boot." />
            <div className="space-y-2 p-5 text-[0.78rem]">
              <Row label="AI provider" value={system.ai?.provider || system.ai?.mode || 'not configured'} />
              <Row label="AI model" value={system.ai?.model || '—'} />
              <Row label="Database" value={system.database?.path} />
              <Row label="Tenants" value={String(system.database?.tenants ?? 0)} />
              <Row label="Users" value={String(system.database?.users ?? 0)} />
              <Row label="Appointments" value={String(system.database?.appointments ?? 0)} />
              <Row label="Messages" value={String(system.database?.messages ?? 0)} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Payment providers" subtitle="Live only when credentials verify." />
            <div className="space-y-2 p-5">
              {(system.payments || []).map((p: any) => (
                <div key={p.provider || p.name} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
                  <span className="text-sm text-[#c9d0dc]">{titleCase(p.provider || p.name)}</span>
                  <StatusChip status={p.configured ? 'connected' : 'configuration_required'} />
                </div>
              ))}
              {(system.payments || []).length === 0 && <EmptyState title="No payment provider configured" description="Set provider credentials to enable checkout." />}
            </div>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader title="Recent platform activity" subtitle="Audit trail written by backend actions." />
            <div className="divide-y divide-white/[0.05]">
              {(system.audit_recent || []).map((a: any, i: number) => (
                <div key={i} className="flex items-center gap-3 px-5 py-2.5 text-[0.75rem]">
                  <span className="text-[#c9d0dc]">{a.action}</span>
                  <span className="text-[#5c6577]">{a.actor_email || 'system'}</span>
                  <span className="ml-auto text-[#5c6577]">{timeAgo(a.created_at)}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {!loading && tab === 'audit' && (
        <Card>
          <CardHeader title="Audit log" subtitle="Most recent 200 privileged actions." />
          <div className="divide-y divide-white/[0.05]">
            {audit.length === 0 && <div className="p-6"><EmptyState title="No audit entries" description="Actions are recorded automatically." /></div>}
            {audit.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-2.5 text-[0.75rem]">
                <span className="text-[#eef1f7]">{a.action}</span>
                <span className="text-[#7d8798]">{a.actor_email || 'system'}</span>
                {a.target && <span className="text-[#5c6577]">{a.target}</span>}
                <span className="ml-auto text-[#5c6577]">{timeAgo(a.created_at)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.tenant?.name || 'Workspace'} wide>
        {detail && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <Row label="Slug" value={`/${detail.tenant.slug}`} />
              <Row label="Industry" value={titleCase(detail.tenant.industry)} />
              <Row label="Status" value={titleCase(detail.tenant.status)} />
              <Row label="Plan" value={detail.plan?.name || 'Trial'} />
              <Row label="Subscription" value={titleCase(detail.subscription?.status || 'none')} />
              <Row label="Renews" value={detail.subscription?.current_period_end ? new Date(detail.subscription.current_period_end).toLocaleDateString() : '—'} />
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              {Object.entries(detail.stats || {}).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-white/[0.06] px-3 py-2">
                  <p className="text-[0.62rem] uppercase tracking-[0.18em] text-[#6f7889]">{titleCase(k)}</p>
                  <p className="mt-1 text-sm text-white">{String(v)}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-[0.66rem] uppercase tracking-[0.2em] text-[#6f7889]">Subscription control</p>
              <div className="flex flex-wrap gap-2">
                {plans.map((p) => (
                  <Button key={p.id} size="sm" variant={detail.subscription?.plan_id === p.id ? 'primary' : 'secondary'} loading={busy} onClick={() => void changeSubscription({ planId: p.id, status: 'active', note: 'Changed by platform admin' })}>
                    {p.name}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {['trialing', 'active', 'past_due', 'cancelled', 'expired', 'suspended'].map((s) => (
                  <button key={s} onClick={() => void changeSubscription({ status: s })} className="rounded-md px-2.5 py-1.5 text-[0.68rem] text-[#9aa3b2] ring-1 ring-white/[0.08] hover:text-white">
                    {titleCase(s.replace(/_/g, ' '))}
                  </button>
                ))}
                <button onClick={() => void changeSubscription({ extendTrialDays: 14 })} className="rounded-md px-2.5 py-1.5 text-[0.68rem] text-[#9aa3b2] ring-1 ring-white/[0.08] hover:text-white">Extend trial 14d</button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[0.66rem] uppercase tracking-[0.2em] text-[#6f7889]">Send notification</p>
              <NotifyForm onSend={notify} />
            </div>

            <div>
              <p className="mb-2 text-[0.66rem] uppercase tracking-[0.2em] text-[#6f7889]">Team</p>
              <div className="space-y-1">
                {(detail.users || []).map((u: any) => (
                  <div key={u.id} className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-3 py-2 text-[0.75rem]">
                    <span className="flex-1 text-[#eef1f7]">{u.name}</span>
                    <span className="text-[#7d8798]">{u.role_label || titleCase(u.role)}</span>
                    <StatusChip status={u.status} />
                  </div>
                ))}
              </div>
            </div>

            <a href={`/business/${detail.tenant.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.75rem] text-[#a9a2ff] hover:underline">
              Open public page <ArrowUpRight size={12} />
            </a>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(credential)} onClose={() => setCredential(null)} title="Administrator created">
        <Alert tone="warn" title="Shown once">
          Share this password securely. It is not stored in plain text and cannot be displayed again.
        </Alert>
        <div className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 font-mono text-[0.75rem] text-[#c9d0dc]">
          <p>{credential?.email}</p>
          <p className="mt-1 text-white">{credential?.password}</p>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2">
      <span className="text-[0.68rem] uppercase tracking-[0.14em] text-[#6f7889]">{label}</span>
      <span className="text-[0.78rem] text-[#eef1f7]">{value}</span>
    </div>
  );
}

function NotifyForm({ onSend }: { onSend: (title: string, body: string, level: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [level, setLevel] = useState('info');
  return (
    <div className="space-y-2">
      <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea label="Message" rows={2} value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="flex items-end gap-2">
        <Select label="Level" value={level} onChange={(e) => setLevel(e.target.value)} options={['info', 'success', 'warning'].map((l) => ({ value: l, label: titleCase(l) }))} />
        <Button size="sm" disabled={!title.trim() || !body.trim()} onClick={() => { void onSend(title, body, level); setTitle(''); setBody(''); }}>Send</Button>
      </div>
    </div>
  );
}
