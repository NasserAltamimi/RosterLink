import { Router } from 'express';
import { z } from 'zod';
import { HttpError, parse } from '../../lib/errors.js';
import { requireUser, sessionUser } from '../auth/routes.js';
import { PlayerProfile } from '../profiles/model.js';
import { Organization, Team } from '../recruitment/models.js';
import { canManageTeam, has } from '../recruitment/routes.js';
import { Follow, Post, PostBookmark } from './models.js';
import { authorModels, authorScope, identity, page, pageFilter, pageResult, postRows } from './routes.js';

const kinds = Object.keys(authorModels);
const limit = 12;
const search = z.string().trim().max(100).default('');
const offset = z.coerce.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0);
const keyOf = (kind, id) => kind + '/' + id;
const nameField = kind => kind === 'player' ? 'displayName' : 'name';
const literal = value => new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

function targets(rows) {
  return kinds.map(kind => ({
    authorKind: kind, authorId: { $in: rows.filter(row => row.kind === kind).map(row => row.target) },
  }));
}

// Hydrate just this page. Resolve team badges through their parent organization and reuse profile privacy.
async function identities(refs, user) {
  const ids = kind => refs.filter(ref => ref.kind === kind).map(ref => ref.target);
  const [players, teams, follows] = await Promise.all([
    PlayerProfile.find({ _id: { $in: ids('player') } }),
    Team.find({ _id: { $in: ids('team') } }),
    user ? Follow.find({ user: user._id, active: true, target: { $in: refs.map(ref => ref.target) } }) : [],
  ]);
  const orgs = await Organization.find({ _id: { $in: [...ids('organization'), ...teams.map(team => team.organization)] } });
  const parents = new Map(orgs.map(org => [org.id, org]));
  const following = new Set(follows.map(row => keyOf(row.kind, row.target)));
  const result = new Map();
  for (const [kind, docs] of [['player', players], ['organization', orgs], ['team', teams]]) {
    for (const doc of docs) {
      const org = kind === 'team' ? parents.get(String(doc.organization)) : doc;
      const self = Boolean(user && kind === 'player' && String(doc.owner) === user.id);
      const key = keyOf(kind, doc.id);
      result.set(key, { ...identity(kind, doc, org), id:doc.id, self, following: following.has(key),
        canPublish: Boolean(user && (kind === 'player' ? self : kind === 'team' ? org && canManageTeam(doc, org, user.id) : has(doc.managers, user.id))) });
    }
  }
  return result;
}

async function timelinePosts(rows, user) {
  const refs = rows.map(post => ({ kind: post.authorKind, target: post.authorId }));
  const [posts, authors] = await Promise.all([postRows(rows, user), identities(refs, user)]);
  return posts.flatMap((post, index) => {
    const { kind, target } = refs[index];
    const author = authors.get(keyOf(kind, target));
    return author ? [{ ...post, author }] : [];
  });
}

