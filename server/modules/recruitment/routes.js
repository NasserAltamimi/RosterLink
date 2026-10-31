import { Router } from 'express';
import { z } from 'zod';
import { Organization, Team, Opening } from './models.js';
import { requireUser } from '../auth/routes.js';
import { User } from '../auth/model.js';
import { Game } from '../games/model.js';
import { HttpError, parse } from '../../lib/errors.js';
import { platforms } from '../../../shared/game-form.js';
import { scheduleDays, scheduleTimes, sortSchedule, formatSchedule, scheduleOverlaps } from '../../../shared/schedule.js';

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');
const text = max => z.string().trim().min(1, 'This field is required.').max(max);
const orgValues = z.object({ name: text(100), description: text(2000), region: text(100),
  website: z.union([z.literal(''), z.url().max(500).refine(value => /^https?:\/\//i.test(value), 'Use an HTTP or HTTPS URL.')]).default(''),
}).strict();
const teamValues = z.object({ name: text(100), description: text(2000), gameId: id }).strict();
const scheduleSlots = z.array(z.object({ day: z.enum(scheduleDays.map(([day]) => day)), start: z.enum(scheduleTimes), end: z.enum(scheduleTimes) }).strict()).min(1, 'Select at least one playing day.').max(7)
  .refine(slots => new Set(slots.map(slot => slot.day)).size === slots.length, 'Choose each day only once.')
  .refine(slots => slots.every(slot => slot.start !== slot.end), 'Start and end times must be different.')
  .refine(slots => !scheduleOverlaps(slots), 'Playing times cannot overlap across days.');
const openingValues = z.object({ role: text(100), requirements: text(2000), platform: z.enum(platforms), rank: z.string().trim().max(100).default(''),
  region: text(100), language: text(100), scheduleSlots,
  timezone: text(100).refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Use a valid timezone, e.g. Asia/Riyadh.'),
  deadline: z.iso.datetime({ offset: true }).refine(value => new Date(value).getTime() > Date.now(), 'Choose a future deadline.'),
}).strict().transform(values => ({ ...values, scheduleSlots: sortSchedule(values.scheduleSlots), schedule: formatSchedule(values.scheduleSlots) }));
const has = (list, user) => list.some(value => String(value) === String(user));
const clean = doc => { const { _id, __v, managers, createdBy, updatedBy, closedBy, ...values } = doc.toObject ? doc.toObject() : doc; return { id: String(_id), ...values }; };
const get = async (Model, value) => { if (!id.safeParse(value).success) throw new HttpError(404, 'Page not found.'); const doc = await Model.findById(value); if (!doc) throw new HttpError(404, 'Page not found.'); return doc; };
async function orgManager(req, orgId) {
  const org = await get(Organization, orgId);
  if (!has(org.managers, req.user.id)) throw new HttpError(403, 'Organization manager permission is required.');
  return org;
}
async function teamManager(req, teamId) {
  const team = await get(Team, teamId), org = await get(Organization, String(team.organization));
  if (!has(org.managers, req.user.id) && !has(team.managers, req.user.id)) throw new HttpError(403, 'You cannot manage this team.');
  return team;
}
async function decoratedOpenings(query) {
  const rows = await Opening.find(query).sort({ createdAt: -1, _id: -1 }).populate({ path: 'team', populate: { path: 'organization', select: 'name' } }).populate('game', 'name').lean();
  return rows.map(row => ({ ...clean(row), team: row.team?._id.toString(), teamName: row.team?.name,
    organizationId: row.team?.organization?._id.toString(), organizationName: row.team?.organization?.name,
    game: row.game?._id.toString(), gameName: row.game?.name, expired: row.deadline <= new Date() }));
}

export function recruitmentRoutes() {
  const router = Router();
  router.get('/openings', async (req, res) => {
    const filters = parse(z.object({ game: id.optional(), role: text(100).optional(), region: text(100).optional(), language: text(100).optional() }).strict(), req.query);
    const query = { status: 'active', deadline: { $gt: new Date() } };
    if (filters.game) query.game = filters.game;
    // Escape user text; filters are literal, case-insensitive substrings, never executable regex.
    for (const key of ['role', 'region', 'language']) if (filters[key]) query[key] = { $regex: filters[key].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    res.json({ openings: await decoratedOpenings(query) });
  });
  router.get('/openings/:id', async (req, res) => { await get(Opening, req.params.id); res.json({ opening: (await decoratedOpenings({ _id: req.params.id }))[0] }); });
  router.get('/organizations/:id', async (req, res) => {
    const organization = await get(Organization, req.params.id);
    const teams = await Team.find({ organization: organization._id }).populate('game', 'name');
    res.json({ organization: clean(organization), teams: teams.map(team => ({ ...clean(team), game: String(team.game._id), gameName: team.game.name })) });
  });
  router.get('/teams/:id', async (req, res) => {
    const team = await get(Team, req.params.id), org = await get(Organization, String(team.organization)), game = await Game.findById(team.game);
    res.json({ team: { ...clean(team), gameName: game?.name, organizationName: org.name }, openings: await decoratedOpenings({ team: team._id, status: 'active', deadline: { $gt: new Date() } }) });
  });
  router.use(['/management', '/organizations', '/teams', '/openings'], requireUser);
  router.get('/management', async (req, res) => {
    const owned = await Organization.find({ managers: req.user._id });
    const teams = await Team.find({ $or: [{ organization: { $in: owned.map(org => org._id) } }, { managers: req.user._id }] }).populate('game', 'name');
    const organizations = await Organization.find({ _id: { $in: [...owned.map(org => org._id), ...teams.map(team => team.organization)] } });
    res.json({ organizations: organizations.map(org => ({ ...clean(org), canManage: has(org.managers, req.user.id) })),
      teams: teams.map(team => ({ ...clean(team), game: String(team.game._id), gameName: team.game.name })),
      openings: await decoratedOpenings({ team: { $in: teams.map(team => team._id) } }) });
  });
  router.post('/organizations', async (req, res) => {
    const values = parse(orgValues, req.body);
    res.status(201).json({ organization: clean(await Organization.create({ ...values, managers: [req.user._id] })) });
  });
  router.put('/organizations/:id', async (req, res) => {
    const org = await orgManager(req, req.params.id), values = parse(orgValues, req.body);
    const saved = await Organization.findOneAndUpdate({ _id: org._id, managers: req.user._id }, { $set: values }, { returnDocument: 'after', runValidators: true });
    if (!saved) throw new HttpError(403, 'Organization manager permission is required.');
    res.json({ organization: clean(saved) });
  });
  router.post('/organizations/:id/teams', async (req, res) => {
    const org = await orgManager(req, req.params.id), { gameId, ...values } = parse(teamValues, req.body);
    if (!await Game.exists({ _id: gameId, enabled: true })) throw new HttpError(400, 'Choose an enabled game.', { gameId: 'Choose an enabled game.' });
    res.status(201).json({ team: clean(await Team.create({ ...values, organization: org._id, game: gameId })) });
  });
  router.put('/teams/:id', async (req, res) => {
    const team = await teamManager(req, req.params.id), values = parse(teamValues.omit({ gameId: true }), req.body);
    res.json({ team: clean(await Team.findByIdAndUpdate(team._id, { $set: values }, { returnDocument: 'after', runValidators: true })) });
  });
  // Memberships live on their scope document. Atomic $pull + size guard prevents concurrent last-manager removals.
  router.get('/organizations/:id/roles', async (req, res) => {
    const org = await orgManager(req, req.params.id), teams = await Team.find({ organization: org._id });
    const users = await User.find({ _id: { $in: [...org.managers, ...teams.flatMap(team => team.managers)] } }).select('email');
    const email = userId => users.find(user => user.id === String(userId))?.email || 'Unavailable account';
    res.json({ roles: [...org.managers.map(user => ({ userId: String(user), email: email(user), teamId: null })), ...teams.flatMap(team => team.managers.map(user => ({ userId: String(user), email: email(user), teamId: team.id, teamName: team.name })))] });
  });
  router.post('/organizations/:id/roles', async (req, res) => {
    const org = await orgManager(req, req.params.id);
    const values = parse(z.object({ email: z.string().trim().toLowerCase().pipe(z.email()), teamId: id.nullable().default(null) }).strict(), req.body);
    const user = await User.findOne({ email: values.email, status: 'active' });
    if (!user) throw new HttpError(400, 'Use an existing registered user email.', { email: 'No active registered user has this email.' });
    if (values.teamId) {
      const team = await get(Team, values.teamId);
      if (String(team.organization) !== org.id) throw new HttpError(403, 'This team belongs to another organization.');
      await Team.updateOne({ _id: team._id, organization: org._id }, { $addToSet: { managers: user._id } });
    } else await Organization.updateOne({ _id: org._id, managers: req.user._id }, { $addToSet: { managers: user._id } });
    res.status(204).end();
  });
  router.delete('/organizations/:id/roles', async (req, res) => {
    const org = await orgManager(req, req.params.id);
    const { userId, teamId } = parse(z.object({ userId: id, teamId: id.nullable().default(null) }).strict(), req.body);
    if (teamId) {
      const team = await get(Team, teamId);
      if (String(team.organization) !== org.id) throw new HttpError(403, 'This team belongs to another organization.');
      await Team.updateOne({ _id: team._id, organization: org._id }, { $pull: { managers: userId } });
    } else {
      const result = await Organization.updateOne({ _id: org._id, managers: req.user._id, $or: [{ managers: { $ne: userId } }, { $expr: { $gt: [{ $size: '$managers' }, 1] } }] }, { $pull: { managers: userId } });
      if (!result.matchedCount) throw new HttpError(409, 'Keep at least one organization manager.');
    }
    res.status(204).end();
  });
  router.post('/teams/:id/openings', async (req, res) => {
    const team = await teamManager(req, req.params.id), values = parse(openingValues, req.body);
    res.status(201).json({ opening: clean(await Opening.create({ ...values, team: team._id, game: team.game, createdBy: req.user._id, updatedBy: req.user._id })) });
  });
  router.put('/openings/:id', async (req, res) => {
    const opening = await get(Opening, req.params.id); await teamManager(req, String(opening.team));
    const values = parse(openingValues, req.body);
    const saved = await Opening.findOneAndUpdate({ _id: opening._id, status: 'active' }, { $set: { ...values, updatedBy: req.user._id } }, { returnDocument: 'after', runValidators: true });
    if (!saved) throw new HttpError(409, 'Closed openings cannot be edited or reopened.');
    res.json({ opening: clean(saved) });
  });
  router.post('/openings/:id/close', async (req, res) => {
    const opening = await get(Opening, req.params.id); await teamManager(req, String(opening.team)); parse(z.object({}).strict(), req.body ?? {});
    await Opening.updateOne({ _id: opening._id, status: 'active' }, { $set: { status: 'closed', closedAt: new Date(), closedBy: req.user._id, updatedBy: req.user._id } });
    res.json({ opening: clean(await Opening.findById(opening._id)) });
  });
  return router;
}
