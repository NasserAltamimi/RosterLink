export function liquipediaPageUrl(wiki, page) {
  if (!/^[a-z0-9]+$/.test(wiki) || !page) return null;
  const segments = page.split('/');
  if (segments.some(segment => segment === '.' || segment === '..')) return null;
  return `https://liquipedia.net/${wiki}/${segments.map(encodeURIComponent).join('/')}`;
}

export function liquipediaEdition(tournament) {
  return tournament.startDate?.slice(0, 4) || tournament.endDate?.slice(0, 4) || 'Date TBD';
}
