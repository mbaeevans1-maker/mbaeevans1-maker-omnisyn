import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BellRing, CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Search, UserX, X, Ban,
} from 'lucide-react';
import { api, errorMessage, type Appointment, type Service, type Slot, type StaffMember } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Avatar, Button, Card, Chip, EmptyState, Field, Input, Modal, PageHeader, Select, SkeletonRows,
  StatusChip, Textarea, useToast,
} from '../../components/primitives';
import { addDays, dateLong, duration, money, num, timeOf, todayIso, titleCase, weekdayOf } from '../../lib/format';

const STATUSES = ['', 'pending', 'confirmed', 'completed', 'cancelled', 'no_show'];

export function BookingsPage() {
  const { can, tenant } = useSession();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [from, setFrom] = useState(params.get('from') || todayIso());
  const [to, setTo] = useState(params.get('to') || addDays(todayIso(), 13));
  const [status, setStatus] = useState(params.get('status') || '');
  const [staffId, setStaffId] = useState('');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Appointment[] | null>(null);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    const query = new URLSearchParams({ from, to });
    if (status) query.set('status', status);
    if (staffId) query.set('staffId', staffId);
    if (q.trim()) query.set('q', q.trim());
    try {
      const res = await api.get<{ appointments: Appointment[] }>(`/tenant/appointments?${query}`);
      setRows(res.appointments);
    } catch (err) {
      setError(errorMessage(err));
      setRows([]);
    }
  }, [from, to, status, staffId, q]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<{ staff: StaffMember[] }>('/tenant/staff').then((r) => setStaff(r.staff)).catch(() => setStaff([])); }, []);

  useEffect(() => {
    const next = new URLSearchParams(params);
    if (status) next.set('status', status); else next.delete('status');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const grouped = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    (rows || []).forEach((a) => {
      const day = a.start_at.slice(0, 10);
      if (!map.has(day)) map.set(day, []);
      map.get(day)!.push(a);
    });
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  const shift = (days: number) => {
    const span = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 864e5) + 1);
    setFrom(addDays(from, days * span));
    setTo(addDays(to, days * span));
  };

  const update = async (appt: Appointment, patch: Record<string, unknown>, label: string) => {
    setBusyId(appt.id);
    try {
      await api.patch(`/tenant/appointments/${appt.id}`, patch);
      toast.push({ title: label, tone: 'ok' });
      await load();
    } catch (err) {
      toast.push({ title: 'Update failed', body: errorMessage(err), tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  const remind = async (appt: Appointment) => {
    setBusyId(appt.id);
    try {
      const res = await api.post<{ queued: boolean; detail?: string }>(`/tenant/appointments/${appt.id}/remind`, {});
      toast.push({
        title: res.queued ? 'Reminder queued' : 'Reminder not sent',
        body: res.detail || (res.queued ? 'Delivery is handled by your connected channel.' : 'Connect WhatsApp or email to deliver reminders.'),
        tone: res.queued ? 'ok' : 'warn',
      });
    } catch (err) {
      toast.push({ title: 'Reminder failed', body: errorMessage(err), tone: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Booking engine"
        title="Calendar"
        description="Real availability from staff schedules, service durations and existing appointments. Double bookings are impossible."
        action={can('bookings:write') ? <Button icon={<CalendarPlus size={15} />} onClick={() => setCreating(true)}>New booking</Button> : undefined}
      />

      <Card className="!p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="flex items-center gap-1.5">
            <button onClick={() => shift(-1)} className="rounded-lg border border-white/10 p-2 text-[#98a1b3] transition hover:text-white" aria-label="Previous range"><ChevronLeft size={15} /></button>
            <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5">
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-[0.78rem] text-white outline-none [color-scheme:dark]" aria-label="From date" />
              <span className="text-[#5d6678]">→</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-[0.78rem] text-white outline-none [color-scheme:dark]" aria-label="To date" />
            </div>
            <button onClick={() => shift(1)} className="rounded-lg border border-white/10 p-2 text-[#98a1b3] transition hover:text-white" aria-label="Next range"><ChevronRight size={15} /></button>
          </div>
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5d6678]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search customer, phone or reference"
                className="mv-input !pl-9"
                aria-label="Search appointments"
              />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mv-input sm:w-40" aria-label="Filter by status">
              {STATUSES.map((s) => <option key={s || 'all'} value={s}>{s ? titleCase(s) : 'All statuses'}</option>)}
            </select>
            <select value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mv-input sm:w-44" aria-label="Filter by staff">
              <option value="">All staff</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {error && <Alert tone="danger" title="Could not load calendar">{error}</Alert>}

      {rows === null ? (
        <Card><SkeletonRows rows={7} /></Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Clock size={18} />}
            title="No appointments in this range"
            body="Adjust the dates, or create a booking to see the engine assign a real staff slot."
            action={can('bookings:write') ? <Button size="sm" onClick={() => setCreating(true)}>New booking</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {grouped.map(([day, list]) => (
            <Card key={day} className="!p-0">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  <p className="font-display text-[0.86rem] text-white">{weekdayOf(day)}</p>
                  <p className="text-[0.72rem] text-[#7d8798]">{dateLong(day)}</p>
                </div>
                <p className="text-[0.72rem] text-[#7d8798]">{list.length} booking{list.length === 1 ? '' : 's'}</p>
              </div>
              <ul className="divide-y divide-white/[0.04]">
                {list.map((a) => (
                  <li key={a.id} className="px-4 py-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="w-14 shrink-0">
                          <p className="font-display text-[0.88rem] text-white">{timeOf(a.start_at)}</p>
                          <p className="text-[0.62rem] uppercase tracking-wider text-[#5d6678]">{duration(a.duration_min)}</p>
                        </div>
                        <Avatar name={a.customer_name} size={30} />
                        <div className="min-w-0">
                          <p className="truncate text-[0.85rem] text-white">{a.customer_name || 'Walk-in'}</p>
                          <p className="truncate text-[0.72rem] text-[#8e97a8]">
                            {a.service_name} · {a.staff_name || 'Unassigned'}{a.customer_phone ? ` · ${a.customer_phone}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
                        <span className="mr-1 text-[0.75rem] text-[#c8cfdc]">{money(a.price_cents, a.currency || tenant?.currency)}</span>
                        <Chip tone="muted">{titleCase(a.source)}</Chip>
                        <StatusChip status={a.status} />
                        {can('bookings:write') && (
                          <div className="flex items-center gap-1">
                            {a.status !== 'confirmed' && a.status !== 'completed' && (
                              <IconAction label="Confirm" onClick={() => update(a, { status: 'confirmed' }, 'Appointment confirmed')} busy={busyId === a.id}><Check size={13} /></IconAction>
                            )}
                            {a.status !== 'completed' && a.status !== 'cancelled' && (
                              <IconAction label="Mark completed" onClick={() => update(a, { status: 'completed' }, 'Appointment completed')} busy={busyId === a.id}><Check size={13} /></IconAction>
                            )}
                            {a.status !== 'no_show' && a.status !== 'cancelled' && (
                              <IconAction label="No show" onClick={() => update(a, { status: 'no_show' }, 'Marked as no-show')} busy={busyId === a.id}><UserX size={13} /></IconAction>
                            )}
                            {a.status !== 'cancelled' && (
                              <IconAction label="Cancel" danger onClick={() => update(a, { status: 'cancelled' }, 'Appointment cancelled')} busy={busyId === a.id}><Ban size={13} /></IconAction>
                            )}
                            <IconAction label="Send reminder" onClick={() => remind(a)} busy={busyId === a.id}><BellRing size={13} /></IconAction>
                          </div>
                        )}
                      </div>
                    </div>
                    {a.notes && <p className="mt-1.5 pl-[4.4rem] text-[0.72rem] text-[#7d8798]">{a.notes}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {creating && (
        <NewBookingModal
          onClose={() => setCreating(false)}
          onCreated={async () => { setCreating(false); await load(); }}
        />
      )}
    </div>
  );
}

function IconAction({ label, onClick, children, danger, busy }: { label: string; onClick: () => void; children: React.ReactNode; danger?: boolean; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={label}
      className={`rounded-md border border-white/10 p-1.5 text-[#98a1b3] transition disabled:opacity-40 ${
        danger ? 'hover:border-rose-400/40 hover:text-rose-300' : 'hover:border-violet/40 hover:text-violet-soft'
      }`}
    >
      {children}
    </button>
  );
}

function NewBookingModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [services, setServices] = useState<Service[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [staffId, setStaffId] = useState('');
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ services: Service[] }>('/tenant/services')
      .then((r) => {
        const active = r.services.filter((s) => Boolean(s.active));
        setServices(active);
        if (active[0]) setServiceId(active[0].id);
      })
      .catch(() => setServices([]));
  }, []);

  useEffect(() => {
    if (!serviceId) return;
    let live = true;
    setSlots(null);
    setSlot(null);
    api.get<{ slots: Slot[] }>(`/tenant/availability?serviceId=${serviceId}&date=${date}`)
      .then((r) => { if (live) setSlots(r.slots || []); })
      .catch(() => { if (live) setSlots([]); });
    return () => { live = false; };
  }, [serviceId, date]);

  const selectedService = services.find((s) => s.id === serviceId);
  const visibleSlots = (slots || []).filter((s) => !staffId || s.staffId === staffId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!serviceId) next.serviceId = 'Choose a service.';
    if (!slot) next.slot = 'Choose an available time.';
    if (form.name.trim().length < 2) next.name = 'Enter the customer name.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    setServerError(null);
    try {
      await api.post('/tenant/appointments', {
        serviceId,
        staffId: slot?.staffId || undefined,
        startAt: slot?.startAt,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
        source: 'dashboard',
        status: 'confirmed',
      });
      toast.push({ title: 'Booking created', body: `${form.name.trim()} · ${selectedService?.name || 'Service'}`, tone: 'ok' });
      onCreated();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="New booking" subtitle="Availability is calculated from real schedules and existing appointments." wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Service" required value={serviceId} onChange={(e) => setServiceId(e.target.value)} error={errors.serviceId}>
            {services.length === 0 && <option value="">No active services yet</option>}
            {services.map((s) => (
              <option key={s.id} value={s.id}>{s.name} · {duration(s.duration_min)} · {money(s.price_cents)}</option>
            ))}
          </Select>
          <Input label="Date" type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.72rem] uppercase tracking-[0.16em] text-[#7d8798]">Available times</p>
            <select value={staffId} onChange={(e) => { setStaffId(e.target.value); setSlot(null); }} className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[0.72rem] text-[#c8cfdc]">
              <option value="">Any staff</option>
              {[...new Map((slots || []).map((s) => [s.staffId, s])).values()].map((s) => (
                <option key={s.staffId} value={s.staffId}>{s.staffName}</option>
              ))}
            </select>
          </div>
          {slots === null ? (
            <div className="h-20 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.02]" />
          ) : visibleSlots.length === 0 ? (
            <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-5 text-center text-[0.78rem] text-[#8e97a8]">
              No availability for this service on {dateLong(date)}. Try another date or add staff schedules.
            </div>
          ) : (
            <div className="max-h-44 overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                {visibleSlots.map((s) => {
                  const active = slot?.startAt === s.startAt && slot?.staffId === s.staffId;
                  return (
                    <button
                      type="button"
                      key={`${s.startAt}-${s.staffId}`}
                      onClick={() => setSlot(s)}
                      className={`rounded-lg border px-2 py-1.5 text-[0.72rem] transition ${
                        active
                          ? 'border-violet/60 bg-violet/20 text-white'
                          : 'border-white/[0.08] bg-white/[0.02] text-[#c8cfdc] hover:border-violet/40'
                      }`}
                    >
                      <span className="block font-medium">{s.localTime}</span>
                      <span className="block truncate text-[0.6rem] text-[#7d8798]">{s.staffName.split(' ')[0]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {errors.slot && <p className="mt-1.5 text-[0.72rem] text-rose-300">{errors.slot}</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Customer name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} placeholder="Full name" />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+254 7xx xxx xxx" inputMode="tel" />
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="optional" />
          <Input label="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Preferences, requests" />
        </div>

        {serverError && <Alert tone="danger" title="Booking not created">{serverError}</Alert>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} icon={<X size={14} />}>Cancel</Button>
          <Button type="submit" loading={saving} disabled={!services.length}>Create booking</Button>
        </div>
      </form>
    </Modal>
  );
}
