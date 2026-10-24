import { useState } from 'react';
import { api } from './api.js';
import { Field, Notice, Submit } from './components.jsx';

export default function ProfileForm({ profile, onSaved }) {
  const [values, setValues] = useState({ displayName: profile?.displayName || '', bio: profile?.bio || '', region: profile?.region || '', languages: profile?.languages.join(', ') || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const change = key => e => { setValues({ ...values, [key]: e.target.value }); setSaved(false); };
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null); setSaved(false);
    try {
      const body = { ...values, languages: values.languages.split(',').map(value => value.trim()).filter(Boolean) };
      const result = await api(profile ? `/profiles/${profile.id}` : '/profiles', { method: profile ? 'PUT' : 'POST', body });
      onSaved(result); setSaved(true);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <section className="card form-card"><div className="section-heading"><div><p className="eyebrow">THE PLAYER BEHIND THE HANDLE</p><h2>{profile ? 'Your player details' : 'Create your player profile'}</h2></div><span className="step-number">01</span></div>
    <p className="muted">Give future teammates a sense of who you are. Required fields are marked *.</p>
    <form onSubmit={submit}>
      <Notice error={error} />{saved && <Notice>Profile saved. Your changes are stored.</Notice>}
      <div className="form-grid">
        <Field label="Gaming / display name" required maxLength={50} minLength={2} value={values.displayName} onChange={change('displayName')} error={error?.fields?.displayName} autoComplete="nickname" dir="auto" placeholder="Your in-game name" />
        <Field label="Region / country" required maxLength={80} value={values.region} onChange={change('region')} error={error?.fields?.region} dir="auto" placeholder="e.g. Saudi Arabia / MENA" />
      </div>
      <Field label="Languages" required maxLength={326} value={values.languages} onChange={change('languages')} error={error?.fields?.languages} help="Separate languages with commas, e.g. Arabic, English. Up to 8 languages." dir="auto" placeholder="Arabic, English" />
      <Field label="About you" as="textarea" rows={5} maxLength={1000} value={values.bio} onChange={change('bio')} error={error?.fields?.bio} help={`${values.bio.length}/1000 characters`} dir="auto" placeholder="Your play style, competitive goals, and what you bring to a team." />
      <div className="form-actions"><span className="muted small">Only you can edit your profile.</span><Submit busy={busy}>{profile ? 'Save profile' : 'Create profile'}</Submit></div>
    </form>
  </section>;
}
