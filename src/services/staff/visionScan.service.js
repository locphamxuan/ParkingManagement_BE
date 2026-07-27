const { GoogleGenAI } = require('@google/genai');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { normalizePlate } = require('../../utils/plate.util');

/**
 * AI camera recognition — provider-based:
 * - "gemini": một call Google Gemini vision đọc biển số + loại xe + hãng xe.
 * - "paddle": gọi microservice PaddleOCR self-hosted (ocr-service/) — chỉ đọc
 *   biển số; loại xe/hãng xe do staff xác nhận trên UI.
 * - Không cấu hình provider nào, hoặc scan lỗi → luôn ném lỗi (KHÔNG có mock
 *   fallback) để staff thấy alert thật thay vì nhận nhầm dữ liệu giả.
 */

const MODEL = 'gemini-2.5-flash';

// Popular makes on Vietnamese roads — guides the model toward expected labels.
const KNOWN_BRANDS = [
  'Toyota', 'Honda', 'Hyundai', 'Kia', 'Mazda', 'Ford', 'Mitsubishi',
  'VinFast', 'Suzuki', 'Nissan', 'Isuzu', 'Chevrolet', 'Mercedes-Benz',
  'BMW', 'Audi', 'Lexus', 'Peugeot', 'Daewoo', 'SYM', 'Yamaha', 'Piaggio',
];

const INSTRUCTION =
  'You are an automated parking-gate camera. Look at the vehicle image and return ' +
  'ONLY a raw JSON object (no markdown, no code fences) with exactly these keys:\n' +
  '- "plateNumber" (string): the Vietnamese license plate exactly as printed (raw ' +
  'characters; do not invent a format). Empty string "" if you cannot read it.\n' +
  '- "plateConfidence" (number 0..1): confidence the plate was read correctly.\n' +
  '- "vehicleType" (string): "car" if it is a car/automobile, "motorcycle" if it is a ' +
  'motorbike/scooter, or "" if unsure.\n' +
  `- "brand" (string|null): the vehicle make, chosen from: ${KNOWN_BRANDS.join(', ')}. ` +
  'Use null if you are not reasonably sure.\n' +
  '- "brandConfidence" (number 0..1): confidence in the brand.';

// Map any model output to our two supported kinds (car | motorcycle | null).
const normalizeVehicleType = (raw) => {
  const v = `${raw || ''}`.toLowerCase();
  if (v.includes('motor') || v.includes('xe may') || v.includes('xe máy') || v === 'bike' || v === 'scooter') return 'motorcycle';
  if (v.includes('car') || v.includes('auto') || v.includes('o to') || v.includes('ô tô') || v === 'truck' || v === 'suv') return 'car';
  return null;
};

let cachedClient = null;
const getGeminiClient = () => {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: env.geminiApiKey });
  }
  return cachedClient;
};

// Strip a data-URL prefix if the caller sent one, and detect the media type.
const parseImage = (image) => {
  if (!image || typeof image !== 'string') {
    throw new AppError('image (base64) is required', 400);
  }
  const dataUrl = image.match(/^data:(image\/(?:png|jpe?g|webp|gif));base64,(.*)$/i);
  if (dataUrl) {
    return { mediaType: dataUrl[1].toLowerCase(), data: dataUrl[2] };
  }
  return { mediaType: 'image/jpeg', data: image };
};

/* ── Provider: Google Gemini ────────────────────────────────────────────── */

const scanWithGemini = async (image) => {
  const { mediaType, data } = parseImage(image);
  const client = getGeminiClient();

  let response;
  try {
    response = await client.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType: mediaType, data } },
            { text: INSTRUCTION },
          ],
        },
      ],
      config: { responseMimeType: 'application/json', temperature: 0 },
    });
  } catch (err) {
    throw new AppError(
      `AI scan thất bại: ${err?.message || 'unknown error'}`,
      502,
      'AI_SCAN_FAILED'
    );
  }

  // `response.text` is a getter on the @google/genai response.
  const rawText = (typeof response.text === 'string' ? response.text : '') || '';
  // Defensive: strip ```json fences if the model wrapped the output.
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned || '{}');
  } catch {
    throw new AppError('AI scan trả về dữ liệu không hợp lệ.', 502, 'AI_SCAN_BAD_OUTPUT');
  }

  return {
    plateNumber: normalizePlate(parsed.plateNumber),
    plateConfidence: Number(parsed.plateConfidence) || 0,
    vehicleType: normalizeVehicleType(parsed.vehicleType),
    brand: parsed.brand || null,
    brandConfidence: Number(parsed.brandConfidence) || 0,
  };
};

