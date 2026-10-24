import 'dotenv/config';
import { createTournamentSearch } from '../server/modules/games/tournaments.js';

try {
  const search = createTournamentSearch({ token: process.env.PANDASCORE_API_TOKEN });
  for (const gameId of [22, 34]) {
    const result = await search(gameId, 'EWC', 1);
    console.log(JSON.stringify({ gameId, query: 'EWC', page: result.page, hasMore: result.hasMore, incomplete: result.incomplete, count: result.competitions.length, samples: result.competitions.slice(0, 2) }));
  }
} catch (error) {
  console.error(`Tournament search smoke check failed (${error.status || error.name}).`);
  process.exitCode = 1;
}
