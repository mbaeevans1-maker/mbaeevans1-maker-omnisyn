import {
  createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState,
} from 'react';
import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { statusTone, titleCase, initials } from '../lib/format';

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'gold' | 'quiet' | 'danger' | 'secondary';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  block?: boolean;
  icon?: ReactNode;
};

export function Button({
  variant = 'primary', size = 'md', loading, block, icon, children, className = '', disabled, ...rest
}: ButtonProps) {
  const variants: Record<string, string> = {
    primary: 'btn-primary',
    ghost: 'btn-ghost',
    gold: 'btn-gold',
    quiet: 'btn-ghost',
    danger: 'btn-ghost !text-red-300 !border-red-400/30 hover:!bg-red-500/10',
  };
  const sizes: Record<string, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' };
  return (
    <button
      className={`btn ${variants[variant]} ${sizes[size]} ${block ? 'btn-block' : ''} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="spin" aria-hidden /> : icon}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form fields                                                         */
/* ------------------------------------------------------------------ */

type FieldShell = { label?: string; hint?: string; error?: string; required?: boolean; htmlFor?: string; children: ReactNode; className?: string };

export function Field({ label, hint, error, required, htmlFor, children, className = '' }: FieldShell) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={htmlFor} className="text-[0.78rem] font-medium text-[#b9c1d0] tracking-wide">
          {label}
          {required && <span className="text-violet-soft ml-1">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[0.72rem] text-red-300/90">{error}</p>
      ) : hint ? (
        <p className="text-[0.72rem] text-[#6f7889]">{hint}</p>
      ) : null}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; error?: string };

export function Input({ label, hint, error, className = '', id, required, ...rest }: InputProps) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId}>
      <input id={fieldId} className={className} aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string };

export function Textarea({ label, hint, error, className = '', id, required, ...rest }: TextareaProps) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId}>
      <textarea id={fieldId} className={className} aria-invalid={Boolean(error)} {...rest} />
    </Field>
  );
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string; hint?: string; error?: string;
  options?: { value: string; label: string }[];
};

export function Select({ label, hint, error, options, className = '', id, required, children, ...rest }: SelectProps) {
  const autoId = useId();
  const fieldId = id || autoId;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={fieldId}>
      <select id={fieldId} className={className} {...rest}>
        {children}
        {(options || []).map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function Switch({ checked, onChange, label, description }: { checked: boolean | number; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={Boolean(checked)}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-between gap-4 w-full text-left py-2"
    >
      <span>
        <span className="block text-sm text-[#dde2ec]">{label}</span>
        {description && <span className="block text-xs text-[#7d8798] mt-0.5">{description}</span>}
      </span>
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? 'bg-violet/80 border-violet' : 'bg-white/5 border-white/10'}`}
      >
        <span
          className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
          style={{ height: 18, width: 18 }}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

export function Chip({ children, tone = 'default', className = '' }: { children: ReactNode; tone?: 'default' | 'violet' | 'gold' | 'ok' | 'warn' | 'danger' | 'muted' | 'success' | 'error' | 'warning' | 'info'; className?: string }) {
  const aliases: Record<string, string> = { success: 'ok', error: 'danger', warning: 'warn', info: 'violet' };
  const map: Record<string, string> = {
    default: '', violet: 'chip-violet', gold: 'chip-gold', ok: 'chip-ok', warn: 'chip-warn', danger: 'chip-danger', muted: 'chip-muted',
  };
  return <span className={`chip ${map[aliases[tone] || tone]} ${className}`}>{children}</span>;
}

export function StatusChip({ status, label }: { status?: string | null; label?: string }) {
  const tone = statusTone(status);
  return <Chip tone={tone === 'muted' ? 'muted' : tone}>{label || titleCase(status || 'unknown')}</Chip>;
}

export function Dot({ tone = 'ok' }: { tone?: 'ok' | 'warn' | 'danger' | 'muted' | 'violet' | 'error' | 'info' | 'success' | 'warning' }) {
  const colors: Record<string, string> = {
    ok: 'bg-emerald-400', warn: 'bg-amber-300', danger: 'bg-red-400', muted: 'bg-slate-500', violet: 'bg-violet-soft',
    error: 'bg-red-400', info: 'bg-sky-400', success: 'bg-emerald-400', warning: 'bg-amber-300',
  };
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${colors[tone]}`} />;
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({ children, className = '', lift = false }: { children: ReactNode; className?: string; lift?: boolean }) {
  return <div className={`${lift ? 'card-lift' : 'panel'} ${className}`}>{children}</div>;
}

export function CardHeader({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: string }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06]">
      <div className="min-w-0">
        {eyebrow && <p className="meta mb-1.5">{eyebrow}</p>}
        <h3 className="text-[1.02rem] text-[#eef1f7]">{title}</h3>
        {subtitle && <p className="text-xs text-[#7d8798] mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, body, description, action }: { icon?: ReactNode; title: string; body?: string; description?: string; action?: ReactNode }) {
  const copy = body || description;
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-14">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-violet-soft">
        {icon || <Info size={20} />}
      </div>
      <p className="text-sm text-[#dde2ec]">{title}</p>
      {copy && <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[#7d8798]">{copy}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-[#7d8798]">
      <Loader2 size={18} className="spin text-violet-soft" />
      {label && <span className="text-xs">{label}</span>}
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-10 w-full" style={{ opacity: 1 - i * 0.12 }} />
      ))}
    </div>
  );
}

export function Avatar({ name, color, size = 34 }: { name?: string | null; color?: string | null; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full border border-white/10 font-medium text-[#eef1f7]"
      style={{
        width: size, height: size,
        background: `linear-gradient(140deg, ${color || '#7b5bff'}33, ${color || '#7b5bff'}12)`,
        fontSize: size * 0.36,
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Motion                                                              */
/* ------------------------------------------------------------------ */

export function Reveal({ children, delay = 0, className = '', as = 'div' }: { children: ReactNode; delay?: number; className?: string; as?: 'div' | 'section' | 'li' | 'article' }) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, []);

  const Tag = as as unknown as 'div';
  return (
    <Tag
      ref={ref as never}
      className={`reveal ${visible ? 'is-visible' : ''} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  eyebrow, title, body, align = 'left', action,
}: { eyebrow?: string; title: ReactNode; body?: ReactNode; align?: 'left' | 'center'; action?: ReactNode }) {
  return (
    <div className={`flex flex-col gap-5 ${align === 'center' ? 'items-center text-center' : 'md:flex-row md:items-end md:justify-between'}`}>
      <div className={align === 'center' ? 'max-w-2xl' : 'max-w-2xl'}>
        {eyebrow && <p className="eyebrow mb-4">{eyebrow}</p>}
        <h2 className="display-lg text-gradient-silver">{title}</h2>
        {body && <p className="lede mt-5">{body}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export function Tabs<T extends string>({ tabs, value, onChange, className = '' }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`no-scrollbar flex gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.025] p-1 ${className}`} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.78rem] transition-colors ${
            value === t.value ? 'bg-violet/20 text-white border border-violet/40' : 'text-[#8a93a6] hover:text-white border border-transparent'
          }`}
        >
          {t.label}
          {typeof t.count === 'number' && <span className="ml-1.5 text-[0.68rem] text-[#6f7889]">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function Modal({
  open, onClose, title, description, subtitle, wide = false, children, footer, width = wide ? 'lg' : 'md',
}: { open: boolean; onClose: () => void; title: string; description?: string; subtitle?: string; wide?: boolean; children: ReactNode; footer?: ReactNode; width?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/72 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative z-10 w-full ${widths[width]} max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#0a0d16] shadow-[0_40px_120px_-40px_rgba(0,0,0,1)]`}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/[0.07] bg-[#0a0d16]/95 px-5 py-4 backdrop-blur">
          <div>
            <h3 className="text-base text-[#eef1f7]">{title}</h3>
            {description && <p className="mt-1 text-xs leading-relaxed text-[#7d8798]">{description}</p>}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[#8a93a6] transition-colors hover:bg-white/5 hover:text-white" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-white/[0.07] bg-[#0a0d16]/95 px-5 py-4 backdrop-blur">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

type ToastTone = 'ok' | 'error' | 'info' | 'warn' | 'danger' | 'success';
type Toast = { id: string; title: string; body?: string; tone: ToastTone };
type ToastApi = { push: (t: Omit<Toast, 'id'> | string, tone?: ToastTone) => void; ok: (title: string, body?: string) => void; error: (title: string, body?: string) => void; info: (title: string, body?: string) => void };

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((input: Omit<Toast, 'id'> | string, tone: ToastTone = 'ok') => {
    const t: Omit<Toast, 'id'> = typeof input === 'string' ? { title: input, tone } : input;
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev.slice(-3), { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 5200);
  }, []);

  const value = useMemo<ToastApi>(() => ({
    push,
    ok: (title, body) => push({ title, body, tone: 'ok' }),
    error: (title, body) => push({ title, body, tone: 'error' }),
    info: (title, body) => push({ title, body, tone: 'info' }),
  }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-4 sm:bottom-4 sm:items-end">
          {items.map((t) => (
            <div
              key={t.id}
              className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-white/10 bg-[#0d111c]/97 px-4 py-3 shadow-[0_24px_60px_-30px_rgba(0,0,0,1)] backdrop-blur"
              role="status"
            >
              <span className="mt-0.5 shrink-0">
                {t.tone === 'ok' ? <CheckCircle2 size={16} className="text-emerald-400" />
                  : t.tone === 'error' ? <XCircle size={16} className="text-red-400" />
                    : <Info size={16} className="text-violet-soft" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.82rem] text-[#eef1f7]">{t.title}</p>
                {t.body && <p className="mt-0.5 text-[0.74rem] leading-relaxed text-[#8a93a6]">{t.body}</p>}
              </div>
              <button onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))} className="text-[#6f7889] hover:text-white" aria-label="Dismiss">
                <X size={13} />
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

export function Progress({ value, max = 100, tone = 'violet' }: { value: number; max?: number; tone?: 'violet' | 'gold' | 'danger' | 'warn' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bg = tone === 'gold' ? 'bg-gold' : tone === 'danger' ? 'bg-red-400' : 'bg-gradient-to-r from-violet-soft to-violet';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div className={`h-full rounded-full ${bg} transition-[width] duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Alert({ tone = 'info', title, children }: { tone?: 'info' | 'warn' | 'danger' | 'ok' | 'success' | 'error' | 'warning'; title?: string; children?: ReactNode }) {
  const aliases: Record<string, string> = { success: 'ok', error: 'danger', warning: 'warn' };
  const resolved = aliases[tone] || tone;
  const map = {
    info: 'border-violet/25 bg-violet/[0.07] text-[#c3b2ff]',
    warn: 'border-amber-400/25 bg-amber-400/[0.06] text-amber-200',
    danger: 'border-red-400/25 bg-red-400/[0.06] text-red-200',
    ok: 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200',
  };
  const Icon = resolved === 'danger' || resolved === 'warn' ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[0.78rem] leading-relaxed ${map[resolved as keyof typeof map]}`}>
      <Icon size={15} className="mt-0.5 shrink-0" />
      <div>
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-0.5 opacity-90' : 'opacity-90'}>{children}</div>
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = 'default' }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'violet' | 'gold' }) {
  const color = tone === 'violet' ? 'text-violet-soft' : tone === 'gold' ? 'text-gold' : 'text-[#eef1f7]';
  return (
    <div className="min-w-0">
      <p className="meta truncate">{label}</p>
      <p className={`mt-2 font-display text-[1.55rem] leading-none ${color}`}>{value}</p>
      {sub && <p className="mt-1.5 text-[0.7rem] text-[#6f7889]">{sub}</p>}
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-white/[0.05] last:border-0">
      <span className="text-xs text-[#7d8798]">{label}</span>
      <span className="text-right text-xs text-[#dde2ec]">{children}</span>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="meta mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[1.7rem] leading-tight text-[#eef1f7] sm:text-[2rem]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[0.85rem] leading-relaxed text-[#8a93a6]">{description}</p>}
      </div>
      {action && <div className="flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

export function Logo({ size = 26, withWordmark = true, className = '' }: { size?: number; withWordmark?: boolean; className?: string }): ReactElement {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden>
        <defs>
          <linearGradient id="mv-logo-a" x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
            <stop stopColor="#C9B6FF" />
            <stop offset="0.5" stopColor="#7B5BFF" />
            <stop offset="1" stopColor="#4B2FD6" />
          </linearGradient>
          <linearGradient id="mv-logo-b" x1="8" y1="6" x2="32" y2="34" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F4F6FA" />
            <stop offset="1" stopColor="#C9D0DC" />
          </linearGradient>
        </defs>
        <path d="M20 1.6 36.6 11v18L20 38.4 3.4 29V11L20 1.6Z" stroke="url(#mv-logo-a)" strokeWidth="1.3" fill="rgba(123,91,255,0.06)" />
        <path d="M12.4 27V15.2l7.6 8.1 7.6-8.1V27" stroke="url(#mv-logo-b)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="20" cy="9.4" r="1.5" fill="#D8C6A3" />
      </svg>
      {withWordmark && (
        <span className="font-display text-[0.95rem] tracking-[0.26em] text-[#eef1f7]">MAVYRON</span>
      )}
    </span>
  );
}
