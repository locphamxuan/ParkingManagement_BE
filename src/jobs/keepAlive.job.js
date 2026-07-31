const logger = require('../utils/logger');

let timer = null;

/**
 * Keep-Alive Self Ping Job
 * Prevents free deployment tiers (like Render free plan) from going into sleep mode
 * by sending a lightweight GET request to the /health endpoint every 10 minutes.
 */
function start() {
  const targetUrl = process.env.SELF_PING_URL || process.env.RENDER_EXTERNAL_URL;

  if (!targetUrl) {
    logger.info('[KeepAlive] No SELF_PING_URL or RENDER_EXTERNAL_URL set. Self-ping job skipped.');
    return;
  }

  const healthUrl = `${targetUrl.replace(/\/$/, '')}/health`;
  logger.info(`[KeepAlive] Self-ping scheduled for ${healthUrl} every 10 minutes.`);

  // Trigger initial ping after 1 minute
  setTimeout(() => void ping(healthUrl), 60 * 1000);

  // Repeat every 10 minutes
  timer = setInterval(() => void ping(healthUrl), 10 * 60 * 1000);
}

async function ping(url) {
  try {
    const res = await fetch(url);
    if (res.ok) {
      logger.info(`[KeepAlive] Self-ping status: ${res.status} OK`);
    } else {
      logger.warn(`[KeepAlive] Self-ping returned status: ${res.status}`);
    }
  } catch (err) {
    logger.error(`[KeepAlive] Self-ping failed: ${err.message}`);
  }
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { start, stop };
