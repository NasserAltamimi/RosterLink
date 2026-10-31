import { useSyncExternalStore } from 'react';

const changed = 'rosterlink:navigation';
const subscribe = callback => {
  window.addEventListener('popstate', callback);
  window.addEventListener(changed, callback);
  return () => { window.removeEventListener('popstate', callback); window.removeEventListener(changed, callback); };
};
export const useLocation = () => useSyncExternalStore(subscribe, () => location.pathname + location.search);
export function navigate(href, { replace = false } = {}) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) return location.assign(url.href);
  history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new Event(changed));
}
// Preserve ordinary link semantics: new tabs, downloads, external links and hashes.
export function installNavigation() {
  document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || url.hash || url.pathname.startsWith('/api/')) return;
    event.preventDefault(); navigate(url.href);
  });
}
