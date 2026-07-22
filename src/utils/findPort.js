const net = require('node:net');

const isPortFree = (port) =>
  new Promise((resolve) => {
    const tester = net.createServer();

    tester.once('error', () => resolve(false));
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port);
  });

/**
 * Tìm port trống bắt đầu từ preferredPort (5000 → 5001 → …).
 * Không cần kill process thủ công khi port mặc định đang bận.
 */
const findAvailablePort = async (preferredPort, maxAttempts = 30) => {
  for (let i = 0; i < maxAttempts; i += 1) {
    const port = preferredPort + i;
    if (await isPortFree(port)) return port;
  }

  throw new Error(
    `Không tìm được port trống từ ${preferredPort} đến ${preferredPort + maxAttempts - 1}`
  );
};

module.exports = { findAvailablePort };
