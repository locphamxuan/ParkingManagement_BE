/** Jest config — core business-logic unit + integration tests. */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
  clearMocks: true,
  // Đặt env bắt buộc trước khi require config/env (nếu không sẽ throw).
  setupFiles: ['<rootDir>/tests/helpers/setEnv.js'],
  // mongodb-memory-server spins a real mongod; keep worker output quiet.
  verbose: true,
};
