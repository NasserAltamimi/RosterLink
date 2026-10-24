// Shared language rules for the general profile languages (SF-04) and each game's
// communication languages (SF-06). The two values are stored separately; these helpers
// only normalize, parse and validate them so the client and server agree.
export const standardLanguages = ['Arabic', 'English'];
export const OTHER_LANGUAGE = 'Other';

// Existing limits: profile languages are an array (max 8 items, 40 characters each);
// a game's communication languages are one string of at most 120 characters.
export const profileLanguageLimits = { maxItems: 8, maxItemLength: 40 };
export const gameLanguageLimits = { maxTotalLength: 120 };

// Legacy free text used commas, Arabic commas, semicolons, slashes or new lines.
const separators = /[,،;/\n]+/;

/** Trim, collapse spaces, canonicalize Arabic/English and drop case-insensitive duplicates. */
export function normalizeLanguages(values = []) {
  const seen = new Set();
  const result = [];
  for (const raw of values) {
    if (typeof raw !== 'string') continue;
    const value = raw.trim().replace(/\s+/g, ' ');
    if (!value) continue;
    const canonical = standardLanguages.find(language => language.toLowerCase() === value.toLowerCase()) || value;
    const key = canonical.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(canonical);
  }
  return result;
}

export const parseLanguageText = text => normalizeLanguages(typeof text === 'string' ? text.split(separators) : []);
export const formatLanguageText = values => normalizeLanguages(values).join(', ');

/** Restores picker selections from saved languages, keeping every custom language. */
export function toLanguageSelection(values = []) {
  const languages = normalizeLanguages(values);
  const custom = languages.filter(language => !standardLanguages.includes(language));
  return {
    selected: standardLanguages.filter(language => languages.includes(language)),
    other: custom.length > 0,
    custom: custom.join(', '),
  };
}

/** The saved value for a picker selection; custom text is ignored unless Other is selected. */
export function fromLanguageSelection({ selected = [], other = false, custom = '' } = {}) {
  return normalizeLanguages([...standardLanguages.filter(language => selected.includes(language)), ...(other ? parseLanguageText(custom) : [])]);
}

/** Returns a user-facing error message, or null when the selection can be saved. */
export function validateLanguageSelection(selection, { maxItems, maxItemLength, maxTotalLength } = {}) {
  const custom = parseLanguageText(selection?.custom);
  if (selection?.other && !custom.length) return 'Enter the other language, or clear Other.';
  const languages = fromLanguageSelection(selection);
  if (!languages.length) return 'Choose at least one language.';
  if (maxItems && languages.length > maxItems) return `Choose up to ${maxItems} languages.`;
  if (maxItemLength && languages.some(language => language.length > maxItemLength)) return `Keep each language to ${maxItemLength} characters or fewer.`;
  if (maxTotalLength && formatLanguageText(languages).length > maxTotalLength) return `Keep these languages to ${maxTotalLength} characters in total.`;
  return null;
}
