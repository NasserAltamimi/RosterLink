import mongoose from 'mongoose';

const ref = model => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true });
const text = max => ({ type: String, required: true, trim: true, maxlength: max });
const options = { timestamps: true, strict: 'throw' };
export const Organization = mongoose.model('Organization', new mongoose.Schema({
  name: text(100), description: text(2000), region: text(100),
  website: { type: String, maxlength: 500, default: '' },
  managers: { type: [ref('User')], required: true, validate: value => value.length > 0 },
}, options));
Organization.schema.index({ managers: 1 });
export const Team = mongoose.model('Team', new mongoose.Schema({
  organization: { ...ref('Organization'), immutable: true },
  game: { ...ref('Game'), immutable: true },
  name: text(100), description: text(2000), managers: [ref('User')],
}, options));
Team.schema.index({ organization: 1 });
Team.schema.index({ managers: 1 });
export const Opening = mongoose.model('Opening', new mongoose.Schema({
  team: { ...ref('Team'), immutable: true },
  game: { ...ref('Game'), immutable: true },
  role: text(100), requirements: text(2000), platform: text(40), rank: { type: String, maxlength: 100, default: '' },
  region: text(100), language: text(100), schedule: text(300), timezone: text(100),
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active', required: true },
  createdBy: ref('User'), updatedBy: ref('User'), closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, closedAt: Date,
}, options));
Opening.schema.index({ status: 1, deadline: 1, game: 1 });
Opening.schema.index({ team: 1 });
export const recruitmentModels = [Organization, Team, Opening];
