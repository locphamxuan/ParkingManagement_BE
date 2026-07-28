const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const env = require('./config/env');
const routes = require('./routes');
const webhookRoutes = require('./routes/payment/webhook.routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');
const { sanitizeInputs } = require('./middlewares/sanitize.middleware');
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

if (env.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

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
app.use(cookieParser());
// Larger limit so base64 camera frames (AI plate/brand scan) fit in the body.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
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
// (unlike Stripe which required raw bytes for signature verification)
app.use('/api/payments/webhook', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
