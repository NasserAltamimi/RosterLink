import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, LayoutDashboard, LogOut, Menu, Search, UserRound, X } from 'lucide-react';
import { Brand } from './components.jsx';

const destinations = [['workspace', '/workspace', 'My Workspace', LayoutDashboard], ['profile', '/profile', 'My Profile', UserRound], ['openings', '/openings', 'Openings', Search], ['organizations', '/organizations', 'Organizations', Building2]];

export default function SiteHeader({ user, current, routeKey, logout, loggingOut }) {
  const [mobileOpen, setMobileOpen] = useState(false), [accountOpen, setAccountOpen] = useState(false);
  const header = useRef(null), account = useRef(null), menuButton = useRef(null), accountButton = useRef(null);
  useEffect(() => { setMobileOpen(false); setAccountOpen(false); }, [routeKey, user]);
  useEffect(() => {
    function dismiss(event) {
      if (event.type === 'keydown' && event.key === 'Escape') {
        if (accountOpen) { setAccountOpen(false); accountButton.current?.focus(); }
        else if (mobileOpen) { setMobileOpen(false); menuButton.current?.focus(); }
      } else if (event.type === 'pointerdown') {
        if (!account.current?.contains(event.target)) setAccountOpen(false);
        if (!header.current?.contains(event.target)) setMobileOpen(false);
      }
    }
    document.addEventListener('keydown', dismiss); document.addEventListener('pointerdown', dismiss);
    return () => { document.removeEventListener('keydown', dismiss); document.removeEventListener('pointerdown', dismiss); };
  }, [mobileOpen, accountOpen]);
  return <><a className="skip-link" href="#main-content">Skip to content</a><header className="site-header" ref={header}>
    <div className="header-inner"><Brand />
      <button ref={menuButton} className="button secondary mobile-toggle" aria-expanded={mobileOpen} aria-controls="site-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}<span>{mobileOpen ? 'Close menu' : 'Menu'}</span></button>
      <nav id="site-navigation" className={`site-navigation ${mobileOpen ? 'is-open' : ''}`} aria-label="Main navigation">
        {(user ? destinations : destinations.filter(([key]) => key === 'openings')).map(([key, href, label, Icon]) => <a key={key} href={href} aria-current={current === key ? 'page' : undefined}><Icon size={17} aria-hidden="true" />{label}</a>)}
        {!user && <div className="public-account-links"><a href="/login">Log in</a><a className="button primary compact" href="/register">Register</a></div>}
      </nav>
      {user && <div className="account-control" ref={account} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false); }}>
        <button className="button secondary account-trigger" ref={accountButton} aria-label="Account" aria-expanded={accountOpen} aria-controls="account-actions" onClick={() => setAccountOpen(!accountOpen)}><UserRound size={18} aria-hidden="true" /><span>Account</span><ChevronDown size={14} aria-hidden="true" /></button>
        {accountOpen && <div className="account-popover" id="account-actions"><p className="eyebrow">ONE ROSTERLINK ACCOUNT</p><p className="account-address">{user.email}</p><a href="/workspace">My Workspace</a><a href="/profile/edit">Edit player profile</a><button onClick={logout} disabled={loggingOut}><LogOut size={16} aria-hidden="true" />{loggingOut ? 'Logging out…' : 'Log out'}</button></div>}
      </div>}
    </div>
  </header></>;
}
