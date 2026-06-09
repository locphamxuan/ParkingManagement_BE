const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const webhookRoutes = require('./routes/payment/webhook.routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

app.use(cors());
// Larger limit so base64 camera frames (AI plate/brand scan) fit in the body.
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

app.get('/', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'PBMS API — xem README.md để biết danh sách endpoint',
    apiPrefix: '/api',
  });
});

app.use('/api', routes);

// PayOS webhook — registered after express.json() since PayOS sends JSON body
// (unlike Stripe which required raw bytes for signature verification)
app.use('/api/payments/webhook', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
