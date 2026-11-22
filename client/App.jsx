import { t, useLanguage } from './i18n.js';
import { useEffect, useState } from 'react';
import { api, endSession } from './api.js';
import { resolveRoute, safeReturnTo } from '../shared/navigation.js';
import { publicProfileRoute } from '../shared/public-profile-route.js';
import { navigate, useLocation } from './navigation.js';
import Auth from './Auth.jsx';
import Landing from './Landing.jsx';
import SiteHeader from './SiteHeader.jsx';
import Workspace from './Workspace.jsx';
import PlayerWorkspace from './PlayerWorkspace.jsx';
import PublicProfile from './PublicProfile.jsx';
import PasswordRecovery from './PasswordRecovery.jsx';
import Recruitment from './Recruitment.jsx';
import Feed from './Feed.jsx';
import Tournaments from './Tournaments.jsx';
import { ApplicationList, ApplicationPage, Notifications } from './Applications.jsx';
import { Loading, Notice } from './components.jsx';
import { useToast } from './Toasts.jsx';

function Redirect({ href }) {
  useEffect(() => { navigate(href, { replace: true }); }, [href]);
  return <Loading />;
}

function RecoveryPage() {
  const [token] = useState(() => {
    const secret = location.pathname === '/reset-password' ? location.hash.slice(1) : '';
    if (secret) history.replaceState(null, '', location.pathname + location.search);
    return secret;
  });
  return <PasswordRecovery token={token} />;
}

export default function App() {
  const routeKey = useLocation(), path = routeKey.split('?')[0], route = resolveRoute(path);
  // Re-render the existing routes so form drafts and filters stay mounted.
  const language = useLanguage();
  const [session, setSession] = useState({ loading: true, user: null, error: null });
  const [loggingOut, setLoggingOut] = useState(false), [logoutError, setLogoutError] = useState(null);
  const [recoveryVisit, setRecoveryVisit] = useState(0);
  const notify = useToast();
  async function bootstrap() {
    setSession(previous => ({ ...previous, loading: true, error: null }));
    try { const { user } = await api('/auth/session'); setSession({ user, loading: false, error: null }); }
    catch (error) { setSession({ user: null, loading: false, error }); }
  }
  useEffect(() => {
    bootstrap();
    const expired = () => { setSession({ loading: false, user: null, error: null }); api('/auth/session').catch(() => {}); };
    const hashChanged = () => { if (location.pathname === '/reset-password' && location.hash) setRecoveryVisit(value => value + 1); };
    window.addEventListener('session-expired', expired); window.addEventListener('hashchange', hashChanged);
    return () => { window.removeEventListener('session-expired', expired); window.removeEventListener('hashchange', hashChanged); };
  }, []);
  useEffect(() => {
    const title = { feed: 'Feed', workspace: 'My Workspace', profile: 'My Profile', organizations: 'Organizations', management: 'Organization management', openings: 'Openings', tournaments: 'Tournaments', applications: 'My Applications', application: 'Application', applicants: 'Applicants', notifications: 'Notifications', auth: 'Account access', 'public-profile': 'Player profile', 'public-detail': 'Recruitment', recovery: 'Account recovery' }[route.page];
    document.title = `${t(title || 'Home')} — RosterLink`;
  }, [route.page, language]);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [path]);
  function authenticated(user) {
    setSession({ user, loading: false, error: null });
    const next = new URLSearchParams(location.search).get('next');
    navigate(safeReturnTo(next), { replace: true });
  }
  async function logout() {
    setLoggingOut(true); setLogoutError(null);
    try { await endSession(); setSession({ user: null, loading: false, error: null }); notify('Logged out.'); navigate('/login', { replace: true }); }
    catch (error) { setLogoutError(error); }
    finally { setLoggingOut(false); }
  }
  const user = session.user;
  let content;
  if (session.loading) content = <Loading />;
  else if (session.error) content = <><h1>{t("Let’s reconnect.")}</h1><Notice error={session.error} /><button className="button primary" onClick={bootstrap}>{t("Try again")}</button></>;
  else if (route.private && !user) content = <section className="card sign-in-state"><p className="eyebrow">{t("ONE ACCOUNT. EVERY OPPORTUNITY.")}</p><h1>{t("Log in to continue.")}</h1><p className="muted">{t("Use your RosterLink account for your player profile and organization or team management.")}</p><div className="heading-actions"><a className="button primary" href={`/login?next=${encodeURIComponent(routeKey)}`}>{t("Log in")}</a><a className="button secondary" href={`/register?next=${encodeURIComponent(routeKey)}`}>{t("Create account")}</a></div></section>;
  else if (route.page === 'auth') content = user ? <Redirect href={safeReturnTo(new URLSearchParams(location.search).get('next'))} /> : <Auth key={route.mode} mode={route.mode} onAuthenticated={authenticated} />;
  else if (route.page === 'recovery') content = <RecoveryPage key={`${routeKey}-${recoveryVisit}`} />;
  else if (route.page === 'workspace') content = user ? <Workspace key={user.id} /> : <Landing onAuthenticated={authenticated} />;
  else if (route.page === 'profile') content = <PlayerWorkspace key={user.id} tab={route.tab} />;
  else if (route.page === 'public-profile') content = <PublicProfile profileId={publicProfileRoute(path)?.profileId} user={user} />;
  else if (route.page === 'feed') content = <Feed key={user?.id || 'guest'} user={user} />;
  else if (route.page === 'tournaments') content = <Tournaments />;
  else if (route.page === 'applications' || route.page === 'applicants') content = <ApplicationList key={path} openingId={route.id} />;
  else if (route.page === 'application') content = <ApplicationPage key={route.id} id={route.id} />;
  else if (route.page === 'notifications') content = <Notifications />;
  else if (route.page === 'legacy-management') content = <Redirect href="/organizations" />;
  else if (['organizations', 'management', 'openings', 'public-detail'].includes(route.page)) content = <Recruitment route={route} routeKey={routeKey} user={user} />;
  else content = <section className="card empty-state"><h1>{t("Page not found.")}</h1><p className="muted">{t("This link does not lead to a RosterLink page.")}</p><a className="button primary" href={user ? '/workspace' : '/'}>{t("Back to RosterLink")}</a></section>;
  const authLayout = !session.loading && !session.error && (route.page === 'recovery' || (!user && route.page === 'auth'));
  const landing = !session.loading && !session.error && !user && path === '/';
  return <><SiteHeader user={user} current={user && route.page === 'workspace' ? 'workspace' : route.destination} routeKey={routeKey} logout={logout} loggingOut={loggingOut} />
    <main id="main-content" tabIndex={-1} className={authLayout ? 'account-page' : landing ? 'site-landing' : `app-main${user ? ' app-main-signed-in' : ''}`}><Notice error={logoutError} />{content}
      {!authLayout && <footer className="workspace-footer"><span>RosterLink © {new Date().getFullYear()}</span><span>{t("Esports recruitment")}</span></footer>}
    </main></>;
}
