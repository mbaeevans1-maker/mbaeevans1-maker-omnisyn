import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Logo, Button } from './primitives';
import { useSession } from '../lib/session';

const NAV = [
  { to: '/platform', label: 'Platform' },
  { to: '/solutions', label: 'Solutions' },
  { to: '/industries', label: 'Industries' },
  { to: '/pricing', label: 'Pricing' },
  { to: '/partnerships', label: 'Partnerships' },
  { to: '/security', label: 'Security' },
  { to: '/about', label: 'Company' },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user, tenant } = useSession();
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const appHref = user?.role === 'platform_admin' ? '/admin' : tenant ? '/app' : '/onboarding';

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled ? 'border-b border-white/[0.07] bg-[#05060a]/82 backdrop-blur-xl' : 'border-b border-transparent bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="MAVYRON home" className="transition-opacity hover:opacity-90">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative text-[0.8rem] tracking-wide transition-colors ${isActive ? 'text-white' : 'text-[#9aa3b5] hover:text-white'}`
                }
              >
                {({ isActive }) => (
                  <>
                    {item.label}
                    {isActive && <span className="absolute -bottom-1.5 left-0 h-px w-full bg-gradient-to-r from-violet to-transparent" />}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2.5 lg:flex">
            {user ? (
              <Link to={appHref}>
                <Button size="sm" icon={<ArrowRight size={14} />}>Open workspace</Button>
              </Link>
            ) : (
              <>
                <Link to="/login" className="px-3 py-2 text-[0.8rem] text-[#9aa3b5] transition-colors hover:text-white">Sign in</Link>
                <Link to="/signup"><Button size="sm">Start free trial</Button></Link>
              </>
            )}
          </div>

          <button
            onClick={() => setOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 text-[#dde2ec] lg:hidden"
            aria-label="Open menu"
            aria-expanded={open}
          >
            <Menu size={18} />
          </button>
        </div>
      </header>

      {/* Mobile menu */}
      <div
        className={`fixed inset-0 z-[70] lg:hidden ${open ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!open}
      >
        <div
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={() => setOpen(false)}
        />
        <div
          className={`absolute inset-y-0 right-0 flex w-full max-w-[400px] flex-col border-l border-white/10 bg-[#070910] transition-transform duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex h-[68px] items-center justify-between border-b border-white/[0.07] px-5">
            <Logo size={22} />
            <button onClick={() => setOpen(false)} className="rounded-lg p-2 text-[#9aa3b5]" aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-5 py-6" aria-label="Mobile">
            <ul className="space-y-1">
              {NAV.concat([{ to: '/resources', label: 'Resources' }, { to: '/contact', label: 'Contact' }]).map((item, i) => (
                <li key={item.to} style={{ transitionDelay: `${i * 30}ms` }}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center justify-between rounded-xl px-3 py-3.5 font-display text-[1.05rem] transition-colors ${
                        isActive ? 'bg-white/[0.04] text-white' : 'text-[#c5cbd8]'
                      }`
                    }
                  >
                    {item.label}
                    <ArrowRight size={15} className="text-[#5d6678]" />
                  </NavLink>
                </li>
              ))}
            </ul>
            <div className="mt-8 space-y-2.5 border-t border-white/[0.07] pt-6">
              {user ? (
                <Link to={appHref}><Button block>Open workspace</Button></Link>
              ) : (
                <>
                  <Link to="/signup"><Button block>Start 14-day trial</Button></Link>
                  <Link to="/login"><Button block variant="ghost">Sign in</Button></Link>
                </>
              )}
            </div>
          </nav>
          <div className="border-t border-white/[0.07] px-5 py-4">
            <p className="text-[0.62rem] uppercase tracking-[0.28em] text-[#5d6678]">Nairobi · Kenya</p>
          </div>
        </div>
      </div>
    </>
  );
}

const FOOTER_GROUPS = [
  {
    title: 'Platform',
    links: [
      { to: '/platform', label: 'Intelligent OS' },
      { to: '/solutions', label: 'Solutions' },
      { to: '/industries', label: 'Industries' },
      { to: '/pricing', label: 'Pricing' },
    ],
  },
  {
    title: 'Company',
    links: [
      { to: '/about', label: 'About MAVYRON' },
      { to: '/partnerships', label: 'Partnerships' },
      { to: '/resources', label: 'Resources' },
      { to: '/contact', label: 'Contact' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { to: '/security', label: 'Security' },
      { to: '/privacy', label: 'Privacy' },
      { to: '/terms', label: 'Terms' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="relative border-t border-white/[0.07] bg-[#05060a]">
      <div className="mx-auto w-full max-w-[1240px] px-5 py-14 sm:px-8">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(3,1fr)]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-[0.8rem] leading-relaxed text-[#7d8798]">
              The Intelligent Business Operating System. AI receptionists, real bookings and automated growth for service businesses.
            </p>
            <p className="mt-5 text-[0.66rem] uppercase tracking-[0.28em] text-[#5d6678]">Nairobi · Kenya · Global</p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="meta mb-4">{group.title}</p>
              <ul className="space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.to}>
                    <Link to={link.to} className="text-[0.8rem] text-[#8a93a6] transition-colors hover:text-white">{link.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/[0.07] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[0.7rem] text-[#5d6678]">© {new Date().getFullYear()} MAVYRON. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.7rem] text-[#5d6678]">
            <span>Founder &amp; CEO · Evans Karani Mbae</span>
            <Link to="/login" className="hover:text-white">Sign in</Link>
            <Link to="/signup" className="hover:text-white">Start trial</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export function MarketingLayout() {
  return (
    <div className="min-h-screen bg-[#05060a]">
      <MarketingNav />
      <main id="main" className="pt-[68px]">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

export function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}
