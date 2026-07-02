/**
 * Chuỗi fallback đối tượng slot (usageType) + suy luận usageType của lượt check-in.
 * Đây là lõi quyết định "ai được dùng slot nào" — test thuần, không DB.
 */
const {
  acceptableUsageTypes,
  resolveCustomerUsageType,
  vehicleKindFromType,
} = require('../../src/services/staff/parkingSession/helpers');

describe('acceptableUsageTypes (fallback một chiều)', () => {
  test('walk_in chỉ dùng được slot walk_in', () => {
    expect(acceptableUsageTypes('walk_in')).toEqual(['walk_in']);
  });

  test('registered dùng được registered → walk_in', () => {
    expect(acceptableUsageTypes('registered')).toEqual(['registered', 'walk_in']);
  });

  test('subscriber ưu tiên subscriber, fallback registered → walk_in', () => {
    expect(acceptableUsageTypes('subscriber')).toEqual(['subscriber', 'registered', 'walk_in']);
  });

  test('reserved ưu tiên reserved, fallback registered → walk_in', () => {
    expect(acceptableUsageTypes('reserved')).toEqual(['reserved', 'registered', 'walk_in']);
  });

  test('walk_in KHÔNG bao giờ chiếm slot subscriber/reserved', () => {
    expect(acceptableUsageTypes('walk_in')).not.toContain('subscriber');
    expect(acceptableUsageTypes('walk_in')).not.toContain('reserved');
  });

  test('usageType lạ → chỉ chính nó; rỗng → []', () => {
    expect(acceptableUsageTypes('vip')).toEqual(['vip']);
    expect(acceptableUsageTypes(undefined)).toEqual([]);
  });
});

describe('resolveCustomerUsageType (ưu tiên subscriber > reserved > registered > walk_in)', () => {
  test('có gói dài hạn → subscriber', () => {
    expect(resolveCustomerUsageType({ longTerm: {}, reservation: {}, registeredOwner: {} })).toBe('subscriber');
  });
  test('có đặt chỗ (không gói) → reserved', () => {
    expect(resolveCustomerUsageType({ longTerm: null, reservation: {}, registeredOwner: {} })).toBe('reserved');
  });
  test('chỉ có tài khoản → registered', () => {
    expect(resolveCustomerUsageType({ longTerm: null, reservation: null, registeredOwner: {} })).toBe('registered');
  });
  test('không gì → walk_in', () => {
    expect(resolveCustomerUsageType({ longTerm: null, reservation: null, registeredOwner: null })).toBe('walk_in');
  });
});

describe('vehicleKindFromType (fallback pricing theo loại)', () => {
  test('mã/tên gợi ý xe máy → motorcycle', () => {
    expect(vehicleKindFromType({ code: 'MOTORCYCLE', name: 'Xe máy' })).toBe('motorcycle');
    expect(vehicleKindFromType({ code: 'BIKE', name: '' })).toBe('motorcycle');
  });
  test('còn lại → car', () => {
    expect(vehicleKindFromType({ code: 'CAR', name: 'Ô tô' })).toBe('car');
    expect(vehicleKindFromType({})).toBe('car');
    expect(vehicleKindFromType(null)).toBe('car');
  });
});
