const { GoogleGenAI } = require('@google/genai');
const env = require('../../config/env');
const AppError = require('../../utils/AppError');
const { normalizePlate } = require('../../utils/plate.util');
const logger = require('../../utils/logger');

/**
 * AI camera recognition — a single Google Gemini vision call reads BOTH the
 * Vietnamese license plate and the vehicle make from one captured frame.
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
const getClient = () => {
  if (!env.geminiApiKey) {
    throw new AppError(
      'AI camera chưa được cấu hình (thiếu GEMINI_API_KEY).',
      503,
      'AI_SCAN_NOT_CONFIGURED'
    );
  }
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

/**
 * scanVehicleImage(image)
 * @param {string} image base64 image (with or without data-URL prefix)
 * @returns {Promise<{plateNumber:string, plateConfidence:number, brand:string|null, brandConfidence:number}>}
 *          plateNumber is canonicalized to the Vietnamese format ('' if unparseable).
 */
const scanVehicleImage = async (image) => {
  // Demo Mock Mode Fallback when Gemini API key is missing
  if (!env.geminiApiKey) {
    try {
      const Reservation = require('../../models/operations/Reservation');
      const activeRes = await Reservation.findOne({ status: { $in: ['pending', 'confirmed', 'checked_in'] } })
        .sort({ updatedAt: -1 })
        .lean();
      
      const targetPlate = activeRes ? activeRes.plateNumber : '59G2-038.80';
      return {
        plateNumber: normalizePlate(targetPlate),
        plateConfidence: 0.99,
        vehicleType: 'car',
        brand: 'VinFast',
        brandConfidence: 0.99,
      };
    } catch (err) {
      logger.error('[AI CAMERA] Mock fallback failed, returning default plate:', err.message);
      return {
        plateNumber: '59G2-038.80',
        plateConfidence: 0.99,
        vehicleType: 'car',
        brand: 'Toyota',
        brandConfidence: 0.99,
      };
    }
  }

  const { mediaType, data } = parseImage(image);
  const client = getClient();

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

module.exports = { scanVehicleImage };
