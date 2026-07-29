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
  // Đăng ký TẤT CẢ model để populate cross-ref (vd ParkingSession→Slot→Floor) không
  // lỗi MissingSchemaError khi test file chỉ require một service lẻ.
  require('../../src/models');
  // Chờ index build XONG trước khi test chạy: các bất biến nghiệp vụ (1 phiên active
  // /biển/tòa, 1 ý định PayOS/phiên, 1 review/phiên, 1 chủ sở hữu/biển số) do unique
  // index bảo đảm — nếu không await, test song song có thể chạy trước khi index tồn tại.
  const models = Object.values(mongoose.models);
  await Promise.all(models.map((model) => model.init()));
  // The four rollout-gated unique indexes opt out of automatic builds. Tests create
  // all declared indexes explicitly so concurrency tests exercise real DB guards.
  await Promise.all(models.map((model) => model.createIndexes()));
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
