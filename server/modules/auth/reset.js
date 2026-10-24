import { Router } from 'express';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { User } from './model.js';
import { hashPassword } from './passwords.js';
import { HttpError, parse } from '../../lib/errors.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, 'This reset link is invalid. Request a new link.');
const invalid = () => new HttpError(400, 'This reset link is invalid or has already been used. Request a new link.');
const expired = () => new HttpError(410, 'This reset link has expired. Request a new link.');
export const resetRequestMessage = 'If an active account exists for this email, you will receive a password reset link. Check your inbox and spam folder.';

export function passwordResetRoutes({ origin, resetMailer, credentials }) {
  const router = Router();
  const options = { windowMs: 15 * 60 * 1000, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in 15 minutes.' } };
  const requestIp = rateLimit({ ...options, limit: 10 });
  const requestEmail = rateLimit({ ...options, limit: 5,
    // Keys cannot expose addresses, and unknown addresses consume the same budget.
    keyGenerator: req => digest(req.body.email), });
  const submissions = rateLimit({ ...options, limit: 30 });
  const requestSchema = credentials.pick({ email: true });
  const resetSchema = z.object({ token: tokenSchema, password: credentials.shape.password,
    confirmPassword: z.string().max(128) }).strict().refine(value => value.password === value.confirmPassword,
    { path: ['confirmPassword'], message: 'Passwords must match.' });
  router.post('/forgot-password', requestIp, (req, res, next) => {
    req.body = parse(requestSchema, req.body); next();
  }, requestEmail, async (req, res) => {
    if (!resetMailer) throw new HttpError(503, 'Password reset email is temporarily unavailable. Please try again later.');
    // Generate and hash on both paths, and issue the same database operation.
    const token = randomBytes(32).toString('hex');
    const link = new URL('/reset-password', origin);
    // Fragments are not sent to HTTP servers, access logs or Referer headers.
    link.hash = token;
    const [user] = await Promise.all([User.findOneAndUpdate({ email: req.body.email, status: 'active' },
      { $push: { resetTokens: { $each: [{ hash: digest(token), expiresAt: new Date(Date.now() + 30 * 60 * 1000) }], $slice: -5 } } },
      { returnDocument: 'after' }).select('email'), delay(300 + randomInt(101))]);
    // Do not await SMTP on the response path: network timing must not reveal an account.
    // Deliberately log only a fixed category, never provider errors or message content.
    res.status(202).json({ message: resetRequestMessage });
    if (user) setImmediate(() => Promise.resolve().then(() => resetMailer({ email: user.email, link: link.href }))
      .catch(() => console.error('Password reset email delivery failed.')));
  });
  async function findToken(token) {
    const hash = digest(token);
    const user = await User.findOne({ status: 'active', 'resetTokens.hash': hash }).select('+resetTokens');
    if (!user) throw invalid();
    if (user.resetTokens.find(item => item.hash === hash).expiresAt <= new Date()) throw expired();
    return { user, hash };
  }
  router.post('/reset-password/validate', submissions, async (req, res) => {
    const { token } = parse(z.object({ token: tokenSchema }).strict(), req.body);
    await findToken(token);
    res.json({ message: 'Choose your new password.' });
  });
  router.post('/reset-password', submissions, async (req, res) => {
    const { token, password } = parse(resetSchema, req.body);
    const { user, hash } = await findToken(token);
    const passwordHash = await hashPassword(password);
    // One document write commits the password, consumes every outstanding token,
    // and revokes every prior session. Works on standalone MongoDB, no transaction needed.
    const result = await User.updateOne({ _id: user._id, status: 'active',
      resetTokens: { $elemMatch: { hash, expiresAt: { $gt: new Date() } } } },
    { $set: { passwordHash, resetTokens: [] }, $inc: { sessionVersion: 1 } });
    if (!result.modifiedCount) throw invalid();
    res.json({ message: 'Your password has been reset. Log in with your new password.' });
  });
  return router;
}
