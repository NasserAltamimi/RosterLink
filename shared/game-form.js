export const platforms = ['PC', 'PlayStation', 'Xbox', 'Nintendo Switch', 'Android', 'iOS', 'Other'];
export const playRegions = ['Middle East', 'Europe', 'North America', 'South America', 'Asia', 'Africa', 'Oceania', 'Other', 'Not applicable'];
export const gameFields = [
  { key: 'platform', label: 'Platform', type: 'select', required: true, options: platforms },
  { key: 'server', label: 'Play region', type: 'select', required: true, options: playRegions, help: 'General geographic play regions, not official game-specific servers. Choose Other to enter a custom region.' },
  { key: 'language', label: 'Communication language(s)', type: 'text', required: true, maxLength: 120, help: 'List the languages you use with teammates.' },
  { key: 'availability', label: 'Availability for playing and tryouts', type: 'text', required: true, maxLength: 300, help: 'Include days, times, and timezone; mention tryout availability.' },
  { key: 'rank', label: 'Rank (optional, self-reported)', type: 'text', required: false, maxLength: 100 },
];
export function sharedDetails(details = {}) {
  return Object.fromEntries(gameFields.filter(field => typeof details[field.key] === 'string').map(field => [field.key, details[field.key]]));
}
