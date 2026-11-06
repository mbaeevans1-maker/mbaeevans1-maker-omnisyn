import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ExternalLink, Plug, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Button, Card, CardHeader, Chip, EmptyState, Field, Input, Modal, PageHeader,
  SkeletonRows, StatusChip, Tabs, useToast,
} from '../../components/primitives';
import { relative, titleCase } from '../../lib/format';

type FieldSpec = {
  key: string;
  label?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  type?: string;
  options?: string[];
};

type Integration = {
  provider: string;
  name: string;
  category: string;
  capability?: string;
  docs?: string | null;
  fields: (FieldSpec | string)[];
  optionalFields?: (FieldSpec | string)[];
  status: 'connected' | 'disconnected' | 'configuration_required' | 'error' | string;
  missing_fields?: string[];
  account_ref?: string | null;
  last_error?: string | null;
  last_checked_at?: string | null;
  connected_at?: string | null;
  credentials?: Record<string, string>;
  configured_fields?: string[];
};

type PlatformStatus = {
  payments?: { provider?: string | null; configured: boolean; mode?: string | null; missing?: string[] };
  ai?: { provider?: string | null; configured: boolean; missing?: string[] };
  messaging?: { provider?: string | null; configured: boolean; missing?: string[] };
  email?: { provider?: string | null; configured: boolean; missing?: string[] };
  voice?: { provider?: string | null; configured: boolean; missing?: string[] };
};

const CATEGORY_ORDER = ['messaging', 'social', 'scheduling', 'payments', 'ai', 'email', 'sms', 'voice', 'analytics'];

function normaliseField(f: FieldSpec | string): FieldSpec {
  return typeof f === 'string' ? { key: f, label: titleCase(f), required: true } : { ...f, label: f.label || titleCase(f.key) };
}

