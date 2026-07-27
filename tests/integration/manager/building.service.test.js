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

describe('updateManagerBuilding — vòng đời bảo trì', () => {
  // Trước đây guard chỉ cho sửa building status=active → manager tự đặt
  // 'maintenance' xong KHÔNG mở lại được, phải nhờ admin (kẹt một chiều).
  test('manager phụ trách: active → maintenance → active', async () => {
    const toMaintenance = await buildingSvc.updateManagerBuilding(manager, building._id, {
      status: 'maintenance',
    });
    expect(toMaintenance.status).toBe('maintenance');

    const backToActive = await buildingSvc.updateManagerBuilding(manager, building._id, {
      status: 'active',
    });
    expect(backToActive.status).toBe('active');
  });

  test('manager tòa khác KHÔNG chuyển được cả hai chiều', async () => {
    const otherBuilding = await f.createBuilding({});
    const otherManager = await f.managerFor(otherBuilding._id);

    await expect(
      buildingSvc.updateManagerBuilding(otherManager, building._id, { status: 'maintenance' }),
    ).rejects.toMatchObject({ statusCode: 403 });

    await building.updateOne({ status: 'maintenance' });
    await expect(
      buildingSvc.updateManagerBuilding(otherManager, building._id, { status: 'active' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("manager KHÔNG được đặt 'inactive' (vòng đời của admin)", async () => {
    await expect(
      buildingSvc.updateManagerBuilding(manager, building._id, { status: 'inactive' }),
    ).rejects.toMatchObject({ statusCode: 403, errorCode: 'BUILDING_STATUS_FORBIDDEN' });

    const unchanged = await buildingSvc.getManagerBuilding(manager, building._id);
    expect(unchanged.status).toBe('active');
  });

  test("tòa đang 'inactive' vẫn ngoài tầm sửa của manager", async () => {
    await building.updateOne({ status: 'inactive' });
    await expect(
      buildingSvc.updateManagerBuilding(manager, building._id, { status: 'active' }),
    ).rejects.toMatchObject({ statusCode: 403, errorCode: 'BUILDING_STATUS_FORBIDDEN' });
  });

  test('sửa name khi đang maintenance vẫn được (không chỉ riêng status)', async () => {
    await building.updateOne({ status: 'maintenance' });
    const updated = await buildingSvc.updateManagerBuilding(manager, building._id, {
      name: 'Renamed While Under Maintenance',
    });
    expect(updated.name).toBe('Renamed While Under Maintenance');
    expect(updated.status).toBe('maintenance');
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
