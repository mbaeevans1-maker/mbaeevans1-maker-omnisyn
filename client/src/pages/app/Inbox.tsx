import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, BookOpen, Bot, Check, MessagesSquare, Plus, Send, ShieldAlert, Trash2, User,
} from 'lucide-react';
import { api, errorMessage } from '../../lib/api';
import { useSession } from '../../lib/session';
import {
  Alert, Button, Card, CardHeader, Chip, EmptyState, Field, Input, Modal, PageHeader,
  Select, SkeletonRows, StatusChip, Switch, Tabs, Textarea, useToast,
} from '../../components/primitives';
import { relative, titleCase } from '../../lib/format';

type Conversation = {
  id: string;
  channel: string;
  status: 'open' | 'needs_human' | 'closed' | string;
  ai_enabled: number | boolean;
  customer_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  contact_ref?: string | null;
  last_message?: string | null;
  message_count?: number;
  last_message_at?: string | null;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

type Message = {
  id: string;
  role: 'customer' | 'assistant' | 'staff' | 'system' | string;
  body: string;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

type KnowledgeEntry = {
  id: string;
  kind: string;
  title: string;
  content: string;
  active: number | boolean;
  updated_at?: string | null;
};

type AiConfig = {
  enabled?: number | boolean;
  assistant_name?: string;
  tone?: string;
  language?: string;
  greeting?: string | null;
  escalation_keywords?: string | string[] | null;
  knowledge?: KnowledgeEntry[];
  provider?: { configured?: boolean; name?: string };
};

const STATUS_TABS = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'needs_human', label: 'Needs human' },
  { value: 'closed', label: 'Closed' },
] as const;