export function Integrations() {
  const toast = useToast();
  const { can } = useSession();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [platform, setPlatform] = useState<PlatformStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<string>('all');
  const [active, setActive] = useState<Integration | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ integrations: Integration[]; platform: PlatformStatus }>('/tenant/integrations');
      setIntegrations(data.integrations);
      setPlatform(data.platform);
    } catch (err) {
      toast.error('Could not load integrations', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => {
    const set = new Set(integrations.map((i) => i.category));
    return ['all', ...Array.from(set).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a); const ib = CATEGORY_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    })];
  }, [integrations]);

  const visible = useMemo(
    () => (tab === 'all' ? integrations : integrations.filter((i) => i.category === tab)),
    [integrations, tab],
  );

  const openConnect = (integration: Integration) => {
    setActive(integration);
    setValues({});
  };

  const connect = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(values)) if (v.trim()) payload[k] = v.trim();
      const result = await api.post<{ verification: { ok: boolean; status: string; message?: string; account_ref?: string } }>(
        `/tenant/integrations/${active.provider}`, payload,
      );
      if (result.verification?.ok) {
        toast.ok(`${active.name} verified`, result.verification.account_ref ? `Account ${result.verification.account_ref} confirmed.` : 'Credentials verified with the provider.');
      } else {
        toast.info('Saved, verification pending', result.verification?.message || 'The provider did not confirm the connection.');
      }
      setActive(null);
      void load();
    } catch (err) {
      toast.error('Connection failed', errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const verify = async (integration: Integration) => {
    setBusy(integration.provider);
    try {
      const result = await api.post<{ verification: { ok: boolean; message?: string } }>(`/tenant/integrations/${integration.provider}/verify`);
      if (result.verification?.ok) toast.ok(`${integration.name} verified`);
      else toast.info(`${integration.name} not verified`, result.verification?.message || 'The provider rejected the credentials.');
      void load();
    } catch (err) {
      toast.error('Verification failed', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const disconnect = async (integration: Integration) => {
    setBusy(integration.provider);
    try {
      await api.del(`/tenant/integrations/${integration.provider}`);
      toast.ok(`${integration.name} disconnected`, 'Stored credentials were removed.');
      void load();
    } catch (err) {
      toast.error('Could not disconnect', errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const platformRows = useMemo(() => {
    if (!platform) return [];
    return (Object.entries(platform) as [string, { provider?: string | null; configured: boolean; mode?: string | null; missing?: string[] }][])
      .filter(([, v]) => v && typeof v === 'object')
      .map(([key, v]) => ({ key, ...v }));
  }, [platform]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Integration centre"
        title="Connections"
        description="Each connection is verified against the provider. Status reflects reality — never a guess."
        action={<Button variant="ghost" onClick={() => void load()}><RefreshCw size={14} /> Refresh</Button>}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {platformRows.map((row) => (
          <Card key={row.key} className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-[0.64rem] uppercase tracking-[0.18em] text-[#7d8798]">{titleCase(row.key)}</span>
              {row.configured ? <CheckCircle2 size={14} className="text-emerald-400" /> : <AlertTriangle size={14} className="text-amber-400" />}
            </div>
            <p className="mt-2 text-sm text-[#eef1f7]">{row.provider ? titleCase(row.provider) : 'Not configured'}</p>
            <p className="mt-1 text-[0.68rem] text-[#6f7889]">
              {row.configured
                ? (row.mode ? `Live in ${row.mode} mode` : 'Platform keys present')
                : `Requires ${(row.missing || []).join(', ') || 'platform configuration'}`}
            </p>
          </Card>
        ))}
      </div>

      <Alert tone="info" title="How connection status works">
        <span className="inline-flex items-start gap-1.5">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          Credentials are encrypted at rest and never returned to the browser. A connection is only marked
          <strong className="mx-1 text-[#dde2ec]">Connected</strong> after the provider accepts a real verification call.
          Anything unverified stays <em className="mx-1">Configuration required</em>.
        </span>
      </Alert>

      <Tabs value={tab} onChange={setTab} tabs={categories.map((c) => ({
        value: c,
        label: c === 'all' ? 'All' : titleCase(c),
        count: c === 'all' ? integrations.length : integrations.filter((i) => i.category === c).length,
      }))} />

      {loading ? (
        <Card><SkeletonRows rows={6} /></Card>
      ) : visible.length === 0 ? (
        <Card><EmptyState icon={<Plug size={20} />} title="No providers in this category" body="Choose another category to view available integrations." /></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((i) => {
            const connected = i.status === 'connected';
            return (
              <Card key={i.provider} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-[#eef1f7]">{i.name}</p>
                    <p className="mt-0.5 text-[0.66rem] uppercase tracking-[0.16em] text-[#6f7889]">{titleCase(i.category)}</p>
                  </div>
                  <StatusChip status={i.status} />
                </div>
                <p className="mt-3 flex-1 text-[0.78rem] leading-relaxed text-[#8a93a6]">{i.capability || 'Verified provider connection.'}</p>

                {i.account_ref && <p className="mt-2 text-[0.68rem] text-[#a9a2ff]">Account: {i.account_ref}</p>}
                {i.last_checked_at && <p className="mt-1 text-[0.66rem] text-[#6f7889]">Checked {relative(i.last_checked_at)}</p>}
                {i.status === 'configuration_required' && (i.missing_fields?.length || 0) > 0 && (
                  <p className="mt-2 text-[0.68rem] text-amber-300/90">Missing: {i.missing_fields!.map(titleCase).join(', ')}</p>
                )}
                {i.last_error && <p className="mt-2 line-clamp-2 text-[0.68rem] text-amber-300/90">{i.last_error}</p>}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant={connected ? 'ghost' : 'primary'} onClick={() => openConnect(i)} disabled={!can('integrations:write')}>
                    {connected ? 'Update' : 'Connect'}
                  </Button>
                  {connected && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => void verify(i)} loading={busy === i.provider}>
                        <RefreshCw size={12} /> Verify
                      </Button>
                      <Button size="sm" variant="quiet" onClick={() => void disconnect(i)} loading={busy === i.provider} aria-label={`Disconnect ${i.name}`}>
                        <Trash2 size={12} />
                      </Button>
                    </>
                  )}
                  {i.docs && (
                    <a href={i.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[0.7rem] text-[#8a93a6] hover:text-[#dde2ec]">
                      Docs <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader title="Connection requirements" subtitle="What each provider needs before it can go live" />
        <div className="grid gap-3 px-5 py-4 md:grid-cols-2">
          {integrations.map((i) => (
            <div key={`req-${i.provider}`} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-[#dde2ec]">{i.name}</p>
                <Chip tone={i.status === 'connected' ? 'ok' : 'muted'}>{i.fields.map((f) => normaliseField(f).label).slice(0, 3).join(' · ') || 'OAuth'}</Chip>
              </div>
              <p className="mt-1.5 text-[0.68rem] leading-relaxed text-[#6f7889]">
                {i.status === 'connected'
                  ? 'Credentials stored and verified. Re-verify at any time.'
                  : 'Provide verified credentials from the provider dashboard. OAuth-only providers require app approval before publishing.'}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active ? `Connect ${active.name}` : 'Connect'}
        description="Credentials are encrypted at rest and verified with the provider before the status changes."
        footer={<>
          <Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button>
          <Button onClick={() => void connect()} loading={saving}>Save &amp; verify</Button>
        </>}
      >
        {active && (
          <div className="space-y-4">
            {active.configured_fields && active.configured_fields.length > 0 && (
              <Alert tone="info" title="Already stored">
                {active.configured_fields.map(titleCase).join(', ')} — leave blank to keep the existing value.
              </Alert>
            )}
            {active.fields.map((f) => {
              const spec = normaliseField(f);
              return (
                <Field key={spec.key} label={spec.label || spec.key} htmlFor={`int-${spec.key}`} hint={spec.hint}>
                  <Input
                    id={`int-${spec.key}`}
                    type={spec.type || (/secret|token|key|password/i.test(spec.key) ? 'password' : 'text')}
                    placeholder={active.credentials?.[spec.key] || spec.placeholder || ''}
                    value={values[spec.key] || ''}
                    onChange={(e) => setValues({ ...values, [spec.key]: e.target.value })}
                    autoComplete="off"
                  />
                </Field>
              );
            })}
            {(active.optionalFields || []).map((f) => {
              const spec = normaliseField(f);
              return (
                <Field key={spec.key} label={`${spec.label || spec.key} (optional)`} htmlFor={`int-${spec.key}`} hint={spec.hint}>
                  <Input
                    id={`int-${spec.key}`}
                    type={spec.type || (/secret|token|key|password/i.test(spec.key) ? 'password' : 'text')}
                    placeholder={active.credentials?.[spec.key] || spec.placeholder || ''}
                    value={values[spec.key] || ''}
                    onChange={(e) => setValues({ ...values, [spec.key]: e.target.value })}
                    autoComplete="off"
                  />
                </Field>
              );
            })}
            <p className="text-[0.68rem] leading-relaxed text-[#6f7889]">
              MAVYRON never stores platform passwords for social accounts and never scrapes providers. Publishing and messaging
              only work through official APIs after verification.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
