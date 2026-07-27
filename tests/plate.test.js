const { normalizePlate, isValidVietnamPlate } = require('../src/utils/plate.util');

describe('Biển Ô TÔ (1 chữ cái)', () => {
  test.each([
    ['30A-12345', '30A-123.45'],
    ['51F12345', '51F-123.45'],
    ['30A 123 45', '30A-123.45'],
    ['30a-12345', '30A-123.45'],   // chữ thường
    ['30A-1234', '30A-1234'],      // 4 số (cũ)
    ['51LD-12345', '51LD-123.45'], // 2 chữ (liên doanh)
    ['80NG-12345', '80NG-123.45'], // 2 chữ
  ])('%s → %s (valid)', (input, expected) => {
    const out = normalizePlate(input);
    expect(out).toBe(expected);
    expect(isValidVietnamPlate(out)).toBe(true);
  });
});

describe('Biển XE MÁY (chữ + số series)', () => {
  test.each([
    ['59X1-23456', '59X1-234.56'],
    ['29B1 234 56', '29B1-234.56'],
    ['60F8-12345', '60F8-123.45'],
    ['59X1-2345', '59X1-2345'],      // 4 số
    ['59G2-03880', '59G2-038.80'],   // dạng cũ vẫn ok
    ['59AB1-23456', '59AB1-234.56'], // 2 chữ + số series
  ])('%s → %s (valid)', (input, expected) => {
    const out = normalizePlate(input);
    expect(out).toBe(expected);
    expect(isValidVietnamPlate(out)).toBe(true);
  });
});

describe('Không hợp lệ', () => {
  test.each([
    '',
    'ABC',
    '30-12345',     // thiếu chữ series
    '30A-123',      // số < 4
    '30A-123456',   // số > 5 (có dấu phân tách)
    'XX-1234',      // thiếu mã tỉnh (2 số)
  ])('%s → invalid', (p) => {
    const out = normalizePlate(p);
    expect(out === '' || !isValidVietnamPlate(out)).toBe(true);
  });
});

describe('isValidVietnamPlate trực tiếp trên canonical', () => {
  test.each(['30A-123.45', '59X1-234.56', '51LD-123.45', '30A-1234', '59X1-2345'])(
    '%s hợp lệ', (p) => expect(isValidVietnamPlate(p)).toBe(true),
  );
  test.each(['30A-123', '30AAA-12345', '3A-12345', '30A-1.2345'])(
    '%s không hợp lệ', (p) => expect(isValidVietnamPlate(p)).toBe(false),
  );
});
