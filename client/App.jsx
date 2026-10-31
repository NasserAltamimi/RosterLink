import { useEffect, useState } from 'react';
import { api, endSession } from './api.js';
import { resolveRoute, safeReturnTo } from '../shared/navigation.js';
import { publicProfileRoute } from '../shared/public-profile-route.js';
import { navigate, useLocation } from './navigation.js';
import Auth from './Auth.jsx';
import SiteHeader from './SiteHeader.jsx';
import Workspace from './Workspace.jsx';
import PlayerWorkspace from './PlayerWorkspace.jsx';
import PublicProfile from './PublicProfile.jsx';
import PasswordRecovery from './PasswordRecovery.jsx';
import Recruitment from './Recruitment.jsx';
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
    document.title = `${{ workspace: 'My Workspace', profile: 'My Profile', organizations: 'Organizations', management: 'Organization management', openings: 'Openings', auth: 'Account access' }[route.page] || 'RosterLink'} — RosterLink`;
    window.scrollTo(0, 0);
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [path, route.page]);
  function authenticated(user, mode) {
    setSession({ user, loading: false, error: null });
    const next = new URLSearchParams(location.search).get('next');
    navigate(mode === 'register' ? '/workspace' : safeReturnTo(next), { replace: true });
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
  else if (session.error) content = <><h1>Let’s reconnect.</h1><Notice error={session.error} /><button className="button primary" onClick={bootstrap}>Try again</button></>;
  else if (route.private && !user) content = <section className="card sign-in-state"><p className="eyebrow">ONE ACCOUNT. EVERY OPPORTUNITY.</p><h1>Log in to continue.</h1><p className="muted">Use your RosterLink account for your player profile and organization or team management.</p><div className="heading-actions"><a className="button primary" href={`/login?next=${encodeURIComponent(routeKey)}`}>Log in</a><a className="button secondary" href={`/register?next=${encodeURIComponent(routeKey)}`}>Create account</a></div></section>;
  else if (route.page === 'auth') content = user ? <Redirect href={safeReturnTo(new URLSearchParams(location.search).get('next'))} /> : <Auth key={route.mode} mode={route.mode} onAuthenticated={authenticated} />;
  else if (route.page === 'recovery') content = <RecoveryPage key={`${routeKey}-${recoveryVisit}`} />;
  else if (route.page === 'workspace') content = user ? <Workspace key={user.id} /> : <Auth mode="register" onAuthenticated={authenticated} />;
  else if (route.page === 'profile') content = <PlayerWorkspace key={user.id} tab={route.tab} />;
  else if (route.page === 'public-profile') content = <PublicProfile profileId={publicProfileRoute(path)?.profileId} />;
  else if (route.page === 'legacy-management') content = <Redirect href="/organizations" />;
  else if (['organizations', 'management', 'openings', 'public-detail'].includes(route.page)) content = <Recruitment route={route} routeKey={routeKey} user={user} />;
  else content = <section className="card empty-state"><h1>Page not found.</h1><p className="muted">This link does not lead to a RosterLink page.</p><a className="button primary" href={user ? '/workspace' : '/'}>Back to RosterLink</a></section>;
  const authLayout = !session.loading && !session.error && (route.page === 'recovery' || (!user && (route.page === 'auth' || path === '/')));
  return <><SiteHeader user={user} current={user && route.page === 'workspace' ? 'workspace' : route.destination} routeKey={routeKey} logout={logout} loggingOut={loggingOut} />
    <main id="main-content" tabIndex={-1} className={authLayout ? 'account-page' : 'app-main'}><Notice error={logoutError} />{content}
      {!authLayout && <footer className="workspace-footer"><span>Your next chapter starts with you.</span><span>RosterLink © {new Date().getFullYear()}</span></footer>}
    </main></>;
}
