import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays, Mail, Phone, Search, Sparkles, Tag, UserPlus, Users, X,
} from 'lucide-react';
import { api, errorMessage, type Appointment, type Customer } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Avatar, Button, Card, CardHeader, Chip, EmptyState, Field, Input, Modal, PageHeader,
  SkeletonRows, Tabs, Textarea, useToast,
} from '../../components/primitives';
import { dateTime, initials, money, num, relative, tagList, titleCase } from '../../lib/format';

type Counts = { all: number; new: number; returning: number; vip: number; inactive: number };
type Segment = 'all' | 'new' | 'returning' | 'vip' | 'inactive';

type CustomerDetail = {
  customer: Customer;
  appointments: Appointment[];
  conversations: { id: string; channel: string; status: string; last_message?: string | null; last_message_at?: string | null }[];
};

export function CustomersPage() {
  const { can, tenant } = useSession();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [segment, setSegment] = useState<Segment>('all');
  const [rows, setRows] = useState<Customer[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    const query = new URLSearchParams({ segment });
    if (q.trim()) query.set('q', q.trim());
    try {
      const res = await api.get<{ customers: Customer[]; counts: Counts }>(`/tenant/customers?${query}`);
      setRows(res.customers);
      setCounts(res.counts);
    } catch (err) {
      setError(errorMessage(err));
      setRows([]);
    }
  }, [q, segment]);

  useEffect(() => {
    const t = setTimeout(load, q ? 260 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Customer intelligence"
        title="Customers"
        description={`Every customer profile, visit and consent record for ${tenant?.name || 'your business'} — segmented automatically from real activity.`}
        action={
          can('customers:write') ? (
            <Button onClick={() => setEditing('new')}>
              <UserPlus size={15} /> Add customer
            </Button>
          ) : undefined
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7889]" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or email"
            aria-label="Search customers"
            className="w-full rounded-xl border border-white/10 bg-white/[0.03] py-2.5 pl-9 pr-9 text-sm text-[#e7ebf3] placeholder:text-[#5f6879] focus:border-violet/50 focus:outline-none"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6f7889] hover:text-white">
              <X size={14} />
            </button>
          )}
        </div>
        <Tabs
          value={segment}
          onChange={setSegment}
          tabs={[
            { value: 'all', label: 'All', count: counts?.all },
            { value: 'new', label: 'New', count: counts?.new },
            { value: 'returning', label: 'Returning', count: counts?.returning },
            { value: 'vip', label: 'VIP', count: counts?.vip },
            { value: 'inactive', label: 'Inactive', count: counts?.inactive },
          ]}
        />
      </div>

      <Card>
        <CardHeader
          title="Customer directory"
          eyebrow="CRM"
          subtitle="Segments derive from visit history and spend — never estimated."
          action={<span className="meta">{rows ? `${rows.length} shown` : '—'}</span>}
        />
        {rows === null ? (
          <SkeletonRows rows={5} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Users size={20} />}
            title={q || segment !== 'all' ? 'No customers match this view' : 'No customers yet'}
            body={
              q || segment !== 'all'
                ? 'Adjust the search or segment to see other customer profiles.'
                : 'Customer profiles are created automatically by bookings, WhatsApp conversations and walk-ins.'
            }
            action={can('customers:write') ? <Button variant="secondary" onClick={() => setEditing('new')}>Add the first customer</Button> : undefined}
          />
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {rows.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setDetailId(c.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] sm:px-5"
                >
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#e7ebf3]">{c.name}</p>
                    <p className="mt-0.5 truncate text-[0.72rem] text-[#7d8798]">
                      {[c.phone, c.email].filter(Boolean).join(' · ') || 'No contact details'}
                    </p>
                  </div>
                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    {tagList(c.tags).slice(0, 2).map((t) => (
                      <Chip key={t} tone="violet">{titleCase(t)}</Chip>
                    ))}
                    {c.marketing_consent && <Chip tone="gold">Consent</Chip>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm text-[#e7ebf3]">{num(c.visits || 0)} visits</p>
                    <p className="mt-0.5 text-[0.7rem] text-[#6f7889]">
                      {c.last_visit_at ? relative(c.last_visit_at) : 'No visits yet'}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.push('Customer saved.', 'success'); }}
        />
      )}

      {detailId && <CustomerDrawer id={detailId} onClose={() => setDetailId(null)} onEdit={(c) => { setDetailId(null); setEditing(c); }} />}
    </div>
  );
}

