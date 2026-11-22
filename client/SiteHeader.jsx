import { getLanguage, setLanguage, t } from './i18n.js';
import { Fragment, useEffect, useRef, useState } from 'react';
import { Bell, Building2, ChevronDown, ClipboardList, Globe, LayoutDashboard, Newspaper, LogOut, Menu, Search, Trophy, UserRound, X } from 'lucide-react';
import { Brand } from './components.jsx';
import { api } from './api.js';

const destinations = [
  ['workspace', '/workspace', 'My Workspace', LayoutDashboard],
  ['profile', '/profile', 'My Profile', UserRound],
  ['applications', '/applications', 'Applications', ClipboardList],
  ['organizations', '/organizations', 'Organizations', Building2],
  ['feed', '/feed', 'Feed', Newspaper],
  ['openings', '/openings', 'Openings', Search],
  ['tournaments', '/tournaments', 'Tournaments', Trophy],
];

function NotificationLink({ current, routeKey, userId }) {
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    let active = true;
    async function refresh() {
      if (document.hidden) return;
      try {
        const data = await api('/applications/notifications/unread');
        if (active) setUnread(data.unread);
      } catch { /* Navigation remains available when the indicator cannot refresh. */ }
    }
    refresh();
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [routeKey, userId]);
  return <a className="button secondary notification-link" href="/notifications" aria-label={t("Notifications")} aria-description={unread ? t("Unread updates available") : undefined} title={t("Notifications")} aria-current={current ? 'page' : undefined}>
    <Bell size={18} aria-hidden="true" />{unread && <span className="unread-dot" aria-hidden="true" />}
  </a>;
}

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
  const locationTitle = destinations.find(([key]) => key === current)?.[2] || (current === 'notifications' ? 'Notifications' : '');
  const nextLanguage = getLanguage() === 'en' ? 'ar' : 'en';
  return <><a className="skip-link" href="#main-content">{t("Skip to content")}</a><header className={`site-header ${user ? 'site-header-workspace' : 'site-header-public'}`} ref={header}>
    <div className="header-inner"><Brand />
      <button ref={menuButton} className="button secondary mobile-toggle" aria-label={mobileOpen ? t("Close menu") : t("Menu")} aria-expanded={mobileOpen} aria-controls="site-navigation" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}<span>{mobileOpen ? t("Close menu") : t("Menu")}</span></button>
      <nav id="site-navigation" className={`site-navigation ${mobileOpen ? 'is-open' : ''}`} aria-label={t("Main navigation")}>
        {(user ? destinations : destinations.slice(-3)).map(([key, href, label, Icon]) => <Fragment key={key}>
          {user && (key === 'workspace' || key === 'feed') && <span className="nav-group-label">{key === 'workspace' ? t("Your workspace") : t("Discover")}</span>}
          <a href={href} data-destination={key} aria-current={current === key ? 'page' : undefined}><Icon size={18} aria-hidden="true" />{t(label)}</a>
        </Fragment>)}
        {!user && <div className="public-account-links"><a href="/login">{t("Log in")}</a><a className="button primary compact" href="/register">{t("Register")}</a></div>}
      </nav>
      {user && locationTitle && <span className="header-context">{t(locationTitle)}</span>}
      <div className="header-user-tools">
        <button type="button" className="button secondary interface-language" lang={nextLanguage} dir={nextLanguage === 'ar' ? 'rtl' : 'ltr'} onClick={() => setLanguage(nextLanguage)}>
          <Globe size={16} aria-hidden="true" />{nextLanguage === 'ar' ? 'العربية' : 'English'}
        </button>
        {user && <><NotificationLink key={user.id} current={current === 'notifications'} routeKey={routeKey} userId={user.id} /><div className="account-control" ref={account} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false); }}>
        <button className="button secondary account-trigger" ref={accountButton} aria-label={t("Account")} aria-expanded={accountOpen} aria-controls="account-actions" onClick={() => setAccountOpen(!accountOpen)}><UserRound size={18} aria-hidden="true" /><span>{t("Account")}</span><ChevronDown size={14} aria-hidden="true" /></button>
        {accountOpen && <div className="account-popover" id="account-actions"><p className="account-address"><bdi>{user.email}</bdi></p><a href="/workspace">{t("My Workspace")}</a><a href="/profile/edit">{t("Edit player profile")}</a><button onClick={logout} disabled={loggingOut}><LogOut size={16} aria-hidden="true" />{loggingOut ? t("Logging out…") : t("Log out")}</button></div>}
      </div></>}
      </div>
    </div>
  </header></>;
}
