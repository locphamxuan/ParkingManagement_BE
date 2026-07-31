/** user/vehicle.service — CRUD phương tiện + xe mặc định + giới hạn + vòng đời QR. */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const svc = require('../../../src/services/user/vehicle.service');
const qrSvc = require('../../../src/services/user/vehicleQr.service');
const Vehicle = require('../../../src/models/vehicle/Vehicle');

let user;
beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); user = await f.createUser(); });

describe('add', () => {
  test('thêm xe hợp lệ với đầy đủ mô tả, tự cấp QR còn hạn', async () => {
    const vehicle = await svc.add(user._id, {
      plateNumber: '51F-123.45',
      category: 'suv',
      brand: 'Toyota',
    });
    expect(vehicle.plateNumber).toBe('51F-123.45');
    expect(vehicle.category).toBe('suv');
    expect(vehicle.brand).toBe('Toyota');
    expect(vehicle.qrCode).toMatch(/^PLT-/);
    expect(qrSvc.isQrExpired(vehicle)).toBe(false);
  });

  test('xe đầu tiên tự thành xe mặc định', async () => {
    const first = await svc.add(user._id, { plateNumber: '51F-123.45' });
    const second = await svc.add(user._id, { plateNumber: '51F-123.46' });
    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);
  });

  test('biển sai định dạng → 400 INVALID_PLATE_FORMAT', async () => {
    await expect(svc.add(user._id, { plateNumber: 'ABC' }))
      .rejects.toMatchObject({ errorCode: 'INVALID_PLATE_FORMAT' });
  });

  test('trùng biển của chính mình → 409 VEHICLE_ALREADY_EXISTS', async () => {
    await svc.add(user._id, { plateNumber: '51F-123.45' });
    await expect(svc.add(user._id, { plateNumber: '51F-123.45' }))
      .rejects.toMatchObject({ statusCode: 409, errorCode: 'VEHICLE_ALREADY_EXISTS' });
  });

  test('biển đã thuộc tài khoản khác → 409 PLATE_OWNED_BY_ANOTHER_USER', async () => {
    const other = await f.createUser();
    await svc.add(other._id, { plateNumber: '51F-123.45' });
    await expect(svc.add(user._id, { plateNumber: '51F-123.45' }))
      .rejects.toMatchObject({ statusCode: 409, errorCode: 'PLATE_OWNED_BY_ANOTHER_USER' });
  });

  test('khác cách viết dấu chấm vẫn là CÙNG một biển → bị chặn', async () => {
    await svc.add(user._id, { plateNumber: '51F-123.45' });
    await expect(svc.add(user._id, { plateNumber: '51F 12345' }))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  test('vượt giới hạn 5 xe → 400 VEHICLE_LIMIT_REACHED', async () => {
    const plates = ['51F-123.45', '51F-123.46', '51F-123.47', '51F-123.48', '51F-123.49'];
    for (const plateNumber of plates) await svc.add(user._id, { plateNumber });
    await expect(svc.add(user._id, { plateNumber: '51F-123.50' }))
      .rejects.toMatchObject({ statusCode: 400, errorCode: 'VEHICLE_LIMIT_REACHED' });
  });
});

describe('setDefault + update + remove', () => {
  test('đặt mặc định: chỉ đúng 1 xe isDefault=true', async () => {
    await svc.add(user._id, { plateNumber: '51F-123.45' });
    const second = await svc.add(user._id, { plateNumber: '51F-123.46' });

    const after = await svc.setDefault(user._id, second._id);
    const defaults = after.filter((v) => v.isDefault);
    expect(defaults).toHaveLength(1);
    expect(String(defaults[0]._id)).toBe(String(second._id));
  });

  test('đổi thể loại xe khi không vướng gói/phiên', async () => {
    const vehicle = await svc.add(user._id, { plateNumber: '51F-123.45', category: 'car' });
    const updated = await svc.update(user._id, vehicle._id, { category: 'suv' });
    expect(updated.category).toBe('suv');
  });

  test('sửa mô tả xe không đụng tới biển số', async () => {
    const vehicle = await svc.add(user._id, { plateNumber: '51F-123.45' });
    const updated = await svc.update(user._id, vehicle._id, { brand: 'Honda' });
    expect(updated.brand).toBe('Honda');
    expect(updated.plateNumber).toBe('51F-123.45');
  });

  test('xoá xe mặc định → xe còn lại lên làm mặc định', async () => {
    const first = await svc.add(user._id, { plateNumber: '51F-123.45' });
    await svc.add(user._id, { plateNumber: '51F-123.46' });

    const remaining = await svc.remove(user._id, first._id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].isDefault).toBe(true);
  });

  test('xe của người khác → 404 VEHICLE_NOT_FOUND', async () => {
    const other = await f.createUser();
    const foreign = await svc.add(other._id, { plateNumber: '51F-123.45' });
    await expect(svc.remove(user._id, foreign._id))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'VEHICLE_NOT_FOUND' });
  });
});

describe('vòng đời mã QR', () => {
  test('list tự cấp mã mới khi mã cũ đã quá hạn', async () => {
    const vehicle = await svc.add(user._id, { plateNumber: '51F-123.45' });
    const staleToken = vehicle.qrCode;
    await Vehicle.updateOne(
      { _id: vehicle._id },
      { $set: { qrExpiresAt: new Date(Date.now() - 60 * 1000) } },
    );

    const [refreshed] = await svc.list(user._id);
    expect(refreshed.qrCode).not.toBe(staleToken);
    expect(qrSvc.isQrExpired(refreshed)).toBe(false);
  });

  test('mã còn hạn thì list KHÔNG đổi token', async () => {
    const vehicle = await svc.add(user._id, { plateNumber: '51F-123.45' });
    const [same] = await svc.list(user._id);
    expect(same.qrCode).toBe(vehicle.qrCode);
  });

  test('rotateQr huỷ token cũ ngay cả khi chưa hết hạn', async () => {
    const vehicle = await svc.add(user._id, { plateNumber: '51F-123.45' });
    const rotated = await qrSvc.rotateQr(user._id, vehicle._id);
    expect(rotated.qrCode).not.toBe(vehicle.qrCode);

    // Token cũ không còn tra ra xe nào.
    await expect(qrSvc.resolveScannedQr(vehicle.qrCode))
      .rejects.toMatchObject({ statusCode: 404, errorCode: 'VEHICLE_QR_NOT_FOUND' });
  });

  test('quét mã đã quá hạn → 410 VEHICLE_QR_EXPIRED', async () => {
    const vehicle = await svc.add(user._id, { plateNumber: '51F-123.45' });
    await Vehicle.updateOne(
      { _id: vehicle._id },
      { $set: { qrExpiresAt: new Date(Date.now() - 60 * 1000) } },
    );

    await expect(qrSvc.resolveScannedQr(vehicle.qrCode))
      .rejects.toMatchObject({ statusCode: 410, errorCode: 'VEHICLE_QR_EXPIRED' });
  });

  test('hạn mặc định là 2 ngày kể từ lúc cấp', async () => {
    const vehicle = await svc.add(user._id, { plateNumber: '51F-123.45' });
    const lifetimeDays =
      (vehicle.qrExpiresAt.getTime() - vehicle.qrIssuedAt.getTime()) / (24 * 60 * 60 * 1000);
    expect(lifetimeDays).toBeCloseTo(qrSvc.qrTtlDays(), 5);
    expect(qrSvc.qrTtlDays()).toBe(2);
  });
});
