/** Jest config — core business-logic unit + integration tests. */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  testTimeout: 30000,
  clearMocks: true,
  // mongodb-memory-server spins a real mongod; keep worker output quiet.
  verbose: true,
};
