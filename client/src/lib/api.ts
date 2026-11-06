export type ApiError = {
  message: string;
  code?: string;
  details?: Record<string, string[]> | unknown;
  status: number;
};

export class RequestError extends Error {
  code?: string;
  details?: unknown;
  status: number;
  constructor(err: ApiError) {
    super(err.message);
    this.name = 'RequestError';
    this.code = err.code;
    this.details = err.details;
    this.status = err.status;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || 'GET',
    credentials: 'same-origin',
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    const err = (payload as { error?: Partial<ApiError> } | null)?.error;
    throw new RequestError({
      message: err?.message || `Request failed (${res.status})`,
      code: err?.code,
      details: err?.details,
      status: res.status,
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function errorMessage(err: unknown): string {
  if (err instanceof RequestError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong. Please try again.';
}

/* ------------------------------------------------------------------ */
/* Shared response types                                               */
/* ------------------------------------------------------------------ */

export type Plan = {
  id: string;
  name: string;
  tagline: string;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  features: string[];
  limits: Record<string, number | null>;
  sort: number;
  active?: boolean;
  price_monthly_display?: string;
  price_yearly_display?: string;
};

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  role_label?: string;
  tenant_id: string | null;
  status: string;
  email_verified: number | boolean;
  permissions?: string[];
};

export type TenantSummary = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  status: string;
  timezone?: string;
  currency?: string;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  tagline?: string | null;
  onboarding_complete?: number | boolean;
  public_url?: string;
  [key: string]: unknown;
};

export type SessionResponse = {
  user: SessionUser | null;
  tenant?: TenantSummary | null;
  subscription?: SubscriptionSummary | null;
  platform?: PlatformStatus | null;
};

export type SubscriptionSummary = {
  id?: string;
  plan_id?: string;
  plan_name?: string;
  status: string;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: number | boolean;
  days_left?: number | null;
  [key: string]: unknown;
};

export type PlatformStatus = {
  ai: { configured: boolean; provider: string | null; model?: string | null };
  payments: { paystack_configured: boolean; [k: string]: unknown };
  integrations?: Record<string, { configured: boolean }>;
  [key: string]: unknown;
};

export type Appointment = {
  id: string;
  start_at: string;
  end_at: string;
  status: string;
  source: string;
  price_cents: number;
  currency?: string;
  notes?: string | null;
  customer_id?: string;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  service_name: string;
  staff_name: string;
  staff_id?: string;
  service_id?: string;
  duration_min?: number;
  [key: string]: unknown;
};

export type Slot = {
  startAt: string;
  endAt: string;
  localTime: string;
  staffId: string;
  staffName: string;
  staffTitle?: string | null;
};

export type Customer = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  tags?: string | null;
  marketing_consent?: number | boolean;
  created_at: string;
  visits?: number;
  total_spend_cents?: number;
  last_visit_at?: string | null;
  segment?: string;
  [key: string]: unknown;
};

export type Service = {
  id: string;
  name: string;
  description?: string | null;
  duration_min: number;
  price_cents: number;
  active: number | boolean;
  category?: string | null;
  buffer_min?: number;
  staff_ids?: string[];
  [key: string]: unknown;
};

export type StaffMember = {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  color?: string | null;
  active: number | boolean;
  user_id?: string | null;
  role?: string | null;
  [key: string]: unknown;
};

export type Conversation = {
  id: string;
  channel: string;
  contact_name?: string | null;
  contact_ref?: string | null;
  status: string;
  ai_enabled: number | boolean;
  last_message_at?: string | null;
  created_at: string;
  preview?: string | null;
  message_count?: number;
  [key: string]: unknown;
};

export type Message = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  body: string;
  created_at: string;
  [key: string]: unknown;
};

export type ContentItem = {
  id: string;
  channel: string;
  type: string;
  title: string;
  body: string;
  status: 'draft' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed' | string;
  scheduled_at?: string | null;
  published_at?: string | null;
  error?: string | null;
  created_at: string;
  [key: string]: unknown;
};

export type Integration = {
  provider: string;
  label: string;
  category: string;
  description?: string;
  status: 'connected' | 'disconnected' | 'configuration_required' | 'error' | string;
  fields: { key: string; label: string; required?: boolean; secret?: boolean; placeholder?: string }[];
  values?: Record<string, string>;
  missing?: string[];
  last_checked_at?: string | null;
  detail?: string | null;
  supports_oauth?: boolean;
  docs_url?: string | null;
  [key: string]: unknown;
};

export type BillingSummary = {
  subscription: SubscriptionSummary;
  plans: Plan[];
  usage: Record<string, { used: number; limit: number | null; label?: string }>;
  limits: Record<string, number | null>;
  invoices: {
    id: string;
    amount_cents: number;
    currency: string;
    status: string;
    issued_at: string;
    paid_at?: string | null;
    plan_name?: string;
    reference?: string | null;
  }[];
  payment_providers: { id: string; label: string; configured: boolean; [k: string]: unknown }[];
  trial_days?: number;
  [key: string]: unknown;
};

export type BusinessProfile = {
  id: string;
  slug: string;
  name: string;
  industry: string;
  tagline?: string | null;
  about?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  address?: string | null;
  city?: string | null;
  logo_url?: string | null;
  brand_color?: string | null;
  currency: string;
  timezone: string;
  status: string;
  gallery?: string[];
  hours?: { day: number; open: string; close: string; closed: boolean }[];
  services: Service[];
  staff: StaffMember[];
  socials?: Record<string, string | null>;
  [key: string]: unknown;
};
