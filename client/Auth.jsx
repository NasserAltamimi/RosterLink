import { getLanguage, t } from './i18n.js';
import { useState } from 'react';
import { api } from './api.js';
import { Field, Notice, PasswordField } from './components.jsx';
import { ArrowUpRight } from 'lucide-react';
import { useToast } from './Toasts.jsx';

export default function Auth({ onAuthenticated, children, mode: initialMode, embedded = false }) {
  const notify = useToast();
  const mode = initialMode || (location.pathname === '/login' ? 'login' : 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const register = mode === 'register';
  async function submit(event) {
    event.preventDefault(); setError(null); setBusy(true);
    try {
      const result = await api(`/auth/${mode}`, { method: 'POST', body: { email, password } });
      // The account exists / the session is active once the API succeeds, even if loading the profile later fails.
      notify(register ? 'Account created.' : 'Logged in successfully.');
      await onAuthenticated(result.user, mode);
    }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  const Heading = embedded ? 'h2' : 'h1';
  const accountForm = <div className="auth-card">
      {children || <>
        <Heading>{register ? t("Make your first move.") : t("Good to have you back.")}</Heading>
        <p className="muted">{register ? t("Create one account for your profile and teams.") : t("Log in to your RosterLink workspace.")}</p>
        <nav className="auth-tabs" aria-label={t("Account access")}><a aria-current={register ? 'page' : undefined} href={`/register${location.search}`}>{t("Create account")}</a><a aria-current={!register ? 'page' : undefined} href={`/login${location.search}`}>{t("Log in")}</a></nav>
        <form onSubmit={submit}>
          {location.search === '?passwordReset=success' && <Notice>{t("Your password has been reset. Log in with your new password.")}</Notice>}
          <Notice error={error} />
          <Field label={t("Email address")} name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} error={error?.fields?.email} placeholder="you@example.com" />
          <PasswordField label={t("Password")} name="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} error={error?.fields?.password} help={register ? t("Use 12–128 characters. A memorable passphrase works well.") : undefined} />
          <button className="button primary full" disabled={busy} type="submit">{busy ? t("Please wait…") : register ? t("Create your account") : t("Log in")}<ArrowUpRight size={18} aria-hidden="true" /></button>
        </form>
        {!register && <p><a className="text-button" href="/forgot-password">{t("Forgot password?")}</a></p>}
      </>}
    </div>;
  if (embedded) return accountForm;
  return <div className="auth-layout">
    <section className="auth-story"><div className="auth-copy"><p className="eyebrow">RosterLink</p><p className="auth-display">{getLanguage() === 'ar' ? <>انضم إلى <br />الفريق<span>.</span></> : <>Get on <br />the roster<span>.</span></>}</p><a href="/openings">{t("Explore openings") + ' '}<ArrowUpRight size={16} aria-hidden="true" /></a></div></section>
    <section className="auth-panel">{accountForm}</section>
  </div>;
}
