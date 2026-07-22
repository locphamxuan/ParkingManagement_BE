/**
 * sanitize.middleware — chặn NoSQL operator injection ($ne, $gt, $where...) và
 * dotted-path keys trong body/query/params trước khi tới controller/service.
 * Test thuần, không DB.
 */
const { sanitizeInputs } = require('../../src/middlewares/sanitize.middleware');

const runNext = () => jest.fn();

describe('sanitizeInputs', () => {
  test('loại bỏ key bắt đầu bằng $ trong req.body (nested)', () => {
    const req = { body: { email: 'a@b.com', password: { $ne: null } } };
    const next = runNext();
    sanitizeInputs(req, {}, next);
    expect(req.body).toEqual({ email: 'a@b.com', password: {} });
    expect(next).toHaveBeenCalledWith();
  });

  test('loại bỏ key bắt đầu bằng $ trong req.query (?building[$ne]=null)', () => {
    const req = { query: { building: { $ne: null } }, body: {}, params: {} };
    sanitizeInputs(req, {}, runNext());
    expect(req.query).toEqual({ building: {} });
  });

  test('loại bỏ key chứa dấu chấm (dotted path)', () => {
    const req = { body: { 'user.role': 'admin', name: 'ok' } };
    sanitizeInputs(req, {}, runNext());
    expect(req.body).toEqual({ name: 'ok' });
  });

  test('giữ nguyên mảng và giá trị nguyên thuỷ hợp lệ', () => {
    const req = {
      body: { tags: ['a', 'b'], count: 3, active: true, note: null },
    };
    sanitizeInputs(req, {}, runNext());
    expect(req.body).toEqual({ tags: ['a', 'b'], count: 3, active: true, note: null });
  });

  test('làm sạch object lồng bên trong mảng', () => {
    const req = { body: { items: [{ $where: 'x' }, { ok: 1 }] } };
    sanitizeInputs(req, {}, runNext());
    expect(req.body).toEqual({ items: [{}, { ok: 1 }] });
  });

  test('req.params cũng được làm sạch', () => {
    const req = { params: { id: { $gt: '' } }, body: {}, query: {} };
    sanitizeInputs(req, {}, runNext());
    expect(req.params).toEqual({ id: {} });
  });

  test('không có body/query/params vẫn gọi next() an toàn', () => {
    const req = {};
    const next = runNext();
    expect(() => sanitizeInputs(req, {}, next)).not.toThrow();
    expect(next).toHaveBeenCalledWith();
  });
});
