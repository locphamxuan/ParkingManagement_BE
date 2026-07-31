const env = require('../config/env');
const AppError = require('../utils/AppError');
const { COOKIE_NAME } = require('../utils/authCookie');

/**
 * CSRF guard for cookie-authenticated writes.
 *
 * The auth cookie is SameSite=None (the FE and BE are always cross-origin), so
 * the browser attaches it to cross-site requests too. CORS does not help here:
 * it hides the RESPONSE from the attacker page but the request still executes.
 *
 * Only requests that rely on the cookie are guarded. Native mobile sends
 * `Authorization: Bearer` and no Origin — a browser cannot forge that header
 * cross-origin, so those requests pass through untouched.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isAllowedOrigin = (origin) => {
  if (env.clientOrigins.includes(origin)) return true;
  // Mirrors the CORS dev branch in app.js (Vite 5173, Expo Web 8081, ...).
  // Never active in production.
  return (
    env.nodeEnv !== 'production' &&
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
  );
};

const originOf = (value) => {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const enforceCsrfOrigin = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  // Bearer wins in auth.middleware, so a Bearer request never depends on the
  // cookie even if one happens to be attached.
  const usesBearer = req.headers.authorization?.startsWith('Bearer ');
  if (usesBearer) return next();

  const hasAuthCookie = Boolean(req.cookies?.[COOKIE_NAME]);
  if (!hasAuthCookie) return next();

  const origin = req.headers.origin ? originOf(req.headers.origin) : null;
  if (origin) {
    if (isAllowedOrigin(origin)) return next();
    return next(new AppError('Cross-site request blocked', 403, 'CSRF_ORIGIN_DENIED'));
  }

  // Fallback only — some older browsers omit Origin on same-site form posts.
  const referer = req.headers.referer ? originOf(req.headers.referer) : null;
  if (referer && isAllowedOrigin(referer)) return next();

  return next(new AppError(
    'Cross-site request blocked: a valid Origin or Referer header is required.',
    403,
    'CSRF_ORIGIN_MISSING',
  ));
};

/**
 * Cookie-authenticated writes must be JSON. Without this, a plain cross-origin
 * HTML <form> (which can send urlencoded/multipart with no preflight) stays a
 * usable write channel even when Origin checking is in place.
 */
const requireJsonForCookieWrites = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.headers.authorization?.startsWith('Bearer ')) return next();
  if (!req.cookies?.[COOKIE_NAME]) return next();

  // No body at all (e.g. POST /logout) is fine.
  const contentType = req.headers['content-type'];
  if (!contentType) return next();
  if (contentType.split(';')[0].trim().toLowerCase() === 'application/json') return next();

  return next(new AppError(
    'Cookie-authenticated writes must use application/json',
    415,
    'UNSUPPORTED_CONTENT_TYPE',
  ));
};

module.exports = { enforceCsrfOrigin, requireJsonForCookieWrites };
