import mongoose from 'mongoose';

const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, enum: ['select', 'text'], required: true },
  required: { type: Boolean, default: true },
  options: [String],
  maxLength: Number,
  help: String,
  // Conditions are catalog data, interpreted by the shared form and backend validator.
  notApplicableWhen: { field: String, values: [String] },
}, { _id: false });

export const Game = mongoose.model('Game', new mongoose.Schema({
  slug: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  schemaVersion: { type: Number, required: true },
  description: String,
  fields: [fieldSchema],
  sources: [{ _id: false, title: String, url: String }],
}, { timestamps: true, strict: 'throw' }));
