import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Clock3, Globe2, MessageSquare, Plug, Rocket,
  Scissors, Sparkles, Users,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Button, Card, CardHeader, Chip, Input, PageHeader, Progress, Select, SkeletonRows, Switch, Textarea, useToast,
} from '../../components/primitives';
import { money, titleCase } from '../../lib/format';

type Schedule = { weekday: number; start_min: number; end_min: number; break_start?: number | null; break_end?: number | null };
type Service = { id: string; name: string; duration_min: number; price_cents: number; active: number };
type Staff = { id: string; name: string; title?: string | null; active: number; schedules?: Schedule[] };
type Ai = { assistant_name: string; tone: string; language: string; greeting?: string | null; enabled: boolean };

const STEPS = [
  { key: 'business', label: 'Business', icon: Sparkles },
  { key: 'location', label: 'Location', icon: Globe2 },
  { key: 'services', label: 'Services', icon: Scissors },
  { key: 'staff', label: 'Team', icon: Users },
  { key: 'hours', label: 'Hours', icon: Clock3 },
  { key: 'booking', label: 'Booking rules', icon: Clock3 },
  { key: 'ai', label: 'AI receptionist', icon: Sparkles },
  { key: 'knowledge', label: 'Knowledge', icon: MessageSquare },
  { key: 'whatsapp', label: 'WhatsApp', icon: Plug },
  { key: 'social', label: 'Social', icon: Globe2 },
  { key: 'launch', label: 'Launch', icon: Rocket },
];

const INDUSTRIES = ['salon', 'barbershop', 'spa', 'clinic', 'dental', 'restaurant', 'hotel', 'fitness', 'rentals', 'other']
  .map((value) => ({ value, label: titleCase(value) }));

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

