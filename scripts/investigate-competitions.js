import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
const headers = { Accept: 'application/json', Authorization: `Bearer ${process.env.PANDASCORE_API_TOKEN?.trim()}` };
const report = { checkedAt: new Date().toISOString(), searches: [], details: [] };
async function get(path) {
  const response = await fetch(`https://api.pandascore.co${path}`, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
  const body = await response.json().catch(() => null);
  return { path, status: response.status, total: response.headers.get('x-total'), body };
}
const summary = row => ({ id: row.id, name: row.name, slug: row.slug, begin_at: row.begin_at, type: row.type, videogame: row.videogame, league: row.league, serie: row.serie });
try {
  for (const gameId of [22, 34]) {
    for (const [field, q] of [['name', 'EWC'], ['slug', 'esports-world-cup'], ['name', 'Esports World Cup'], ['slug', 'msc'], ['name', 'MSC'], ['slug', 'mid-season-cup'], ['name', 'Mid Season Cup']]) {
      for (let page = 1; page <= 2; page++) {
        const query = new URLSearchParams({ [`search[${field}]`]: q, page: String(page), per_page: '20', sort: '-begin_at' });
        const result = await get(`/videogames/${gameId}/tournaments?${query}`);
        const rows = Array.isArray(result.body) ? result.body.map(summary) : [];
        report.searches.push({ ...result, body: rows });
        console.log(JSON.stringify({ gameId, field, q, page, status: result.status, total: result.total, competitions: [...new Set(rows.map(row => `${row.league?.id}:${row.league?.name} / ${row.serie?.id}:${row.serie?.full_name}`))] }));
        if (rows.length < 20 || page * 20 >= Number(result.total)) break;
      }
    }
  }
  const rows = report.searches.flatMap(result => result.body);
  const chosen = [];
  for (const gameId of [22, 34]) {
    const relevant = rows.filter(row => row.videogame?.id === gameId && /playoff/i.test(row.name));
    const series = new Set();
    for (const row of relevant) if (!series.has(row.serie?.id) && series.size < 2) { chosen.push(row); series.add(row.serie.id); }
  }
  for (const row of chosen) {
    for (const path of [`/series/${row.serie.id}`, `/series/${row.serie.id}/tournaments?per_page=50&page=1`, `/tournaments/${row.id}`, `/tournaments/${row.id}/standings`, `/tournaments/${row.id}/brackets`]) {
      const result = await get(path);
      report.details.push(result);
      console.log(JSON.stringify({ path, status: result.status, total: result.total, keys: result.body && Object.keys(Array.isArray(result.body) ? result.body[0] || {} : result.body), sample: Array.isArray(result.body) ? result.body.slice(0, path.includes('brackets') ? 2 : 1) : summary(result.body || {}) }));
    }
  }
  await mkdir('.local-data', { recursive: true });
  await writeFile('.local-data/competition-investigation.json', JSON.stringify(report, null, 2));
} catch (error) { console.error(`Investigation failed (${error.name}).`); process.exitCode = 1; }
