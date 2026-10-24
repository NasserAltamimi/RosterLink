import { useState } from 'react';
import { api } from './api.js';
import { Field, Notice, Brand } from './components.jsx';

export default function Auth({ onAuthenticated, children }) {
  const [mode, setMode] = useState(location.pathname === '/login' ? 'login' : 'register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const register = mode === 'register';
  async function submit(event) {
    event.preventDefault(); setError(null); setBusy(true);
    try { const result = await api(`/auth/${mode}`, { method: 'POST', body: { email, password } }); await onAuthenticated(result.user); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  function changeMode(next) { setMode(next); setPassword(''); setError(null); }
  return <main className="auth-layout">
    <section className="auth-story">
      <Brand />
      <div className="auth-copy"><p className="eyebrow light">YOUR NEXT CHAPTER IN ESPORTS</p>
        <h1>Great teams start<br />with a player<br /><em>like you.</em></h1>
        <p>Build your player profile. Tell your story.<br />Be ready for the next opportunity.</p>
        <div className="journey"><span className="journey-active">01 <b>Your profile</b></span><span>02 <b>Your team</b></span><span>03 <b>Your next chapter</b></span></div>
      </div>
      <p className="auth-footer">A place for every competitive player. From day one.</p>
    </section>
    <section className="auth-panel">
      <div className="auth-card">
        {children || <>
        <p className="eyebrow">WELCOME TO ROSTERLINK</p>
        <h2>{register ? 'Make your first move.' : 'Good to have you back.'}</h2>
        <p className="muted">{register ? 'Start with your profile. No competitive record required.' : 'Log in to continue building your player profile.'}</p>
        <div className="auth-tabs" aria-label="Account access"><button type="button" aria-pressed={register} onClick={() => changeMode('register')} disabled={busy}>Create account</button><button type="button" aria-pressed={!register} onClick={() => changeMode('login')} disabled={busy}>Log in</button></div>
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
  </main>;
}