/* ── Provider: PaddleOCR microservice ───────────────────────────────────── */

const PADDLE_TIMEOUT_MS = 15000;

const scanWithPaddle = async (image) => {
  const { mediaType, data } = parseImage(image);

  let response;
  try {
    response = await fetch(`${env.paddleOcrUrl.replace(/\/$/, '')}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: data, mediaType }),
      signal: AbortSignal.timeout(PADDLE_TIMEOUT_MS),
    });
  } catch (err) {
    throw new AppError(
      `PaddleOCR service không phản hồi: ${err?.message || 'unknown error'}`,
      502,
      'AI_SCAN_FAILED'
    );
  }

  if (!response.ok) {
    throw new AppError(`PaddleOCR service lỗi (HTTP ${response.status}).`, 502, 'AI_SCAN_FAILED');
  }

  let parsed;
  try {
    parsed = await response.json();
  } catch {
    throw new AppError('PaddleOCR trả về dữ liệu không hợp lệ.', 502, 'AI_SCAN_BAD_OUTPUT');
  }

  return {
    plateNumber: normalizePlate(parsed.plateNumber),
    plateConfidence: Number(parsed.plateConfidence) || 0,
    // PaddleOCR chỉ đọc text — loại xe/hãng xe do staff chọn trên UI check-in.
    vehicleType: normalizeVehicleType(parsed.vehicleType),
    brand: parsed.brand || null,
    brandConfidence: Number(parsed.brandConfidence) || 0,
  };
};

/* ── Provider selection ─────────────────────────────────────────────────── */

// OCR_PROVIDER thắng khi được set; nếu không, tự chọn theo cấu hình sẵn có.
// KHÔNG có nhánh mock: thiếu cấu hình luôn ném lỗi rõ ràng cho staff thấy.
const resolveProvider = () => {
  if (env.ocrProvider === 'paddle') {
    if (!env.paddleOcrUrl) {
      throw new AppError(
        'PaddleOCR chưa được cấu hình (thiếu PADDLE_OCR_URL).',
        503,
        'AI_SCAN_NOT_CONFIGURED'
      );
    }
    return 'paddle';
  }
  if (env.ocrProvider === 'gemini') {
    if (!env.geminiApiKey) {
      throw new AppError(
        'AI camera chưa được cấu hình (thiếu GEMINI_API_KEY).',
        503,
        'AI_SCAN_NOT_CONFIGURED'
      );
    }
    return 'gemini';
  }
  if (env.paddleOcrUrl) return 'paddle';
  if (env.geminiApiKey) return 'gemini';
  throw new AppError(
    'AI camera chưa được cấu hình (thiếu GEMINI_API_KEY hoặc PADDLE_OCR_URL). Vui lòng liên hệ quản trị viên.',
    503,
    'AI_SCAN_NOT_CONFIGURED'
  );
};

/**
 * scanVehicleImage(image)
 * @param {string} image base64 image (with or without data-URL prefix)
 * @returns {Promise<{plateNumber:string, plateConfidence:number, vehicleType:('car'|'motorcycle'|null), brand:string|null, brandConfidence:number}>}
 *          plateNumber is canonicalized to the Vietnamese format ('' if unparseable).
 * @throws {AppError} khi chưa cấu hình provider hoặc scan thất bại — KHÔNG bao giờ
 *         trả về dữ liệu giả (mock), luôn để caller (route/controller) trả lỗi
 *         thật cho FE hiển thị alert.
 */
const scanVehicleImage = async (image) => {
  const provider = resolveProvider();
  if (provider === 'paddle') return scanWithPaddle(image);
  return scanWithGemini(image);
};

module.exports = { scanVehicleImage };
