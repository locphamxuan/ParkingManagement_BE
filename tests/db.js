const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Replica set (1 node) để Mongoose transactions (withTransaction) hoạt động.
let replset;

const connect = async () => {
  replset = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replset.getUri());
};

const clearAll = async () => {
  const collections = await mongoose.connection.db.collections();
  for (const c of collections) await c.deleteMany({});
};

const stop = async () => {
  await mongoose.disconnect();
  if (replset) await replset.stop();
};

module.exports = { connect, clearAll, stop };
