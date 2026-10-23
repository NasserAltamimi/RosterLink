import { Router } from 'express';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { User } from './model.js';
import { hashPassword, verifyPassword } from './passwords.js';
import { HttpError, parse } from '../../lib/errors.js';

const credentials = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').max(254),
  password: z.string().min(12, 'Use at least 12 characters.').max(128, 'Use at most 128 characters.'),
}).strict();
const loginCredentials = credentials.extend({ password: z.string().min(1, 'Enter your password.').max(128) });
const safeUser = user => ({ id: user.id, email: user.email });
const saveSession = req => new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
function csrfToken(req) { return req.session.csrfToken ??= randomBytes(32).toString('hex'); }

export function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const expected = req.session.csrfToken;
  const supplied = req.get('X-CSRF-Token');
  if (!expected || !supplied || Buffer.byteLength(expected) !== Buffer.byteLength(supplied)
    || !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))) {
    return next(new HttpError(403, 'Your session changed. Refresh the page and try again.'));
  }
  next();
}

export async function requireUser(req, res, next) {
  if (!req.session.userId) throw new HttpError(401, 'Please log in to continue.');
  const user = await User.findOne({ _id: req.session.userId, status: 'active' });
  if (!user) throw new HttpError(401, 'Please log in to continue.');
  req.user = user;
  next();
}

export function authRoutes({ secureCookies = false } = {}) {
  const router = Router();
  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false,
    message: { message: 'Too many attempts. Please try again in 15 minutes.' } });
  router.get('/session', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ _id: req.session.userId, status: 'active' }) : null;
    const token = csrfToken(req);
    await saveSession(req);
    res.json({ user: user ? safeUser(user) : null, csrfToken: token });
  });
  const authenticate = async (req, user, res, status = 200) => {
    await regenerate(req);
    req.session.userId = user.id;
    const token = csrfToken(req);
    await saveSession(req);
    res.status(status).json({ user: safeUser(user), csrfToken: token });
  };
  router.post('/register', limiter, async (req, res) => {
    const { email, password } = parse(credentials, req.body);
    if (await User.exists({ email })) throw new HttpError(409, 'An account with this email already exists.');
    const user = await User.create({ email, passwordHash: await hashPassword(password) });
    await authenticate(req, user, res, 201);
  });
  // A dummy hash keeps nonexistent-account failures on the same expensive verification path.
  const dummyHash = hashPassword(randomBytes(24).toString('hex'));
  router.post('/login', limiter, async (req, res) => {
    const { email, password } = parse(loginCredentials, req.body);
    const user = await User.findOne({ email }).select('+passwordHash');
    const valid = await verifyPassword(password, user?.passwordHash || await dummyHash);
    if (!valid || !user || user.status !== 'active') throw new HttpError(401, 'Email or password is incorrect.');
    await authenticate(req, user, res);
  });
  router.post('/logout', async (req, res) => {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
    res.clearCookie('rosterlink.sid', { path: '/', httpOnly: true, sameSite: 'lax', secure: secureCookies });
    res.status(204).end();
  });
  return router;
}
