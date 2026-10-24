import { HttpError } from '../../lib/errors.js';
import { groupCompetitions, mlbbEwcEditions, positiveId, searchStreams, stageIdentity, supportedResults } from './competition-data.js';
const PAGE_SIZE = 20, MAX_PAGE = 20;

export function createTournamentSearch({ token, fetchImpl = fetch, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  let cooldown = 0, windowStart = 0, calls = 0, active = 0;
  async function request(path) {
    const hit = cache.get(path);
    if (hit?.expires > now()) return hit.data;
    if (pending.has(path)) return pending.get(path);
    if (!token?.trim()) throw new HttpError(503, 'Competition search is not configured. Enter a competition and result manually.');
    if (now() < cooldown || active >= 8) throw new HttpError(429, 'Competition provider is busy or rate limited. Try again later or enter manually.');
    if (now() - windowStart >= 60000) { windowStart = now(); calls = 0; }
    if (calls >= 60) throw new HttpError(429, 'Competition lookup limit reached. Try again in a minute or enter manually.');
    calls++; active++;
    const task = (async () => {
      let response;
      try { response = await fetchImpl(new URL(`https://api.pandascore.co${path}`), { headers: { Accept: 'application/json', Authorization: `Bearer ${token.trim()}` }, signal: AbortSignal.timeout(6000), redirect: 'error' }); }
      catch { throw new HttpError(503, 'Competition provider is unavailable. Enter manually or try again later.'); }
      if (response.status === 429) {
        const retry = Number(response.headers.get('retry-after'));
        cooldown = now() + Math.min(300, Math.max(30, Number.isFinite(retry) ? retry : 60)) * 1000;
        throw new HttpError(429, 'Competition provider rate limit reached. Try again later or enter manually.');
      }
      if (!response.ok) throw new HttpError(503, 'Competition metadata is unavailable right now. Enter manually.');
      const body = await response.json().catch(() => null);
      if (!body || typeof body !== 'object') throw new HttpError(503, 'Competition provider returned an invalid response. Enter manually.');
      const list = path.startsWith('/videogames/') || path.includes('/tournaments?') || /\/(standings|brackets)\?/.test(path);
      if (list !== Array.isArray(body)) throw new HttpError(503, 'Competition provider returned an invalid response shape. Enter manually.');
      const totalHeader = response.headers.get('x-total');
      const data = { body, total: totalHeader !== null && /^\d+$/.test(totalHeader) ? Number(totalHeader) : null };
      cache.delete(path); cache.set(path, { data, expires: now() + 5 * 60000 });
      if (cache.size > 300) cache.delete(cache.keys().next().value);
      return data;
    })();
    pending.set(path, task);
    try { return await task; } finally { active--; pending.delete(path); }
  }
  const more = (result, page, size) => result.total !== null ? page * size < result.total : result.body.length === size;
  async function search(gameId, query, page) {
    if (!positiveId(gameId)) throw new HttpError(503, 'Competition coverage is not mapped for this game. Enter manually.');
    if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80 || !Number.isInteger(page) || page < 1 || page > MAX_PAGE) throw new HttpError(400, 'Use 2–80 search characters and a page from 1 to 20.');
    const responses = await Promise.allSettled(searchStreams(gameId, query).map(async stream => {
      const params = new URLSearchParams({ [`search[${stream.field}]`]: stream.value, page: String(page), per_page: String(PAGE_SIZE), sort: '-begin_at' });
      const result = await request(`/videogames/${gameId}/tournaments?${params}`);
      if (!Array.isArray(result.body)) throw new HttpError(503, 'Competition provider returned an invalid list. Enter manually.');
      const rows = stream.ewcOnly ? result.body.filter(row => row.league?.id === 5264 && mlbbEwcEditions.has(row.serie?.id) && mlbbEwcEditions.get(row.serie.id) === row.serie.year) : result.body;
      return { rows, more: more(result, page, PAGE_SIZE) };
    }));
    const successes = responses.filter(result => result.status === 'fulfilled').map(result => result.value);
    const errors = responses.filter(result => result.status === 'rejected');
    if (!successes.length) throw (errors.find(result => result.reason.status === 429) || errors[0]).reason;
    const grouped = groupCompetitions(successes.flatMap(result => result.rows), gameId);
    const hasMore = successes.some(result => result.more);
    return { ...grouped, page, hasMore: page < MAX_PAGE && hasMore, limitReached: page === MAX_PAGE && hasMore, incomplete: errors.length > 0 || grouped.skipped > 0 || hasMore || page > 1,
      warnings: [...new Set(errors.map(result => result.reason.status === 429 ? 'Some search sources were rate limited.' : 'Some search sources were unavailable.'))],
      scope: 'Bounded provider metadata search; not a complete competition database.' };
  }
  search.details = async function details(gameId, leagueId, seriesId) {
    if (![gameId, leagueId, seriesId].every(positiveId)) throw new HttpError(400, 'Invalid competition reference.');
    const serie = (await request(`/series/${seriesId}`)).body;
    if (serie.id !== seriesId || serie.videogame?.id !== gameId || serie.league_id !== leagueId || serie.league?.id !== leagueId) throw new HttpError(404, 'Competition does not belong to this game and league.');
    const rows = []; let stageMore = false;
    for (let page = 1; page <= 2; page++) {
      const result = await request(`/series/${seriesId}/tournaments?per_page=50&page=${page}`);
      if (!Array.isArray(result.body)) throw new HttpError(503, 'Competition stages are unavailable. Enter a result manually.');
      rows.push(...result.body); stageMore = more(result, page, 50);
      if (!stageMore) break;
    }
    const verified = rows.filter(row => { const id = stageIdentity(row, gameId); return id?.leagueId === leagueId && id.seriesId === seriesId; });
    const group = groupCompetitions(verified, gameId).competitions[0];
    if (!group) throw new HttpError(503, 'Competition stages could not be confirmed. Enter manually.');
    const candidates = verified.filter(row => !/group|wild\s*card|qualif/i.test(row.name || '')).sort((a, b) => Number(/^playoffs$/i.test(b.name)) - Number(/^playoffs$/i.test(a.name))).slice(0, 2);
    const observations = [], warnings = [];
    for (const stage of candidates) {
      const outcomes = await Promise.allSettled(['standings', 'brackets'].map(endpoint => request(`/tournaments/${stage.id}/${endpoint}?per_page=100&page=1`)));
      const data = {};
      for (const [index, endpoint] of ['standings', 'brackets'].entries()) {
        const outcome = outcomes[index];
        const complete = outcome.status === 'fulfilled' && Array.isArray(outcome.value.body) && !more(outcome.value, 1, 100);
        data[endpoint] = complete ? outcome.value.body : [];
        if (!complete) warnings.push(`${endpoint} for ${stage.name} is unavailable or incomplete.`);
      }
      observations.push({ stageId: stage.id, ...data });
    }
    return { ...group, resultOptions: supportedResults(group.stages, observations), incomplete: stageMore || verified.length !== rows.length || warnings.length > 0 || verified.filter(row => !/group|wild\s*card|qualif/i.test(row.name || '')).length > candidates.length, warnings, trust: 'Participation and results are self-reported. Metadata does not verify the claim.' };
  };
  return search;
}
