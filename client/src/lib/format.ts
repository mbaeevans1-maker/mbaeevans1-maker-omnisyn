export function money(cents: number | null | undefined, currency = 'KES'): string {
  const value = (cents ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-KE', {
      style: 'currency',
      currency,
      maximumFractionDigits: value % 1 === 0 ? 0 : 2,
      minimumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function compactMoney(cents: number | null | undefined, currency = 'KES'): string {
  const value = (cents ?? 0) / 100;
  if (Math.abs(value) >= 1_000_000) return `${currency} ${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 10_000) return `${currency} ${Math.round(value / 1000)}K`;
  return money(cents, currency);
}

export function num(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-KE').format(value ?? 0);
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short' });

export function dateLong(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return DATE.format(d);
}

export function dateShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return DATE_SHORT.format(d);
}

export function timeOf(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return TIME.format(d);
}

export function weekdayOf(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return WEEKDAY.format(d);
}

export function dateTime(iso?: string | null): string {
  if (!iso) return '—';
  return `${dateShort(iso)} · ${timeOf(iso)}`;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function todayIso(): string {
  return isoDate(new Date());
}

export function relative(iso?: string | null): string {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const future = diff < 0;
  if (mins < 1) return 'just now';
  if (mins < 60) return future ? `in ${mins}m` : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return future ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return future ? `in ${days}d` : `${days}d ago`;
  return dateShort(iso);
}

export function duration(min: number | null | undefined): string {
  const m = Math.max(0, Math.round(min ?? 0));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function initials(name?: string | null): string {
  if (!name) return '—';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || '')
    .join('');
}

export function titleCase(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusTone(status?: string | null): 'ok' | 'warn' | 'danger' | 'muted' | 'violet' {
  switch ((status || '').toLowerCase()) {
    case 'confirmed':
    case 'completed':
    case 'active':
    case 'connected':
    case 'published':
    case 'paid':
    case 'trialing':
    case 'approved':
      return status === 'trialing' || status === 'approved' ? 'violet' : 'ok';
    case 'pending':
    case 'scheduled':
    case 'draft':
    case 'publishing':
    case 'past_due':
    case 'configuration_required':
    case 'needs_human':
      return 'warn';
    case 'cancelled':
    case 'no_show':
    case 'failed':
    case 'expired':
    case 'suspended':
    case 'error':
      return 'danger';
    default:
      return 'muted';
  }
}

export function digitsOnly(value: string): string {
  return value.replace(/[^\d+]/g, '');
}
