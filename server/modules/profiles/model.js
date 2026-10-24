import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, immutable: true },
  displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  bio: { type: String, default: '', maxlength: 1000 },
  region: { type: String, required: true, maxlength: 80 },
  languages: { type: [String], required: true, validate: value => value.length >= 1 && value.length <= 8 && value.every(item => item.length > 0 && item.length <= 40) },
  profileImage: String,
  headerImage: String,
}, { timestamps: true, strict: 'throw' });

export const PlayerProfile = mongoose.model('PlayerProfile', profileSchema);

const playerGameSchema = new mongoose.Schema({
  profile: { type: mongoose.Schema.Types.ObjectId, ref: 'PlayerProfile', required: true, immutable: true },
  game: { type: mongoose.Schema.Types.ObjectId, ref: 'Game', required: true, immutable: true },
  schemaVersion: { type: Number, required: true },
  source: { type: String, enum: ['self_reported'], default: 'self_reported', immutable: true },
  details: { type: Map, of: String, required: true },
  legacyDetails: { type: Map, of: String, default: undefined },
  experience: { type: [new mongoose.Schema({
    name: { type: String, required: true, maxlength: 200 },
    edition: { type: String, required: true, maxlength: 80 },
    placement: { type: String, required: true, maxlength: 120 },
    stage: { type: String, maxlength: 120, default: '' },
    tournament: { type: new mongoose.Schema({ provider: { type: String, enum: ['pandascore'], required: true }, id: { type: Number, required: true }, gameId: { type: Number, required: true } }, { _id: false }), default: null },
    competition: { type: new mongoose.Schema({ provider: { type: String, enum: ['pandascore'], required: true }, gameId: { type: Number, required: true }, leagueId: { type: Number, required: true }, seriesId: { type: Number, required: true }, stageIds: [Number] }, { _id: false }), default: null },
    result: { type: new mongoose.Schema({ kind: { type: String, enum: ['exact', 'range', 'top', 'elimination', 'manual'], required: true }, value: { type: String, required: true, maxlength: 120 } }, { _id: false }), default: null },
  }, { _id: false, strict: 'throw' })], default: [] },
}, { timestamps: true, strict: 'throw' });
playerGameSchema.index({ profile: 1, game: 1 }, { unique: true });
export const PlayerGame = mongoose.model('PlayerGame', playerGameSchema);
