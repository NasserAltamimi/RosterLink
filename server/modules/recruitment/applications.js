import { Router } from 'express';
import { z } from 'zod';
import { Application, Opening, Organization, Team, organizationLogo } from './models.js';
import { get, has, managedTeams, teamManager } from './routes.js';
import { PlayerGame, PlayerProfile } from '../profiles/model.js';
import { publicAvatar } from '../profiles/public.js';
import { resolvePrivacy } from '../../../shared/profile-privacy.js';
import { requireUser } from '../auth/routes.js';
import { HttpError, parse } from '../../lib/errors.js';
import { activeApplicationStates, applicationStates } from '../../../shared/applications.js';

const text = maximum => z.string().trim().min(1, 'This field is required.').max(maximum);
const submission = z.strictObject({ introduction: text(1600), availability: text(300), submissionId: z.uuid() });
const revision = z.number().int().nonnegative();
const actionInput = z.strictObject({ revision, action: z.enum(['review', 'shortlist', 'accept', 'reject', 'withdraw', 'attend', 'decline']) });
const invitationInput = z.strictObject({
  revision,
  startsAt: z.iso.datetime({ offset: true }).refine(value => Date.parse(value) > Date.now(), 'Choose a future date and time.'),
  timeZone: text(100).refine(value => {
    try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
  }, 'Choose a valid timezone.'),
  notes: text(1000),
});
const active = status => activeApplicationStates.includes(status);
const transitions = { review: 'reviewing', shortlist: 'shortlisted', accept: 'accepted', reject: 'rejected', withdraw: 'withdrawn' };
const playerActions = ['withdraw', 'attend', 'decline'];

function allowedActions(application, manager) {
  if (!active(application.status)) return [];
  if (!manager) {
    const invitation = application.invitation;
    return invitation?.status === 'pending' && invitation.startsAt > new Date() ? ['attend', 'decline', 'withdraw'] : ['withdraw'];
  }
  const actions = ['accept', 'reject'];
  if (application.status === 'submitted') actions.unshift('review');
  if (application.status !== 'shortlisted') actions.unshift('shortlist');
  else if (!application.invitation) actions.unshift('invite');
  return actions;
}

const related = [
  { path: 'opening', select: 'role game', populate: { path: 'game', select: 'name' } },
  { path: 'team', select: 'name organization', populate: { path: 'organization', select: 'name logoImage updatedAt' } },
  { path: 'profile', select: 'displayName publicFields profileImage region updatedAt' },
];

function applicationDto(row, manager, rank, includeHistory = false) {
  const shown = resolvePrivacy(row.profile).publicFields;
  return {
    id: row.id,
    opening: { id: row.opening.id, role: row.opening.role, gameName: row.opening.game?.name },
    team: { id: row.team.id, name: row.team.name, organizationId: row.team.organization.id, organizationName: row.team.organization.name, logoUrl: organizationLogo(row.team.organization) },
    profile: { id: row.profile.id, name: row.profile.displayName,
      ...(manager && { avatarUrl: publicAvatar(row.profile), ...(shown.region && { region: row.profile.region }), ...(shown.rank && rank && { rank }) }) },
    status: row.status, revision: row.revision, createdAt: row.createdAt, updatedAt: row.updatedAt,
    introduction: row.introduction, availability: row.availability,
    invitation: row.invitation,
    actions: allowedActions(row, manager), viewer: manager ? 'manager' : 'player',
    ...(includeHistory && { history: row.events.map(({ kind, date }) => ({ kind, date })) }),
  };
}

async function detail(row, manager) {
  await row.populate(related);
  const game = row.opening.game;
  const section = manager && game && await PlayerGame.findOne({ profile: row.profile._id, game: game._id }).select('details.rank');
  return applicationDto(row, manager, section?.details?.get('rank'), true);
}