export function Setup() {
  const toast = useToast();
  const navigate = useNavigate();
  const { tenant, refresh, can } = useSession();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [profile, setProfile] = useState({
    name: '', industry: 'salon', tagline: '', address: '', city: '', country: 'Kenya',
    phone: '', whatsapp: '', email: '', timezone: 'Africa/Nairobi', currency: 'KES',
  });
  const [rules, setRules] = useState({
    slotIntervalMin: 15, leadTimeMin: 60, maxAdvanceDays: 60, bufferMin: 0, allowStaffChoice: true, requireEmail: false,
  });
  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [ai, setAi] = useState<Ai>({ assistant_name: 'Ava', tone: 'warm-professional', language: 'en', greeting: '', enabled: true });
  const [knowledge, setKnowledge] = useState<{ id: string; title: string; kind: string }[]>([]);
  const [integrations, setIntegrations] = useState<{ provider: string; name: string; status: string }[]>([]);

  const [newService, setNewService] = useState({ name: '', duration_min: 45, price: '' });
  const [newStaff, setNewStaff] = useState({ name: '', title: '' });
  const [newEntry, setNewEntry] = useState({ title: '', content: '' });
  const [launched, setLaunched] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settings, svc, stf, aiRes, knw, ints] = await Promise.all([
        api.get<{ tenant: Record<string, any> }>('/tenant/settings'),
        api.get<{ services: Service[] }>('/tenant/services').catch(() => ({ services: [] })),
        api.get<{ staff: Staff[] }>('/tenant/staff').catch(() => ({ staff: [] })),
        api.get<{ settings: Ai }>('/tenant/ai').catch(() => null),
        api.get<{ knowledge: { id: string; title: string; kind: string }[] }>('/tenant/knowledge').catch(() => ({ knowledge: [] })),
        api.get<{ integrations: { provider: string; name: string; status: string }[] }>('/tenant/integrations').catch(() => ({ integrations: [] })),
      ]);
      const t = settings.tenant;
      setProfile({
        name: t.name || '', industry: t.industry || 'salon', tagline: t.tagline || '',
        address: t.address || '', city: t.city || '', country: t.country || 'Kenya',
        phone: t.phone || '', whatsapp: t.whatsapp || '', email: t.email || '',
        timezone: t.timezone || 'Africa/Nairobi', currency: t.currency || 'KES',
      });
      setRules({ ...rules, ...(t.booking_rules || {}) });
      setServices(svc.services || []);
      setStaff(stf.staff || []);
      if (aiRes?.settings) setAi({ ...aiRes.settings });
      setKnowledge(knw.knowledge || []);
      setIntegrations(ints.integrations || []);
      const saved = Number(t.onboarding_step || 1);
      if (!t.onboarding_complete && saved > 1) setStep(Math.min(saved - 1, STEPS.length - 1));
    } catch (err) {
      toast.error('Could not load setup', errorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const saveProfile = async () => {
    await api.patch('/tenant/settings', {
      name: profile.name, industry: profile.industry, tagline: profile.tagline || null,
      address: profile.address || null, city: profile.city || null, country: profile.country,
      phone: profile.phone || null, whatsapp: profile.whatsapp || null, email: profile.email || null,
      timezone: profile.timezone, currency: profile.currency,
    });
    await refresh();
  };

  const addService = async () => {
    if (!newService.name.trim()) return;
    const res = await api.post<{ service: Service }>('/tenant/services', {
      name: newService.name.trim(), duration_min: Number(newService.duration_min) || 30,
      price_cents: Math.round(Number(newService.price || 0) * 100), active: true,
    });
    setServices((rows) => [...rows, res.service]);
    setNewService({ name: '', duration_min: 45, price: '' });
  };

  const loadTemplate = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ services: Service[]; note?: string }>('/tenant/onboarding/template');
      setServices(res.services);
      toast.ok('Template services added', res.note || 'Set your real prices next.');
    } catch (err) {
      toast.error('Template unavailable', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const addStaff = async () => {
    if (!newStaff.name.trim()) return;
    const res = await api.post<{ staff: Staff }>('/tenant/staff', {
      name: newStaff.name.trim(), title: newStaff.title || null,
      service_ids: services.filter((s) => s.active).map((s) => s.id),
    });
    setStaff((rows) => [...rows, { ...res.staff, schedules: [] }]);
    setNewStaff({ name: '', title: '' });
  };

  const saveHours = async (member: Staff, days: Schedule[]) => {
    setBusy(true);
    try {
      const res = await api.put<{ days: Schedule[] }>(`/tenant/staff/${member.id}/schedule`, { days });
      setStaff((rows) => rows.map((r) => (r.id === member.id ? { ...r, schedules: res.days } : r)));
      toast.ok('Working hours saved', `${member.name}'s availability is live.`);
    } catch (err) {
      toast.error('Could not save hours', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const addEntry = async () => {
    if (!newEntry.title.trim() || !newEntry.content.trim()) return;
    const res = await api.post<{ entry: { id: string; title: string; kind: string } }>('/tenant/knowledge', {
      kind: 'faq', title: newEntry.title.trim(), content: newEntry.content.trim(), active: true,
    });
    setKnowledge((rows) => [...rows, res.entry]);
    setNewEntry({ title: '', content: '' });
  };

  const next = async () => {
    setBusy(true);
    try {
      if (step === 0) await saveProfile();
      if (step === 1) await saveProfile();
      if (step === 5) await api.patch('/tenant/settings', { booking_rules: rules });
      if (step === 6) await api.patch('/tenant/ai', {
        enabled: ai.enabled, assistant_name: ai.assistant_name, tone: ai.tone,
        language: ai.language, greeting: ai.greeting || null,
      });
      const target = Math.min(step + 2, STEPS.length);
      await api.patch('/tenant/onboarding', { step: target }).catch(() => null);
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    } catch (err) {
      toast.error('Could not save this step', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const launch = async () => {
    setBusy(true);
    try {
      await api.post('/tenant/launch');
      await refresh();
      setLaunched(true);
      toast.ok('Workspace launched', 'Your public booking page is live.');
    } catch (err) {
      toast.error('Launch blocked', errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const progress = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);
  const whatsapp = integrations.find((i) => i.provider === 'whatsapp');
  const socials = integrations.filter((i) => ['instagram', 'facebook', 'tiktok', 'x'].includes(i.provider));

  if (loading) {
    return <div className="space-y-6"><PageHeader eyebrow="Onboarding" title="Set up MAVYRON" /><Card><SkeletonRows rows={8} /></Card></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Guided setup"
        title={launched ? 'Your workspace is live' : 'Launch your AI operating system'}
        description="Eleven steps from business profile to a live booking page. Everything you enter is used by the real booking engine and AI receptionist."
        action={<Chip tone={launched ? 'success' : 'violet'}>{launched ? 'Live' : `Step ${step + 1} of ${STEPS.length}`}</Chip>}
      />

      <Card>
        <div className="p-5">
          <Progress value={progress} />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {STEPS.map((s, i) => (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`rounded-lg px-2.5 py-1.5 text-[0.68rem] transition ${
                  i === step ? 'bg-[#7B5BFF]/20 text-white ring-1 ring-[#7B5BFF]/40'
                    : i < step ? 'text-[#8ee0b0] hover:bg-white/5' : 'text-[#6f7889] hover:bg-white/5'
                }`}
              >
                {i < step ? <Check size={11} className="mr-1 inline" /> : null}{s.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader
          eyebrow={`Step ${step + 1}`}
          title={STEPS[step].label}
          subtitle={SUBTITLES[step]}
        />

        <div className="space-y-4 p-5">
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Business name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              <Select label="Industry" options={INDUSTRIES} value={profile.industry} onChange={(e) => setProfile({ ...profile, industry: e.target.value })} />
              <Input label="Tagline" className="sm:col-span-2" value={profile.tagline} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} hint="One line that describes what you do." />
              <Alert tone="info" title="This shapes everything" >
                Your industry selects the service template and terminology used across the platform.
              </Alert>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Street address" value={profile.address} onChange={(e) => setProfile({ ...profile, address: e.target.value })} />
              <Input label="City" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} />
              <Input label="Country" value={profile.country} onChange={(e) => setProfile({ ...profile, country: e.target.value })} />
              <Input label="Business phone" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              <Input label="WhatsApp number" value={profile.whatsapp} onChange={(e) => setProfile({ ...profile, whatsapp: e.target.value })} hint="Customers message this number from your public page." />
              <Input label="Business email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              <Input label="Timezone" value={profile.timezone} onChange={(e) => setProfile({ ...profile, timezone: e.target.value })} />
              <Select label="Currency" value={profile.currency} onChange={(e) => setProfile({ ...profile, currency: e.target.value })} options={['KES', 'USD', 'EUR', 'GBP', 'TZS', 'UGX', 'ZAR'].map((c) => ({ value: c, label: c }))} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              {services.length === 0 ? (
                <Alert tone="warn" title="No services yet">
                  Add your first service or load the template for your industry. The booking engine cannot work without services.
                </Alert>
              ) : (
                <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
                  {services.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <Scissors size={14} className="text-[#a9a2ff]" />
                      <span className="flex-1 text-sm text-[#eef1f7]">{s.name}</span>
                      <span className="text-[0.72rem] text-[#7d8798]">{s.duration_min} min</span>
                      <span className="text-[0.72rem] text-[#c9d0dc]">{s.price_cents ? money(s.price_cents, profile.currency) : 'Price not set'}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_120px_140px_auto]">
                <Input label="Service name" value={newService.name} onChange={(e) => setNewService({ ...newService, name: e.target.value })} />
                <Input label="Minutes" type="number" min={5} value={String(newService.duration_min)} onChange={(e) => setNewService({ ...newService, duration_min: Number(e.target.value) })} />
                <Input label={`Price (${profile.currency})`} type="number" min={0} value={newService.price} onChange={(e) => setNewService({ ...newService, price: e.target.value })} />
                <div className="flex items-end"><Button onClick={() => void addService()} className="w-full">Add</Button></div>
              </div>
              <Button variant="secondary" onClick={() => void loadTemplate()} loading={busy} disabled={services.length > 0}>
                Load {titleCase(profile.industry)} template
              </Button>
              <p className="text-[0.72rem] text-[#6f7889]">Prices are stored in your currency's minor units and can be edited later.</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {staff.length === 0 ? (
                <Alert tone="warn" title="Add at least one person">Availability is calculated per staff member, so the engine needs someone to book with.</Alert>
              ) : (
                <div className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.06]">
                  {staff.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                      <Users size={14} className="text-[#a9a2ff]" />
                      <span className="flex-1 text-sm text-[#eef1f7]">{m.name}</span>
                      <span className="text-[0.72rem] text-[#7d8798]">{m.title || 'Team member'}</span>
                      <Chip tone={(m.schedules || []).length ? 'success' : 'warn'}>{(m.schedules || []).length ? 'Hours set' : 'No hours'}</Chip>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <Input label="Full name" value={newStaff.name} onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })} />
                <Input label="Title" value={newStaff.title} onChange={(e) => setNewStaff({ ...newStaff, title: e.target.value })} hint="e.g. Senior stylist" />
                <div className="flex items-end"><Button onClick={() => void addStaff()} className="w-full">Add</Button></div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              {staff.length === 0 ? (
                <Alert tone="warn" title="Add team members first">Working hours are attached to a person.</Alert>
              ) : staff.map((m) => (
                <HoursEditor key={m.id} member={m} busy={busy} onSave={(days) => void saveHours(m, days)} />
              ))}
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Slot interval (minutes)" type="number" value={String(rules.slotIntervalMin)} onChange={(e) => setRules({ ...rules, slotIntervalMin: Number(e.target.value) })} />
              <Input label="Minimum lead time (minutes)" type="number" value={String(rules.leadTimeMin)} onChange={(e) => setRules({ ...rules, leadTimeMin: Number(e.target.value) })} />
              <Input label="Booking window (days)" type="number" value={String(rules.maxAdvanceDays)} onChange={(e) => setRules({ ...rules, maxAdvanceDays: Number(e.target.value) })} />
              <Input label="Buffer (minutes)" type="number" value={String(rules.bufferMin)} onChange={(e) => setRules({ ...rules, bufferMin: Number(e.target.value) })} />
              <div className="sm:col-span-2 space-y-2">
                <Switch checked={rules.allowStaffChoice} onChange={(v) => setRules({ ...rules, allowStaffChoice: v })} label="Let customers choose staff" />
                <Switch checked={rules.requireEmail} onChange={(v) => setRules({ ...rules, requireEmail: v })} label="Require email address" />
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Assistant name" value={ai.assistant_name} onChange={(e) => setAi({ ...ai, assistant_name: e.target.value })} />
              <Select label="Tone" value={ai.tone} onChange={(e) => setAi({ ...ai, tone: e.target.value })} options={[
                { value: 'warm-professional', label: 'Warm professional' }, { value: 'concise', label: 'Concise' },
                { value: 'luxury', label: 'Luxury' }, { value: 'friendly', label: 'Friendly' },
              ]} />
              <Select label="Language" value={ai.language} onChange={(e) => setAi({ ...ai, language: e.target.value })} options={[
                { value: 'en', label: 'English' }, { value: 'sw', label: 'Kiswahili' }, { value: 'en-sw', label: 'English + Kiswahili' },
              ]} />
              <div className="sm:col-span-2"><Switch checked={ai.enabled} onChange={(v) => setAi({ ...ai, enabled: v })} label="AI receptionist enabled" description="It answers only from your services, hours, staff and knowledge base." /></div>
              <Textarea label="Greeting" rows={3} className="sm:col-span-2" value={ai.greeting || ''} onChange={(e) => setAi({ ...ai, greeting: e.target.value })} hint="Leave blank to generate one from your business profile." />
            </div>
          )}

          {step === 7 && (
            <div className="space-y-4">
              {knowledge.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {knowledge.map((k) => <Chip key={k.id} tone="muted">{k.title}</Chip>)}
                </div>
              )}
              <Input label="Question or topic" value={newEntry.title} onChange={(e) => setNewEntry({ ...newEntry, title: e.target.value })} />
              <Textarea label="Approved answer" rows={4} value={newEntry.content} onChange={(e) => setNewEntry({ ...newEntry, content: e.target.value })} hint="Only what you write here is quoted to customers." />
              <Button onClick={() => void addEntry()} disabled={!newEntry.title.trim() || !newEntry.content.trim()}>Add knowledge entry</Button>
              <p className="text-[0.72rem] text-[#6f7889]">You can add policies, promotions and document notes later from Settings.</p>
            </div>
          )}

          {step === 8 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
                <MessageSquare size={16} className="text-[#a9a2ff]" />
                <div className="flex-1">
                  <p className="text-sm text-[#eef1f7]">WhatsApp Business</p>
                  <p className="text-[0.72rem] text-[#7d8798]">{whatsapp ? titleCase(whatsapp.status.replace(/_/g, ' ')) : 'Configuration required'}</p>
                </div>
                <Chip tone={whatsapp?.status === 'connected' ? 'success' : 'warn'}>{whatsapp?.status === 'connected' ? 'Connected' : 'Not connected'}</Chip>
              </div>
              <Alert tone="info" title="Official API only">
                MAVYRON connects to WhatsApp through the official Cloud API webhook. Credentials are encrypted at rest and never
                displayed. Until a real number is verified, the AI inbox still records messages from the public page chat.
              </Alert>
              <Link to="/app/integrations"><Button variant="secondary" icon={<Plug size={14} />}>Open integration centre</Button></Link>
            </div>
          )}

          {step === 9 && (
            <div className="space-y-3">
              {(socials.length ? socials : [
                { provider: 'instagram', name: 'Instagram', status: 'configuration_required' },
                { provider: 'facebook', name: 'Facebook', status: 'configuration_required' },
                { provider: 'tiktok', name: 'TikTok', status: 'configuration_required' },
                { provider: 'x', name: 'X', status: 'configuration_required' },
              ]).map((s) => (
                <div key={s.provider} className="flex items-center gap-3 rounded-xl border border-white/[0.06] px-4 py-3">
                  <Globe2 size={15} className="text-[#a9a2ff]" />
                  <span className="flex-1 text-sm text-[#eef1f7]">{s.name}</span>
                  <Chip tone={s.status === 'connected' ? 'success' : 'warn'}>{titleCase(s.status.replace(/_/g, ' '))}</Chip>
                </div>
              ))}
              <Alert tone="info" title="OAuth only">
                Publishing requires official OAuth app credentials. MAVYRON never stores social passwords, and content stays in
                Draft until a human approves it.
              </Alert>
              <Link to="/app/integrations"><Button variant="secondary">Configure social channels</Button></Link>
            </div>
          )}

          {step === 10 && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Checklist ok={services.filter((s) => s.active).length > 0} label="Active services" detail={`${services.filter((s) => s.active).length} configured`} />
                <Checklist ok={staff.some((s) => (s.schedules || []).length > 0)} label="Working hours" detail={`${staff.filter((s) => (s.schedules || []).length).length} of ${staff.length} with hours`} />
                <Checklist ok={knowledge.length > 0} label="Knowledge base" detail={`${knowledge.length} entries`} />
              </div>
              {launched ? (
                <Alert tone="success" title="Workspace live">
                  Your public page is available at <Link className="underline" to={`/business/${tenant?.slug}`}>/business/{tenant?.slug}</Link>. Share the QR code from Settings or the public page.
                </Alert>
              ) : (
                <Alert tone="info" title="Launch requires real configuration">
                  At least one active service and one staff member with working hours are required. Billing starts with a 14-day trial;
                  no payment is simulated.
                </Alert>
              )}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void launch()} loading={busy} disabled={launched || !can('settings:write')} icon={<Rocket size={14} />}>
                  {launched ? 'Launched' : 'Launch workspace'}
                </Button>
                <Button variant="ghost" onClick={() => navigate('/app')}>Go to command centre</Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-white/[0.06] px-5 py-4">
          <Button variant="ghost" icon={<ArrowLeft size={14} />} onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>Back</Button>
          <span className="text-[0.7rem] text-[#6f7889]">{STEPS[step].label}</span>
          <Button onClick={() => void next()} loading={busy} disabled={step === STEPS.length - 1} icon={<ArrowRight size={14} />}>Save & continue</Button>
        </div>
      </Card>
    </div>
  );
}

const SUBTITLES = [
  'Name and industry define the terminology and templates across your workspace.',
  'Where you are and how customers reach you. Shown on your public page.',
  'Services and prices power real availability and AI answers.',
  'Each person gets their own calendar and availability.',
  'Working hours generate the bookable slots customers see.',
  'How the booking engine spaces, buffers and limits appointments.',
  'Personality, language and escalation behaviour of your receptionist.',
  'Approved facts the AI is allowed to quote.',
  'Official WhatsApp Cloud API connection for the AI inbox.',
  'Official OAuth connections for scheduled publishing.',
  'Publish your workspace and share the booking page.',
];

function Checklist({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] px-4 py-3">
      <div className="flex items-center gap-2">
        {ok ? <CheckCircle2 size={14} className="text-[#8ee0b0]" /> : <Clock3 size={14} className="text-[#e8c98a]" />}
        <p className="text-sm text-[#eef1f7]">{label}</p>
      </div>
      <p className="mt-1 text-[0.7rem] text-[#7d8798]">{detail}</p>
    </div>
  );
}

function HoursEditor({ member, busy, onSave }: { member: Staff; busy: boolean; onSave: (days: Schedule[]) => void }) {
  const [days, setDays] = useState<Schedule[]>(member.schedules || []);

  const day = (weekday: number) => days.find((d) => d.weekday === weekday);

  const toggle = (weekday: number) => {
    setDays((rows) => rows.some((d) => d.weekday === weekday)
      ? rows.filter((d) => d.weekday !== weekday)
      : [...rows, { weekday, start_min: 9 * 60, end_min: 18 * 60, break_start: 13 * 60, break_end: 14 * 60 }].sort((a, b) => a.weekday - b.weekday));
  };

  const update = (weekday: number, patch: Partial<Schedule>) =>
    setDays((rows) => rows.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));

  return (
    <div className="rounded-xl border border-white/[0.06] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-[#eef1f7]">{member.name}</p>
        <Button size="sm" variant="secondary" loading={busy} onClick={() => onSave(days)}>Save hours</Button>
      </div>
      <div className="space-y-2">
        {DAYS.map((label, weekday) => {
          const d = day(weekday);
          return (
            <div key={label} className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => toggle(weekday)}
                className={`w-14 rounded-lg px-2 py-1.5 text-[0.7rem] transition ${d ? 'bg-[#7B5BFF]/20 text-white ring-1 ring-[#7B5BFF]/40' : 'text-[#6f7889] ring-1 ring-white/[0.07]'}`}
              >
                {label}
              </button>
              {d ? (
                <>
                  <input aria-label={`${label} start`} type="time" value={hhmm(d.start_min)} onChange={(e) => update(weekday, { start_min: toMin(e.target.value) })} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.72rem] text-white" />
                  <span className="text-[#4c5566]">–</span>
                  <input aria-label={`${label} end`} type="time" value={hhmm(d.end_min)} onChange={(e) => update(weekday, { end_min: toMin(e.target.value) })} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.72rem] text-white" />
                  <span className="ml-1 text-[0.66rem] text-[#6f7889]">break</span>
                  <input aria-label={`${label} break start`} type="time" value={hhmm(d.break_start ?? 13 * 60)} onChange={(e) => update(weekday, { break_start: toMin(e.target.value) })} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.72rem] text-white" />
                  <input aria-label={`${label} break end`} type="time" value={hhmm(d.break_end ?? 14 * 60)} onChange={(e) => update(weekday, { break_end: toMin(e.target.value) })} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.72rem] text-white" />
                </>
              ) : <span className="text-[0.7rem] text-[#4c5566]">Closed</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
