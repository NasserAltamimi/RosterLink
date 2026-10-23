import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
}, { timestamps: true, strict: 'throw' });

export const User = mongoose.model('User', userSchema);