function CustomerForm({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [notes, setNotes] = useState((customer as { notes?: string | null })?.notes || '');
  const [preferences, setPreferences] = useState((customer as { preferences?: string | null })?.preferences || '');
  const [tags, setTags] = useState(tagList(customer?.tags).join(', '));
  const [consent, setConsent] = useState(Boolean(customer?.marketing_consent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
      preferences: preferences.trim() || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 20),
      marketing_consent: consent,
    };
    try {
      if (customer) await api.patch(`/tenant/customers/${customer.id}`, body);
      else await api.post('/tenant/customers', body);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={customer ? 'Edit customer' : 'Add customer'}
      description="Stored inside your workspace only. Consent controls marketing eligibility."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 2}>{busy ? 'Saving…' : 'Save customer'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Full name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254…" inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" type="email" />
          </Field>
        </div>
        <Field label="Preferences" hint="Allergies, favourite stylist, service preferences.">
          <Textarea value={preferences} onChange={(e) => setPreferences(e.target.value)} rows={2} />
        </Field>
        <Field label="Internal notes" hint="Visible only to your team.">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Field label="Tags" hint="Comma separated, e.g. vip, bridal, colour.">
          <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="vip, colour" />
        </Field>
        <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-violet" />
          <span className="text-xs leading-relaxed text-[#98a1b3]">
            Customer has consented to marketing messages. Only consented customers are included in campaign audiences.
          </span>
        </label>
      </div>
    </Modal>
  );
}

function CustomerDrawer({ id, onClose, onEdit }: { id: string; onClose: () => void; onEdit: (c: Customer) => void }) {
  const { can } = useSession();
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<CustomerDetail>(`/tenant/customers/${id}`)
      .then((res) => alive && setData(res))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => { alive = false; };
  }, [id]);

  return (
    <Modal
      open
      onClose={onClose}
      title={data?.customer.name || 'Customer'}
      description={data ? [data.customer.phone, data.customer.email].filter(Boolean).join(' · ') || 'No contact details' : undefined}
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          {data && can('customers:write') && <Button onClick={() => onEdit(data.customer)}>Edit profile</Button>}
        </>
      }
    >
      {error ? (
        <Alert tone="error">{error}</Alert>
      ) : !data ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <MiniStat label="Visits" value={num(Number(data.customer.visits || 0))} />
            <MiniStat label="Spend" value={money(Number(data.customer.total_spent_cents || 0))} />
            <MiniStat label="Last visit" value={data.customer.last_visit_at ? relative(data.customer.last_visit_at) : '—'} />
          </div>

          <div className="flex flex-wrap gap-2">
            {tagList(data.customer.tags).map((t) => <Chip key={t} tone="violet"><Tag size={11} className="mr-1" />{titleCase(t)}</Chip>)}
            {data.customer.marketing_consent && <Chip tone="gold">Marketing consent</Chip>}
          </div>

          {(data.customer as { preferences?: string | null }).preferences && (
            <Block icon={<Sparkles size={14} />} title="Preferences">
              {(data.customer as { preferences?: string | null }).preferences}
            </Block>
          )}

          <div>
            <p className="meta mb-2.5">Appointment history</p>
            {data.appointments.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-[#7d8798]">
                No appointments recorded for this customer yet.
              </p>
            ) : (
              <ul className="divide-y divide-white/[0.05] overflow-hidden rounded-xl border border-white/10">
                {data.appointments.slice(0, 8).map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate text-[#e7ebf3]">{a.service_name}</p>
                      <p className="mt-0.5 text-[0.68rem] text-[#6f7889]">{dateTime(a.start_at)} · {a.staff_name || 'Unassigned'}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[#dde2ec]">{money(a.price_cents)}</p>
                      <p className="mt-0.5 text-[0.68rem] text-[#6f7889]">{titleCase(a.status)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="meta mb-2.5">Conversations</p>
            {data.conversations.length === 0 ? (
              <p className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-xs text-[#7d8798]">
                No AI or WhatsApp conversations for this customer yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.conversations.map((c) => (
                  <li key={c.id} className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[#dde2ec]">{titleCase(c.channel)}</span>
                      <span className="text-[0.68rem] text-[#6f7889]">{c.last_message_at ? relative(c.last_message_at) : ''}</span>
                    </div>
                    {c.last_message && <p className="mt-1 line-clamp-2 text-[0.7rem] text-[#7d8798]">{c.last_message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {(data.customer as { notes?: string | null }).notes && (
            <Block icon={<Mail size={14} />} title="Internal notes">
              {(data.customer as { notes?: string | null }).notes}
            </Block>
          )}
        </div>
      )}
    </Modal>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5">
      <p className="meta truncate">{label}</p>
      <p className="mt-1.5 truncate text-sm text-[#eef1f7]">{value}</p>
    </div>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
      <p className="flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#7d8798]">
        <span className="text-violet-soft">{icon}</span>{title}
      </p>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[#c3cad8]">{children}</p>
    </div>
  );
}

export const CustomerIcons = { CalendarDays, Phone, initials };
