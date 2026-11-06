import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2, Download, KeyRound, Palette, Plug, Plus, ShieldCheck, Sparkles, Trash2, Users, Clock3,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Avatar, Button, Card, CardHeader, Chip, EmptyState, Input, Modal, PageHeader, Select,
  SkeletonRows, StatusChip, Switch, Tabs, Textarea, useToast,
} from '../../components/primitives';
import { dateLong, relative, titleCase } from '../../lib/format';

type BookingRules = {
  slotIntervalMin?: number; leadTimeMin?: number; maxAdvanceDays?: number;
  bufferMin?: number; allowStaffChoice?: boolean; requireEmail?: boolean;
};

type Tenant = {
  id: string; slug: string; name: string; industry: string; legal_name?: string | null;
  email?: string | null; phone?: string | null; whatsapp?: string | null;
  address?: string | null; city?: string | null; country: string; timezone: string; currency: string;
  logo_url?: string | null; brand_color: string; accent_color: string;
  tagline?: string | null; about?: string | null;
  gallery: string[]; social_links: Record<string, string>; booking_rules: BookingRules;
  onboarding_step: number; onboarding_complete: boolean; status: string; launched_at?: string | null;
};

type AiSettings = {
  enabled: boolean; assistant_name: string; tone: string; language: string;
  greeting?: string | null; escalation_keywords: string[]; voice_enabled: boolean;
};

type Knowledge = { id: string; kind: string; title: string; content: string; active: number };

type TeamMember = {
  id: string; name: string; email: string; role: string; status: string;
  role_label?: string; last_login_at?: string | null; created_at: string;
};

type AuditRow = { id?: string; action: string; actor?: string; target?: string; created_at: string; ip?: string | null };

const INDUSTRIES = [
  ['salon', 'Salon'], ['barbershop', 'Barbershop'], ['spa', 'Spa'], ['clinic', 'Clinic'],
  ['dental', 'Dental'], ['restaurant', 'Restaurant'], ['hotel', 'Hotel'], ['fitness', 'Fitness'],
  ['rentals', 'Rentals'], ['other', 'Other'],
].map(([value, label]) => ({ value, label }));

const ROLES = [
  { value: 'manager', label: 'Manager' }, { value: 'receptionist', label: 'Receptionist' }, { value: 'staff', label: 'Staff' },
];

type Tab = 'profile' | 'brand' | 'booking' | 'ai' | 'team' | 'security' | 'data';

