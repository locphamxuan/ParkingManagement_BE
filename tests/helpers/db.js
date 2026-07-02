/**
 * In-memory MongoDB (replica set) lifecycle cho integration test.
 * Dùng MongoMemoryReplSet vì các service nghiệp vụ chạy trong transaction
 * (session.withTransaction) — MongoDB standalone không hỗ trợ transaction.
 */
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

let replset;

async function connect() {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
}

async function clear() {
  const { collections } = mongoose.connection;
  await Promise.all(
    Object.values(collections).map((c) => c.deleteMany({})),
  );
}

async function close() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (replset) await replset.stop();
}

module.exports = { connect, clear, close };
