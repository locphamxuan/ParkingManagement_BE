/**
 * building.service — getManagerBuilding/updateManagerBuilding: floorCount phải
 * lấy từ số Floor THẬT đã tạo (không phải field totalFloors nhập tay, dễ lệch
 * với thực tế) — audit 2026-07-22.
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const buildingSvc = require('../../../src/services/building.service');

let building, manager;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  building = await f.createBuilding({ totalFloors: 1 });
  manager = await f.managerFor(building._id);
});

describe('getManagerBuilding', () => {
  test('floorCount = số Floor thật đã tạo, không phải totalFloors nhập tay', async () => {
    await f.createFloor(building._id);
    await f.createFloor(building._id);
    await f.createFloor(building._id);

    const result = await buildingSvc.getManagerBuilding(manager, building._id);
    expect(result.floorCount).toBe(3);
    expect(result.totalFloors).toBe(1); // field cũ vẫn còn trong DB nhưng không dùng để hiển thị nữa
  });

  test('chưa tạo Floor nào → floorCount 0', async () => {
    const result = await buildingSvc.getManagerBuilding(manager, building._id);
    expect(result.floorCount).toBe(0);
  });

  test('danh sách building (không truyền buildingId) cũng kèm floorCount từng toà', async () => {
    await f.createFloor(building._id);
    const results = await buildingSvc.getManagerBuilding(manager, undefined);
    expect(results).toHaveLength(1);
    expect(results[0].floorCount).toBe(1);
  });
});

describe('updateManagerBuilding', () => {
  test('gửi kèm totalFloors → bị bỏ qua (chỉ name/status được sửa), floorCount vẫn tính từ Floor thật', async () => {
    await f.createFloor(building._id);
    await f.createFloor(building._id);

    const updated = await buildingSvc.updateManagerBuilding(manager, building._id, {
      name: 'Building Renamed',
      totalFloors: 99,
    });
    expect(updated.name).toBe('Building Renamed');
    expect(updated.totalFloors).toBe(1); // không bị ghi đè thành 99
    expect(updated.floorCount).toBe(2); // vẫn đúng số Floor thật
  });
});
