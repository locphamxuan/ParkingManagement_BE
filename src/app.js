const express = require('express');
const mongoose = require('mongoose');
const compression = require('compression');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const webhookRoutes = require('./routes/payment/webhook.routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');
const { sanitizeInputs } = require('./middlewares/sanitize.middleware');
const { enforceCsrfOrigin, requireJsonForCookieWrites } = require('./middlewares/csrf.middleware');
const { setupSwagger } = require('./config/swagger');
const AppError = require('./utils/AppError');

const app = express();
app.disable('x-powered-by');

// Baseline API hardening. These headers are deliberately framework-agnostic
// and safe for JSON, Swagger and cross-origin frontend/mobile clients.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Most dashboard, audit and ledger responses are JSON. Compressing responses
// over 1 KB lowers transfer time without changing any business payloads.
app.use(compression({ threshold: 1024 }));

if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

app.use(cookieParser());

// CSRF guards run BEFORE cors() and before body parsing, so they are the
// authoritative answer for a forged cross-site write (CORS also happens to
// reject unknown origins today, but that is a transport concern and a config
// change there must not silently reopen this hole). Bearer callers (native
// mobile) and unauthenticated requests pass through untouched.
app.use(enforceCsrfOrigin);
app.use(requireJsonForCookieWrites);

// Explicit origin allowlist (not '*') + credentials:true — required for the
// httpOnly auth cookie (see utils/authCookie.js) to be accepted cross-origin.
const allowedOrigins = new Set(env.clientOrigins);
app.use(cors({
  origin: (origin, callback) => {
    // No Origin header (curl/Postman/server-to-server, e.g. PayOS webhook) — allow.
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    // Allow any localhost / 127.0.0.1 port (e.g. Expo Web on 8081, Vite on 5173, etc.)
    if (
      env.nodeEnv !== 'production' &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
    ) return callback(null, true);
    return callback(new AppError('Origin is not allowed by CORS', 403, 'CORS_ORIGIN_DENIED'));
  },
  credentials: true,
}));
// JSON only, and small: no route accepts form-urlencoded bodies, and leaving
// that parser enabled would keep a no-preflight cross-origin write channel open.
// The staff AI scan (base64 camera frame) is the one endpoint that needs more,
// so it is skipped here and mounts its own 4mb parser behind its rate limiter.
const SCAN_PATH = '/api/staff/parking-sessions/scan';
const globalJsonParser = express.json({ limit: '1mb' });
app.use((req, res, next) => {
  if (req.path === SCAN_PATH) return next();
  return globalJsonParser(req, res, next);
});
// Strip Mongo operator keys from body/query/params before any route/controller runs.
app.use(sanitizeInputs);

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'PBMS API — xem README.md để biết danh sách endpoint',
    apiPrefix: '/api',
  });
});

app.get('/health', (_req, res) => {
  const databaseReady = mongoose.connection.readyState === 1;
  res.status(databaseReady ? 200 : 503).json({
    success: databaseReady,
    service: 'pbms-api',
    database: databaseReady ? 'connected' : 'unavailable',
  });
});

app.use('/api', routes);
setupSwagger(app);

// PayOS webhook — registered after express.json() since PayOS sends JSON body
// (unlike Stripe which required raw bytes for signature verification).
// Server-to-server: no auth cookie, so the CSRF guard above is a no-op for it.
// Its own authentication is the PayOS payload validation in webhook.service.
app.use('/api/payments/webhook', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
