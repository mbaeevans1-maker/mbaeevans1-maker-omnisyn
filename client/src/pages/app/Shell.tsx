import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, CalendarDays, ChevronRight, CreditCard, Gauge, LayoutGrid, LogOut, Menu, MessagesSquare,
  Plug, Settings as SettingsIcon, Shield, Sparkles, Users, X, Wand2, BarChart3, Check,
} from 'lucide-react';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { Avatar, Button, Chip, Logo, StatusChip, useToast } from '../../components/primitives';
import { relative, titleCase } from '../../lib/format';

type NavItem = { to: string; label: string; icon: typeof Gauge; permission?: string; end?: boolean };

const WORKSPACE: NavItem[] = [
  { to: '/app', label: 'Command centre', icon: Gauge, end: true },
  { to: '/app/calendar', label: 'Bookings', icon: CalendarDays, permission: 'bookings:read' },
  { to: '/app/customers', label: 'Customers', icon: Users, permission: 'customers:read' },
  { to: '/app/inbox', label: 'AI inbox', icon: MessagesSquare, permission: 'ai:read' },
  { to: '/app/catalog', label: 'Services & staff', icon: LayoutGrid, permission: 'services:read' },
  { to: '/app/marketing', label: 'AI marketing', icon: Wand2, permission: 'marketing:read' },
  { to: '/app/analytics', label: 'Analytics', icon: BarChart3, permission: 'analytics:read' },
];

const ACCOUNT: NavItem[] = [
  { to: '/app/integrations', label: 'Integrations', icon: Plug, permission: 'integrations:read' },
  { to: '/app/billing', label: 'Billing & plan', icon: CreditCard, permission: 'billing:read' },
  { to: '/app/settings', label: 'Settings', icon: SettingsIcon, permission: 'settings:read' },
];

type Notification = { id: string; title: string; body?: string | null; created_at: string; read_at?: string | null };

