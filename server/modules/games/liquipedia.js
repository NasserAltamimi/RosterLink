import mongoose from 'mongoose';
import { liquipediaPageUrl } from '../../../shared/liquipedia.js';

const hour = 60 * 60 * 1000;
const cacheTime = hour;
const failureDelay = 60 * 1000;

// MongoDB supplies the clock and serializes reservations across server processes and restarts.
export async function reserveLiquipediaRequest() {
  const budget = mongoose.connection.collection('provider_request_budgets');
  const result = await budget.findOneAndUpdate({ _id: 'liquipedia-v3' }, [
    { $set: { requests: { $filter: {
      input: { $ifNull: ['$requests', []] },
      cond: { $gt: ['$$this', { $subtract: ['$$NOW', hour] }] },
    } } } },
    { $set: { reserved: { $lt: [{ $size: '$requests' }, 60] } } },
    { $set: { requests: { $cond: ['$reserved', { $concatArrays: ['$requests', ['$$NOW']] }, '$requests'] } } },
  ], { upsert: true, returnDocument: 'after' });
  return result.reserved;
}

function dateOnly(value) {
  const day = typeof value === 'string' ? value.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= '1990-01-01' && !Number.isNaN(Date.parse(day)) ? day : null;
}

function mapTournaments(rows, wiki) {
  const tournaments = new Map();
  for (const row of rows) {
    const page = typeof row?.pagename === 'string' ? row.pagename.trim() : '';
    if (!page || tournaments.has(page)) continue;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    tournaments.set(page, {
      id: page,
      name: name || page.replaceAll('_', ' '),
      startDate: dateOnly(row.startdate),
      endDate: dateOnly(row.enddate),
      status: typeof row.status === 'string' ? row.status.trim() : '',
      url: liquipediaPageUrl(wiki, page),
    });
  }
  return [...tournaments.values()];
}

export function createLiquipediaTournaments({ apiKey, fetchImpl = fetch, reserve = reserveLiquipediaRequest, now = Date.now } = {}) {
  const key = apiKey?.trim();
  const cache = new Map();
  let pausedUntil = 0;

  return async function tournamentsFor(wiki) {
    const response = { provider: 'Liquipedia', tournaments: [] };
    if (!wiki || !/^[a-z0-9]+$/.test(wiki)) return { ...response, status: 'unsupported' };
    if (!key) return { ...response, status: 'unavailable' };
    const entry = cache.get(wiki) || {};
    const fallback = () => entry.data?.status === 'ok' && now() < entry.freshUntil + 24 * hour
      ? { ...entry.data, stale: true }
      : { ...response, status: 'unavailable' };
    if (now() < entry.freshUntil) return entry.data;
    if (entry.pending) return entry.pending;
    if (now() < pausedUntil || now() < entry.retryAfter) return fallback();
    cache.set(wiki, entry);
    entry.pending = (async () => {
      try {
        if (!await reserve()) {
          pausedUntil = now() + failureDelay;
          return fallback();
        }
        const url = new URL('https://api.liquipedia.net/api/v3/tournament');
        url.search = new URLSearchParams({ wiki, query: 'pagename, name, startdate, enddate, status', order: 'startdate DESC', limit: '500' });
        const upstream = await fetchImpl(url, {
          headers: { Accept: 'application/json', Authorization: `Apikey ${key}` },
          redirect: 'error',
          signal: AbortSignal.timeout(6000),
        });
        if ([401, 403, 429].includes(upstream.status)) {
          pausedUntil = now() + hour;
          return fallback();
        }
        if (upstream.status === 404) {
          entry.data = { ...response, status: 'unsupported' };
        } else {
          if (!upstream.ok) return fallback();
          const body = await upstream.json();
          if (!Array.isArray(body?.result) || body.error) return fallback();
          const tournaments = mapTournaments(body.result, wiki);
          if (body.result.length && !tournaments.length) return fallback();
          entry.data = { ...response, status: 'ok', tournaments, retrievedAt: new Date(now()).toISOString() };
        }
        entry.freshUntil = now() + cacheTime;
        return entry.data;
      } catch {
        return fallback();
      } finally {
        entry.retryAfter = now() + failureDelay;
      }
    })();
    try { return await entry.pending; }
    finally { delete entry.pending; }
  };
}
