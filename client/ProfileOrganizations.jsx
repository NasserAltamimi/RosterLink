import { isolate, t } from './i18n.js';
import { useState } from 'react';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { api } from './api.js';
import { Loading, Notice } from './components.jsx';
import useResource from './useResource.js';
import { useToast } from './Toasts.jsx';
import IdentityMark from './IdentityMark.jsx';

export default function ProfileOrganizations({ profileId }) {
  const path = `/profiles/${profileId}/affiliations`;
  const result = useResource(path);
  const [busy, setBusy] = useState(null), [error, setError] = useState(null);
  const [changes, setChanges] = useState({});
  const notify = useToast();
  async function publish(item, published) {
    setBusy(item.key); setError(null);
    setChanges(previous => ({ ...previous, [item.key]: published }));
    try {
      await api(path, { method: 'PATCH', body: { key: item.key, published } });
      notify(published ? 'Affiliation visible on your public profile.' : 'Affiliation hidden from your public profile.');
    } catch (error) {
      setChanges(previous => ({ ...previous, [item.key]: !published }));
      setError(error);
    }
    finally { setBusy(null); }
  }
  return <section className="card form-card profile-organizations">
    <div className="section-heading"><div><h2><Building2 size={21} aria-hidden="true" />{' ' + t("My Organizations")}</h2><p className="muted">{t("Manage your assigned teams and choose which roles appear on your public profile.")}</p></div><a className="button secondary compact" href="/organizations">{t("Organizations") + ' '}<ArrowUpRight size={15} aria-hidden="true" /></a></div>
    <Notice error={error || result.error} />
    {result.loading ? <Loading>{t("Loading management roles…")}</Loading> : result.error ? <button className="button secondary" onClick={result.reload}>{t("Try again")}</button>
      : !result.data.affiliations.length ? <p className="muted">{t("Your organization and team roles will appear here.")}</p>
        : <ul className="affiliation-list">{result.data.affiliations.map(item => {
          const href = `/manage/organizations/${item.organizationId}${item.teamId ? '/teams/' + item.teamId : ''}`;
          return <li key={item.key}>
            <div className="affiliation-identity"><IdentityMark className="org-mark" name={item.organization} src={item.logoUrl} />
              <div><a className="affiliation-name" href={href} dir="auto">{item.team || item.organization}</a>
                <p className="muted small" dir="auto">{t(item.role)}{item.team && <> · <bdi>{item.organization}</bdi></>}</p></div></div>
            <label className="affiliation-toggle"><input type="checkbox" checked={changes[item.key] ?? item.published} disabled={Boolean(busy)} onChange={event => publish(item, event.target.checked)} /><span>{t("Show on public profile")}<span className="sr-only"> {t("for {name}", { name: isolate(item.team || item.organization) })}</span></span></label>
          </li>;
        })}</ul>}
  </section>;
}