export function AppShell() {
  const { user, tenant, subscription, platform, logout, can } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);

  useEffect(() => { setMobileOpen(false); setNotifOpen(false); }, [location.pathname]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const data = await api.get<{ notifications: Notification[]; unread: number }>('/tenant/notifications');
        if (!live) return;
        setNotifications(data.notifications.slice(0, 8));
        setUnread(data.unread);
      } catch { /* notifications are non-critical */ }
    };
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => { live = false; window.clearInterval(timer); };
  }, [location.pathname]);

  const workspace = useMemo(() => WORKSPACE.filter((i) => !i.permission || can(i.permission)), [can]);
  const account = useMemo(() => ACCOUNT.filter((i) => !i.permission || can(i.permission)), [can]);
  const isPlatformAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const onboardingIncomplete = tenant && tenant.onboarding_step < 11;

  const markRead = async () => {
    try {
      await api.post('/tenant/notifications/read');
      setUnread(0);
      setNotifications((rows) => rows.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
    } catch { /* ignore */ }
  };

  const doLogout = async () => {
    await logout();
    toast.push({ title: 'Signed out', tone: 'ok' });
    navigate('/login', { replace: true });
  };

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}
      >
        <Icon size={17} strokeWidth={1.7} />
        <span>{item.label}</span>
      </NavLink>
    );
  };

  return (
    <div className="min-h-dvh bg-obsidian text-silver">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="aurora aurora-violet left-[-10%] top-[-10%] h-[420px] w-[420px]" />
        <div className="aurora aurora-navy right-[-14%] top-[30%] h-[520px] w-[520px]" />
      </div>

      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-white/[0.06] bg-[#07070c]/85 backdrop-blur-xl lg:flex">
        <div className="flex h-[74px] items-center px-5">
          <Link to="/app" aria-label="MAVYRON workspace"><Logo size={24} /></Link>
        </div>

        <div className="mx-4 mb-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <p className="truncate text-[0.82rem] font-medium text-white">{tenant?.name || 'Your workspace'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Chip tone="violet">{titleCase(tenant?.industry || 'service')}</Chip>
            {subscription && <StatusChip status={subscription.status} />}
          </div>
          {subscription?.trialing && (
            <p className="mt-2 text-[0.7rem] text-[#8e97a8]">
              Trial · {subscription.trial_days_left} day{subscription.trial_days_left === 1 ? '' : 's'} left
            </p>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          <p className="px-2 pb-2 text-[0.62rem] uppercase tracking-[0.22em] text-[#5d6678]">Workspace</p>
          <div className="flex flex-col gap-0.5">{workspace.map(navLink)}</div>
          <p className="px-2 pb-2 pt-5 text-[0.62rem] uppercase tracking-[0.22em] text-[#5d6678]">Account</p>
          <div className="flex flex-col gap-0.5">{account.map(navLink)}</div>
          {isPlatformAdmin && (
            <>
              <p className="px-2 pb-2 pt-5 text-[0.62rem] uppercase tracking-[0.22em] text-[#5d6678]">Platform</p>
              <NavLink to="/admin" className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}>
                <Shield size={17} strokeWidth={1.7} />
                <span>Platform admin</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="border-t border-white/[0.06] p-3">
          {tenant?.slug && (
            <a
              href={`/business/${tenant.slug}`}
              target="_blank"
              rel="noreferrer"
              className="mb-2 flex items-center justify-between rounded-lg px-2.5 py-2 text-[0.78rem] text-[#98a1b3] transition hover:bg-white/[0.04] hover:text-white"
            >
              <span className="flex items-center gap-2"><Sparkles size={14} /> Public page</span>
              <ChevronRight size={14} />
            </a>
          )}
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <Avatar name={user?.name} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8rem] font-medium text-white">{user?.name}</p>
              <p className="truncate text-[0.68rem] text-[#7d8798]">{user?.role ? titleCase(user.role) : ''}</p>
            </div>
            <button onClick={doLogout} aria-label="Sign out" className="rounded-md p-1.5 text-[#7d8798] transition hover:bg-white/[0.06] hover:text-white">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#07070c]/80 backdrop-blur-xl lg:pl-[264px]">
        <div className="flex h-[64px] items-center gap-3 px-4 sm:px-6">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="rounded-lg border border-white/10 p-2 text-silver transition hover:bg-white/[0.05] lg:hidden"
          >
            <Menu size={18} />
          </button>
          <div className="lg:hidden"><Logo size={22} withWordmark={false} /></div>
          <div className="hidden min-w-0 flex-1 lg:block">
            <p className="truncate text-[0.82rem] text-[#98a1b3]">
              {tenant?.name} <span className="text-[#4d5566]">/</span>{' '}
              {titleCase(location.pathname.replace('/app', '').split('/')[1] || 'command centre')}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {onboardingIncomplete && (
              <Link to="/app/setup" className="hidden sm:block">
                <Button size="sm" variant="gold" icon={<Sparkles size={14} />}>Finish setup</Button>
              </Link>
            )}
            <div className="relative">
              <button
                onClick={() => setNotifOpen((v) => !v)}
                aria-label="Notifications"
                className="relative rounded-lg border border-white/10 p-2 text-silver transition hover:bg-white/[0.05]"
              >
                <Bell size={17} />
                {unread > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet px-1 text-[0.6rem] font-semibold text-white">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-11 w-[320px] overflow-hidden rounded-xl border border-white/10 bg-[#0b0b13] shadow-2xl">
                  <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                    <p className="text-[0.8rem] font-medium text-white">Notifications</p>
                    {unread > 0 && <button onClick={markRead} className="text-[0.72rem] text-violet-soft hover:underline">Mark all read</button>}
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="px-4 py-8 text-center text-[0.78rem] text-[#7d8798]">
                        No notifications yet. Booking and AI alerts will appear here.
                      </p>
                    ) : notifications.map((n) => (
                      <div key={n.id} className={`border-b border-white/[0.05] px-4 py-3 last:border-0 ${n.read_at ? 'opacity-60' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.read_at && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-soft" />}
                          <div>
                            <p className="text-[0.8rem] text-white">{n.title}</p>
                            {n.body && <p className="mt-0.5 text-[0.74rem] leading-relaxed text-[#8e97a8]">{n.body}</p>}
                            <p className="mt-1 text-[0.66rem] text-[#5d6678]">{relative(n.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Link to="/app/settings" aria-label="Account settings" className="rounded-full ring-1 ring-white/10 transition hover:ring-violet/60">
              <Avatar name={user?.name} size={34} />
            </Link>
          </div>
        </div>
      </header>

      <main className="lg:pl-[264px]">
        {platform && !platform.ai?.configured && location.pathname === '/app/inbox' && (
          <div className="mx-4 mt-4 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-4 py-2.5 text-[0.78rem] text-amber-200 sm:mx-6">
            AI provider credentials are not configured. The AI receptionist runs in deterministic knowledge-only mode until a provider key is added.
          </div>
        )}
        <div className="px-4 pb-24 pt-5 sm:px-6 sm:pb-16 lg:pb-12">
          <Outlet />
        </div>
      </main>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-[330px] overflow-y-auto border-r border-white/10 bg-[#08080e] p-4">
            <div className="mb-5 flex items-center justify-between">
              <Logo size={22} />
              <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="rounded-lg p-2 text-silver hover:bg-white/[0.06]">
                <X size={18} />
              </button>
            </div>
            <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
              <p className="truncate text-[0.85rem] font-medium text-white">{tenant?.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {subscription && <StatusChip status={subscription.status} />}
                {onboardingIncomplete && <Chip tone="warn">Setup {tenant?.onboarding_step}/11</Chip>}
              </div>
            </div>
            <nav className="flex flex-col gap-0.5">
              {workspace.map(navLink)}
              <div className="my-3 h-px bg-white/[0.07]" />
              {account.map(navLink)}
              {onboardingIncomplete && (
                <NavLink to="/app/setup" className={({ isActive }) => `side-link ${isActive ? 'side-link-active' : ''}`}>
                  <Check size={17} /> <span>Setup checklist</span>
                </NavLink>
              )}
              {isPlatformAdmin && (
                <NavLink to="/admin" className="side-link"><Shield size={17} /><span>Platform admin</span></NavLink>
              )}
            </nav>
            <button onClick={doLogout} className="mt-6 flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2.5 text-[0.82rem] text-[#b9c1d0]">
              <LogOut size={16} /> Sign out
            </button>
          </div>
        </div>
      )}

      {/* mobile tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-white/[0.07] bg-[#07070c]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {[
            { to: '/app', label: 'Home', icon: Gauge, end: true },
            { to: '/app/calendar', label: 'Bookings', icon: CalendarDays },
            { to: '/app/inbox', label: 'AI', icon: MessagesSquare },
            { to: '/app/marketing', label: 'Content', icon: Wand2 },
            { to: '/app/settings', label: 'Account', icon: SettingsIcon },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[0.62rem] tracking-wide ${isActive ? 'text-violet-soft' : 'text-[#7d8798]'}`}
              >
                <Icon size={19} strokeWidth={1.7} />
                {tab.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
