import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  sessionVersion: { type: Number, default: 0 },
  resetTokens: { type: [new mongoose.Schema({
    hash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  }, { _id: false })], default: [], select: false },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
}, { timestamps: true, strict: 'throw' });

userSchema.index({ 'resetTokens.hash': 1 }, { sparse: true });

export const User = mongoose.model('User', userSchema);
