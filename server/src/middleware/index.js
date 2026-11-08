import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Business, User } from '../models/index.js';
import { ApiError } from '../utils/errors.js';

export const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax', // same-site via the Vercel /api proxy
  path: '/',
  maxAge: 7 * 24 * 3600 * 1000,
});

export function issueSession(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
  res.cookie(env.COOKIE_NAME, token, cookieOptions());
}

export function clearSession(res) {
  const { maxAge, ...rest } = cookieOptions();
  res.clearCookie(env.COOKIE_NAME, rest);
}

export async function requireAuth(req, _res, next) {
  const token = req.cookies?.[env.COOKIE_NAME];
  if (!token) return next(ApiError.unauthorized());
  let payload;
  try {
    payload = jwt.verify(token, env.JWT_SECRET);
  } catch {
    return next(new ApiError(401, 'SESSION_EXPIRED', 'Session expired. Please sign in again.'));
  }
  const user = await User.findById(payload.sub);
  if (!user) return next(ApiError.unauthorized());
  req.user = user;
  next();
}

/** Loads :businessId and enforces that the authenticated user owns it. 404 otherwise
 * (does not reveal existence of other businesses). */
export async function loadBusiness(req, _res, next) {
  const { businessId } = req.params;
  if (!mongoose.isValidObjectId(businessId)) return next(ApiError.notFound('Business not found'));
  const business = await Business.findOne({ _id: businessId, ownerId: req.user._id });
  if (!business) return next(ApiError.notFound('Business not found'));
  req.business = business;
  next();
}

/** CSRF defence for cookie auth: state-changing requests must carry a custom header
 * (cannot be set cross-site without a CORS preflight) and, if present, an allowed Origin. */
export function csrfGuard(req, _res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.path.startsWith('/webhooks/')) return next();
  if (req.get('x-requested-with') !== 'bizgent') return next(ApiError.forbidden('Missing CSRF header'));
  const origin = req.get('origin');
  if (origin && !env.allowedOrigins.includes(origin)) return next(ApiError.forbidden('Origin not allowed'));
  next();
}

export const validate = (schema, source = 'body') => (req, _res, next) => {
  const { value, error } = schema.validate(req[source], { abortEarly: false, stripUnknown: true });
  if (error) return next(ApiError.badRequest('Validation failed', error.details.map((d) => ({ field: d.path.join('.'), message: d.message }))));
  if (source === 'query') req.validQuery = value;
  else req[source] = value;
  next();
};

export function notFound(_req, _res, next) {
  next(ApiError.notFound('Route not found'));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err?.name === 'ValidationError') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: err.message } });
  }
  if (err?.code === 11000) {
    return res.status(409).json({ error: { code: 'DUPLICATE', message: 'A record with these details already exists' } });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid JSON body' } });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
