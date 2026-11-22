import { Router } from 'express';
import { postMediaStorage } from '../../storage/post-media.js';
import { managedTeams } from '../recruitment/routes.js';
import { Types, isObjectIdOrHexString } from 'mongoose';
import { z } from 'zod';
import { commentLength, postAuthorPaths, postLength } from '../../../shared/posts.js';
import { HttpError, parse } from '../../lib/errors.js';
import { requireUser, sessionUser } from '../auth/routes.js';
import { PlayerProfile } from '../profiles/model.js';
import { publicAvatar } from '../profiles/public.js';
import { Organization, Team, organizationLogo } from '../recruitment/models.js';
import { canManageTeam, get, has } from '../recruitment/routes.js';
import { Post, PostBookmark, PostComment, PostReaction } from './models.js';

export const authorModels = { player: PlayerProfile, organization: Organization, team: Team };
const textInput = limit => z.strictObject({ body: z.string().trim().min(1, 'Enter some text.').max(limit) });
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const cursorInput = z.strictObject({ before: z.string().max(80).optional() });

export function identity(kind, subject, organization) {
  return {
    kind, name: kind === 'player' ? subject.displayName : subject.name,
    url: `${postAuthorPaths[kind]}/${subject.id}`,
    imageUrl: kind === 'player' ? publicAvatar(subject) : organizationLogo(organization),
  };
}

export async function authorScope(kind, id, user) {
  if (!Object.hasOwn(authorModels, kind)) throw new HttpError(404, 'Publishing identity not found.');
  const subject = await get(authorModels[kind], String(id));
  const organization = kind === 'team' ? await get(Organization, String(subject.organization)) : subject;
  let canPublish = false;
  if (user) {
    if (kind === 'player') canPublish = String(subject.owner) === user.id;
    else if (kind === 'organization') canPublish = has(subject.managers, user.id);
    else canPublish = canManageTeam(subject, organization, user.id);
  }
  return { subject, author: identity(kind, subject, organization), canPublish };
}

function requirePublisher(scope) {
  if (!scope.canPublish) throw new HttpError(403, 'You cannot publish or manage posts for this identity.');
}

export function pageFilter(scope, query) {
  const { before } = parse(cursorInput, query);
  if (!before) return scope;
  const [time, id, extra] = before.split('/');
  if (extra !== undefined || !z.iso.datetime().safeParse(time).success || !objectId.safeParse(id).success) {
    throw new HttpError(400, 'Invalid page cursor.');
  }
  const createdAt = new Date(time);
  return { $and: [scope, { $or: [{ createdAt: { $lt: createdAt } }, { createdAt, _id: { $lt: new Types.ObjectId(id) } }] }] };
}

export function pageResult(docs, limit) {
  const rows = docs.slice(0, limit);
  const last = rows.at(-1);
  return { rows, nextCursor: docs.length > limit ? `${last.createdAt.toISOString()}/${last._id}` : null };
}

export async function page(Model, scope, query, limit) {
  const docs = await Model.find(pageFilter(scope, query)).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
  return pageResult(docs, limit);
}

async function counts(Model, ids) {
  const rows = await Model.aggregate([{ $match: { post: { $in: ids } } }, { $group: { _id: '$post', count: { $sum: 1 } } }]);
  return new Map(rows.map(row => [String(row._id), row.count]));
}

function postDto(post) {
  const base = '/api/posts/' + post.id + '/media/';
  const attachments = post.attachments.map(({ kind, key, poster }) => ({ kind, key, url: base + key, ...(poster && { posterUrl: base + poster }) }));
  return { id: post.id, body: post.body, attachments, createdAt: post.createdAt, editedAt: post.editedAt };
}

export async function postRows(rows, user) {
  if (rows.length === 0) return [];
  const ids = rows.map(row => row._id);
  const [reactions, comments, mine, bookmarks] = await Promise.all([
    counts(PostReaction, ids),
    counts(PostComment, ids),
    user ? PostReaction.find({ post: { $in: ids }, user: user._id }).distinct('post') : [],
    user ? PostBookmark.find({ post: { $in: ids }, user: user._id }).distinct('post') : [],
  ]);
  const reacted = new Set(mine.map(String));
  const saved = new Set(bookmarks.map(String));
  return rows.map(row => ({
    ...postDto(row),
    reactionCount: reactions.get(row.id) || 0,
    commentCount: comments.get(row.id) || 0,
    reacted: reacted.has(row.id),
    ...(user && { saved: saved.has(row.id) }),
  }));
}

async function commentRows(rows, user) {
  if (rows.length === 0) return [];
  const profiles = await PlayerProfile.find({ owner: { $in: rows.map(row => row.user) } })
    .select('owner displayName profileImage updatedAt publicFields');
  const authors = new Map(profiles.map(profile => [String(profile.owner), identity('player', profile)]));
  return rows.map(row => ({
    id: row.id, body: row.body, createdAt: row.createdAt,
    author: authors.get(String(row.user)) || { kind: 'player', name: 'RosterLink member', url: null, imageUrl: null },
    canDelete: Boolean(user && String(row.user) === user.id),
  }));
}

