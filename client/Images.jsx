import { t } from './i18n.js';
import { useState } from 'react';
import { api } from './api.js';
import { Notice } from './components.jsx';
import { useToast } from './Toasts.jsx';
import IdentityMark from './IdentityMark.jsx';

export function ImageUpload({ title, kind, url, path, onSaved, help, name }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const notify = useToast();
  const image = t(title).toLowerCase();
  const uploadLabel = t('Upload {image}', { image });
  const previewLabel = t('Your {image}', { image });
  async function upload(event) {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG, or WebP image.'); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.append('image', file);
      const result = await api(path, { method: 'POST', body });
      onSaved(result); notify(`${title} saved.`);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { const result = await api(path, { method: 'DELETE' }); onSaved(result); notify(`${title} removed.`); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <div className="image-editor">
    <div className={`image-sample ${kind}`}>{name ? <IdentityMark name={name} src={url} alt={previewLabel} className="org-mark" /> : url ? <img src={url} alt={previewLabel} /> : <span aria-hidden="true">＋</span>}</div>
    <h3>{t(title)}</h3><p className="muted small">{help}</p>
    <label className={`button secondary upload-label ${busy ? 'disabled' : ''}`}>{busy ? t("Saving…") : url ? t('Replace {image}', { image }) : uploadLabel}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={uploadLabel} onChange={upload} disabled={busy} /></label>
    {url && <button type="button" className="text-button danger" disabled={busy} onClick={remove}>{t('Remove {image}', { image })}</button>}
    <Notice error={error} />
  </div>;
}

export default function Images({ profile, onSaved }) {
  return <section className="card form-card"><div className="section-heading"><h2>{t("Profile visuals")}</h2></div>
    <p className="muted">{t("JPEG, PNG, or WebP. Maximum 5 MB and 20 megapixels each. Images are saved as WebP.")}</p>
    <div className="image-grid">
      <ImageUpload kind="profile" title="Profile image" url={profile.profileImageUrl} path={`/profiles/${profile.id}/images/profile`} onSaved={result => onSaved(result.profile)} help={t("A recognizable face or player identity.")} />
      <ImageUpload kind="header" title="Header image" url={profile.headerImageUrl} path={`/profiles/${profile.id}/images/header`} onSaved={result => onSaved(result.profile)} help={t("Set the scene for your profile.")} />
    </div>
  </section>;
}
