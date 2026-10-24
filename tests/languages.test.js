import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatGameLanguageText, formatLanguageText, fromLanguageSelection, gameLanguageLimits, normalizeLanguages, parseLanguageText, profileLanguageLimits, toLanguageSelection, validateLanguageSelection } from '../shared/languages.js';
import { sharedDetailsInput } from '../server/modules/games/player-form.js';
import { legacyLanguage } from './fixtures/profile-edge-cases.js';

const details = { platform: 'PC', server: 'Middle East', availability: 'Fri 20:00 Asia/Riyadh' };

test('SF-06: valid compact legacy languages survive expansion without relaxing edited-value limits', () => {
  const languages = parseLanguageText(legacyLanguage);
  assert.equal(legacyLanguage.length, 114);
  assert.equal(formatLanguageText(languages).length, 128);
  assert.equal(formatGameLanguageText(languages, legacyLanguage), legacyLanguage);
  const selection = toLanguageSelection(languages);
  assert.equal(validateLanguageSelection(selection, { ...gameLanguageLimits, originalText: legacyLanguage }), null);
  assert.equal(formatGameLanguageText(fromLanguageSelection(selection), legacyLanguage), legacyLanguage);
  assert.equal(sharedDetailsInput.parse({ ...details, language: legacyLanguage }).language, legacyLanguage);
  const changed = { ...selection, custom: `${selection.custom}, Zulu` };
  assert.match(validateLanguageSelection(changed, { ...gameLanguageLimits, originalText: legacyLanguage }), /120 characters/);
  assert.match(validateLanguageSelection(selection, gameLanguageLimits), /120 characters/);
  assert.equal(formatGameLanguageText(['Arabic','English'], 'Arabic/English'), 'Arabic, English');
  assert.equal(sharedDetailsInput.safeParse({ ...details, language: 'X'.repeat(121) }).success, false);
});

test('SF-04 / SF-06: Arabic only, English only, both, Other and combined selections produce the saved languages', () => {
  assert.deepEqual(fromLanguageSelection({ selected: ['Arabic'], other: false, custom: '' }), ['Arabic']);
  assert.deepEqual(fromLanguageSelection({ selected: ['English'], other: false, custom: '' }), ['English']);
  assert.deepEqual(fromLanguageSelection({ selected: ['English', 'Arabic'], other: false, custom: '' }), ['Arabic', 'English']);
  assert.deepEqual(fromLanguageSelection({ selected: [], other: true, custom: 'French' }), ['French']);
  assert.deepEqual(fromLanguageSelection({ selected: ['Arabic', 'English'], other: true, custom: ' French ,  Urdu ' }), ['Arabic', 'English', 'French', 'Urdu']);
  // Custom text is ignored once Other is cleared.
  assert.deepEqual(fromLanguageSelection({ selected: ['Arabic'], other: false, custom: 'French' }), ['Arabic']);
});

test('SF-04 / SF-06: values are trimmed and duplicates are removed case-insensitively', () => {
  assert.deepEqual(normalizeLanguages([' arabic ', 'Arabic', 'ENGLISH', 'french', 'French', '', '  ']), ['Arabic', 'English', 'french']);
  assert.deepEqual(fromLanguageSelection({ selected: ['Arabic'], other: true, custom: 'arabic, Urdu, urdu' }), ['Arabic', 'Urdu']);
  assert.equal(formatLanguageText(['Arabic', ' English ', 'english']), 'Arabic, English');
});

test('SF-04 / SF-06: existing saved languages, including several custom ones, restore into the picker', () => {
  assert.deepEqual(toLanguageSelection(['Arabic', 'English']), { selected: ['Arabic', 'English'], other: false, custom: '' });
  assert.deepEqual(toLanguageSelection(['English', 'Urdu', 'French']), { selected: ['English'], other: true, custom: 'Urdu, French' });
  assert.deepEqual(toLanguageSelection([]), { selected: [], other: false, custom: '' });
  // Legacy free-text game languages used commas, slashes, semicolons or Arabic commas.
  assert.deepEqual(parseLanguageText('Arabic / English'), ['Arabic', 'English']);
  assert.deepEqual(toLanguageSelection(parseLanguageText('arabic; Tagalog، Urdu')), { selected: ['Arabic'], other: true, custom: 'Tagalog, Urdu' });
  const saved = ['Arabic', 'Urdu', 'French'];
  assert.deepEqual(fromLanguageSelection(toLanguageSelection(saved)), saved);
});

test('SF-04 / SF-06: required language, required Other text and existing limits are validated', () => {
  assert.equal(validateLanguageSelection({ selected: [], other: false, custom: '' }, profileLanguageLimits), 'Choose at least one language.');
  assert.match(validateLanguageSelection({ selected: ['Arabic'], other: true, custom: ' , ' }, profileLanguageLimits), /Enter the other language/);
  assert.equal(validateLanguageSelection({ selected: ['Arabic'], other: true, custom: 'French' }, profileLanguageLimits), null);
  const nine = { selected: ['Arabic', 'English'], other: true, custom: 'A1, A2, A3, A4, A5, A6, A7' };
  assert.match(validateLanguageSelection(nine, profileLanguageLimits), /up to 8/);
  assert.match(validateLanguageSelection({ selected: [], other: true, custom: 'x'.repeat(41) }, profileLanguageLimits), /40 characters/);
  assert.match(validateLanguageSelection({ selected: ['Arabic'], other: true, custom: Array.from({ length: 12 }, (_, i) => `Language${i}`).join(', ') }, gameLanguageLimits), /120 characters/);
});

test('SF-06: the game details validator trims, de-duplicates and still requires a communication language', () => {
  assert.equal(sharedDetailsInput.parse({ ...details, language: ' Arabic ,english, arabic ' }).language, 'Arabic, English');
  assert.equal(sharedDetailsInput.parse({ ...details, language: 'Arabic / English' }).language, 'Arabic, English');
  for (const language of ['', ' ', ' , ; ', undefined, 12]) assert.equal(sharedDetailsInput.safeParse({ ...details, language }).success, false);
  const tooLong = sharedDetailsInput.safeParse({ ...details, language: Array.from({ length: 20 }, (_, i) => `Language${i}`).join(', ') });
  assert.equal(tooLong.success, false);
  assert.deepEqual(tooLong.error.issues[0].path, ['language']);
});
