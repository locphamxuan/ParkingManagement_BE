/**
 * Validator cho incident: staff không được set status tuỳ ý lúc TẠO (chỉ open/resolved
 * — 'escalated'/'penalty_pending' chỉ do BE tự set), và GET /staff/incidents phải lọc
 * được theo status 'penalty_pending' (trước đây thiếu trong INCIDENT_STATUSES_ALL → 400
 * sai cho 1 status hợp lệ). Test thuần, không DB.
 */
const {
  validateCreateIncident,
  validateListIncidentsQuery,
} = require('../../src/validators/staff.validator');

const runNext = () => jest.fn();
const req = (body = {}, query = {}) => ({ body, query, params: {} });

describe('validateCreateIncident — status tại thời điểm tạo', () => {
  test('không truyền status → qua (default open ở service)', () => {
    const next = runNext();
    validateCreateIncident(req({ type: 'vehicle_damaged' }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test("status: 'open' → qua", () => {
    const next = runNext();
    validateCreateIncident(req({ type: 'vehicle_damaged', status: 'open' }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test("status: 'resolved' → qua", () => {
    const next = runNext();
    validateCreateIncident(req({ type: 'vehicle_damaged', status: 'resolved' }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test("status: 'penalty_pending' → 400 INVALID_STATUS (chặn incident 'ma' không có penaltyFee)", () => {
    const next = runNext();
    validateCreateIncident(req({ type: 'vehicle_damaged', status: 'penalty_pending' }), {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].errorCode).toBe('INVALID_STATUS');
  });

  test("status: 'escalated' → 400 INVALID_STATUS (escalation chỉ tự động qua user report)", () => {
    const next = runNext();
    validateCreateIncident(req({ type: 'vehicle_damaged', status: 'escalated' }), {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
    expect(next.mock.calls[0][0].errorCode).toBe('INVALID_STATUS');
  });
});

describe('validateListIncidentsQuery — filter theo status', () => {
  test("status='penalty_pending' hợp lệ (trước đây bị thiếu khỏi danh sách, gây 400 sai)", () => {
    const next = runNext();
    validateListIncidentsQuery(req({}, { status: 'penalty_pending' }), {}, next);
    expect(next).toHaveBeenCalledWith();
  });

  test('status không hợp lệ vẫn bị chặn 400', () => {
    const next = runNext();
    validateListIncidentsQuery(req({}, { status: 'not_a_status' }), {}, next);
    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });
});
