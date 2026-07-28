/**
 * The staff AI scan endpoint spends real money (Gemini) or real CPU (PaddleOCR)
 * per call. Nothing malformed, oversized or type-mismatched may reach either
 * provider, and a single staff account must not be able to flood them.
 */
const request = require('supertest');
const app = require('../../../src/app');
const db = require('../../helpers/db');
const f = require('../../helpers/fixtures');
const { resetLimiterForKey } = require('../../helpers/rateLimit');
const { scanLimiter } = require('../../../src/middlewares/rateLimiter');
const { signToken } = require('../../../src/utils/token');
const BuildingManager = require('../../../src/models/building/BuildingManager');
const { parseImage } = require('../../../src/services/staff/visionScan.service');

beforeAll(async () => { await db.connect(); });
afterAll(async () => { await db.close(); });
beforeEach(async () => { await db.clear(); f.resetSeq(); });

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x11)]);
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 0x22),
]);
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.alloc(4),
  Buffer.from('WEBP', 'ascii'),
  Buffer.alloc(64, 0x33),
]);

const dataUrl = (mime, buf) => `data:${mime};base64,${buf.toString('base64')}`;

describe('Image payload validation (never reaches a provider)', () => {
  test('accepts the supported types with matching magic bytes', () => {
    expect(parseImage(dataUrl('image/jpeg', JPEG)).mediaType).toBe('image/jpeg');
    expect(parseImage(dataUrl('image/png', PNG)).mediaType).toBe('image/png');
    expect(parseImage(dataUrl('image/webp', WEBP)).mediaType).toBe('image/webp');
  });

  test('rejects a bare base64 string with no data-URL prefix', () => {
    expect(() => parseImage(JPEG.toString('base64')))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_MALFORMED' }));
  });

  test('rejects unsupported and dangerous types', () => {
    expect(() => parseImage(dataUrl('image/svg+xml', Buffer.from('<svg/>'))))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_TYPE_UNSUPPORTED' }));
    expect(() => parseImage(dataUrl('image/gif', Buffer.from('GIF89a'))))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_TYPE_UNSUPPORTED' }));
    expect(() => parseImage(dataUrl('application/pdf', Buffer.from('%PDF-'))))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_TYPE_UNSUPPORTED' }));
  });

  test('rejects invalid base64', () => {
    expect(() => parseImage('data:image/jpeg;base64,!!!not base64!!!'))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_BASE64_INVALID' }));
    expect(() => parseImage('data:image/jpeg;base64,'))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_BASE64_INVALID' }));
  });

  test('rejects a payload whose decoded size exceeds the limit', () => {
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4 * 1024 * 1024)]);
    expect(() => parseImage(dataUrl('image/jpeg', huge)))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_TOO_LARGE' }));
  });

  test('rejects content that does not match the declared MIME type', () => {
    expect(() => parseImage(dataUrl('image/jpeg', PNG)))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_TYPE_MISMATCH' }));
    expect(() => parseImage(dataUrl('image/png', JPEG)))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_TYPE_MISMATCH' }));
    expect(() => parseImage(dataUrl('image/webp', JPEG)))
      .toThrow(expect.objectContaining({ errorCode: 'IMAGE_TYPE_MISMATCH' }));
  });
});

describe('Rejected payloads never reach the vision provider', () => {
  const env = require('../../../src/config/env');
  const { scanVehicleImage } = require('../../../src/services/staff/visionScan.service');
  let fetchSpy;
  let originalUrl;

  beforeEach(() => {
    originalUrl = env.paddleOcrUrl;
    env.paddleOcrUrl = 'http://ocr.test';
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ plateNumber: '59G2-038.80', plateConfidence: 0.9 }),
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    env.paddleOcrUrl = originalUrl;
  });

  test.each([
    ['malformed', 'not-a-data-url'],
    ['unsupported type', `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`],
    ['bad base64', 'data:image/jpeg;base64,@@@@'],
    ['mime mismatch', `data:image/jpeg;base64,${PNG.toString('base64')}`],
  ])('a %s payload is rejected without calling the provider', async (_label, image) => {
    await expect(scanVehicleImage(image)).rejects.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('an oversized payload is rejected without calling the provider', async () => {
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(4 * 1024 * 1024)]);

    await expect(scanVehicleImage(dataUrl('image/jpeg', huge))).rejects.toBeDefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('a valid payload still reaches the provider', async () => {
    await scanVehicleImage(dataUrl('image/jpeg', JPEG));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/staff/parking-sessions/scan', () => {
  let staff;
  let building;

  const post = (body) =>
    request(app)
      .post('/api/staff/parking-sessions/scan')
      .set('Authorization', `Bearer ${signToken(staff)}`)
      .send(body);

  beforeEach(async () => {
    building = await f.createBuilding();
    staff = await f.createUser({ role: 'staff' });
    await BuildingManager.create({ building: building._id, user: staff._id, isActive: true });
    await resetLimiterForKey(scanLimiter, `staff:${staff._id}`);
  });

  test.each([
    ['malformed', 'not-a-data-url'],
    ['unsupported type', `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`],
    ['bad base64', 'data:image/jpeg;base64,@@@@'],
    ['mime mismatch', `data:image/jpeg;base64,${PNG.toString('base64')}`],
  ])('rejects a %s payload with 4xx', async (_label, image) => {
    const res = await post({ image, building: String(building._id) });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('rejects an oversized payload with 4xx', async () => {
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(3.5 * 1024 * 1024)]);

    const res = await post({ image: dataUrl('image/jpeg', huge), building: String(building._id) });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  test('rejects a body larger than the route parser limit before any handler runs', async () => {
    const overLimit = 'A'.repeat(5 * 1024 * 1024);

    const res = await post({ image: `data:image/jpeg;base64,${overLimit}`, building: String(building._id) });

    expect(res.status).toBe(413);
  });

  test('rate-limits a single staff account', async () => {
    const image = dataUrl('image/jpeg', JPEG);
    let sawRateLimit = false;

    for (let i = 0; i < 25; i += 1) {
      const res = await post({ image, building: String(building._id) });
      if (res.status === 429) { sawRateLimit = true; break; }
    }

    expect(sawRateLimit).toBe(true);
  });

  test('still enforces staff building scope', async () => {
    const otherBuilding = await f.createBuilding();

    const res = await post({
      image: dataUrl('image/jpeg', JPEG),
      building: String(otherBuilding._id),
    });

    expect(res.status).toBe(403);
  });

  test('a non-staff account cannot reach the endpoint', async () => {
    const customer = await f.createUser({ role: 'user' });

    const res = await request(app)
      .post('/api/staff/parking-sessions/scan')
      .set('Authorization', `Bearer ${signToken(customer)}`)
      .send({ image: dataUrl('image/jpeg', JPEG), building: String(building._id) });

    expect(res.status).toBe(403);
  });
});
