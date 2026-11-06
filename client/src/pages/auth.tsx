import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, KeyRound, ShieldCheck, Sparkles } from 'lucide-react';
import { Alert, Button, Card, Field, Input, Select, Spinner } from '../components/primitives';
import { IntelligenceField } from '../components/visuals';
import { api, errorMessage, type Plan } from '../lib/api';
import { useSession } from '../lib/session';

const INDUSTRIES = [
  { value: 'salon', label: 'Salon' },
  { value: 'barbershop', label: 'Barbershop' },
  { value: 'spa', label: 'Spa & wellness' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'dental', label: 'Dental practice' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'fitness', label: 'Fitness studio' },
  { value: 'rentals', label: 'Rentals' },
  { value: 'other', label: 'Other service business' },
];

function fieldErrors(err: unknown): Record<string, string> {
  const details = (err as { details?: unknown })?.details;
  const out: Record<string, string> = {};
  if (details && typeof details === 'object') {
    for (const [k, v] of Object.entries(details as Record<string, unknown>)) {
      if (Array.isArray(v) && v.length) out[k] = String(v[0]);
      else if (typeof v === 'string') out[k] = v;
    }
  }
  return out;
}

function AuthFrame({ children, side }: { children: React.ReactNode; side: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] overflow-hidden bg-[#05060a]">
      <div className="pointer-events-none absolute inset-0 opacity-[0.55]">
        <IntelligenceField density={0.7} labels={false} />
      </div>
      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-[1240px] items-center gap-10 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="order-2 hidden lg:order-1 lg:block">{side}</div>
        <div className="order-1 lg:order-2">{children}</div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- SIGN IN */

export function Login() {
  const { login } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const next = params.get('next') || '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const session = await login(email, password);
      const role = (session as unknown as { user?: { role?: string } } | null)?.user?.role;
      nav(next || (role === 'platform_admin' ? '/admin' : '/app'), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      side={
        <div className="max-w-md">
          <p className="eyebrow">The Intelligent Business Operating System</p>
          <h2 className="mt-5 font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-[#f2f4f9]">
            One workspace. Every conversation, booking and campaign.
          </h2>
          <p className="mt-4 text-[0.86rem] leading-relaxed text-[#8a93a6]">
            Sign in to manage availability, your AI receptionist, customers and marketing from a single
            operating surface.
          </p>
          <div className="mt-8 space-y-3">
            {['Tenant-isolated data by design', 'Role-based staff permissions', 'AI grounded in your own knowledge base'].map((t) => (
              <div key={t} className="flex items-center gap-2.5 text-[0.8rem] text-[#b7bfcf]">
                <ShieldCheck size={14} className="shrink-0 text-[#b9a8ff]" />{t}
              </div>
            ))}
          </div>
        </div>
      }
    >
      <Card className="p-7">
        <h1 className="font-display text-[1.5rem] tracking-[-0.01em] text-[#f2f4f9]">Sign in</h1>
        <p className="mt-1.5 text-[0.82rem] text-[#8a93a6]">Access your MAVYRON workspace.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <Alert tone="error" title="Could not sign in">{error}</Alert>}
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@business.com" />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" placeholder="••••••••" />
          </Field>
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-[0.74rem] text-[#a99bff] hover:text-white">Forgot password?</Link>
          </div>
          <Button type="submit" block loading={busy} icon={<ArrowRight size={14} />}>Sign in</Button>
        </form>
        <p className="mt-5 text-center text-[0.78rem] text-[#8a93a6]">
          New to MAVYRON? <Link to="/signup" className="text-[#c4b7ff] hover:text-white">Create a workspace</Link>
        </p>
      </Card>
    </AuthFrame>
  );
}

/* ---------------------------------------------------------------- SIGNUP */

export function Signup() {
  const { signup } = useSession();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState({
    name: '', email: '', password: '', business_name: '', industry: 'salon',
    phone: '', city: '', country: 'Kenya', plan_id: params.get('plan') || 'starter',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ plans: Plan[] }>('/plans')
      .then((d) => setPlans(d.plans))
      .catch(() => setPlans([]));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setErrors({});
    try {
      await signup({
        name: form.name,
        email: form.email,
        password: form.password,
        business_name: form.business_name,
        industry: form.industry,
        phone: form.phone || null,
        city: form.city || null,
        country: form.country,
        plan_id: form.plan_id,
      });
      nav('/app/setup', { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      side={
        <div className="max-w-md">
          <p className="eyebrow">Start your workspace</p>
          <h2 className="mt-5 font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-[#f2f4f9]">
            14 days. Full platform. No card required.
          </h2>
          <p className="mt-4 text-[0.86rem] leading-relaxed text-[#8a93a6]">
            Create an isolated workspace for your business, configure services and staff, then let the AI
            receptionist handle enquiries against your real availability.
          </p>
          <div className="mt-8 grid gap-2.5">
            {[
              'Guided setup: business, hours, services, staff, AI',
              'Public booking page, QR code and embeddable widget',
              'AI marketing with an approval workflow you control',
            ].map((t) => (
              <div key={t} className="flex items-start gap-2.5 text-[0.8rem] leading-relaxed text-[#b7bfcf]">
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-400/80" />{t}
              </div>
            ))}
          </div>
        </div>
      }
    >
      <Card className="p-7">
        <h1 className="font-display text-[1.5rem] tracking-[-0.01em] text-[#f2f4f9]">Create your workspace</h1>
        <p className="mt-1.5 text-[0.82rem] text-[#8a93a6]">Trial starts immediately. Cancel any time.</p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <Alert tone="error" title="Could not create workspace">{error}</Alert>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" required error={errors.name}>
              <Input value={form.name} onChange={set('name')} required autoComplete="name" placeholder="Evans Karani Mbae" />
            </Field>
            <Field label="Business name" required error={errors.business_name}>
              <Input value={form.business_name} onChange={set('business_name')} required placeholder="Studio name" />
            </Field>
            <Field label="Email" required error={errors.email}>
              <Input type="email" value={form.email} onChange={set('email')} required autoComplete="email" placeholder="you@business.com" />
            </Field>
            <Field label="Password" required error={errors.password} hint="At least 10 characters.">
              <Input type="password" value={form.password} onChange={set('password')} required autoComplete="new-password" placeholder="••••••••••" />
            </Field>
            <Field label="Industry" required error={errors.industry}>
              <Select value={form.industry} onChange={set('industry')} options={INDUSTRIES} />
            </Field>
            <Field label="Phone" error={errors.phone}>
              <Input value={form.phone} onChange={set('phone')} placeholder="+254 …" autoComplete="tel" />
            </Field>
            <Field label="City" error={errors.city}>
              <Input value={form.city} onChange={set('city')} placeholder="Nairobi" />
            </Field>
            <Field label="Country" error={errors.country}>
              <Input value={form.country} onChange={set('country')} />
            </Field>
          </div>
          <Field label="Plan" required hint="Every plan starts with a 14-day trial.">
            <Select
              value={form.plan_id}
              onChange={set('plan_id')}
              options={(plans.length ? plans : [{ id: 'starter', name: 'Starter' } as Plan, { id: 'pro', name: 'Pro' } as Plan, { id: 'scale', name: 'Scale' } as Plan])
                .map((p) => ({ value: p.id, label: p.name }))}
            />
          </Field>
          <Button type="submit" block loading={busy} icon={<ArrowRight size={14} />}>Create workspace</Button>
          <p className="text-center text-[0.68rem] leading-relaxed text-[#5f6779]">
            By creating an account you accept the <Link to="/terms" className="text-[#a99bff]">Terms</Link> and{' '}
            <Link to="/privacy" className="text-[#a99bff]">Privacy Policy</Link>.
          </p>
        </form>
        <p className="mt-4 text-center text-[0.78rem] text-[#8a93a6]">
          Already have a workspace? <Link to="/login" className="text-[#c4b7ff] hover:text-white">Sign in</Link>
        </p>
      </Card>
    </AuthFrame>
  );
}

/* -------------------------------------------------------------- RECOVERY */

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post<{ ok: boolean; message: string; dev_token?: string | null }>('/api/auth/forgot-password', { email });
      setSent(true);
      setDevToken(res.dev_token || null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      side={
        <div className="max-w-md">
          <p className="eyebrow">Account recovery</p>
          <h2 className="mt-5 font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-[#f2f4f9]">
            Regain access to your operating system.
          </h2>
          <p className="mt-4 text-[0.86rem] leading-relaxed text-[#8a93a6]">
            Reset links are single-use and expire. Where outbound email is not yet configured on this deployment,
            the reset token is surfaced here instead of being silently discarded.
          </p>
        </div>
      }
    >
      <Card className="p-7">
        <h1 className="font-display text-[1.5rem] text-[#f2f4f9]">Reset your password</h1>
        {sent ? (
          <div className="mt-5 space-y-4">
            <Alert tone="success" title="Request received">
              If an account exists for that address, a reset token has been created.
            </Alert>
            {devToken ? (
              <div className="rounded-xl border border-gold/25 bg-gold/[0.05] p-4">
                <p className="text-[0.72rem] uppercase tracking-[0.16em] text-gold">Development token</p>
                <p className="mt-2 break-all font-mono text-[0.72rem] text-[#dfe4ee]">{devToken}</p>
                <Link to={`/reset-password?token=${encodeURIComponent(devToken)}`} className="mt-3 inline-flex">
                  <Button size="sm" variant="gold" icon={<KeyRound size={13} />}>Continue to reset</Button>
                </Link>
              </div>
            ) : (
              <p className="text-[0.78rem] leading-relaxed text-[#8a93a6]">
                Email delivery is handled by the configured provider. Check your inbox for the reset link.
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <Alert tone="error" title="Request failed">{error}</Alert>}
            <Field label="Email" required>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@business.com" />
            </Field>
            <Button type="submit" block loading={busy} icon={<ArrowRight size={14} />}>Send reset link</Button>
          </form>
        )}
        <p className="mt-5 text-center text-[0.78rem] text-[#8a93a6]">
          <Link to="/login" className="text-[#c4b7ff] hover:text-white">Back to sign in</Link>
        </p>
      </Card>
    </AuthFrame>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [token, setToken] = useState(params.get('token') || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => nav('/login', { replace: true }), 1600);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      side={
        <div className="max-w-md">
          <p className="eyebrow">Secure reset</p>
          <h2 className="mt-5 font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-[#f2f4f9]">
            Choose a new password.
          </h2>
          <p className="mt-4 text-[0.86rem] leading-relaxed text-[#8a93a6]">
            Completing the reset signs out other sessions for this account.
          </p>
        </div>
      }
    >
      <Card className="p-7">
        <h1 className="font-display text-[1.5rem] text-[#f2f4f9]">Set a new password</h1>
        {done ? (
          <div className="mt-5">
            <Alert tone="success" title="Password updated">Redirecting you to sign in…</Alert>
            <div className="mt-4 flex justify-center"><Spinner /></div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-5 space-y-4">
            {error && <Alert tone="error" title="Reset failed">{error}</Alert>}
            <Field label="Reset token" required>
              <Input value={token} onChange={(e) => setToken(e.target.value)} required placeholder="Paste the token" />
            </Field>
            <Field label="New password" required hint="At least 10 characters.">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Field label="Confirm password" required>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </Field>
            <Button type="submit" block loading={busy} icon={<ArrowRight size={14} />}>Update password</Button>
          </form>
        )}
      </Card>
    </AuthFrame>
  );
}

export function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const token = params.get('token');

  useEffect(() => {
    if (!token) return;
    setState('working');
    api.post('/api/auth/verify-email', { token })
      .then(() => setState('done'))
      .catch((err) => { setState('error'); setMessage(errorMessage(err)); });
  }, [token]);

  return (
    <AuthFrame
      side={
        <div className="max-w-md">
          <p className="eyebrow">Account verification</p>
          <h2 className="mt-5 font-display text-[2rem] leading-[1.1] tracking-[-0.02em] text-[#f2f4f9]">
            Confirm the address on your workspace.
          </h2>
        </div>
      }
    >
      <Card className="p-7 text-center">
        {state === 'working' && <><Spinner /><p className="mt-4 text-[0.84rem] text-[#8a93a6]">Verifying…</p></>}
        {state === 'done' && (
          <>
            <CheckCircle2 size={34} className="mx-auto text-emerald-400" />
            <h1 className="mt-4 font-display text-[1.3rem] text-[#f2f4f9]">Email verified</h1>
            <p className="mt-2 text-[0.82rem] text-[#8a93a6]">Your account is now verified.</p>
            <Link to="/app" className="mt-5 inline-flex"><Button icon={<Sparkles size={14} />}>Open workspace</Button></Link>
          </>
        )}
        {state === 'error' && <Alert tone="error" title="Verification failed">{message}</Alert>}
        {state === 'idle' && (
          <>
            <h1 className="font-display text-[1.3rem] text-[#f2f4f9]">Verification link required</h1>
            <p className="mt-2 text-[0.82rem] leading-relaxed text-[#8a93a6]">
              Open the verification link sent to your email address. If email delivery is not configured on this
              deployment, the workspace remains fully usable and the status is shown in Settings.
            </p>
            <Link to="/app" className="mt-5 inline-flex"><Button variant="ghost">Go to workspace</Button></Link>
          </>
        )}
      </Card>
    </AuthFrame>
  );
}
