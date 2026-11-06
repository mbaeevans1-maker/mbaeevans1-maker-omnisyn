import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock, Check, Instagram, Plus, Send, Sparkles, Trash2, Wand2, X,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Button, Card, CardHeader, Chip, EmptyState, Field, Input, Modal, PageHeader,
  Select, SkeletonRows, StatusChip, Tabs, Textarea, useToast,
} from '../../components/primitives';
import { dateTime, relative, titleCase } from '../../lib/format';

type ContentItem = {
  id: string;
  kind: string;
  channel: string;
  title?: string | null;
  caption: string;
  hashtags?: string | null;
  script?: string | null;
  status: 'draft' | 'approved' | 'scheduled' | 'publishing' | 'published' | 'failed' | string;
  scheduled_at?: string | null;
  published_at?: string | null;
  failure_reason?: string | null;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

type Campaign = {
  id: string;
  name: string;
  goal?: string | null;
  audience?: string | null;
  message?: string | null;
  status?: string | null;
  scheduled_at?: string | null;
  created_at: string;
};

type ChannelState = { channel: string; status?: string; connected?: boolean; label?: string };

const KINDS = [
  { value: 'caption', label: 'Social caption' },
  { value: 'offer', label: 'Offer' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'educational', label: 'Educational post' },
  { value: 'retention', label: 'Retention message' },
  { value: 'script', label: 'Short-video script' },
  { value: 'voiceover', label: 'Voiceover script' },
  { value: 'subtitles', label: 'Subtitles' },
];

const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'x', label: 'X' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'approved', label: 'Approved' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'published', label: 'Published' },
  { value: 'failed', label: 'Failed' },
] as const;

