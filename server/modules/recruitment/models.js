import mongoose from 'mongoose';
import { scheduleDays, scheduleTimes } from '../../../shared/schedule.js';
import { activeApplicationStates, applicationStates, applicationUpdates } from '../../../shared/applications.js';

const ref = model => ({ type: mongoose.Schema.Types.ObjectId, ref: model, required: true });
const text = max => ({ type: String, required: true, trim: true, maxlength: max });
const options = { timestamps: true, strict: 'throw' };
export const Organization = mongoose.model('Organization', new mongoose.Schema({
  name: text(100), description: text(2000), region: text(100),
  website: { type: String, maxlength: 500, default: '' },
  logoImage: String,
  managers: { type: [ref('User')], required: true, validate: value => value.length > 0 },
}, options));
Organization.schema.index({ managers: 1 });
export const organizationLogo = org => org?.logoImage ? `/api/organizations/${org._id}/logo?v=${org.updatedAt.getTime()}` : null;
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
  scheduleSlots: { type: [new mongoose.Schema({ day: { type: String, enum: scheduleDays.map(([day]) => day), required: true }, start: { type: String, enum: scheduleTimes, required: true }, end: { type: String, enum: scheduleTimes, required: true } }, { _id: false, strict: 'throw' })], default: undefined },
  deadline: { type: Date, required: true },
  status: { type: String, enum: ['active', 'closed'], default: 'active', required: true },
  createdBy: ref('User'), updatedBy: ref('User'), closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, closedAt: Date,
  lastApplicationAdmissionAt: Date,
}, options));
Opening.schema.index({ status: 1, deadline: 1, game: 1 });
Opening.schema.index({ team: 1 });
const invitationSchema = new mongoose.Schema({
  startsAt: { type: Date, required: true },
  timeZone: text(100),
  notes: text(1000),
  status: { type: String, enum: ['pending', 'attending', 'declined', 'cancelled'], required: true },
}, { _id: false, strict: 'throw' });
const applicationEventSchema = new mongoose.Schema({
  kind: { type: String, enum: Object.keys(applicationUpdates), required: true },
  date: { type: Date, required: true },
  recipients: [ref('User')],
  readBy: [ref('User')],
}, { strict: 'throw' });
export const Application = mongoose.model('Application', new mongoose.Schema({
  opening: { ...ref('Opening'), immutable: true },
  team: { ...ref('Team'), immutable: true },
  player: { ...ref('User'), immutable: true },
  profile: { ...ref('PlayerProfile'), immutable: true },
  submissionId: { type: String, required: true, immutable: true },
  introduction: text(1600),
  availability: text(300),
  status: { type: String, enum: Object.keys(applicationStates), required: true, default: 'submitted' },
  revision: { type: Number, default: 0, required: true },
  invitation: { type: invitationSchema, default: undefined },
  events: [applicationEventSchema],
}, options));
Application.schema.index({ opening: 1, player: 1 }, { unique: true, partialFilterExpression: { status: { $in: activeApplicationStates } } });
Application.schema.index({ player: 1, submissionId: 1 }, { unique: true });
Application.schema.index({ player: 1, updatedAt: -1 });
Application.schema.index({ opening: 1, updatedAt: -1 });
Application.schema.index({ 'events.recipients': 1 });
export const recruitmentModels = [Organization, Team, Opening, Application];
