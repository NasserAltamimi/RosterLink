import { t } from './i18n.js';
import { useState } from 'react';
import { Link2 } from 'lucide-react';
import { useToast } from './Toasts.jsx';

export default function CopyLink({ path, label = t('Copy link') }) {
  const notify = useToast();
  const [fallback, setFallback] = useState('');
  async function copy() {
    const url = new URL(path, location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      setFallback('');
      notify('Public link copied.');
    } catch {
      setFallback(url);
    }
  }
  return <div className="copy-link">
    <button className="button secondary" type="button" onClick={copy}><Link2 size={16} aria-hidden="true" />{label}</button>
    {fallback && <input className="copy-link-field" aria-label={t("Public link")} dir="ltr" value={fallback} readOnly onFocus={event => event.currentTarget.select()} />}
  </div>;
}
