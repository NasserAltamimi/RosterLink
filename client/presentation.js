import { scheduleDays, sortSchedule } from '../shared/schedule.js';
import { platforms, playRegions } from '../shared/game-form.js';
import { standardLanguages } from '../shared/languages.js';
import { getLanguage, isolate, number, t } from './i18n.js';

const arabicPlurals = new Intl.PluralRules('ar');
const countLabels = {
  'active opening': ['شاغر متاح واحد', 'شاغران متاحان', 'شواغر متاحة', 'شاغرًا متاحًا', 'شاغر متاح'],
  'open role': ['دور شاغر واحد', 'دوران شاغران', 'أدوار شاغرة', 'دورًا شاغرًا', 'دور شاغر'],
  application: ['طلب واحد', 'طلبان', 'طلبات', 'طلبًا', 'طلب'],
  applicant: ['متقدم واحد', 'متقدمان', 'متقدمين', 'متقدمًا', 'متقدم'],
  'new applicant': ['متقدم جديد واحد', 'متقدمان جديدان', 'متقدمين جدد', 'متقدمًا جديدًا', 'متقدم جديد'],
  'game profile': ['ملف لعبة واحد', 'ملفّا لعبتين', 'ملفات ألعاب', 'ملف لعبة', 'ملف لعبة'],
  team: ['فريق واحد', 'فريقان', 'فرق', 'فريقًا', 'فريق'],
  'assigned team': ['فريق مسند واحد', 'فريقان مسندان', 'فرق مسندة', 'فريقًا مسندًا', 'فريق مسند'],
  organization: ['منظمة واحدة', 'منظمتان', 'منظمات', 'منظمة', 'منظمة'],
  reaction: ['تفاعل واحد', 'تفاعلان', 'تفاعلات', 'تفاعلًا', 'تفاعل'],
  comment: ['تعليق واحد', 'تعليقان', 'تعليقات', 'تعليقًا', 'تعليق'],
};

export function quantity(count, singular) {
  if (getLanguage() === 'en') return `${number(count)} ${count === 1 ? singular : singular + 's'}`;
  const [one, two, few, many, other] = countLabels[singular];
  const form = arabicPlurals.select(count);
  if (form === 'one') return one;
  if (form === 'two') return two;
  return `${number(count)} ${form === 'few' ? few : form === 'many' ? many : other}`;
}

export function displayDate(value, timeZone, showTime = true) {
  return new Intl.DateTimeFormat(getLanguage(), {
    year: 'numeric', month: 'short', day: 'numeric',
    ...(showTime && { hour: 'numeric', minute: '2-digit', timeZoneName: 'shortOffset' }),
    timeZone, calendar: 'gregory', numberingSystem: getLanguage() === 'ar' ? 'arab' : 'latn',
  }).format(new Date(value));
}

export function displayRegion(value) {
  if (!/^[A-Z]{2}$/.test(value)) return value;
  return new Intl.DisplayNames(getLanguage(), { type: 'region', fallback: 'none' }).of(value) || value;
}

export const displayLanguage = value => standardLanguages.includes(value) ? t(value) : value;

export function displayGameDetail(key, value) {
  if (key === 'platform' && platforms.includes(value)) return t(value);
  if (key === 'server' && playRegions.includes(value)) return t(value);
  if (key === 'language') return value.replace(/[^,،;/\n]+/g, part => part.replace(/\S(?:.*\S)?/, displayLanguage));
  return value;
}

export function displaySchedule({ schedule, scheduleSlots }) {
  if (getLanguage() === 'en' || !scheduleSlots?.length) return schedule;
  return sortSchedule(scheduleSlots).map(({ day, start, end }) => {
    const label = scheduleDays.find(([key]) => key === day)[1];
    return t(end < start ? '{day} {start}–{end} (+1 day)' : '{day} {start}–{end}', {
      day: t(label), start: isolate(start), end: isolate(end),
    });
  }).join('، ');
}

export const displayPlacement = entry => entry.result && entry.result.kind !== 'manual' ? t(entry.placement) : entry.placement;

export function featuredGames(games = []) {
  return ['rocket-league', 'valorant', 'cs-go', 'league-of-legends', 'apex-legends']
    .map(slug => games.find(game => game.slug === slug)).filter(Boolean);
}
