import { readFileSync } from 'node:fs';
export const fixtures = JSON.parse(readFileSync(new URL('./competition-data.json', import.meta.url), 'utf8'));
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
export async function fixtureFetch(url) {
  const parsed = new URL(url);
  if (parsed.pathname.startsWith('/videogames/')) {
    const gameId = Number(parsed.pathname.split('/')[2]);
    const name = parsed.searchParams.get('search[name]'), slug = parsed.searchParams.get('search[slug]');
    const q = name || slug || '';
    if (q.includes('outage')) return json([], 503);
    if (q.includes('limited')) return json([], 429, { 'retry-after': '30' });
    const rows = fixtures.stages.filter(row => row.videogame.id === gameId && String(name ? row.name : row.slug).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.id - a.id);
    const size = Number(parsed.searchParams.get('per_page')), page = Number(parsed.searchParams.get('page'));
    return json(rows.slice((page - 1) * size, page * size), 200, { 'x-total': String(rows.length) });
  }
  const result = fixtures.details.find(row => row.path === parsed.pathname);
  return result ? json(result.body, result.status, result.total ? { 'x-total': result.total } : {}) : json([], 404);
}
