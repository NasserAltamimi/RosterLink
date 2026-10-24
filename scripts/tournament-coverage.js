import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';

const headers = { Accept: 'application/json', Authorization: `Bearer ${process.env.PANDASCORE_API_TOKEN?.trim()}` };
const request = async path => {
  const response = await fetch(`https://api.pandascore.co${path}`, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
  const body = await response.json().catch(() => null);
  return { response, body };
};
try {
  const { response, body } = await request('/videogames?per_page=100');
  if (!response.ok || !Array.isArray(body)) throw new Error('Game catalog unavailable');
  const coverage = [];
  for (const game of body) {
    const { response: result, body: tournaments } = await request(`/videogames/${game.id}/tournaments?per_page=1&page=1&sort=-begin_at`);
    const item = Array.isArray(tournaments) ? tournaments[0] : null;
    const row = { id: game.id, name: game.name, status: result.status, total: result.headers.get('x-total'), sample: item ? { id: item.id, name: item.name, begin_at: item.begin_at, league: item.league, serie: item.serie, videogame: item.videogame } : null };
    coverage.push(row);
    console.log(JSON.stringify(row));
  }
  const searches = [];
  for (const query of ['search[name]=EWC', 'search[slug]=esports-world-cup']) {
    const { response: result, body: rows } = await request(`/videogames/26/tournaments?per_page=3&page=1&${query}`);
    const row = { query, status: result.status, total: result.headers.get('x-total'), rows: Array.isArray(rows) ? rows.map(({ id, name, slug, league, serie }) => ({ id, name, slug, league, serie })) : null };
    searches.push(row); console.log(JSON.stringify(row));
  }
  await mkdir('.local-data', { recursive: true });
  await writeFile('.local-data/tournament-coverage.json', JSON.stringify({ checkedAt: new Date().toISOString(), coverage, searches }, null, 2));
} catch (error) {
  console.error(`Coverage check failed (${error.name}).`);
  process.exitCode = 1;
}
