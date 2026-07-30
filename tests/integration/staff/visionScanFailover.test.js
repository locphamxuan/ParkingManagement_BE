/**
 * A dead OCR microservice must not take the entry gate down with it. When both
 * providers are configured and the primary is unreachable, the scan has to fall
 * through to the other one instead of degrading to manual entry.
 */
const mockGenerateContent = jest.fn();
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent: (...args) => mockGenerateContent(...args) },
  })),
}));

const env = require('../../../src/config/env');
const { scanVehicleImage, resolveProviderChain } = require('../../../src/services/staff/visionScan.service');

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 0x11)]);
const IMAGE = `data:image/jpeg;base64,${JPEG.toString('base64')}`;

const original = {};
let fetchSpy;
let errorSpy;

beforeEach(() => {
  original.ocrProvider = env.ocrProvider;
  original.paddleOcrUrl = env.paddleOcrUrl;
  original.geminiApiKey = env.geminiApiKey;
  fetchSpy = jest.spyOn(global, 'fetch');
  errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  mockGenerateContent.mockReset();
});

afterEach(() => {
  Object.assign(env, original);
  fetchSpy.mockRestore();
  errorSpy.mockRestore();
  jest.restoreAllMocks();
});

describe('resolveProviderChain', () => {
  test('puts the explicitly configured provider first and keeps the other as backup', () => {
    env.ocrProvider = 'paddle';
    env.paddleOcrUrl = 'http://ocr.test';
    env.geminiApiKey = 'key';

    expect(resolveProviderChain()).toEqual(['paddle', 'gemini']);
  });

  test('has no backup when only the chosen provider is configured', () => {
    env.ocrProvider = 'paddle';
    env.paddleOcrUrl = 'http://ocr.test';
    env.geminiApiKey = null;

    expect(resolveProviderChain()).toEqual(['paddle']);
  });

  test('throws when the chosen provider is missing its own configuration', () => {
    env.ocrProvider = 'paddle';
    env.paddleOcrUrl = null;
    env.geminiApiKey = 'key';

    expect(() => resolveProviderChain())
      .toThrow(expect.objectContaining({ errorCode: 'AI_SCAN_NOT_CONFIGURED' }));
  });

  test('throws when nothing at all is configured', () => {
    env.ocrProvider = null;
    env.paddleOcrUrl = null;
    env.geminiApiKey = null;

    expect(() => resolveProviderChain())
      .toThrow(expect.objectContaining({ errorCode: 'AI_SCAN_NOT_CONFIGURED' }));
  });
});

describe('scanVehicleImage failover', () => {
  test('falls back to Gemini when the PaddleOCR service is unreachable', async () => {
    env.ocrProvider = 'paddle';
    env.paddleOcrUrl = 'http://ocr.test';
    env.geminiApiKey = 'key';
    fetchSpy.mockRejectedValue(new Error('fetch failed'));

    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        plateNumber: '59G2-038.80',
        plateConfidence: 0.94,
        vehicleType: 'car',
        brand: 'Toyota',
        brandConfidence: 0.7,
      }),
    });

    const result = await scanVehicleImage(IMAGE);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(result.plateNumber).toBe('59G2-038.80');
    expect(result.vehicleType).toBe('car');
  });

  test('surfaces the outage when the only configured provider is down', async () => {
    env.ocrProvider = 'paddle';
    env.paddleOcrUrl = 'http://ocr.test';
    env.geminiApiKey = null;
    fetchSpy.mockRejectedValue(new Error('fetch failed'));

    await expect(scanVehicleImage(IMAGE))
      .rejects.toEqual(expect.objectContaining({ errorCode: 'AI_SCAN_FAILED' }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  test('does not fail over when the provider answers with unusable output', async () => {
    env.ocrProvider = 'paddle';
    env.paddleOcrUrl = 'http://ocr.test';
    env.geminiApiKey = 'key';
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => { throw new Error('not json'); },
    });

    await expect(scanVehicleImage(IMAGE))
      .rejects.toEqual(expect.objectContaining({ errorCode: 'AI_SCAN_BAD_OUTPUT' }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
