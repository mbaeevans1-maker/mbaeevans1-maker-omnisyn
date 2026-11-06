import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock, Check, Clock, Plus, Scissors, Trash2, UserCog, Users,
} from 'lucide-react';
import { api, errorMessage, type Service, type StaffMember } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Avatar, Button, Card, CardHeader, Chip, EmptyState, Field, Input, Modal, PageHeader,
  Select, SkeletonRows, Switch, Tabs, Textarea, useToast,
} from '../../components/primitives';
import { duration, money, num } from '../../lib/format';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const toTime = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (v: string) => {
  const [h, m] = v.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

type ScheduleRow = { weekday: number; start_min: number; end_min: number; break_start?: number | null; break_end?: number | null };

export function CatalogPage() {
  const { can } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<'services' | 'team'>('services');
  const [services, setServices] = useState<Service[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serviceModal, setServiceModal] = useState<Service | 'new' | null>(null);
  const [staffModal, setStaffModal] = useState<StaffMember | 'new' | null>(null);
  const [scheduleFor, setScheduleFor] = useState<StaffMember | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, t] = await Promise.all([
        api.get<{ services: Service[] }>('/tenant/services'),
        api.get<{ staff: StaffMember[] }>('/tenant/staff'),
      ]);
      setServices(s.services);
      setStaff(t.staff);
    } catch (err) {
      setError(errorMessage(err));
      setServices([]);
      setStaff([]);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Service catalogue & team"
        title="Catalog"
        description="Services, pricing, duration and staff schedules are the source of truth for real availability."
        action={
          <Button onClick={() => (tab === 'services' ? setServiceModal('new') : setStaffModal('new'))} disabled={!can(tab === 'services' ? 'services:write' : 'staff:write')}>
            <Plus size={15} /> {tab === 'services' ? 'New service' : 'Add team member'}
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'services', label: 'Services', count: services?.length },
          { value: 'team', label: 'Team', count: staff?.length },
        ]}
      />

      {tab === 'services' ? (
        <Card>
          <CardHeader
            title="Services"
            eyebrow="Catalogue"
            subtitle="Duration and buffer drive slot generation. Price is used for revenue and invoices."
            action={<span className="meta">{services ? `${services.filter((s) => s.active).length} active` : '—'}</span>}
          />
          {services === null ? (
            <SkeletonRows rows={4} />
          ) : services.length === 0 ? (
            <EmptyState
              icon={<Scissors size={20} />}
              title="No services yet"
              body="Add your first service to enable real bookings, availability and pricing."
              action={can('services:write') ? <Button variant="secondary" onClick={() => setServiceModal('new')}>Add service</Button> : undefined}
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {services.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm text-[#e7ebf3]">{s.name}</p>
                      {!s.active && <Chip tone="muted">Inactive</Chip>}
                      {s.category && <Chip tone="violet">{s.category}</Chip>}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] text-[#7d8798]">
                      <span className="inline-flex items-center gap-1"><Clock size={11} />{duration(s.duration_min)}</span>
                      {!!s.buffer_min && <span>+{s.buffer_min}m buffer</span>}
                      <span>{(s.staff_ids || []).length} staff assigned</span>
                    </p>
                  </div>
                  <p className="shrink-0 text-sm text-[#eef1f7]">{money(s.price_cents)}</p>
                  {can('services:write') && (
                    <Button size="sm" variant="ghost" onClick={() => setServiceModal(s)}>Edit</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : (
        <Card>
          <CardHeader
            title="Team"
            eyebrow="Schedules"
            subtitle="Working hours and breaks define which slots the booking engine can offer."
            action={<span className="meta">{staff ? `${staff.filter((s) => s.active).length} active` : '—'}</span>}
          />
          {staff === null ? (
            <SkeletonRows rows={4} />
          ) : staff.length === 0 ? (
            <EmptyState
              icon={<Users size={20} />}
              title="No team members yet"
              body="Add staff to assign bookings and open availability."
              action={can('staff:write') ? <Button variant="secondary" onClick={() => setStaffModal('new')}>Add team member</Button> : undefined}
            />
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {staff.map((m) => {
                const days = (m.schedules || []).length;
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                    <Avatar name={m.name} color={m.color} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm text-[#e7ebf3]">{m.name}</p>
                        {!m.active && <Chip tone="muted">Inactive</Chip>}
                      </div>
                      <p className="mt-1 truncate text-[0.7rem] text-[#7d8798]">
                        {m.title || 'Team member'} · {num(days)} shift{days === 1 ? '' : 's'} configured · {(m.service_ids || []).length} services
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {can('staff:write') && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => setScheduleFor(m)}>
                            <CalendarClock size={13} /> Schedule
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setStaffModal(m)}>Edit</Button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {serviceModal && (
        <ServiceModal
          service={serviceModal === 'new' ? null : serviceModal}
          onClose={() => setServiceModal(null)}
          onSaved={(msg) => { setServiceModal(null); load(); toast.push(msg, 'success'); }}
        />
      )}
      {staffModal && (
        <StaffModal
          member={staffModal === 'new' ? null : staffModal}
          services={services || []}
          onClose={() => setStaffModal(null)}
          onSaved={(msg) => { setStaffModal(null); load(); toast.push(msg, 'success'); }}
        />
      )}
      {scheduleFor && (
        <ScheduleModal
          member={scheduleFor}
          onClose={() => setScheduleFor(null)}
          onSaved={() => { setScheduleFor(null); load(); toast.push('Schedule saved.', 'success'); }}
        />
      )}
    </div>
  );
}

function ServiceModal({ service, onClose, onSaved }: { service: Service | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(service?.name || '');
  const [category, setCategory] = useState(service?.category || '');
  const [description, setDescription] = useState(service?.description || '');
  const [price, setPrice] = useState(service ? (service.price_cents / 100).toFixed(2) : '');
  const [minutes, setMinutes] = useState(String(service?.duration_min || 30));
  const [buffer, setBuffer] = useState(String(service?.buffer_min || 0));
  const [active, setActive] = useState(service ? service.active : true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      category: category.trim() || null,
      description: description.trim() || null,
      duration_min: Number(minutes),
      buffer_min: Number(buffer) || 0,
      price_cents: Math.round(Number(price || 0) * 100),
      active,
    };
    try {
      if (service) await api.patch(`/tenant/services/${service.id}`, body);
      else await api.post('/tenant/services', body);
      onSaved(service ? 'Service updated.' : 'Service created.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!service) return;
    setBusy(true);
    try {
      await api.del(`/tenant/services/${service.id}`);
      onSaved('Service removed.');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={service ? 'Edit service' : 'New service'}
      description="Prices are stored in minor units and used for revenue reporting."
      footer={
        <>
          {service && <Button variant="ghost" onClick={remove} disabled={busy}><Trash2 size={14} /> Delete</Button>}
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 2}>{busy ? 'Saving…' : 'Save service'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Service name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Signature haircut" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" hint="Optional grouping.">
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Hair" />
          </Field>
          <Field label="Price" required>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder="2500" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Duration (minutes)" required>
            <Input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
          </Field>
          <Field label="Buffer (minutes)" hint="Cleanup time after the appointment.">
            <Input value={buffer} onChange={(e) => setBuffer(e.target.value)} inputMode="numeric" />
          </Field>
        </div>
        <Field label="Description" hint="Shown on your public business page.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </Field>
        <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
          <span className="text-xs text-[#98a1b3]">Bookable (visible to customers and AI)</span>
          <Switch checked={active} onChange={setActive} />
        </label>
      </div>
    </Modal>
  );
}

function StaffModal({
  member, services, onClose, onSaved,
}: { member: StaffMember | null; services: Service[]; onClose: () => void; onSaved: (msg: string) => void }) {
  const [name, setName] = useState(member?.name || '');
  const [title, setTitle] = useState(member?.title || '');
  const [email, setEmail] = useState(member?.email || '');
  const [phone, setPhone] = useState(member?.phone || '');
  const [color, setColor] = useState(member?.color || '#8b5cf6');
  const [active, setActive] = useState(member ? member.active : true);
  const [serviceIds, setServiceIds] = useState<string[]>(member?.service_ids || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleService(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const body = {
      name: name.trim(),
      title: title.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      color,
      active,
      service_ids: serviceIds,
    };
    try {
      if (member) await api.patch(`/tenant/staff/${member.id}`, body);
      else await api.post('/tenant/staff', body);
      onSaved(member ? 'Team member updated.' : 'Team member added.');
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
      title={member ? 'Edit team member' : 'Add team member'}
      description="Staff appear on the public page and can be assigned appointments."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy || name.trim().length < 2}>{busy ? 'Saving…' : 'Save'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Team member name" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role / title">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Senior stylist" />
          </Field>
          <Field label="Calendar colour">
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-11" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
        </div>
        <div>
          <p className="mb-2 text-[0.72rem] uppercase tracking-[0.14em] text-[#7d8798]">Services performed</p>
          {services.length === 0 ? (
            <p className="text-xs text-[#7d8798]">Add services first to assign them.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {services.map((s) => {
                const on = serviceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={`rounded-full border px-3 py-1.5 text-[0.75rem] transition-colors ${
                      on ? 'border-violet/50 bg-violet/20 text-white' : 'border-white/10 bg-white/[0.02] text-[#8a93a6] hover:text-white'
                    }`}
                  >
                    {on && <Check size={11} className="mr-1 inline" />}
                    {s.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <label className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3">
          <span className="text-xs text-[#98a1b3]">Active and bookable</span>
          <Switch checked={active} onChange={setActive} />
        </label>
      </div>
    </Modal>
  );
}

function ScheduleModal({ member, onClose, onSaved }: { member: StaffMember; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<ScheduleRow[]>(
    (member.schedules || []).map((s) => ({
      weekday: s.weekday, start_min: s.start_min, end_min: s.end_min,
      break_start: s.break_start ?? null, break_end: s.break_end ?? null,
    })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setRows((prev) => {
      const exists = prev.find((r) => r.weekday === day);
      if (exists) return prev.filter((r) => r.weekday !== day);
      return [...prev, { weekday: day, start_min: 540, end_min: 1080, break_start: null, break_end: null }].sort((a, b) => a.weekday - b.weekday);
    });
  }

  function patch(day: number, changes: Partial<ScheduleRow>) {
    setRows((prev) => prev.map((r) => (r.weekday === day ? { ...r, ...changes } : r)));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api.put(`/tenant/staff/${member.id}/schedule`, { days: rows });
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
      title={`${member.name} — working hours`}
      description="Only these windows can produce bookable slots. Breaks are excluded automatically."
      width="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Save schedule'}</Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <Alert tone="error">{error}</Alert>}
        {WEEKDAYS.map((label, day) => {
          const row = rows.find((r) => r.weekday === day);
          return (
            <div key={day} className={`rounded-xl border p-3 ${row ? 'border-white/10 bg-white/[0.03]' : 'border-white/[0.06] bg-white/[0.01]'}`}>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`inline-flex items-center gap-2 text-sm ${row ? 'text-[#e7ebf3]' : 'text-[#7d8798]'}`}
                >
                  <span className={`flex h-4 w-4 items-center justify-center rounded border ${row ? 'border-violet/60 bg-violet/30 text-white' : 'border-white/20'}`}>
                    {row && <Check size={11} />}
                  </span>
                  {label}
                </button>
                {row && (
                  <span className="text-[0.7rem] text-[#6f7889]">
                    {toTime(row.start_min)}–{toTime(row.end_min)}
                  </span>
                )}
              </div>
              {row && (
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <MiniTime label="Start" value={toTime(row.start_min)} onChange={(v) => patch(day, { start_min: toMin(v) })} />
                  <MiniTime label="End" value={toTime(row.end_min)} onChange={(v) => patch(day, { end_min: toMin(v) })} />
                  <MiniTime
                    label="Break"
                    value={row.break_start != null ? toTime(row.break_start) : ''}
                    onChange={(v) => patch(day, { break_start: v ? toMin(v) : null, break_end: v ? row.break_end ?? toMin(v) + 30 : null })}
                  />
                  <MiniTime
                    label="Break end"
                    value={row.break_end != null ? toTime(row.break_end) : ''}
                    onChange={(v) => patch(day, { break_end: v ? toMin(v) : null })}
                  />
                </div>
              )}
            </div>
          );
        })}
        <p className="flex items-start gap-2 pt-1 text-[0.7rem] leading-relaxed text-[#6f7889]">
          <UserCog size={13} className="mt-0.5 shrink-0" />
          Time off and blocked periods override these hours. Double bookings are rejected by the server, not the UI.
        </p>
      </div>
    </Modal>
  );
}

function MiniTime({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.12em] text-[#6f7889]">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-xs text-[#e7ebf3] focus:border-violet/50 focus:outline-none"
      />
    </label>
  );
}

export const CatalogSelect = Select;
