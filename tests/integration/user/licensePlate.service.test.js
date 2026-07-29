/** user/licensePlate.service — CRUD biển số + đặt mặc định + giới hạn. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/user/licensePlate.service');

let user;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); user = await f.createUser(); });

describe('add', () => {
  test('thêm biển hợp lệ, gán qrCode', async () => {
    const plates = await svc.add(user._id, { plateNumber: '51F-123.45', vehicleType: 'car' });
    expect(plates).toHaveLength(1);
    expect(plates[0].plateNumber).toBe('51F-123.45');
    expect(plates[0].qrCode).toBeTruthy();
  });

  test('biển sai định dạng → 400 INVALID_PLATE_FORMAT', async () => {
    await expect(svc.add(user._id, { plateNumber: 'ABC', vehicleType: 'car' }))
      .rejects.toMatchObject({ errorCode: 'INVALID_PLATE_FORMAT' });
  });

  test('biển trùng → 409', async () => {
    await svc.add(user._id, { plateNumber: '51F-123.45' });
    await expect(svc.add(user._id, { plateNumber: '51F-123.45' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('hai tài khoản thêm cùng biển song song → chỉ một tài khoản sở hữu biển', async () => {
    const otherUser = await f.createUser();
    const results = await Promise.allSettled([
      svc.add(user._id, { plateNumber: '51F-123.45' }),
      svc.add(otherUser._id, { plateNumber: '51F-123.45' }),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected.reason).toMatchObject({
      statusCode: 409,
      errorCode: 'PLATE_OWNED_BY_ANOTHER_USER',
    });
  });

  test('vượt giới hạn 5 biển → 400', async () => {
    const plates = ['51F-123.45', '51F-123.46', '51F-123.47', '51F-123.48', '51F-123.49'];
    for (const p of plates) await svc.add(user._id, { plateNumber: p });
    await expect(svc.add(user._id, { plateNumber: '51F-123.50' }))
      .rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('setDefault + update + remove', () => {
  test('đặt mặc định: chỉ 1 biển isDefault=true', async () => {
    await svc.add(user._id, { plateNumber: '51F-123.45' });
    const two = await svc.add(user._id, { plateNumber: '51F-123.46' });
    const targetId = two[1]._id;
    const after = await svc.setDefault(user._id, targetId);
    const defaults = after.filter((p) => p.isDefault);
    expect(defaults).toHaveLength(1);
    expect(String(defaults[0]._id)).toBe(String(targetId));
  });

  test('update loại xe', async () => {
    const one = await svc.add(user._id, { plateNumber: '51F-123.45', vehicleType: 'car' });
    const updated = await svc.update(user._id, one[0]._id, { vehicleType: 'suv' });
    expect(updated[0].vehicleType).toBe('suv');
  });

  test('remove biển', async () => {
    const one = await svc.add(user._id, { plateNumber: '51F-123.45' });
    const after = await svc.remove(user._id, one[0]._id);
    expect(after).toHaveLength(0);
  });
});
