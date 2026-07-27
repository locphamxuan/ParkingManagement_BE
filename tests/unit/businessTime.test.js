const {
  parseTime,
  isWithinOperatingWindow,
  isWithinShiftWindow,
  getShiftWindowRelation,
} = require('../../src/utils/businessTime');
const {
  assertBuildingAcceptsEntry,
} = require('../../src/services/shared/entryAuthorization.service');

const TZ = 'Asia/Ho_Chi_Minh';
const atLocal = (dateTime) => new Date(`${dateTime}+07:00`);

describe('businessTime', () => {
  test.each([
    ['00:00', 0],
    ['06:15', 375],
    ['23:59', 1439],
    ['24:00', null],
    ['6:00', null],
    ['12:60', null],
  ])('parseTime(%s)', (value, expected) => {
    expect(parseTime(value)).toBe(expected);
  });

  test('daytime operating window includes open and excludes close', () => {
    expect(isWithinOperatingWindow('06:00', '22:00', atLocal('2026-07-25T06:00:00'), TZ)).toBe(true);
    expect(isWithinOperatingWindow('06:00', '22:00', atLocal('2026-07-25T21:59:00'), TZ)).toBe(true);
    expect(isWithinOperatingWindow('06:00', '22:00', atLocal('2026-07-25T22:00:00'), TZ)).toBe(false);
    expect(isWithinOperatingWindow('06:00', '22:00', atLocal('2026-07-25T05:59:00'), TZ)).toBe(false);
  });

  test('overnight operating window spans midnight', () => {
    expect(isWithinOperatingWindow('22:00', '06:00', atLocal('2026-07-25T23:30:00'), TZ)).toBe(true);
    expect(isWithinOperatingWindow('22:00', '06:00', atLocal('2026-07-26T05:59:00'), TZ)).toBe(true);
    expect(isWithinOperatingWindow('22:00', '06:00', atLocal('2026-07-26T06:00:00'), TZ)).toBe(false);
    expect(isWithinOperatingWindow('22:00', '06:00', atLocal('2026-07-25T12:00:00'), TZ)).toBe(false);
  });

  test.each([
    ['06:00', '06:00'],
    ['bad', '22:00'],
    ['06:00', '24:00'],
  ])('invalid operating window %s-%s throws a stable code', (open, close) => {
    expect(() => isWithinOperatingWindow(open, close, new Date(), TZ))
      .toThrow(expect.objectContaining({
        errorCode: 'INVALID_OPERATING_HOURS',
        statusCode: 400,
      }));
  });

  test('overnight shift is valid only on work date and following morning', () => {
    const shift = {
      workDate: atLocal('2026-07-25T00:00:00'),
      startTime: '22:00',
      endTime: '06:00',
    };
    expect(isWithinShiftWindow(shift, atLocal('2026-07-25T21:59:00'), TZ)).toBe(false);
    expect(isWithinShiftWindow(shift, atLocal('2026-07-25T22:00:00'), TZ)).toBe(true);
    expect(isWithinShiftWindow(shift, atLocal('2026-07-26T05:59:00'), TZ)).toBe(true);
    expect(isWithinShiftWindow(shift, atLocal('2026-07-26T06:00:00'), TZ)).toBe(false);
    expect(isWithinShiftWindow(shift, atLocal('2026-07-27T01:00:00'), TZ)).toBe(false);
  });

  test('shift relation distinguishes before, within, and after', () => {
    const shift = {
      workDate: atLocal('2026-07-25T00:00:00'),
      startTime: '06:00',
      endTime: '14:00',
    };
    expect(getShiftWindowRelation(shift, atLocal('2026-07-25T05:59:00'), TZ)).toBe('before');
    expect(getShiftWindowRelation(shift, atLocal('2026-07-25T06:00:00'), TZ)).toBe('within');
    expect(getShiftWindowRelation(shift, atLocal('2026-07-25T14:00:00'), TZ)).toBe('after');
  });

  test.each([
    ['inactive', 'BUILDING_INACTIVE'],
    ['maintenance', 'BUILDING_MAINTENANCE'],
  ])('building status %s blocks entry with a stable code', (status, errorCode) => {
    expect(() => assertBuildingAcceptsEntry({
      status,
      operatingHours: { open: '00:00', close: '23:59' },
    }, atLocal('2026-07-25T12:00:00'), TZ)).toThrow(expect.objectContaining({
      statusCode: 409,
      errorCode,
    }));
  });

  test('active building outside its hours is closed for entry', () => {
    expect(() => assertBuildingAcceptsEntry({
      status: 'active',
      operatingHours: { open: '06:00', close: '22:00' },
    }, atLocal('2026-07-25T22:00:00'), TZ)).toThrow(expect.objectContaining({
      statusCode: 409,
      errorCode: 'BUILDING_CLOSED',
    }));
  });
});
