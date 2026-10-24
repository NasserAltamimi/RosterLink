import { z } from 'zod';
import { platforms } from '../../../shared/game-form.js';
import { formatGameLanguageText, parseLanguageText, gameLanguageLimits } from '../../../shared/languages.js';

const text = (max) => z.string().trim().min(1, 'This field is required.').max(max);
export const sharedDetailsInput = z.object({
  platform: z.enum(platforms, { error: 'Choose a platform.' }),
  server: text(80), availability: text(300),
  // Normalize where it fits; preserve valid compact legacy text rather than expanding it past 120.
  language: z.string().max(1000).transform(value => formatGameLanguageText(parseLanguageText(value), value))
    .pipe(z.string().min(1, 'Choose at least one language.').max(gameLanguageLimits.maxTotalLength, `Keep these languages to ${gameLanguageLimits.maxTotalLength} characters in total.`)),
  rank: z.string().trim().max(100).optional().default(''),
}).strict();
export const experienceInput = z.array(z.object({
  name: text(200), edition: text(80), placement: text(120),
  stage: z.string().trim().max(120).optional().default(''),
  tournament: z.object({
    provider: z.literal('pandascore'), id: z.number().int().positive(), gameId: z.number().int().positive(),
  }).strict().nullable().optional().default(null),
  competition: z.object({
    provider: z.literal('pandascore'), gameId: z.number().int().positive(), leagueId: z.number().int().positive(), seriesId: z.number().int().positive(), stageIds: z.array(z.number().int().positive()).max(100).transform(ids => [...new Set(ids)]),
  }).strict().nullable().optional().default(null),
  result: z.object({ kind: z.enum(['exact', 'range', 'top', 'elimination', 'manual']), value: text(120) }).strict().nullable().optional().default(null),
}).strict()).max(20, 'Add up to 20 tournament entries per game.');