export function Settings() {
  const toast = useToast();
  const { refresh, user, can } = useSession();
  const [tab, setTab] = useState<Tab>('profile');
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [ai, setAi] = useState<AiSettings | null>(null);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [invite, setInvite] = useState({ name: '', email: '', role: 'staff', password: '' });
  const [entryOpen, setEntryOpen] = useState(false);
  const [entry, setEntry] = useState({ kind: 'faq', title: '', content: '' });
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, t, a] = await Promise.all([
        api.get<{ tenant: Tenant; ai: { configured?: boolean } }>('/tenant/settings'),
        api.get<{ settings: AiSettings; knowledge: Knowledge[] }>('/tenant/ai').catch(() => null),
        api.get<{ members: TeamMember[] }>('/tenant/team').catch(() => null),
      ]);
      setTenant(s.tenant);
      if (t) { setAi(t.settings); setKnowledge(t.knowledge || []); }
      if (a) setMembers(a.members || []);
    } catch (err) {
      toast.error('Could not load settings', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (tab !== 'security' || audit.length) return;
    void (async () => {
      try {
        const data = await api.get<{ entries?: AuditRow[]; audit?: AuditRow[] }>('/tenant/audit');
        setAudit(data.entries || data.audit || []);
      } catch { /* audit log is optional for non-owners */ }
    })();
  }, [tab, audit.length]);

  const patch = (fields: Partial<Tenant>) => setTenant((t) => (t ? { ...t, ...fields } : t));
  const patchRules = (fields: BookingRules) =>
    setTenant((t) => (t ? { ...t, booking_rules: { ...t.booking_rules, ...fields } } : t));

  const saveProfile = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      await api.patch('/tenant/settings', {
        name: tenant.name, legal_name: tenant.legal_name || null, industry: tenant.industry,
        email: tenant.email || null, phone: tenant.phone || null, whatsapp: tenant.whatsapp || null,
        address: tenant.address || null, city: tenant.city || null, country: tenant.country,
        timezone: tenant.timezone, currency: tenant.currency,
        tagline: tenant.tagline || null, about: tenant.about || null,
      });
      toast.ok('Business profile saved');
      await refresh();
    } catch (err) {
      toast.error('Could not save profile', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveBrand = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      await api.patch('/tenant/settings', {
        logo_url: tenant.logo_url || null, brand_color: tenant.brand_color, accent_color: tenant.accent_color,
      });
      toast.ok('Branding saved', 'Your public page and content engine use these colours.');
      await refresh();
    } catch (err) {
      toast.error('Could not save branding', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async () => {
    if (!tenant) return;
    setSaving(true);
    try {
      await api.patch('/tenant/settings', { booking_rules: tenant.booking_rules });
      toast.ok('Booking rules saved', 'Availability calculations use these values immediately.');
    } catch (err) {
      toast.error('Could not save booking rules', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const saveAi = async () => {
    if (!ai) return;
    setSaving(true);
    try {
      const res = await api.patch<{ settings: AiSettings }>('/tenant/ai', {
        enabled: ai.enabled, assistant_name: ai.assistant_name, tone: ai.tone, language: ai.language,
        greeting: ai.greeting || null, voice_enabled: ai.voice_enabled,
        escalation_keywords: ai.escalation_keywords,
      });
      setAi(res.settings);
      toast.ok('AI receptionist updated');
    } catch (err) {
      toast.error('Could not save AI settings', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const addKnowledge = async () => {
    if (!entry.title.trim() || !entry.content.trim()) return;
    setSaving(true);
    try {
      const res = await api.post<{ entry: Knowledge }>('/tenant/knowledge', entry);
      setKnowledge((rows) => [...rows, res.entry]);
      setEntry({ kind: 'faq', title: '', content: '' });
      setEntryOpen(false);
      toast.ok('Knowledge added', 'The AI can now answer from this entry.');
    } catch (err) {
      toast.error('Could not add knowledge', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const toggleKnowledge = async (row: Knowledge) => {
    try {
      const res = await api.patch<{ entry: Knowledge }>(`/tenant/knowledge/${row.id}`, { active: !row.active });
      setKnowledge((rows) => rows.map((r) => (r.id === row.id ? res.entry : r)));
    } catch (err) {
      toast.error('Could not update entry', errorMessage(err));
    }
  };

  const removeKnowledge = async (row: Knowledge) => {
    try {
      await api.delete(`/tenant/knowledge/${row.id}`);
      setKnowledge((rows) => rows.filter((r) => r.id !== row.id));
      toast.ok('Knowledge removed');
    } catch (err) {
      toast.error('Could not remove entry', errorMessage(err));
    }
  };

  const addMember = async () => {
    setSaving(true);
    try {
      await api.post('/tenant/team', invite);
      setInvite({ name: '', email: '', role: 'staff', password: '' });
      setInviteOpen(false);
      toast.ok('Team member added', 'Share the temporary password securely and ask them to change it.');
      const data = await api.get<{ members: TeamMember[] }>('/tenant/team');
      setMembers(data.members);
    } catch (err) {
      toast.error('Could not add team member', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const updateMember = async (member: TeamMember, fields: { role?: string; status?: string }) => {
    try {
      await api.patch(`/tenant/team/${member.id}`, fields);
      const data = await api.get<{ members: TeamMember[] }>('/tenant/team');
      setMembers(data.members);
      toast.ok('Team updated');
    } catch (err) {
      toast.error('Could not update member', errorMessage(err));
    }
  };

  const removeMember = async (member: TeamMember) => {
    try {
      await api.delete(`/tenant/team/${member.id}`);
      setMembers((rows) => rows.filter((r) => r.id !== member.id));
      toast.ok('Access removed');
    } catch (err) {
      toast.error('Could not remove member', errorMessage(err));
    }
  };

  const changePassword = async () => {
    setSaving(true);
    try {
      await api.patch('/auth/password', pwd);
      setPwd({ currentPassword: '', newPassword: '' });
      toast.ok('Password updated', 'Other sessions remain valid until they expire.');
    } catch (err) {
      toast.error('Could not change password', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const exportData = async () => {
    try {
      const data = await api.get<Record<string, unknown>>('/tenant/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mavyron-${tenant?.slug || 'workspace'}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.ok('Export downloaded');
    } catch (err) {
      toast.error('Export failed', errorMessage(err));
    }
  };

  const tabs = useMemo(() => [
    { value: 'profile' as Tab, label: 'Business' },
    { value: 'brand' as Tab, label: 'Brand' },
    { value: 'booking' as Tab, label: 'Booking rules' },
    { value: 'ai' as Tab, label: 'AI & knowledge' },
    { value: 'team' as Tab, label: 'Team', count: members.length },
    { value: 'security' as Tab, label: 'Security' },
    { value: 'data' as Tab, label: 'Data' },
  ], [members.length]);

  if (loading || !tenant) {
    return <div className="space-y-6"><PageHeader eyebrow="Account" title="Settings" /><Card><SkeletonRows rows={10} /></Card></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Workspace settings"
        description="Configuration here drives your public page, booking availability and the AI receptionist."
        action={<Chip tone="violet">{tenant.slug}</Chip>}
      />

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'profile' && (
        <Card>
          <CardHeader
            eyebrow="Identity"
            title="Business profile"
            subtitle="Shown on your public page, AI answers and customer messages."
            action={<Button onClick={() => void saveProfile()} loading={saving} icon={<Building2 size={14} />}>Save profile</Button>}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Input label="Business name" value={tenant.name} onChange={(e) => patch({ name: e.target.value })} />
            <Input label="Registered legal name" value={tenant.legal_name || ''} onChange={(e) => patch({ legal_name: e.target.value })} />
            <Select label="Industry" options={INDUSTRIES} value={tenant.industry} onChange={(e) => patch({ industry: e.target.value })} />
            <Input label="Public tagline" value={tenant.tagline || ''} onChange={(e) => patch({ tagline: e.target.value })} />
            <Input label="Email" type="email" value={tenant.email || ''} onChange={(e) => patch({ email: e.target.value })} />
            <Input label="Phone" value={tenant.phone || ''} onChange={(e) => patch({ phone: e.target.value })} />
            <Input label="WhatsApp number" value={tenant.whatsapp || ''} onChange={(e) => patch({ whatsapp: e.target.value })} hint="Used by the public page and WhatsApp integration." />
            <Input label="Street address" value={tenant.address || ''} onChange={(e) => patch({ address: e.target.value })} />
            <Input label="City" value={tenant.city || ''} onChange={(e) => patch({ city: e.target.value })} />
            <Input label="Country" value={tenant.country} onChange={(e) => patch({ country: e.target.value })} />
            <Input label="Timezone" value={tenant.timezone} onChange={(e) => patch({ timezone: e.target.value })} hint="IANA name, e.g. Africa/Nairobi" />
            <Input label="Currency" maxLength={3} value={tenant.currency} onChange={(e) => patch({ currency: e.target.value.toUpperCase() })} />
            <Textarea label="About the business" rows={4} className="sm:col-span-2" value={tenant.about || ''} onChange={(e) => patch({ about: e.target.value })} />
          </div>
        </Card>
      )}

      {tab === 'brand' && (
        <Card>
          <CardHeader
            eyebrow="Identity"
            title="Brand kit"
            subtitle="Colours are applied to your public page, content engine and generated creatives."
            action={<Button onClick={() => void saveBrand()} loading={saving} icon={<Palette size={14} />}>Save brand</Button>}
          />
          <div className="grid gap-5 p-5 lg:grid-cols-[1fr_320px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Logo URL" className="sm:col-span-2" value={tenant.logo_url || ''} onChange={(e) => patch({ logo_url: e.target.value })} hint="HTTPS link to a square logo, ideally 512px." />
              <div>
                <p className="mb-1.5 text-[0.78rem] text-[#b9c1d0]">Primary colour</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={tenant.brand_color} onChange={(e) => patch({ brand_color: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent" aria-label="Primary colour" />
                  <input value={tenant.brand_color} onChange={(e) => patch({ brand_color: e.target.value })} className="flex-1" aria-label="Primary colour hex" />
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-[0.78rem] text-[#b9c1d0]">Accent colour</p>
                <div className="flex items-center gap-2">
                  <input type="color" value={tenant.accent_color} onChange={(e) => patch({ accent_color: e.target.value })} className="h-10 w-14 cursor-pointer rounded-lg border border-white/10 bg-transparent" aria-label="Accent colour" />
                  <input value={tenant.accent_color} onChange={(e) => patch({ accent_color: e.target.value })} className="flex-1" aria-label="Accent colour hex" />
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.07] p-5" style={{ background: `linear-gradient(150deg, ${tenant.brand_color}22, ${tenant.accent_color}11, transparent)` }}>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06]">
                {tenant.logo_url ? <img src={tenant.logo_url} alt="" className="h-full w-full rounded-xl object-cover" /> : <Sparkles size={18} style={{ color: tenant.accent_color }} />}
              </div>
              <p className="mt-4 font-display text-lg text-white">{tenant.name}</p>
              <p className="text-xs text-white/60">{tenant.tagline || 'Your tagline appears here'}</p>
              <span className="mt-4 inline-flex rounded-full px-3 py-1.5 text-[0.72rem] font-medium text-white" style={{ background: tenant.brand_color }}>Book appointment</span>
            </div>
          </div>
        </Card>
      )}

      {tab === 'booking' && (
        <Card>
          <CardHeader
            eyebrow="Availability"
            title="Booking rules"
            subtitle="These values feed the real availability engine — no override is possible at booking time."
            action={<Button onClick={() => void saveRules()} loading={saving} icon={<Clock3 size={14} />}>Save rules</Button>}
          />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Input label="Slot interval (minutes)" type="number" min={5} max={120} value={String(tenant.booking_rules.slotIntervalMin ?? 15)} onChange={(e) => patchRules({ slotIntervalMin: Number(e.target.value) })} />
            <Input label="Minimum lead time (minutes)" type="number" min={0} max={10080} value={String(tenant.booking_rules.leadTimeMin ?? 60)} onChange={(e) => patchRules({ leadTimeMin: Number(e.target.value) })} />
            <Input label="Maximum advance (days)" type="number" min={1} max={365} value={String(tenant.booking_rules.maxAdvanceDays ?? 60)} onChange={(e) => patchRules({ maxAdvanceDays: Number(e.target.value) })} />
            <Input label="Buffer between appointments (minutes)" type="number" min={0} max={120} value={String(tenant.booking_rules.bufferMin ?? 0)} onChange={(e) => patchRules({ bufferMin: Number(e.target.value) })} />
            <div className="sm:col-span-2 space-y-2">
              <Switch checked={Boolean(tenant.booking_rules.allowStaffChoice)} onChange={(v) => patchRules({ allowStaffChoice: v })} label="Let customers choose their staff member" description="When off, the engine assigns the first available qualified staff member." />
              <Switch checked={Boolean(tenant.booking_rules.requireEmail)} onChange={(v) => patchRules({ requireEmail: v })} label="Require an email address" description="Email is needed for confirmations and receipts." />
            </div>
          </div>
        </Card>
      )}

      {tab === 'ai' && (
        <div className="space-y-4">
          {!ai ? (
            <Alert tone="warn" title="AI settings unavailable">Your role does not include AI configuration access.</Alert>
          ) : (
            <Card>
              <CardHeader
                eyebrow="Receptionist"
                title="AI configuration"
                subtitle="The receptionist only answers from your services, hours, staff and approved knowledge."
                action={<Button onClick={() => void saveAi()} loading={saving}>Save AI settings</Button>}
              />
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <div className="sm:col-span-2"><Switch checked={ai.enabled} onChange={(v) => setAi({ ...ai, enabled: v })} label="AI receptionist enabled" description="When disabled, inbound messages are stored and flagged for a human." /></div>
                <Input label="Assistant name" value={ai.assistant_name} onChange={(e) => setAi({ ...ai, assistant_name: e.target.value })} />
                <Select label="Tone" value={ai.tone} onChange={(e) => setAi({ ...ai, tone: e.target.value })} options={[
                  { value: 'warm-professional', label: 'Warm professional' }, { value: 'concise', label: 'Concise' },
                  { value: 'luxury', label: 'Luxury' }, { value: 'friendly', label: 'Friendly' },
                ]} />
                <Select label="Language" value={ai.language} onChange={(e) => setAi({ ...ai, language: e.target.value })} options={[
                  { value: 'en', label: 'English' }, { value: 'sw', label: 'Kiswahili' }, { value: 'en-sw', label: 'English + Kiswahili' },
                ]} />
                <div className="sm:col-span-2">
                  <Input label="Escalation keywords" value={ai.escalation_keywords.join(', ')} onChange={(e) => setAi({ ...ai, escalation_keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} hint="Comma separated. Matching messages are handed to a human immediately." />
                </div>
                <Textarea label="Greeting" rows={3} className="sm:col-span-2" value={ai.greeting || ''} onChange={(e) => setAi({ ...ai, greeting: e.target.value })} hint="Leave empty to use a greeting generated from your business profile." />
              </div>
            </Card>
          )}

          <Card>
            <CardHeader
              eyebrow="Grounding"
              title="Knowledge base"
              subtitle="Only approved entries are used to answer customers."
              action={<Button onClick={() => setEntryOpen(true)} icon={<Plus size={14} />}>Add entry</Button>}
            />
            {knowledge.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={18} />}
                title="No knowledge entries yet"
                body="Add your policies, FAQs and promotions. Until then the AI answers only from services, staff and opening hours."
                action={<Button onClick={() => setEntryOpen(true)}>Add first entry</Button>}
              />
            ) : (
              <div className="divide-y divide-white/[0.05]">
                {knowledge.map((row) => (
                  <div key={row.id} className="flex items-start gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm text-[#eef1f7]">{row.title}</p>
                        <Chip tone="muted">{titleCase(row.kind)}</Chip>
                        {!row.active && <Chip tone="warn">Inactive</Chip>}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[#7d8798]">{row.content}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void toggleKnowledge(row)}>{row.active ? 'Disable' : 'Enable'}</Button>
                      <button onClick={() => void removeKnowledge(row)} aria-label={`Delete ${row.title}`} className="rounded-lg p-2 text-[#7d8798] transition hover:bg-white/5 hover:text-red-300">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'team' && (
        <Card>
          <CardHeader
            eyebrow="Access"
            title="Team & roles"
            subtitle="Roles are enforced on every API request, not only in the interface."
            action={can('team:write') ? <Button onClick={() => setInviteOpen(true)} icon={<Users size={14} />}>Add member</Button> : undefined}
          />
          {members.length === 0 ? (
            <EmptyState icon={<Users size={18} />} title="No team members loaded" body="You may not have permission to view the team list." />
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {members.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <Avatar name={m.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[#eef1f7]">{m.name}{m.id === user?.id && <span className="ml-2 text-[0.68rem] text-[#6f7889]">you</span>}</p>
                    <p className="truncate text-[0.72rem] text-[#7d8798]">{m.email}</p>
                  </div>
                  <StatusChip status={m.status} />
                  {m.role === 'owner' ? (
                    <Chip tone="gold">Owner</Chip>
                  ) : (
                    <Select
                      aria-label={`Role for ${m.name}`}
                      value={m.role}
                      options={ROLES}
                      onChange={(e) => void updateMember(m, { role: e.target.value })}
                    />
                  )}
                  <span className="hidden text-[0.68rem] text-[#6f7889] sm:block">{m.last_login_at ? `Last seen ${relative(m.last_login_at)}` : 'Never signed in'}</span>
                  {m.role !== 'owner' && (
                    <button onClick={() => void removeMember(m)} aria-label={`Remove ${m.name}`} className="rounded-lg p-2 text-[#7d8798] transition hover:bg-white/5 hover:text-red-300">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'security' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader eyebrow="Credentials" title="Change password" subtitle="Use at least 10 characters with a mix of letters and numbers." />
            <div className="space-y-3 p-5">
              <Input label="Current password" type="password" autoComplete="current-password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />
              <Input label="New password" type="password" autoComplete="new-password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />
              <Button onClick={() => void changePassword()} loading={saving} disabled={pwd.newPassword.length < 10} icon={<KeyRound size={14} />}>Update password</Button>
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="Governance" title="Audit log" subtitle="Recorded actions in this workspace." action={<ShieldCheck size={16} className="text-[#a9a2ff]" />} />
            {audit.length === 0 ? (
              <EmptyState title="No audit entries available" body="Owner-level access is required to read the audit trail, or no actions have been recorded yet." />
            ) : (
              <div className="max-h-[360px] divide-y divide-white/[0.05] overflow-y-auto">
                {audit.map((row, i) => (
                  <div key={row.id || `${row.action}-${i}`} className="px-5 py-3">
                    <p className="text-[0.78rem] text-[#eef1f7]">{titleCase(row.action)}</p>
                    <p className="mt-0.5 text-[0.68rem] text-[#6f7889]">
                      {row.actor ? `${row.actor} · ` : ''}{dateLong(row.created_at)}{row.ip ? ` · ${row.ip}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'data' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader eyebrow="Portability" title="Export your data" subtitle="Every customer, appointment, message and knowledge entry stored for this workspace." />
            <div className="space-y-3 p-5">
              <Button onClick={() => void exportData()} icon={<Download size={14} />}>Download JSON export</Button>
              <p className="text-[0.72rem] leading-relaxed text-[#6f7889]">
                The export contains only this workspace's records. It is generated from the database at request time.
              </p>
            </div>
          </Card>
          <Card>
            <CardHeader eyebrow="Integrations" title="Connected services" subtitle="Credentials are encrypted at rest and never returned to the browser." action={<Plug size={16} className="text-[#a9a2ff]" />} />
            <div className="p-5">
              <p className="text-[0.78rem] leading-relaxed text-[#8a93a6]">
                WhatsApp, social publishing, voice and payments are configured from the Integrations page. Each provider shows a
                verified status — connected only after a successful live check.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip tone="muted">AES-256-GCM encrypted</Chip>
                <Chip tone="muted">Tenant isolated</Chip>
                <Chip tone="muted">Webhook verified</Chip>
              </div>
            </div>
          </Card>
          <Alert tone="info" title="Data retention">
            Records remain available for the life of your subscription. Deleting a customer removes their profile and history from this
            workspace; export first if you need a copy.
          </Alert>
        </div>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Add team member"
        description="They receive access immediately with the temporary password you set."
        footer={<><Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button><Button onClick={() => void addMember()} loading={saving} disabled={!invite.name || !invite.email || invite.password.length < 10}>Add member</Button></>}
      >
        <div className="space-y-3">
          <Input label="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
          <Input label="Email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
          <Select label="Role" options={ROLES} value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value })} />
          <Input label="Temporary password" type="password" value={invite.password} onChange={(e) => setInvite({ ...invite, password: e.target.value })} hint="Minimum 10 characters. Share it through a secure channel." />
        </div>
      </Modal>

      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="Add knowledge entry"
        description="Keep entries factual — the AI quotes them to customers."
        footer={<><Button variant="ghost" onClick={() => setEntryOpen(false)}>Cancel</Button><Button onClick={() => void addKnowledge()} loading={saving} disabled={!entry.title.trim() || !entry.content.trim()}>Save entry</Button></>}
      >
        <div className="space-y-3">
          <Select label="Type" value={entry.kind} onChange={(e) => setEntry({ ...entry, kind: e.target.value })} options={[
            { value: 'faq', label: 'FAQ' }, { value: 'policy', label: 'Policy' }, { value: 'service_info', label: 'Service info' },
            { value: 'promotion', label: 'Promotion' }, { value: 'document', label: 'Document note' },
          ]} />
          <Input label="Title" value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} />
          <Textarea label="Content" rows={5} value={entry.content} onChange={(e) => setEntry({ ...entry, content: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
