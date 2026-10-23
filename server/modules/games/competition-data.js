export const positiveId = value => Number.isSafeInteger(value) && value > 0;
const text = (value, length) => typeof value === 'string' ? value.trim().slice(0, length) : '';

// Checked against PandaScore game 34 / league 5264, and MOONTON/EWC announcements.
// These aliases apply only to these editions, never to every historic/future MSC.
export const mlbbEwcEditions = new Map([[7694, 2024], [9462, 2025], [10754, 2026]]);

export function searchStreams(gameId, query) {
  const q = query.toLowerCase().trim();
  const normalized = q.replace(/[-\s]+/g, ' ');
  const ewc = normalized.match(/^(?:ewc|esports world cup)(?: (20\d\d))?$/);
  const msc = gameId === 34 && normalized.match(/^(?:msc|mid season cup)(?: (20\d\d))?$/);
  const slug = (ewc ? `esports-world-cup${ewc[1] ? `-${ewc[1]}` : ''}` : msc ? `mid-season-cup${msc[1] ? `-${msc[1]}` : ''}` : q).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return [{ field: 'name', value: q }, ...(slug ? [{ field: 'slug', value: slug }] : []), ...(ewc && gameId === 34 ? [{ field: 'slug', value: `mid-season-cup${ewc[1] ? `-${ewc[1]}` : ''}`, ewcOnly: true }] : [])];
}

export function stageIdentity(row, gameId) {
  const leagueId = row.league?.id;
  const seriesId = row.serie?.id;
  if (row.videogame?.id !== gameId || ![row.id, leagueId, seriesId].every(positiveId)) return null;
  if ((row.league_id != null && row.league_id !== leagueId) || (row.serie_id != null && row.serie_id !== seriesId) || (row.serie?.league_id != null && row.serie.league_id !== leagueId)) return null;
  return { leagueId, seriesId };
}

export function groupCompetitions(rows, gameId) {
  const groups = new Map();
  let skipped = 0;
  for (const row of rows) {
    const identity = stageIdentity(row, gameId);
    if (!identity) { skipped++; continue; }
    const { leagueId, seriesId } = identity;
    const key = `${gameId}:${leagueId}:${seriesId}`;
    if (!groups.has(key)) groups.set(key, {
      key, name: text(row.league.name, 200), edition: text(row.serie.full_name || [row.serie.name, row.serie.season, row.serie.year].filter(Boolean).join(' '), 80),
      association: gameId === 34 && leagueId === 5264 && mlbbEwcEditions.has(seriesId) && mlbbEwcEditions.get(seriesId) === row.serie.year ? 'MSC at Esports World Cup' : '',
      competition: { provider: 'pandascore', gameId, leagueId, seriesId, stageIds: [] }, stages: [],
    });
    const group = groups.get(key);
    if (!group.competition.stageIds.includes(row.id)) {
      group.competition.stageIds.push(row.id);
      group.stages.push({ id: row.id, name: text(row.name, 120) });
    }
  }
  return { competitions: [...groups.values()], skipped };
}

// Suggestions describe the competition's available outcomes, never a player's actual result.
export function supportedResults(stages, observations) {
  const options = new Map();
  const add = (kind, value, label) => options.set(`${kind}:${value}`, { kind, value, label });
  for (const { stageId, brackets, standings } of observations) {
    const stage = stages.find(row => row.id === stageId);
    if (!stage || /wild\s*card|qualif|group/i.test(stage.name)) continue;
    const matches = brackets.filter(row => row.tournament_id === stageId);
    const name = match => String(match.name || '').split(':')[0].trim().toLowerCase();
    const finals = matches.filter(row => /^(grand\s*final|final)(?:\s|$)/.test(name(row)));
    if (!finals.length) continue; // Do not infer overall ranks from a group's standings.
    add('exact', '1', 'Champion — exactly 1st');
    add('exact', '2', 'Runner-up — exactly 2nd');
    const ranks = new Set(standings.map(row => row.rank).filter(positiveId));
    if (matches.some(row => /^(3rd|third) place/.test(name(row)))) {
      if (ranks.has(3)) add('exact', '3', 'Exactly 3rd');
      if (ranks.has(4)) add('exact', '4', 'Exactly 4th');
    }
    for (const [round, expression, label] of [
      ['semifinal', /^semi[ -]?final/, 'Semifinal exit'],
      ['quarterfinal', /^quarter[ -]?final/, 'Quarterfinal exit'],
      ['round-of-16', /^(round of 16|round 16|ro16)/, 'Round-of-16 exit'],
    ]) {
      const roundMatches = matches.filter(row => expression.test(name(row)));
      const loserContinues = roundMatches.some(row => matches.some(next => (next.previous_matches || []).some(previous => previous.match_id === row.id && previous.type === 'loser') && !/^(3rd|third|\d+(?:st|nd|rd|th)) place/.test(name(next))));
      if (roundMatches.length && !loserContinues) add('elimination', round, label);
    }
    const quarters = matches.filter(row => /^quarter[ -]?final/.test(name(row)));
    const semis = matches.filter(row => /^semi[ -]?final/.test(name(row)));
    // Conservative single-elimination geometry: no numeric result is assigned to a round exit.
    const lowerPath = matches.some(row => (row.previous_matches || []).some(previous => previous.type === 'loser') && !/^(3rd|third|\d+(?:st|nd|rd|th)) place/.test(name(row)));
    const feeds = (match, previous) => match.previous_matches?.length === 2 && match.previous_matches.every(link => link.type === 'winner' && previous.some(row => row.id === link.match_id));
    const completeGeometry = finals.length === 1 && feeds(finals[0], semis) && semis.every(match => feeds(match, quarters)) && new Set(semis.flatMap(match => match.previous_matches.map(link => link.match_id))).size === 4;
    if (quarters.length === 4 && semis.length === 2 && completeGeometry && !lowerPath) {
      add('top', '8', 'Top 8 — within the first eight, not exactly 8th');
      if (!matches.some(row => /^(5th|6th|7th|8th) place/.test(name(row)))) add('range', '5-8', 'Placement range — 5th–8th');
    }
    // Exact placements, top cutoffs, ranges and elimination rounds stay different option types.
  }
  return [...options.values()];
}
