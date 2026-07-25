/**
 * P1-B — validate giờ hoạt động phải chặt ở MỌI cửa ngõ ghi dữ liệu, không chỉ ở
 * endpoint chuyên dụng: validator create/update building, service cập nhật giờ,
 * và validator của model (chốt chặn cuối).
 */
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const buildingValidator = require('../../../src/validators/building.validator');
const buildingService = require('../../../src/services/building.service');
const { Building } = require('../../../src/models');

jest.setTimeout(120000);

let building;
let manager;

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.clear();
  f.resetSeq();
  building = await f.createBuilding();
  manager = await f.managerFor(building._id);
});

/** Chạy middleware validator, trả lỗi mà nó chuyển cho next() (null nếu hợp lệ). */
const runValidator = (validator, body) => new Promise((resolve) => {
  validator({ body }, {}, (error) => resolve(error || null));
});

const BAD_HOURS = [
  ['giờ vượt phạm vi', { open: '25:00', close: '22:00' }],
  ['thiếu số 0 đứng đầu', { open: '6:0', close: '22:00' }],
  ['mở trùng đóng (KHÔNG phải 24/7)', { open: '08:00', close: '08:00' }],
  ['chuỗi rỗng', { open: '', close: '' }],
  ['không phải object', 'nonsense'],
];

describe('validator tạo building', () => {
  test.each(BAD_HOURS)('từ chối %s', async (_label, operatingHours) => {
    const error = await runValidator(buildingValidator.validateBuildingCreate, {
      name: 'Toa A',
      code: 'TOA-A',
      totalFloors: 3,
      pricing: { hourlyRate: 10000 },
      operatingHours,
    });

    expect(error).toMatchObject({ statusCode: 400, errorCode: 'INVALID_OPERATING_HOURS' });
  });

  test('chấp nhận cửa sổ qua đêm hợp lệ', async () => {
    const error = await runValidator(buildingValidator.validateBuildingCreate, {
      name: 'Toa B',
      code: 'TOA-B',
      totalFloors: 3,
      pricing: { hourlyRate: 10000 },
      operatingHours: { open: '22:00', close: '06:00' },
    });

    expect(error).toBeNull();
  });
});

describe('validator cập nhật building', () => {
  test.each(BAD_HOURS)('từ chối %s', async (_label, operatingHours) => {
    const error = await runValidator(buildingValidator.validateBuildingUpdate, { operatingHours });

    expect(error).toMatchObject({ statusCode: 400, errorCode: 'INVALID_OPERATING_HOURS' });
  });

  test('không gửi operatingHours thì không bị chặn (partial update)', async () => {
    const error = await runValidator(buildingValidator.validateBuildingUpdate, { name: 'Đổi tên' });

    expect(error).toBeNull();
  });
});

describe('service cập nhật giờ hoạt động chuyên dụng', () => {
  test.each([
    ['25:00', '22:00'],
    ['6:0', '22:00'],
    ['08:00', '08:00'],
  ])('từ chối open=%s close=%s và KHÔNG ghi vào DB', async (open, close) => {
    const before = (await Building.findById(building._id)).operatingHours;

    await expect(
      buildingService.updateManagerOperatingHours(manager, building._id, { open, close }),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: 'INVALID_OPERATING_HOURS' });

    const after = (await Building.findById(building._id)).operatingHours;
    expect(after.open).toBe(before.open);
    expect(after.close).toBe(before.close);
  });

  test('chấp nhận cửa sổ qua đêm và lưu đúng', async () => {
    await buildingService.updateManagerOperatingHours(manager, building._id, {
      open: '22:00',
      close: '06:00',
    });

    const saved = (await Building.findById(building._id)).operatingHours;
    expect(saved.open).toBe('22:00');
    expect(saved.close).toBe('06:00');
  });
});

describe('model là chốt chặn cuối', () => {
  test('lưu thẳng qua model với open === close vẫn bị từ chối', async () => {
    await expect(f.createBuilding({ operatingHours: { open: '08:00', close: '08:00' } }))
      .rejects.toThrow(/distinct HH:mm|validation failed/i);
  });

  test('lưu thẳng qua model với giờ sai định dạng vẫn bị từ chối', async () => {
    await expect(f.createBuilding({ operatingHours: { open: '6:0', close: '22:00' } }))
      .rejects.toThrow(/distinct HH:mm|validation failed/i);
  });
});