export function Inbox() {
  const toast = useToast();
  const { can } = useSession();
  const [tab, setTab] = useState<'conversations' | 'knowledge'>('conversations');
  const [status, setStatus] = useState<'all' | 'open' | 'needs_human' | 'closed'>('all');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<{ conversation: Conversation; messages: Message[] } | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);

  const [ai, setAi] = useState<AiConfig | null>(null);
  const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
  const [entryModal, setEntryModal] = useState(false);
  const [entry, setEntry] = useState({ kind: 'faq', title: '', content: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{ conversations: Conversation[]; counts: Record<string, number> }>(
        `/tenant/conversations${status === 'all' ? '' : `?status=${status}`}`,
      );
      setConversations(data.conversations);
      setCounts(data.counts);
    } catch (err) {
      toast.error('Could not load conversations', errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [status, toast]);

  const loadAi = useCallback(async () => {
    try {
      const data = await api.get<{ ai?: AiConfig; knowledge?: KnowledgeEntry[] }>('/tenant/ai');
      const config = data.ai || (data as unknown as AiConfig);
      setAi(config);
      setKnowledge(data.knowledge || config.knowledge || []);
    } catch (err) {
      toast.error('Could not load AI settings', errorMessage(err));
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadAi(); }, [loadAi]);

  const openConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setThreadLoading(true);
    try {
      const data = await api.get<{ conversation: Conversation; messages: Message[] }>(`/tenant/conversations/${id}`);
      setThread(data);
    } catch (err) {
      toast.error('Could not open conversation', errorMessage(err));
      setActiveId(null);
    } finally {
      setThreadLoading(false);
    }
  }, [toast]);

  const send = async () => {
    if (!thread || !draft.trim()) return;
    setSending(true);
    try {
      const result = await api.post<{ sent: boolean; whatsapp: { sent: boolean; reason?: string } | null }>(
        `/tenant/conversations/${thread.conversation.id}/reply`, { body: draft.trim() },
      );
      setDraft('');
      const fresh = await api.get<{ conversation: Conversation; messages: Message[] }>(
        `/tenant/conversations/${thread.conversation.id}`,
      );
      setThread(fresh);
      if (result.whatsapp && !result.whatsapp.sent) {
        toast.info('Saved to the thread', `WhatsApp delivery pending: ${result.whatsapp.reason || 'channel not connected'}.`);
      } else if (result.whatsapp?.sent) {
        toast.ok('Reply sent', 'Delivered through the connected WhatsApp Business number.');
      } else {
        toast.ok('Reply added', 'Stored in this conversation thread.');
      }
      void load();
    } catch (err) {
      toast.error('Reply not sent', errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const patchConversation = async (payload: Record<string, unknown>) => {
    if (!thread) return;
    try {
      await api.patch(`/tenant/conversations/${thread.conversation.id}`, payload);
      await openConversation(thread.conversation.id);
      void load();
      toast.ok('Conversation updated');
    } catch (err) {
      toast.error('Update failed', errorMessage(err));
    }
  };

  const addKnowledge = async () => {
    if (!entry.title.trim() || !entry.content.trim()) return;
    try {
      await api.post('/tenant/knowledge', entry);
      setEntryModal(false);
      setEntry({ kind: 'faq', title: '', content: '' });
      toast.ok('Knowledge added', 'The AI receptionist will answer from this entry.');
      void loadAi();
    } catch (err) {
      toast.error('Could not save entry', errorMessage(err));
    }
  };

  const toggleKnowledge = async (row: KnowledgeEntry) => {
    try {
      await api.patch(`/tenant/knowledge/${row.id}`, { active: !row.active });
      void loadAi();
    } catch (err) {
      toast.error('Could not update entry', errorMessage(err));
    }
  };

  const removeKnowledge = async (row: KnowledgeEntry) => {
    try {
      await api.del(`/tenant/knowledge/${row.id}`);
      toast.ok('Entry removed');
      void loadAi();
    } catch (err) {
      toast.error('Could not remove entry', errorMessage(err));
    }
  };

  const active = useMemo(() => conversations.find((c) => c.id === activeId) || null, [conversations, activeId]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="AI receptionist"
        title="AI inbox"
        description="Every customer conversation across web chat and WhatsApp, with human takeover whenever it matters."
        action={<Tabs value={tab} onChange={setTab} tabs={[
          { value: 'conversations', label: 'Conversations', count: counts.all },
          { value: 'knowledge', label: 'Knowledge base', count: knowledge.length },
        ]} />}
      />

      {tab === 'conversations' ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          <Card className={`${activeId ? 'hidden lg:block' : ''} overflow-hidden`}>
            <CardHeader
              title="Threads"
              subtitle="Sorted by most recent activity"
              action={<Tabs value={status} onChange={setStatus} tabs={STATUS_TABS.map((t) => ({
                value: t.value,
                label: t.label,
                count: counts[t.value === 'all' ? 'all' : t.value],
              }))} />}
            />
            {loading ? (
              <SkeletonRows rows={6} />
            ) : conversations.length === 0 ? (
              <EmptyState
                icon={<MessagesSquare size={20} />}
                title="No conversations yet"
                body="When a customer messages your public page or connected WhatsApp number, the AI receptionist replies here."
              />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => void openConversation(c.id)}
                      className={`w-full px-4 py-3 text-left transition-colors hover:bg-white/[0.03] ${activeId === c.id ? 'bg-violet/[0.09]' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-[0.86rem] text-[#eef1f7]">
                          {c.customer_name || c.customer_phone || 'Website visitor'}
                        </span>
                        <span className="shrink-0 text-[0.66rem] text-[#6f7889]">{relative(c.last_message_at || c.created_at)}</span>
                      </div>
                      <p className="mt-1 truncate text-[0.75rem] text-[#7d8798]">{c.last_message || 'No messages yet'}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Chip tone={c.channel === 'whatsapp' ? 'ok' : 'muted'}>{titleCase(c.channel)}</Chip>
                        <StatusChip status={c.status} />
                        {c.ai_enabled ? <Chip tone="violet"><Bot size={10} className="mr-1 inline" />AI</Chip> : <Chip tone="warn">Human</Chip>}
                        {c.message_count ? <span className="text-[0.66rem] text-[#6f7889]">{c.message_count} msgs</span> : null}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className={`${activeId ? '' : 'hidden lg:block'} min-h-[520px] overflow-hidden`}>
            {!activeId ? (
              <EmptyState
                icon={<Bot size={20} />}
                title="Select a conversation"
                body="Read the full exchange, reply as a human, or hand the thread back to the AI receptionist."
              />
            ) : threadLoading || !thread ? (
              <SkeletonRows rows={6} />
            ) : (
              <div className="flex h-full min-h-[520px] flex-col">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button variant="quiet" size="sm" className="lg:hidden" onClick={() => { setActiveId(null); setThread(null); }}>
                      <ArrowLeft size={14} />
                    </Button>
                    <div>
                      <p className="text-sm text-[#eef1f7]">
                        {thread.conversation.customer_name || active?.customer_name || 'Website visitor'}
                      </p>
                      <p className="text-[0.7rem] text-[#6f7889]">
                        {titleCase(thread.conversation.channel)} · {relative(thread.conversation.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={thread.conversation.status} />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void patchConversation({ ai_enabled: !thread.conversation.ai_enabled })}
                    >
                      <Bot size={13} /> {thread.conversation.ai_enabled ? 'Pause AI' : 'Resume AI'}
                    </Button>
                    {thread.conversation.status !== 'closed' ? (
                      <Button size="sm" variant="ghost" onClick={() => void patchConversation({ status: 'closed' })}>
                        <Check size={13} /> Close
                      </Button>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => void patchConversation({ status: 'open' })}>
                        Reopen
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-5" style={{ maxHeight: '52vh' }}>
                  {thread.messages.length === 0 ? (
                    <p className="py-10 text-center text-xs text-[#6f7889]">No messages in this thread yet.</p>
                  ) : thread.messages.map((m) => {
                    const mine = m.role === 'assistant' || m.role === 'staff';
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[86%] rounded-2xl border px-3.5 py-2.5 text-[0.82rem] leading-relaxed ${
                          mine ? 'border-violet/30 bg-violet/[0.12] text-[#ece9ff]' : 'border-white/[0.08] bg-white/[0.03] text-[#dde2ec]'
                        }`}>
                          <p className="mb-1 flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.16em] text-[#8a93a6]">
                            {m.role === 'staff' ? <User size={10} /> : m.role === 'assistant' ? <Bot size={10} /> : null}
                            {m.role === 'staff' ? 'Team' : titleCase(m.role)}
                          </p>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="mt-1 text-[0.62rem] text-[#6f7889]">{relative(m.created_at)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-white/[0.06] p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      className="min-h-[54px]"
                      placeholder={can('ai:write') ? 'Reply as the business…' : 'Your role cannot reply to conversations.'}
                      value={draft}
                      disabled={!can('ai:write')}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
                      }}
                    />
                    <Button onClick={() => void send()} loading={sending} disabled={!draft.trim() || !can('ai:write')}>
                      <Send size={14} />
                    </Button>
                  </div>
                  <p className="mt-2 text-[0.66rem] text-[#6f7889]">
                    Replies are delivered through the connected WhatsApp Business number when available. Nothing is simulated.
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <Card className="overflow-hidden">
            <CardHeader
              title="Approved knowledge"
              subtitle="The AI answers only from this business knowledge, services and availability."
              action={<Button size="sm" onClick={() => setEntryModal(true)}><Plus size={14} /> Add entry</Button>}
            />
            {knowledge.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={20} />}
                title="No knowledge entries yet"
                body="Add policies, FAQs and service details so the AI receptionist can answer accurately instead of guessing."
                action={<Button size="sm" onClick={() => setEntryModal(true)}>Add the first entry</Button>}
              />
            ) : (
              <ul className="divide-y divide-white/[0.05]">
                {knowledge.map((row) => (
                  <li key={row.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-[#eef1f7]">{row.title}</p>
                          <Chip tone="muted">{titleCase(row.kind)}</Chip>
                          {row.active ? <Chip tone="ok">Active</Chip> : <Chip tone="warn">Disabled</Chip>}
                        </div>
                        <p className="mt-1.5 max-w-2xl whitespace-pre-wrap text-[0.78rem] leading-relaxed text-[#8a93a6]">{row.content}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={Boolean(row.active)} onChange={() => void toggleKnowledge(row)} label="Active" />
                        <Button variant="quiet" size="sm" onClick={() => void removeKnowledge(row)} aria-label="Delete entry">
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader title="AI behaviour" subtitle="Configured in Settings" />
              <div className="space-y-3 px-5 py-4 text-xs">
                <div className="flex items-center justify-between"><span className="text-[#7d8798]">Assistant</span><span className="text-[#dde2ec]">{ai?.assistant_name || 'Not set'}</span></div>
                <div className="flex items-center justify-between"><span className="text-[#7d8798]">Tone</span><span className="text-[#dde2ec]">{titleCase(ai?.tone || 'warm professional')}</span></div>
                <div className="flex items-center justify-between"><span className="text-[#7d8798]">Language</span><span className="text-[#dde2ec]">{ai?.language === 'sw' ? 'Swahili' : ai?.language === 'en-sw' ? 'English + Swahili' : 'English'}</span></div>
                <div className="flex items-center justify-between"><span className="text-[#7d8798]">Status</span><span>{ai?.enabled ? <Chip tone="ok">Enabled</Chip> : <Chip tone="warn">Paused</Chip>}</span></div>
              </div>
            </Card>
            <Alert tone={ai?.provider?.configured ? 'ok' : 'info'} title={ai?.provider?.configured ? 'AI provider connected' : 'Deterministic fallback active'}>
              {ai?.provider?.configured
                ? `Responses are generated with ${ai?.provider?.name || 'the configured provider'} using this workspace's knowledge only.`
                : 'Without an AI provider key, replies are composed deterministically from your services, hours and knowledge base. No fabricated answers.'}
            </Alert>
            <Alert tone="warn" title="Human escalation">
              <span className="inline-flex items-center gap-1.5"><ShieldAlert size={12} /> Threads escalate automatically on complaints, pricing disputes or configured keywords.</span>
            </Alert>
          </div>
        </div>
      )}

      <Modal
        open={entryModal}
        onClose={() => setEntryModal(false)}
        title="Add knowledge entry"
        description="Only approved, accurate business information. The AI never invents policies."
        footer={<>
          <Button variant="ghost" onClick={() => setEntryModal(false)}>Cancel</Button>
          <Button onClick={() => void addKnowledge()} disabled={!entry.title.trim() || !entry.content.trim()}>Save entry</Button>
        </>}
      >
        <div className="space-y-4">
          <Field label="Type" htmlFor="kb-kind">
            <Select
              id="kb-kind"
              value={entry.kind}
              onChange={(e) => setEntry({ ...entry, kind: e.target.value })}
              options={[
                { value: 'faq', label: 'FAQ' },
                { value: 'policy', label: 'Policy' },
                { value: 'service', label: 'Service detail' },
                { value: 'promotion', label: 'Promotion' },
                { value: 'general', label: 'General information' },
              ]}
            />
          </Field>
          <Input label="Title" value={entry.title} onChange={(e) => setEntry({ ...entry, title: e.target.value })} placeholder="Cancellation policy" />
          <Textarea
            label="Approved answer"
            value={entry.content}
            onChange={(e) => setEntry({ ...entry, content: e.target.value })}
            placeholder="Appointments can be cancelled or rescheduled up to 12 hours before the start time."
            rows={5}
          />
        </div>
      </Modal>
    </div>
  );
}
