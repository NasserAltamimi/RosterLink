import { useState } from 'react';
import { api } from './api.js';
import { Field, Notice, Brand } from './components.jsx';
import { useToast } from './Toasts.jsx';

export default function Auth({ onAuthenticated, children, mode: initialMode }) {
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
  return <div className="auth-layout">
    <section className="auth-story">
      <Brand />
      <div className="auth-copy"><p className="eyebrow light">YOUR NEXT CHAPTER IN ESPORTS</p>
        <h1>Great teams start<br />with a player<br /><em>like you.</em></h1>
        <p>Build your player profile. Lead an organization.<br />One account for your next opportunity.</p>
        <div className="journey"><span className="journey-active">01 <b>Your profile</b></span><span>02 <b>Your team</b></span><span>03 <b>Your next chapter</b></span></div>
      </div>
      <p className="auth-footer">A place for every competitive player. From day one.</p>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        {children || <>
        <p className="eyebrow">WELCOME TO ROSTERLINK</p>
        <h2>{register ? 'Make your first move.' : 'Good to have you back.'}</h2>
        <p className="muted">{register ? 'Create a player profile, an organization, or both. Start with one account.' : 'Your player profile and management access, together in one account.'}</p>
        <nav className="auth-tabs" aria-label="Account access"><a aria-current={register ? 'page' : undefined} href={`/register${location.search}`}>Create account</a><a aria-current={!register ? 'page' : undefined} href={`/login${location.search}`}>Log in</a></nav>
        <form onSubmit={submit}>
          {location.search === '?passwordReset=success' && <Notice>Your password has been reset. Log in with your new password.</Notice>}
          <Notice error={error} />
          <Field label="Email address" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} error={error?.fields?.email} placeholder="you@example.com" />
          <Field label="Password" name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={register ? 12 : 1} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} error={error?.fields?.password} help={register ? 'Use 12–128 characters. A memorable passphrase works well.' : undefined} />
          <button className="button primary full" disabled={busy} type="submit">{busy ? 'Please wait…' : register ? 'Create your account' : 'Log in'}<span aria-hidden="true">↗</span></button>
        </form>
        {!register && <p><a className="text-button" href="/forgot-password">Forgot password?</a></p>}
        <p className="auth-note">Your profile starts with information you provide.<br />An external account or verified status is not required.</p>
        </>}
      </div>
    </section>
  </div>;
}
