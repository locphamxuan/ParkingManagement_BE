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

  test('walk_in KHÔNG bao giờ chiếm slot subscriber', () => {
    expect(acceptableUsageTypes('walk_in')).not.toContain('subscriber');
  });

  test('usageType lạ → chỉ chính nó; rỗng → []', () => {
    expect(acceptableUsageTypes('vip')).toEqual(['vip']);
    expect(acceptableUsageTypes(undefined)).toEqual([]);
  });
});

describe('resolveCustomerUsageType (ưu tiên subscriber > registered > walk_in)', () => {
  test('có gói dài hạn → subscriber', () => {
    expect(resolveCustomerUsageType({ longTerm: {}, registeredOwner: {} })).toBe('subscriber');
  });
  test('chỉ có tài khoản → registered', () => {
    expect(resolveCustomerUsageType({ longTerm: null, registeredOwner: {} })).toBe('registered');
  });
  test('không gì → walk_in', () => {
    expect(resolveCustomerUsageType({ longTerm: null, registeredOwner: null })).toBe('walk_in');
  });
});

describe('vehicleKindFromType (nhóm tính phí, đọc từ category)', () => {
  test('mọi thể loại 2 bánh → motorcycle', () => {
    expect(vehicleKindFromType({ category: 'motorcycle' })).toBe('motorcycle');
    expect(vehicleKindFromType({ category: 'ebike' })).toBe('motorcycle');
    expect(vehicleKindFromType({ category: 'emotorbike' })).toBe('motorcycle');
  });
  test('thể loại 4 bánh → car', () => {
    expect(vehicleKindFromType({ category: 'car' })).toBe('car');
    expect(vehicleKindFromType({ category: 'suv' })).toBe('car');
    expect(vehicleKindFromType({ category: 'truck' })).toBe('car');
  });
  test('KHÔNG còn đoán theo tên/mã: tên "Xe máy" mà category=car vẫn ra car', () => {
    expect(vehicleKindFromType({ code: 'MOTORCYCLE', name: 'Xe máy', category: 'car' })).toBe('car');
  });
  test('thiếu category → car (nhóm mặc định)', () => {
    expect(vehicleKindFromType({})).toBe('car');
    expect(vehicleKindFromType(null)).toBe('car');
  });
});
