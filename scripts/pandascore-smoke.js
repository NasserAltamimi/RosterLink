import dotenv from 'dotenv';

dotenv.config({ quiet: true });
const token = process.env.PANDASCORE_API_TOKEN?.trim();
if (!token) {
  console.error('PANDASCORE_API_TOKEN is missing. No request was sent.');
  process.exitCode = 1;
} else {
  const endpoint = 'https://api.pandascore.co/videogames?per_page=100';
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20000), redirect: 'error',
    });
    const body = await response.json().catch(() => null);
    // Never log headers, the token, error objects, or an unfiltered response body.
    const games = Array.isArray(body) ? body.map(({ id, name, slug }) => ({ id, name, slug })) : [];
    console.log(JSON.stringify({
      endpoint: '/videogames?per_page=100', status: response.status,
      jsonArray: Array.isArray(body), count: games.length,
      rocketLeague: games.filter(game => /rocket|^rl$/i.test(`${game.name} ${game.slug}`)),
      eaFootball: games.filter(game => /fifa|ea.?fc|ea sports fc/i.test(`${game.name} ${game.slug}`)),
    }, null, 2));
    if (!response.ok || !Array.isArray(body)) process.exitCode = 1;
  } catch (error) {
    console.error(JSON.stringify({ result: 'request_failed', category: error.name, code: error.cause?.code || null }));
    process.exitCode = 1;
  }
}
