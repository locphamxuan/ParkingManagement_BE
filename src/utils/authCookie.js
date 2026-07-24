const env = require('./../config/env');

const COOKIE_NAME = 'pbms_token';

// Parses durations like the ones jsonwebtoken accepts for JWT_EXPIRES_IN
// ("7d", "12h", "30m", "45s"); falls back to 7 days for anything else.
function parseDurationMs(value) {
  const match = /^(\d+)([smhd])$/.exec(String(value).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const [, amount, unit] = match;
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return Number(amount) * multipliers[unit];
}

// sameSite:'none' + secure:true (not env-conditional) because the FE and BE
// are always cross-origin (different ports in dev, different domains in
// prod) — SameSite=Lax cookies are not sent on cross-origin fetch/XHR at
// all, so this pair is required for the cookie to work in every env. Modern
// browsers treat http://localhost as a secure context, so Secure cookies
// work there too, not just over real HTTPS in production.
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
};

const setAuthCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, { ...COOKIE_OPTIONS, maxAge: parseDurationMs(env.jwtExpiresIn) });
};

const clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
};

module.exports = { COOKIE_NAME, setAuthCookie, clearAuthCookie };
