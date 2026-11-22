import { t } from './i18n.js';
import { useEffect, useState } from 'react';
import Auth from './Auth.jsx';
import { api } from './api.js';
import { Field, Notice, Loading, PasswordField } from './components.jsx';

export default function PasswordRecovery({ token }) {
  const reset = location.pathname === '/reset-password';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [checking, setChecking] = useState(reset);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState('');
  const [linkValid, setLinkValid] = useState(false);
  useEffect(() => {
    if (!reset) return;
    let active = true;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setError(new Error('This reset link is invalid. Request a new link.')); setChecking(false); return;
    }
    api('/auth/reset-password/validate', { method: 'POST', body: { token } })
      .then(() => { if (active) setLinkValid(true); })
      .catch(error => { if (active) setError(error); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [reset, token]);
  async function submit(event) {
    event.preventDefault(); setError(null); setBusy(true);
    if (reset && password !== confirmPassword) {
      setError({ message: 'Passwords must match.', fields: { confirmPassword: 'Passwords must match.' } });
      setBusy(false); return;
    }
    try {
      const result = await api(`/auth/${reset ? 'reset-password' : 'forgot-password'}`, {
        method: 'POST', body: reset ? { token, password, confirmPassword } : { email },
      });
      if (reset) location.replace('/login?passwordReset=success');
      else setMessage(result.message);
    } catch (error) {
      setError(error);
      if (reset && (error.status === 410 || (error.status === 400 && !Object.keys(error.fields || {}).length))) setLinkValid(false);
    } finally { setBusy(false); }
  }
  return <Auth>
    <p className="eyebrow">{t("ACCOUNT RECOVERY")}</p>
    <h1>{reset ? t("Choose a new password.") : t("Forgot your password?")}</h1>
    <p className="muted">{reset ? t("Use a memorable passphrase to get back to your next chapter.") : t("Enter your account email and we will send you a reset link.")}</p>
    <Notice error={error} />
    {message && <Notice>{t(message)}</Notice>}
    {checking ? <Loading>{t("Checking your reset link…")}</Loading> : (!reset || linkValid) && <form onSubmit={submit} aria-busy={busy}>
      {reset ? <>
        <PasswordField label={t("New password")} name="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} error={error?.fields?.password} help={t("Use 12–128 characters. A memorable passphrase works well.")} />
        <PasswordField label={t("Confirm new password")} name="confirmPassword" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} error={error?.fields?.confirmPassword} />
      </> : <Field label={t("Email address")} name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setMessage(''); }} error={error?.fields?.email} placeholder="you@example.com" />}
      <button className="button primary full" type="submit" disabled={busy}>{busy ? (reset ? t("Resetting password…") : t("Sending reset link…")) : reset ? t("Reset password") : t("Send reset link")}</button>
    </form>}
    {reset && !checking && !linkValid && <p><a className="text-button" href="/forgot-password">{t("Request a new reset link")}</a></p>}
    <p><a className="text-button" href="/login">{t("Back to log in")}</a></p>
  </Auth>;
}
