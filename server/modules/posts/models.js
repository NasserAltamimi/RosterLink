import mongoose from 'mongoose';
import { commentLength, postAuthorPaths, postLength } from '../../../shared/posts.js';

const ref = model => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true, immutable: true });
const body = maxlength => ({ type: String, required: true, trim: true, maxlength });
const options = { timestamps: true, strict: 'throw' };

export const Post = mongoose.model('Post', new mongoose.Schema({
  authorKind: { type: String, enum: Object.keys(postAuthorPaths), required: true, immutable: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  body: { type: String, trim: true, maxlength: postLength, default: '' },
  attachments: [{ _id: false, kind: { type: String, enum: ['photo','video'] }, key: String, poster: String }],
  editedAt: Date,
  deletedAt: { type: Date, default: null },
}, options));
Post.schema.index({ authorKind: 1, authorId: 1, deletedAt: 1, createdAt: -1, _id: -1 });

export const PostReaction = mongoose.model('PostReaction', new mongoose.Schema({
  post: ref('Post'),
  user: ref('User'),
}, options));
PostReaction.schema.index({ post: 1, user: 1 }, { unique: true });

export const PostComment = mongoose.model('PostComment', new mongoose.Schema({
  post: ref('Post'),
  user: ref('User'),
  body: body(commentLength),
}, options));
PostComment.schema.index({ post: 1, createdAt: -1, _id: -1 });

Post.schema.index({ deletedAt: 1, createdAt: -1, _id: -1 });

const followSchema = new mongoose.Schema({
  user: ref('User'),
  kind: { type: String, enum: Object.keys(postAuthorPaths), required: true, immutable: true },
  target: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
  active: { type: Boolean, default: true },
}, options);
followSchema.index({ user: 1, kind: 1, target: 1 }, { unique: true });
followSchema.index({ kind: 1, target: 1, active: 1 });
export const Follow = mongoose.model('Follow', followSchema);
export const postModels = [Post, PostReaction, PostComment, Follow];
