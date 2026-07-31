/**
 * express-rate-limit keeps its counters in process memory, so they survive
 * between tests in the same worker. Tests that exercise a limited endpoint
 * repeatedly must clear the counter rather than raise the limit — the limit
 * itself is the thing under test elsewhere.
 */
const LOOPBACK_KEYS = ['::ffff:127.0.0.1', '127.0.0.1', '::1'];

const resetLimiters = async (...limiters) => {
  for (const limiter of limiters) {
    for (const key of LOOPBACK_KEYS) {
      await limiter.resetKey(key);
    }
  }
};

const resetLimiterForKey = async (limiter, key) => limiter.resetKey(key);

module.exports = { resetLimiters, resetLimiterForKey, LOOPBACK_KEYS };