export function Marketing() {
  const toast = useToast();
  const { can, tenant } = useSession();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [channels, setChannels] = useState<ChannelState[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'draft' | 'approved' | 'scheduled' | 'published' | 'failed'>('all');
  const [generating, setGenerating] = useState(false);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [form, setForm] = useState({ kind: 'caption', channel: 'instagram', brief: '' });
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [editDraft, setEditDraft] = useState({ caption: '', hashtags: '' });
  const [scheduleFor, setScheduleFor] = useState<ContentItem | null>(null);
  const [scheduleAt, setScheduleAt] = useState('');
  const [campaignModal, setCampaignModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: '', goal: '', audience: 'all', message: '', scheduled_at: '' });
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{
        items: ContentItem[]; campaigns: Campaign[]; channels: ChannelState[]; counts: Record<string, number>;
      }>('/tenant/content');
      setItems(data.items);
      setCampaigns(data.campaigns);
      setChannels(data.channels);
      setCounts(data.counts);
    } catch (err) {
      toast.error('Could not load content', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const generate = async () => {
    setGenerating(true);
    setProviderError(null);
    try {
      const result = await api.post<{ item: ContentItem; provider_error?: string | null }>('/tenant/content/generate', form);
      if (result.provider_error) setProviderError(result.provider_error);
      toast.ok('Content drafted', 'Review, edit and approve before anything is published.');
      void load();
    } catch (err) {
      toast.error('Generation failed', errorMessage(err));
    } finally {
      setGenerating(false);
    }
  };

  const patch = async (item: ContentItem, payload: Record<string, unknown>, message?: string) => {
    setBusyId(item.id);
    try {
      await api.patch(`/tenant/content/${item.id}`, payload);
      if (message) toast.ok(message);
      void load();
    } catch (err) {
      toast.error('Update failed', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const publish = async (item: ContentItem) => {
    setBusyId(item.id);
    try {
      const result = await api.post<{ published: boolean; reason?: string }>(`/tenant/content/${item.id}/publish`);
      if (result.published) toast.ok('Published', 'Confirmed by the connected platform API.');
      else toast.info('Not published', result.reason || 'The destination channel is not connected yet.');
      void load();
    } catch (err) {
      toast.error('Publish failed', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (item: ContentItem) => {
    setBusyId(item.id);
    try {
      await api.del(`/tenant/content/${item.id}`);
      toast.ok('Content removed');
      void load();
    } catch (err) {
      toast.error('Could not remove', errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const createCampaign = async () => {
    try {
      await api.post('/tenant/campaigns', {
        name: campaignForm.name,
        goal: campaignForm.goal || undefined,
        audience: campaignForm.audience,
        message: campaignForm.message || undefined,
        scheduled_at: campaignForm.scheduled_at || undefined,
      });
      setCampaignModal(false);
      setCampaignForm({ name: '', goal: '', audience: 'all', message: '', scheduled_at: '' });
      toast.ok('Campaign created');
      void load();
    } catch (err) {
      toast.error('Could not create campaign', errorMessage(err));
    }
  };

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.status === filter)),
    [items, filter],
  );

  const connectedChannels = channels.filter((c) => c.connected || c.status === 'connected');

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI marketing"
        title="Content engine"
        description="On-brand content generated from this business's services, tone and audience — approved by you before it ships."
        action={<Button onClick={() => setCampaignModal(true)}><Plus size={14} /> New campaign</Button>}
      />

      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Generate" subtitle="Draft only — nothing is posted automatically" />
            <div className="space-y-4 px-5 py-4">
              <Field label="Content type" htmlFor="gen-kind">
                <Select id="gen-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} options={KINDS} />
              </Field>
              <Field label="Channel" htmlFor="gen-channel">
                <Select id="gen-channel" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} options={CHANNELS} />
              </Field>
              <Textarea
                label="Brief"
                rows={4}
                placeholder="Promote the midweek beard trim with a calm, premium tone for returning clients."
                value={form.brief}
                onChange={(e) => setForm({ ...form, brief: e.target.value })}
              />
              <Button className="w-full" onClick={() => void generate()} loading={generating} disabled={!can('marketing:write')}>
                <Wand2 size={14} /> Generate draft
              </Button>
              <p className="text-[0.68rem] leading-relaxed text-[#6f7889]">
                Generation uses {tenant?.name || 'your business'} branding, services and approved knowledge. If no AI provider key is
                configured, a structured template draft is produced instead — never invented claims.
              </p>
            </div>
          </Card>

          {providerError && (
            <Alert tone="warn" title="AI provider not configured">
              {providerError} Add the provider key in Integrations to enable model-written copy. The draft above was produced locally.
            </Alert>
          )}

          <Card>
            <CardHeader title="Channel readiness" subtitle="Publishing requires a verified connection" />
            <div className="space-y-2 px-5 py-4">
              {channels.length === 0 ? (
                <p className="text-xs text-[#6f7889]">Connect a channel to enable direct publishing.</p>
              ) : channels.map((c) => (
                <div key={c.channel} className="flex items-center justify-between gap-2 text-xs">
                  <span className="inline-flex items-center gap-2 text-[#dde2ec]"><Instagram size={13} /> {titleCase(c.channel)}</span>
                  <StatusChip status={c.connected || c.status === 'connected' ? 'connected' : (c.status || 'configuration_required')} />
                </div>
              ))}
              {connectedChannels.length === 0 && (
                <p className="pt-1 text-[0.68rem] text-[#6f7889]">
                  No channel is verified yet. Approved content stays in the queue until a connection is confirmed.
                </p>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader
              title="Content queue"
              subtitle={`${counts.draft || 0} draft · ${counts.approved || 0} approved · ${counts.scheduled || 0} scheduled · ${counts.published || 0} published`}
              action={<Tabs value={filter} onChange={setFilter} tabs={FILTERS.map((f) => ({
                value: f.value,
                label: f.label,
                count: f.value === 'all' ? items.length : counts[f.value],
              }))} />}
            />
            {loading ? (
              <SkeletonRows rows={5} />
            ) : visible.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={20} />}
                title={items.length === 0 ? 'No content yet' : 'Nothing in this state'}
                body={items.length === 0
                  ? 'Generate your first caption, offer or short-video script. Every draft is yours to review.'
                  : 'Switch filters to see the rest of the queue.'}
              />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {visible.map((item) => (
                  <li key={item.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Chip tone="violet">{titleCase(item.kind)}</Chip>
                          <Chip tone="muted">{titleCase(item.channel)}</Chip>
                          <StatusChip status={item.status} />
                          <span className="text-[0.66rem] text-[#6f7889]">{relative(item.created_at)}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-[0.84rem] leading-relaxed text-[#dde2ec]">{item.caption}</p>
                        {item.hashtags && <p className="mt-1.5 text-[0.74rem] text-[#8a93a6]">{item.hashtags}</p>}
                        {item.script && (
                          <details className="mt-2 text-[0.74rem] text-[#8a93a6]">
                            <summary className="cursor-pointer text-[#a9a2ff]">View script</summary>
                            <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{item.script}</p>
                          </details>
                        )}
                        {item.scheduled_at && (
                          <p className="mt-2 inline-flex items-center gap-1.5 text-[0.7rem] text-[#8a93a6]">
                            <CalendarClock size={11} /> Scheduled {dateTime(item.scheduled_at)}
                          </p>
                        )}
                        {item.failure_reason && <p className="mt-2 text-[0.72rem] text-amber-300/90">{item.failure_reason}</p>}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.status === 'draft' && (
                        <Button size="sm" variant="ghost" onClick={() => void patch(item, { status: 'approved' }, 'Approved')} loading={busyId === item.id}>
                          <Check size={13} /> Approve
                        </Button>
                      )}
                      {(item.status === 'approved' || item.status === 'failed') && (
                        <Button size="sm" variant="ghost" onClick={() => { setScheduleFor(item); setScheduleAt(''); }}>
                          <CalendarClock size={13} /> Schedule
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(item); setEditDraft({ caption: item.caption, hashtags: item.hashtags || '' }); }}>
                        Edit
                      </Button>
                      {(item.status === 'approved' || item.status === 'scheduled' || item.status === 'failed') && (
                        <Button size="sm" onClick={() => void publish(item)} loading={busyId === item.id}>
                          <Send size={13} /> Publish now
                        </Button>
                      )}
                      <Button size="sm" variant="quiet" onClick={() => void remove(item)} aria-label="Delete content">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Campaigns" subtitle="Grouped outreach with a real audience definition" />
            {campaigns.length === 0 ? (
              <EmptyState
                icon={<Sparkles size={20} />}
                title="No campaigns yet"
                body="Campaigns organise offers and retention pushes around a specific audience segment."
                action={<Button size="sm" onClick={() => setCampaignModal(true)}>Create campaign</Button>}
              />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {campaigns.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm text-[#eef1f7]">{c.name}</p>
                      <p className="text-[0.7rem] text-[#7d8798]">
                        {titleCase(c.audience || 'all')} audience{c.goal ? ` · ${c.goal}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusChip status={c.status || 'draft'} />
                      {c.scheduled_at && <span className="text-[0.68rem] text-[#6f7889]">{dateTime(c.scheduled_at)}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title="Edit content"
        description="Edits are saved to the draft; publishing stays a deliberate action."
        footer={<>
          <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          <Button
            onClick={async () => {
              if (!editing) return;
              await patch(editing, { caption: editDraft.caption, hashtags: editDraft.hashtags }, 'Content saved');
              setEditing(null);
            }}
          >
            Save changes
          </Button>
        </>}
      >
        <div className="space-y-4">
          <Textarea label="Caption" rows={6} value={editDraft.caption} onChange={(e) => setEditDraft({ ...editDraft, caption: e.target.value })} />
          <Input label="Hashtags" value={editDraft.hashtags} onChange={(e) => setEditDraft({ ...editDraft, hashtags: e.target.value })} placeholder="#nairobisalon #grooming" />
        </div>
      </Modal>

      <Modal
        open={Boolean(scheduleFor)}
        onClose={() => setScheduleFor(null)}
        title="Schedule content"
        description="The scheduler publishes only when the channel connection is verified."
        footer={<>
          <Button variant="ghost" onClick={() => setScheduleFor(null)}>Cancel</Button>
          <Button
            disabled={!scheduleAt}
            onClick={async () => {
              if (!scheduleFor) return;
              await patch(scheduleFor, { scheduled_at: new Date(scheduleAt).toISOString(), status: 'scheduled' }, 'Scheduled');
              setScheduleFor(null);
            }}
          >
            Schedule
          </Button>
        </>}
      >
        <Input
          label="Publish at"
          type="datetime-local"
          value={scheduleAt}
          onChange={(e) => setScheduleAt(e.target.value)}
        />
      </Modal>

      <Modal
        open={campaignModal}
        onClose={() => setCampaignModal(false)}
        title="New campaign"
        description="Define the audience and message; content can be attached afterwards."
        footer={<>
          <Button variant="ghost" onClick={() => setCampaignModal(false)}>Cancel</Button>
          <Button onClick={() => void createCampaign()} disabled={!campaignForm.name.trim()}>Create campaign</Button>
        </>}
      >
        <div className="space-y-4">
          <Input label="Name" value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} placeholder="Midweek retention push" />
          <Field label="Audience" htmlFor="camp-audience">
            <Select
              id="camp-audience"
              value={campaignForm.audience}
              onChange={(e) => setCampaignForm({ ...campaignForm, audience: e.target.value })}
              options={[
                { value: 'all', label: 'All customers' },
                { value: 'returning', label: 'Returning customers' },
                { value: 'vip', label: 'VIP customers' },
                { value: 'inactive', label: 'Inactive customers' },
                { value: 'new', label: 'New customers' },
              ]}
            />
          </Field>
          <Input label="Goal" value={campaignForm.goal} onChange={(e) => setCampaignForm({ ...campaignForm, goal: e.target.value })} placeholder="Increase midweek bookings" />
          <Textarea label="Message angle" rows={3} value={campaignForm.message} onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })} />
          <Input label="Scheduled at" type="datetime-local" value={campaignForm.scheduled_at} onChange={(e) => setCampaignForm({ ...campaignForm, scheduled_at: e.target.value })} />
        </div>
      </Modal>
    </div>
  );
}
