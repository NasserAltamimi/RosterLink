import { t } from './i18n.js';
import { useId, useState } from 'react';
import { api } from './api.js';
import { Notice, Submit } from './components.jsx';
import { useToast } from './Toasts.jsx';
import { publicFieldOptions } from '../shared/profile-privacy.js';

const groups = [
  ['profile', 'Your profile', 'Turn off anything you want to keep off your public profile. Your display name and list of games are always shown.'],
  ['game', 'Your game profiles', 'Applies to every game on your public profile.'],
];

function Toggle({ label, help, checked, onChange, disabled }) {
  const id = useId();
  return <div className="toggle-row">
    <span className="toggle-text"><label className="toggle-label" htmlFor={id}>{label}</label>{help && <span className="muted small" id={`${id}-help`}>{help}</span>}</span>
    <input id={id} type="checkbox" role="switch" checked={checked} onChange={event => onChange(event.target.checked)} disabled={disabled} aria-describedby={help ? `${id}-help` : undefined} />
  </div>;
}

// SF-08: recruiting availability and which fields appear on the shared public profile.
export default function PrivacySettings({ profile, onSaved }) {
  const notify = useToast();
  const [openToOffers, setOpenToOffers] = useState(profile.openToOffers);
  const [publicFields, setPublicFields] = useState(profile.publicFields);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(null);
    try {
      const result = await api(`/profiles/${profile.id}/settings`, { method: 'PATCH', body: { openToOffers, publicFields } });
      onSaved(result); notify('Recruiting and privacy settings saved.');
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <section className="card form-card"><div className="section-heading"><h2>{t("Recruiting & Privacy")}</h2></div>
    <p className="muted">{t("Choose what people see on your shared public profile. You always see everything here.")}</p>
    <form onSubmit={submit}>
      <Notice error={error} />
      <fieldset className="toggle-group"><legend>{t("Recruiting")}</legend>
        <Toggle label={t("Open to offers")} help={t("Shows an “Open to offers” badge so teams know you are looking.")} checked={openToOffers} onChange={setOpenToOffers} disabled={busy} />
      </fieldset>
      {groups.map(([group, legend, note]) => <fieldset className="toggle-group" key={group}><legend>{t(legend)}</legend><p className="muted small">{t(note)}</p>
        {publicFieldOptions.filter(option => option.group === group).map(option => <Toggle key={option.key} label={t(option.label)} help={t(option.help)} checked={publicFields[option.key]} onChange={value => setPublicFields(previous => ({ ...previous, [option.key]: value }))} disabled={busy} />)}
      </fieldset>)}
      <div className="form-actions"><a className="text-button" href={`/p/${profile.id}`} target="_blank" rel="noopener">{t("Preview public profile ↗")}</a><Submit busy={busy}>{t("Save settings")}</Submit></div>
    </form>
  </section>;
}
