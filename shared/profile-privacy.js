// SF-08: profile fields a player can show or hide on their public profile.
// Display name, profile ID (the share link), the list of games and openToOffers are always public.
// Account email, password hash, owner/user IDs, storage keys and legacy details are never public.
// Every toggle defaults to public so existing shared profiles look the same as before SF-08.
export const publicFieldOptions = [
  { key: 'bio', group: 'profile', label: 'Bio' },
  { key: 'region', group: 'profile', label: 'Region' },
  { key: 'languages', group: 'profile', label: 'Spoken languages' },
  { key: 'profileImage', group: 'profile', label: 'Profile image' },
  { key: 'headerImage', group: 'profile', label: 'Header image' },
  { key: 'platform', group: 'game', detail: 'platform', label: 'Platform' },
  { key: 'playRegion', group: 'game', detail: 'server', label: 'Play region' },
  { key: 'communicationLanguages', group: 'game', detail: 'language', label: 'Communication languages' },
  { key: 'availability', group: 'game', detail: 'availability', label: 'Availability' },
  { key: 'rank', group: 'game', detail: 'rank', label: 'Rank' },
  { key: 'tournamentExperience', group: 'game', label: 'Tournament experience', help: 'Hides your whole self-reported tournament list.' },
];
export const publicFieldKeys = publicFieldOptions.map(option => option.key);
export const defaultPublicFields = Object.fromEntries(publicFieldKeys.map(key => [key, true]));

// Works for hydrated documents and .lean() objects; missing or invalid values fall back to defaults.
export function resolvePrivacy(profile) {
  const saved = profile?.publicFields;
  return {
    openToOffers: profile?.openToOffers === true,
    publicFields: Object.fromEntries(publicFieldKeys.map(key => [key, typeof saved?.[key] === 'boolean' ? saved[key] : defaultPublicFields[key]])),
  };
}
