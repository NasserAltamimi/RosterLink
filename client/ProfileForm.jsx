import { useRef, useState } from 'react';
import { api } from './api.js';
import { Field, Notice, Submit } from './components.jsx';
import LanguagePicker from './LanguagePicker.jsx';
import { useToast } from './Toasts.jsx';
import { fromLanguageSelection, profileLanguageLimits, toLanguageSelection, validateLanguageSelection } from '../shared/languages.js';

// Server errors for one language item arrive as languages.<index>.
const languageError = fields => fields?.languages || Object.entries(fields || {}).find(([key]) => key.startsWith('languages.'))?.[1];

export default function ProfileForm({ profile, onSaved }) {
  const notify = useToast();
  const [values, setValues] = useState({ displayName: profile?.displayName || '', bio: profile?.bio || '', region: profile?.region || '' });
  const [languages, setLanguages] = useState(() => toLanguageSelection(profile?.languages));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const languageInput = useRef(null);
  const change = key => e => setValues({ ...values, [key]: e.target.value });
  async function submit(event) {
    event.preventDefault(); setError(null);
    const languageProblem = validateLanguageSelection(languages, profileLanguageLimits);
    if (languageProblem) {
      setError({ message: 'Please check the highlighted fields.', fields: { languages: languageProblem } });
      languageInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      const body = { ...values, languages: fromLanguageSelection(languages) };
      const result = await api(profile ? `/profiles/${profile.id}` : '/profiles', { method: profile ? 'PUT' : 'POST', body });
      // Show the saved (trimmed, de-duplicated) languages after an edit.
      if (profile) setLanguages(toLanguageSelection(result.profile.languages));
      onSaved(result); notify(profile ? 'Profile saved.' : 'Profile created.');
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <section className="card form-card"><div className="section-heading"><div><p className="eyebrow">THE PLAYER BEHIND THE HANDLE</p><h2>{profile ? 'Your player details' : 'Create your player profile'}</h2></div><span className="step-number">01</span></div>
    <p className="muted">Give future teammates a sense of who you are. Required fields are marked *.</p>
    <form onSubmit={submit}>
      <Notice error={error} />
      <div className="form-grid">
        <Field label="Gaming / display name" required maxLength={50} minLength={2} value={values.displayName} onChange={change('displayName')} error={error?.fields?.displayName} autoComplete="nickname" dir="auto" placeholder="Your in-game name" />
        <Field label="Region / country" required maxLength={80} value={values.region} onChange={change('region')} error={error?.fields?.region} dir="auto" placeholder="e.g. Saudi Arabia / MENA" />
      </div>
      <LanguagePicker label="Languages" selection={languages} onChange={setLanguages} disabled={busy} focusRef={languageInput} customMaxLength={profileLanguageLimits.maxItems * (profileLanguageLimits.maxItemLength + 2)} error={languageError(error?.fields)} help={`Choose every language you speak. Up to ${profileLanguageLimits.maxItems} languages.`} />
      <Field label="About you" as="textarea" rows={5} maxLength={1000} value={values.bio} onChange={change('bio')} error={error?.fields?.bio} help={`${values.bio.length}/1000 characters`} dir="auto" placeholder="Your play style, competitive goals, and what you bring to a team." />
      <div className="form-actions"><span className="muted small">Only you can edit your profile.</span><Submit busy={busy}>{profile ? 'Save profile' : 'Create profile'}</Submit></div>
    </form>
  </section>;
}
