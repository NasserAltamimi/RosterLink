// SF-21: wording for the filters currently applied on the openings page. Kept as a pure
// function so the text can be unit-tested without a browser.
export const filterLabels = { game: 'Game', role: 'Role', region: 'Region', language: 'Language' };

// Returns e.g. "Game: Overwatch · Role: DPS", or '' when no filter is applied.
// `games` is the catalog list ({ _id, name }); an unknown game id falls back to the id's text.
export function describeFilters(filters = {}, games = []) {
  return Object.keys(filterLabels)
    .map(key => [key, String(filters[key] ?? '').trim()])
    .filter(([, value]) => value)
    .map(([key, value]) => `${filterLabels[key]}: ${key === 'game' ? games.find(game => game._id === value)?.name || value : value}`)
    .join(' · ');
}
