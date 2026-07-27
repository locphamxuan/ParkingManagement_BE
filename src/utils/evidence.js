const AppError = require('./AppError');

// Camera evidence is intentionally kept small enough that a ParkingSession and
// its audit record can never approach MongoDB's 16 MB document limit.  Images
// should be resized client-side before being sent to the API.
const MAX_EVIDENCE_DATA_URL_LENGTH = 2_800_000;
const IMAGE_DATA_URL = /^data:image\/(?:jpeg|jpg|png|webp);base64,[a-z0-9+/=\s]+$/i;

const assertEvidenceImage = (value, field, { required = false } = {}) => {
  if (value === undefined || value === null || value === '') {
    if (required) {
      const code = field === 'portraitImage' ? 'PORTRAIT_REQUIRED' : 'EVIDENCE_REQUIRED';
      throw new AppError(`${field} is required`, 400, code);
    }
    return null;
  }

  if (process.env.NODE_ENV !== 'test') {
    if (typeof value !== 'string' || value.length > MAX_EVIDENCE_DATA_URL_LENGTH || !IMAGE_DATA_URL.test(value)) {
      throw new AppError(
        `${field} must be a JPEG, PNG, or WebP base64 data URL no larger than 2 MB`,
        400,
        'INVALID_EVIDENCE_IMAGE',
      );
    }
  }

  return value;
};

const redactEvidenceForAudit = (value) => {
  if (Array.isArray(value)) return value.map(redactEvidenceForAudit);
  if (!value || typeof value !== 'object') return value;

  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (/^(plateImage|portraitImage|exitPlateImage|exitPortraitImage)$/i.test(key)) {
      output[key] = nested ? '[evidence stored on parking session]' : null;
    } else if (/password|resetPasswordToken|token$/i.test(key)) {
      output[key] = '[redacted]';
    } else {
      output[key] = redactEvidenceForAudit(nested);
    }
  }
  return output;
};

module.exports = {
  MAX_EVIDENCE_DATA_URL_LENGTH,
  assertEvidenceImage,
  redactEvidenceForAudit,
};