async function audience(teamId, actor) {
  const team = await Team.findById(teamId).select('organization managers');
  const organization = await Organization.findById(team.organization).select('managers');
  return [...new Set([...organization.managers, ...team.managers].map(String))].filter(id => id !== String(actor));
}

function event(kind, recipients) {
  return { kind, recipients, date: new Date() };
}

export function applicationRoutes() {
  const router = Router();
  router.use(requireUser);
  router.param('openingId', async (req, res, next, id) => {
    req.opening = await get(Opening, id);
    next();
  });
  router.param('applicationId', async (req, res, next, id) => {
    const row = await get(Application, id);
    req.application = row;
    req.isApplicant = String(row.player) === req.user.id;
    if (!req.isApplicant) {
      try { await teamManager(req, String(row.team)); }
      catch (error) {
        if (error.status === 403) throw new HttpError(404, 'Application not found.');
        throw error;
      }
    }
    next();
  });

  router.get('/opening/:openingId', async (req, res) => {
    const opening = req.opening;
    const [existing, profile, team] = await Promise.all([
      Application.findOne({ opening: opening._id, player: req.user._id, status: { $in: activeApplicationStates } }).select('_id'),
      PlayerProfile.findOne({ owner: req.user._id }).select('_id displayName'),
      Team.findById(opening.team).populate('organization', 'managers'),
    ]);
    res.json({
      applicationId: existing?.id,
      profile: profile ? { id: profile.id, name: profile.displayName } : null,
      canManage: has(team.managers, req.user.id) || has(team.organization.managers, req.user.id),
    });
  });
  router.post('/opening/:openingId', async (req, res) => {
    const opening = req.opening;
    const values = parse(submission, req.body);
    const tokenFilter = { player: req.user._id, submissionId: values.submissionId };
    const respondExisting = async () => {
      const existing = await Application.findOne(tokenFilter).select('opening');
      if (!existing) return false;
      if (String(existing.opening) !== opening.id) throw new HttpError(409, 'This submission belongs to another opening.');
      res.json({ id: existing.id });
      return true;
    };
    if (await respondExisting()) return;
    const profile = await PlayerProfile.findOne({ owner: req.user._id }).select('_id');
    if (!profile) throw new HttpError(400, 'Create a player profile before applying.');
    const recipients = await audience(opening.team, req.user.id);
    // Admission is serialized with closure on the opening document in standalone MongoDB.
    const admitted = await Opening.updateOne({ _id: opening._id, status: 'active', deadline: { $gt: new Date() } },
      { $currentDate: { lastApplicationAdmissionAt: true } }, { timestamps: false });
    if (!admitted.matchedCount) throw new HttpError(409, 'This opening is no longer accepting applications.');
    try {
      const application = await Application.create({ ...values, player: req.user._id, profile: profile._id,
        opening: opening._id, team: opening.team, events: [event('submitted', recipients)] });
      res.status(201).json({ id: application.id });
    } catch (error) {
      if (error.code !== 11000) throw error;
      if (!await respondExisting()) throw new HttpError(409, 'You already have an active application for this opening.');
    }
  });

  router.get('/', async (req, res) => {
    const rows = await Application.find({ player: req.user._id }).sort({ updatedAt: -1, _id: -1 }).populate(related);
    res.json({ applications: rows.map(row => applicationDto(row, false)) });
  });
  router.get('/review/:openingId', async (req, res) => {
    const opening = req.opening;
    const team = await teamManager(req, String(opening.team));
    const { status } = parse(z.strictObject({ status: z.enum(Object.keys(applicationStates)).optional() }), req.query);
    const organization = await Organization.findById(team.organization).select('name logoImage updatedAt');
    const rows = await Application.find({ opening: opening._id, player: { $ne: req.user._id }, ...(status && { status }) })
      .sort({ updatedAt: -1, _id: -1 }).populate(related);
    const sections = await PlayerGame.find({ profile: { $in: rows.map(row => row.profile._id) }, game: opening.game }).select('profile details.rank');
    const ranks = new Map(sections.map(section => [String(section.profile), section.details?.get('rank')]));
    res.json({ opening: { id: opening.id, role: opening.role, team: team.name, teamId: team.id, organization: organization.name, organizationId: organization.id, logoUrl: organizationLogo(organization) },
      applications: rows.map(row => applicationDto(row, true, ranks.get(row.profile.id))) });
  });
  router.get('/detail/:applicationId', async (req, res) => res.json({ application: await detail(req.application, !req.isApplicant) }));

  async function update(req, res, action, expectedRevision, changes = {}) {
    const row = req.application;
    if (playerActions.includes(action) !== req.isApplicant) throw new HttpError(403, 'You do not have permission to take this action.');
    if (expectedRevision !== row.revision || !allowedActions(row, !req.isApplicant).includes(action)) {
      throw new HttpError(409, 'This action is no longer available. Refresh to see the latest status.');
    }
    const status = transitions[action];
    const inviteResponse = { attend: 'attending', decline: 'declined' }[action];
    const kind = action === 'invite' ? 'invited' : inviteResponse || status;
    const guard = { _id: row._id, revision: expectedRevision };
    if (status) {
      changes.status = status;
      if (!active(status) && row.invitation?.status === 'pending') changes['invitation.status'] = 'cancelled';
    }
    if (inviteResponse) {
      changes['invitation.status'] = inviteResponse;
      guard['invitation.startsAt'] = { $gt: new Date() };
    }
    const recipients = req.isApplicant ? await audience(row.team, req.user.id) : [row.player];
    const saved = await Application.findOneAndUpdate(guard, {
      $set: changes, $inc: { revision: 1 }, $push: { events: event(kind, recipients) },
    }, { returnDocument: 'after', runValidators: true });
    if (!saved) throw new HttpError(409, 'This application changed. Refresh to see the latest status.');
    res.json({ application: await detail(saved, !req.isApplicant) });
  }
  router.post('/detail/:applicationId/action', async (req, res) => {
    const { action, revision } = parse(actionInput, req.body);
    await update(req, res, action, revision);
  });
  router.post('/detail/:applicationId/invitation', async (req, res) => {
    const { revision, ...invitation } = parse(invitationInput, req.body);
    await update(req, res, 'invite', revision, { invitation: { ...invitation, status: 'pending' } });
  });

  async function notificationScope(user) {
    const teams = await managedTeams(user);
    return { $or: [{ player: user }, { team: { $in: teams.map(team => team._id) } }] };
  }
  router.get('/notifications/unread', async (req, res) => {
    const user = req.user._id;
    const unread = await Application.exists({ ...(await notificationScope(user)), events: { $elemMatch: { recipients: user, readBy: { $ne: user } } } });
    res.json({ unread: Boolean(unread) });
  });
  router.get('/notifications', async (req, res) => {
    const user = req.user._id;
    const rows = await Application.aggregate([
      { $match: { 'events.recipients': user, ...(await notificationScope(user)) } },
      { $unwind: '$events' },
      { $match: { 'events.recipients': user } },
      { $sort: { 'events.date': -1, 'events._id': -1 } },
      { $limit: 100 },
      { $project: { opening: 1, events: 1 } },
    ]);
    await Application.populate(rows, { path: 'opening', select: 'role' });
    res.json({ notifications: rows.map(row => ({
      id: row.events._id, applicationId: row._id, kind: row.events.kind,
      opening: row.opening?.role, date: row.events.date, read: has(row.events.readBy, user),
    })) });
  });
  router.post('/notifications/:applicationId/read', async (req, res) => {
    const { eventId } = parse(z.strictObject({ eventId: z.string().regex(/^[a-f\d]{24}$/i) }), req.body);
    await Application.updateOne({ _id: req.application._id, events: { $elemMatch: { _id: eventId, recipients: req.user._id } } },
      { $addToSet: { 'events.$.readBy': req.user._id } }, { timestamps: false });
    res.status(204).end();
  });
  return router;
}
