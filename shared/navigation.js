// Navigation selects a screen only. Authorization always comes from the API.
export function resolveRoute(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/' || path === '/workspace') return { page: 'workspace', destination: 'workspace', private: path !== '/' };
  if (['/login', '/register'].includes(path)) return { page: 'auth', destination: '', mode: path.slice(1) };
  if (['/forgot-password', '/reset-password'].includes(path)) return { page: 'recovery', destination: '' };
  if (/^\/p(?:\/|$)/i.test(path)) return { page: 'public-profile', destination: '' };
  if (/^\/profile(?:\/(edit|games))?$/.test(path)) return { page: 'profile', destination: 'profile', private: true, tab: path.split('/')[2] || 'overview' };
  if (path === '/organizations' || path === '/organizations/new') return { page: 'organizations', destination: 'organizations', private: true, creating: path.endsWith('/new') };
  if (path === '/manage') return { page: 'legacy-management', destination: 'organizations', private: true };
  const management = path.match(/^\/manage\/organizations\/([a-f\d]{24})(?:\/(edit|teams\/new|teams\/([a-f\d]{24})(?:\/(edit))?))?$/i);
  if (management) return { page: 'management', destination: 'organizations', private: true, organizationId: management[1], action: management[2] || '', teamId: management[3], editTeam: Boolean(management[4]) };
  if (path === '/openings') return { page: 'openings', destination: 'openings' };
  const detail = path.match(/^\/(organizations|teams|openings)\/([^/]+)$/);
  if (detail) return { page: 'public-detail', destination: detail[1] === 'openings' ? 'openings' : 'organizations', kind: detail[1], id: detail[2] };
  return { page: 'not-found', destination: '' };
}

export function safeReturnTo(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/workspace';
  try {
    const url = new URL(value, 'https://rosterlink.local');
    const route = resolveRoute(url.pathname);
    if (url.origin !== 'https://rosterlink.local' || ['auth', 'recovery', 'not-found'].includes(route.page)) return '/workspace';
    return url.pathname + url.search;
  } catch { return '/workspace'; }
}
