import { useState } from 'react';

export default function IdentityMark({ name = '', src, className = '', alt = '' }) {
  const [failed, setFailed] = useState(null);
  const words = name.trim().split(/\s+/);
  const initials = words.length > 1
    ? [words[0], words.at(-1)].map(word => Array.from(word)[0]).join('')
    : Array.from(words[0]).slice(0, 2).join('');
  return <span className={`identity-mark ${className}`} aria-hidden={alt ? undefined : 'true'}>
    {src && failed !== src ? <img src={src} alt={alt} onError={() => setFailed(src)} /> : <span>{initials.toLocaleUpperCase() || 'R'}</span>}
  </span>;
}
