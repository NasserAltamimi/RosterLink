import { useState } from 'react';
import { api } from './api.js';
import { Notice } from './components.jsx';
import { useToast } from './Toasts.jsx';

function ImageUpload({ profile, kind, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const notify = useToast();
  const title = kind === 'profile' ? 'Profile image' : 'Header image';
  const url = kind === 'profile' ? profile.profileImageUrl : profile.headerImageUrl;
  async function upload(event) {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    setError(null);
    if (file.size > 5 * 1024 * 1024) { setError('Choose an image smaller than 5 MB.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPEG, PNG, or WebP image.'); return; }
    setBusy(true);
    try {
      const body = new FormData(); body.append('image', file);
      const result = await api(`/profiles/${profile.id}/images/${kind}`, { method: 'POST', body });
      onSaved(result.profile); notify(`${title} saved.`);
    } catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError(null);
    try { const result = await api(`/profiles/${profile.id}/images/${kind}`, { method: 'DELETE' }); onSaved(result.profile); notify(`${title} removed.`); }
    catch (error) { setError(error); }
    finally { setBusy(false); }
  }
  return <div className="image-editor">
    <div className={`image-sample ${kind}`}>{url ? <img src={url} alt={`Your ${title.toLowerCase()}`} /> : <span aria-hidden="true">{kind === 'profile' ? '↗' : '＋'}</span>}</div>
    <h3>{title}</h3><p className="muted small">{kind === 'profile' ? 'A recognizable face or player identity.' : 'Set the scene for your profile.'}</p>
    <label className={`button secondary upload-label ${busy ? 'disabled' : ''}`}>{busy ? 'Saving…' : url ? `Replace ${title.toLowerCase()}` : `Upload ${title.toLowerCase()}`}<input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Upload ${title.toLowerCase()}`} onChange={upload} disabled={busy} /></label>
    {url && <button type="button" className="text-button danger" disabled={busy} onClick={remove}>Remove {title.toLowerCase()}</button>}
    <Notice error={error} />
  </div>;
}

export default function Images({ profile, onSaved }) {
  return <section className="card form-card"><div className="section-heading"><div><p className="eyebrow">MAKE IT YOURS</p><h2>Profile visuals</h2></div><span className="step-number">02</span></div>
    <p className="muted">JPEG, PNG, or WebP. Maximum 5 MB and 20 megapixels each. Images are saved as WebP.</p>
    <div className="image-grid"><ImageUpload profile={profile} kind="profile" onSaved={onSaved} /><ImageUpload profile={profile} kind="header" onSaved={onSaved} /></div>
  </section>;
}
