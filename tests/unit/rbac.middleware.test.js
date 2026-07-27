/**
 * RBAC middleware — kiểm soát quyền theo role + phạm vi tòa nhà.
 * Bao gồm hành vi sau merge dev: admin bypass; staff không kèm buildingId vẫn qua
 * khi có assignment; readOnlyForAdmin chặn ghi với admin. Test thuần, không DB.
 */
const { authorize, authorizeBuildingAccess, readOnlyForAdmin } = require('../../src/middlewares/rbac.middleware');
const AppError = require('../../src/utils/AppError');

const runNext = () => jest.fn();

describe('authorize(...roles)', () => {
  test('không có user → 401', () => {
    const next = runNext();
    authorize('manager')({}, {}, next);
    expect(next.mock.calls[0][0]).toBeInstanceOf(AppError);
    expect(next.mock.calls[0][0].statusCode).toBe(401);
  });
  test('role không nằm trong danh sách → 403', () => {
    const next = runNext();
    authorize('manager')({ user: { role: 'staff' } }, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
  test('role hợp lệ → next() không lỗi', () => {
    const next = runNext();
    authorize('manager', 'admin')({ user: { role: 'admin' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('authorizeBuildingAccess', () => {
  test('admin bypass hoàn toàn (không cần buildingId)', () => {
    const next = runNext();
    authorizeBuildingAccess({ user: { role: 'admin' } }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('staff không kèm buildingId nhưng CÓ assignment → qua', () => {
    const next = runNext();
    authorizeBuildingAccess(
      { user: { role: 'staff', assignedBuildings: ['b1'] }, params: {}, query: {}, body: {} },
      {}, next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  test('staff không kèm buildingId và KHÔNG có assignment → 400', () => {
    const next = runNext();
    authorizeBuildingAccess(
      { user: { role: 'staff', assignedBuildings: [] }, params: {}, query: {}, body: {} },
      {}, next,
    );
    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });

  test('manager có buildingId thuộc assignment → qua', () => {
    const next = runNext();
    authorizeBuildingAccess(
      { user: { role: 'manager', assignedBuildings: ['b1', 'b2'] }, params: { buildingId: 'b2' }, query: {}, body: {} },
      {}, next,
    );
    expect(next).toHaveBeenCalledWith();
  });

  test('manager có buildingId KHÔNG thuộc assignment → 403', () => {
    const next = runNext();
    authorizeBuildingAccess(
      { user: { role: 'manager', assignedBuildings: ['b1'] }, params: { buildingId: 'bX' }, query: {}, body: {} },
      {}, next,
    );
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });

  // Từ chối chéo tòa phải có errorCode máy đọc được để FE map ra thông báo rõ
  // ràng, thay vì rơi về chuỗi tiếng Anh thô của backend.
  test('staff truy cập tòa khác → 403 kèm errorCode BUILDING_ACCESS_DENIED', () => {
    const next = runNext();
    authorizeBuildingAccess(
      { user: { role: 'staff', assignedBuildings: ['bB'] }, params: {}, query: { buildingId: 'bA' }, body: {} },
      {}, next,
    );
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe('BUILDING_ACCESS_DENIED');
  });

  test('phản hồi từ chối chéo tòa không lộ PII (biển số / tên / email)', () => {
    const next = runNext();
    authorizeBuildingAccess(
      {
        user: { role: 'staff', assignedBuildings: ['bB'], email: 'staffb@example.com', fullName: 'Staff B' },
        params: {}, query: { buildingId: 'bA' }, body: { plateNumber: '51A-100.01' },
      },
      {}, next,
    );
    const err = next.mock.calls[0][0];
    const payload = JSON.stringify({ message: err.message, errorCode: err.errorCode, details: err.details });
    expect(payload).not.toMatch(/51A-100\.01/);
    expect(payload).not.toMatch(/staffb@example\.com/);
    expect(payload).not.toMatch(/Staff B/);
  });

  test('thiếu buildingId vẫn là 400 (không gắn nhầm BUILDING_ACCESS_DENIED)', () => {
    const next = runNext();
    authorizeBuildingAccess(
      { user: { role: 'manager', assignedBuildings: [] }, params: {}, query: {}, body: {} },
      {}, next,
    );
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].errorCode).toBeNull();
  });
});

describe('readOnlyForAdmin', () => {
  test('admin + POST → 403 (read-only)', () => {
    const next = runNext();
    readOnlyForAdmin({ user: { role: 'admin' }, method: 'POST' }, {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(403);
  });
  test('admin + GET → qua', () => {
    const next = runNext();
    readOnlyForAdmin({ user: { role: 'admin' }, method: 'GET' }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
  test('manager + POST → qua (không bị chặn)', () => {
    const next = runNext();
    readOnlyForAdmin({ user: { role: 'manager' }, method: 'POST' }, {}, next);
    expect(next).toHaveBeenCalledWith();
  });
});