export function postRoutes(directory) {
  const storage = postMediaStorage(directory);
  function validate(values, attachments) {
    return attachments?.length
      ? parse(z.strictObject({ body: z.string().trim().max(postLength).default('') }), values)
      : parse(textInput(postLength), values);
  }
  const router = Router();
  router.param('postId', async (req, res, next, id) => {
    req.post = isObjectIdOrHexString(id) && await Post.findOne({ _id: id, deletedAt: null });
    if (!req.post) throw new HttpError(404, 'Post not found.');
    next();
  });

  router.get('/identities', requireUser, async (req,res) => {
    const id = req.user._id;
    const [profile, orgs, teams] = await Promise.all([PlayerProfile.findOne({owner:id}), Organization.find({managers:id}), managedTeams(id)]);
    const entries = (kind,docs) => docs.map(doc => ({ kind, id:doc.id, name:doc.displayName || doc.name }));
    res.json({ identities: [...entries('player', profile ? [profile] : []), ...entries('organization',orgs), ...entries('team',teams)] });
  });
  router.get('/:postId/media/:key', (req,res) => {
    const key = req.params.key;
    if (!req.post.attachments.some(item => item.key === key || item.poster === key)) throw new HttpError(404,'Attachment not found.');
    res.sendFile(key, {root:storage.root, dotfiles:'allow'});
  });
  router.get('/by/:kind/:entityId', async (req, res) => {
    const { kind, entityId } = req.params;
    const user = await sessionUser(req);
    const { subject, author, canPublish } = await authorScope(kind, entityId, user);
    const { rows, nextCursor } = await page(Post, { authorKind: kind, authorId: subject._id, deletedAt: null }, req.query, 12);
    res.json({ author, canPublish, posts: await postRows(rows, user), nextCursor });
  });
  router.post('/by/:kind/:entityId', requireUser, async (req, res) => {
    const { kind, entityId } = req.params;
    const scope = await authorScope(kind, entityId, req.user);
    requirePublisher(scope);
    const post = await storage.receive(req,res,[],(body,attachments) =>
      Post.create({ ...validate(body,attachments), attachments, authorKind: kind, authorId: scope.subject._id }));
    res.status(201).json({ post: { ...postDto(post), reactionCount: 0, commentCount: 0, reacted: false, saved: false } });
  });
  router.patch('/:postId', requireUser, async (req, res) => {
    requirePublisher(await authorScope(req.post.authorKind, req.post.authorId, req.user));
    const post = await storage.receive(req,res,req.post.attachments, async (body,attachments) => {
      const values = validate(body,attachments ?? req.post.attachments);
      const updated = await Post.findOneAndUpdate({ _id:req.post._id, deletedAt:null, __v:req.post.__v },
        { $set:{ ...values, ...(attachments && {attachments}), editedAt:new Date() }, $inc:{__v:1} }, { returnDocument:'after',runValidators:true });
      if (!updated) throw new HttpError(409,'The post changed. Reload before editing.');
      return updated;
    });
    await storage.discard(req.post.attachments.filter(old => !post.attachments.some(item => item.key === old.key)));
    res.json({ post: postDto(post) });
  });
  router.delete('/:postId', requireUser, async (req, res) => {
    requirePublisher(await authorScope(req.post.authorKind, req.post.authorId, req.user));
    // A tombstone hides the whole discussion atomically, including concurrent interactions.
    const previous = await Post.findOneAndUpdate({ _id: req.post._id, deletedAt: null }, { $set: { deletedAt: new Date(), attachments: [] }, $unset: { body: 1 } });
    if (previous) await storage.discard(previous.attachments);
    res.status(204).end();
  });

  async function reaction(req, res) {
    const post = req.post._id;
    const key = { post, user: req.user._id };
    if (req.method === 'PUT') {
      try { await PostReaction.updateOne(key, { $setOnInsert: key }, { upsert: true }); }
      catch (error) { if (error.code !== 11000) throw error; }
    } else await PostReaction.deleteOne(key);
    const [reactionCount, reacted] = await Promise.all([PostReaction.countDocuments({ post }), PostReaction.exists(key)]);
    res.json({ reactionCount, reacted: Boolean(reacted) });
  }
  router.put('/:postId/reaction', requireUser, reaction);
  router.delete('/:postId/reaction', requireUser, reaction);

  async function bookmark(req, res) {
    const key = { post: req.post._id, user: req.user._id };
    if (req.method === 'PUT') {
      try {
        await PostBookmark.updateOne(key, { $setOnInsert: key }, { upsert: true });
      } catch (error) {
        if (error.code !== 11000) throw error;
      }
    } else await PostBookmark.deleteOne(key);
    res.json({ saved: Boolean(await PostBookmark.exists(key)) });
  }
  router.put('/:postId/bookmark', requireUser, bookmark);
  router.delete('/:postId/bookmark', requireUser, bookmark);

  router.get('/:postId/comments', async (req, res) => {
    const post = req.post._id;
    const [user, { rows, nextCursor }, commentCount] = await Promise.all([
      sessionUser(req), page(PostComment, { post }, req.query, 15), PostComment.countDocuments({ post }),
    ]);
    res.json({ comments: await commentRows(rows, user), commentCount, nextCursor });
  });
  router.post('/:postId/comments', requireUser, async (req, res) => {
    const post = req.post._id;
    const values = parse(textInput(commentLength), req.body);
    const row = await PostComment.create({ ...values, post, user: req.user._id });
    const [[comment], commentCount] = await Promise.all([commentRows([row], req.user), PostComment.countDocuments({ post })]);
    res.status(201).json({ comment, commentCount });
  });
  router.delete('/:postId/comments/:commentId', requireUser, async (req, res) => {
    const post = req.post._id;
    const { commentId } = req.params;
    if (!isObjectIdOrHexString(commentId)) throw new HttpError(404, 'Comment not found.');
    const comment = await PostComment.findOne({ _id: commentId, post }).select('user');
    if (!comment) throw new HttpError(404, 'Comment not found.');
    if (String(comment.user) !== req.user.id) throw new HttpError(403, 'You can only delete your own comments.');
    await PostComment.deleteOne({ _id: comment._id, post, user: req.user._id });
    res.json({ commentCount: await PostComment.countDocuments({ post }) });
  });
  return router;
}