export function discoveryRoutes() {
  const router = Router();
  router.get('/feed', async (req, res) => {
    const { tab, q, before } = parse(z.strictObject({ tab: z.enum(['following','all']).optional(), q: search, before: z.string().max(80).optional() }), req.query);
    const user = await sessionUser(req);
    const follows = user ? await Follow.find({ user: user._id, active: true }).select('kind target') : [];
    const scope = user ? tab || (follows.length ? 'following' : 'all') : 'all';
    const conditions = [{ deletedAt: null }];
    if (scope === 'following') conditions.push({ $or: targets(follows) });
    if (q) {
      const authorName = literal(q.replace(/^@(?=.)/, ''));
      const authors = await Promise.all(kinds.map(async kind => ({
        authorKind: kind, authorId: { $in: await authorModels[kind].distinct('_id', { [nameField(kind)]: authorName }) },
      })));
      conditions.push({ $or: [{ body: literal(q) }, ...authors] });
    }
    const { rows, nextCursor } = await page(Post, { $and: conditions }, { before }, limit);
    res.json({ tab: scope, posts: await timelinePosts(rows, user), nextCursor });
  });

  router.get('/saved-posts', requireUser, async (req, res) => {
    const bookmarks = await PostBookmark.aggregate([
      { $match: pageFilter({ user: req.user._id }, req.query) },
      { $sort: { createdAt: -1, _id: -1 } },
      { $lookup: { from: Post.collection.name, localField: 'post', foreignField: '_id', as: 'post' } },
      { $unwind: '$post' },
      { $match: { 'post.deletedAt': null } },
      { $limit: limit + 1 },
    ]);
    const { rows, nextCursor } = pageResult(bookmarks, limit);
    const posts = await timelinePosts(rows.map(row => Post.hydrate(row.post)), req.user);
    res.json({ posts: posts.filter(post => post.saved), nextCursor });
  });

  router.get('/accounts', async (req,res) => {
    const { q, start } = parse(z.strictObject({ q: search, start: offset }), req.query);
    const user = await sessionUser(req);
    const pattern = literal(q.replace(/^@(?=.)/, ''));
    const pipeline = kind => [
      { $match: { [nameField(kind)]: pattern } },
      { $project: { name: '$' + nameField(kind), kind: { $literal: kind } } },
    ];
    const rows = await PlayerProfile.aggregate([
      ...pipeline('player'), ...kinds.slice(1).map(kind => ({ $unionWith: { coll: authorModels[kind].collection.name, pipeline: pipeline(kind) } })),
      { $sort: { name: 1, kind: 1, _id: 1 } }, { $skip: start }, { $limit: limit + 1 },
    ]).collation({ locale: 'en', strength: 2 });
    const refs = rows.slice(0,limit).map(row => ({ kind: row.kind, target: row._id }));
    const accounts = await identities(refs,user);
    res.json({ accounts: refs.map(row => accounts.get(keyOf(row.kind,row.target))), next: rows.length > limit ? start + limit : null });
  });

  router.param('id', async (req,res,next,id) => {
    req.viewer = await sessionUser(req);
    req.entity = (await authorScope(req.params.kind,id,req.viewer)).subject;
    next();
  });
  const edge = req => ({ kind: req.params.kind, target: req.entity._id });
  async function summary(req) {
    const self = req.params.kind === 'player' && req.viewer?.id === String(req.entity.owner);
    const [followers, followingCount, followed] = await Promise.all([
      Follow.countDocuments({ ...edge(req), active: true }),
      req.params.kind === 'player' ? Follow.countDocuments({ user: req.entity.owner, active: true }) : null,
      req.viewer && Follow.exists({ ...edge(req), user: req.viewer._id, active: true }),
    ]);
    return { self, following: Boolean(followed), followers, followingCount };
  }
  router.get('/:kind/:id', async (req,res) => res.json(await summary(req)));
  async function change(req,res) {
    if (req.params.kind === 'player' && req.user.id === String(req.entity.owner)) throw new HttpError(400,'You cannot follow your own player profile.');
    const filter = { ...edge(req), user: req.user._id };
    const active = req.method === 'PUT';
    try { await Follow.updateOne(filter, { $set: { active } }, { upsert: active }); }
    catch (error) {
      if (error.code !== 11000 || !active) throw error;
      await Follow.updateOne(filter, { $set: { active } });
    }
    res.json(await summary(req));
  }
  router.put('/:kind/:id', requireUser, change);
  router.delete('/:kind/:id', requireUser, change);
  router.get('/:kind/:id/:list', async (req,res) => {
    const { start } = parse(z.strictObject({ start: offset }),req.query);
    const { list, kind } = req.params;
    const inbound = list === 'followers';
    if (!inbound && (list !== 'following' || kind !== 'player')) throw new HttpError(404,'List not found.');
    const rows = await Follow.find({ ...(inbound ? edge(req) : { user: req.entity.owner }), active: true }).sort({ _id: -1 }).skip(start).limit(limit+1);
    const slice = rows.slice(0,limit);
    const players = inbound ? await PlayerProfile.find({ owner: { $in: slice.map(row => row.user) } }).select('owner') : [];
    const profiles = new Map(players.map(p => [String(p.owner),p._id]));
    const refs = slice.map(row => inbound ? { kind:'player', target:profiles.get(String(row.user)) } : row);
    const accounts = await identities(refs.filter(ref=>ref.target),req.viewer);
    res.json({ accounts: refs.map(ref => accounts.get(keyOf(ref.kind,ref.target)) || { name: 'RosterLink member', kind:'member' }), next: rows.length > limit ? start + limit : null });
  });
  return router;
}
