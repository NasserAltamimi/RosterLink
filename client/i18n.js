import { useSyncExternalStore } from 'react';
import arabic from './ar.json';

const storageKey = 'rosterlink-language';
const listeners = new Set();
const formatters = {
  en: new Intl.NumberFormat('en'),
  ar: new Intl.NumberFormat('ar', { numberingSystem: 'arab' }),
};
let language = 'en';
try {
  if (localStorage.getItem(storageKey) === 'ar') language = 'ar';
} catch { /* The switch also works when browser storage is unavailable. */ }

function updateDocumentLanguage() {
  document.documentElement.lang = language;
  document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
}

export function getLanguage() { return language; }

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage);

export function setLanguage(next) {
  if (next === language) return;
  language = next;
  try { localStorage.setItem(storageKey, language); }
  catch { /* Keep the preference for the current session. */ }
  updateDocumentLanguage();
  document.querySelectorAll('[data-localized-validity]').forEach(clearValidity);
  for (const listener of listeners) listener();
}

export function t(message, values) {
  const text = language === 'ar' && Object.hasOwn(arabic, message) ? arabic[message] : message;
  return values ? text.replace(/\{(\w+)\}/g, (token, name) => Object.hasOwn(values, name) ? values[name] : token) : text;
}

export const number = value => formatters[language].format(value);
export const percent = value => new Intl.NumberFormat(language, { style: 'percent', numberingSystem: language === 'ar' ? 'arab' : 'latn' }).format(value / 100);

// Isolate inline names and identifiers from surrounding UI punctuation.
export const isolate = value => language === 'ar' && value ? `\u2068${value}\u2069` : value;

export function errorText(message) {
  if (language !== 'ar' || typeof message !== 'string') return message;
  if (Object.hasOwn(arabic, message)) return arabic[message];
  const limits = [
    [/^Choose up to (\d+) languages\.$/, 'Choose up to {count} languages.'],
    [/^Keep each language to (\d+) characters or fewer\.$/, 'Keep each language to {count} characters or fewer.'],
    [/^Keep these languages to (\d+) characters in total\.$/, 'Keep these languages to {count} characters in total.'],
    [/^Too small: expected string to have >=(\d+) characters$/, 'Use at least {count} characters.'],
    [/^Too big: expected string to have <=(\d+) characters$/, 'Use no more than {count} characters.'],
    [/^Too small: expected array to have >=(\d+) items$/, 'Select at least {count} items.'],
    [/^Too big: expected array to have <=(\d+) items$/, 'Select no more than {count} items.'],
    [/^Too small: expected number to be >=(\d+)$/, 'Enter a value of at least {count}.'],
    [/^Too big: expected number to be <=(\d+)$/, 'Enter a value of no more than {count}.'],
  ];
  for (const [pattern, key] of limits) {
    const match = message.match(pattern);
    if (match) return t(key, { count: number(Number(match[1])) });
  }
  if (/^Invalid option:/.test(message)) return t('Choose a valid option.');
  if (/^Invalid (email address|URL|ISO datetime)$/.test(message)) {
    const formats = { 'Invalid email address': 'Enter a valid email address.', 'Invalid URL': 'Enter a valid URL.', 'Invalid ISO datetime': 'Enter a valid date and time.' };
    return t(formats[message]);
  }
  if (/^Invalid input: expected .+, received undefined$/.test(message)) return t('This field is required.');
  if (message.startsWith('Unknown setting:')) return t('Unknown setting.');
  if (/^(Invalid |Unrecognized )/.test(message) || / must be true or false\.$/.test(message)) return t('Enter a valid value.');
  return /\p{Script=Arabic}/u.test(message) ? message : t('Something went wrong. Please try again.');
}

function clearValidity(input) {
  if (input.hasAttribute?.('data-localized-validity')) {
    input.setCustomValidity('');
    input.removeAttribute('data-localized-validity');
  }
}

export function installDocumentLanguage() {
  updateDocumentLanguage();
  document.addEventListener('input', event => clearValidity(event.target), true);
  document.addEventListener('invalid', ({ target: input }) => {
    if (language !== 'ar' || !input.setCustomValidity || input.validity.customError) return;
    const { valueMissing, typeMismatch, tooShort, tooLong, badInput } = input.validity;
    const message = valueMissing ? (input.tagName === 'SELECT' ? 'Please select an option.' : 'Please fill out this field.')
      : typeMismatch && input.type === 'email' ? 'Enter a valid email address.'
      : typeMismatch && input.type === 'url' ? 'Enter a valid URL.'
      : badInput && input.type === 'datetime-local' ? 'Enter a valid date and time.'
      : tooShort ? 'Use at least {count} characters.'
      : tooLong ? 'Use no more than {count} characters.'
      : 'Enter a valid value.';
    input.setCustomValidity(t(message, { count: number(tooShort ? input.minLength : input.maxLength) }));
    input.setAttribute('data-localized-validity', '');
  }, true);
}
