/**
 * Vietnamese license-plate normalization & validation.
 *
 * Canonical form: `59G2-038.80`
 *   - province: 2 digits
 *   - series:   1 letter + 1 digit (e.g. G2, A1, F1) OR 2 letters (e.g. LD, MD).
 *               A bare single letter (e.g. `59G`) is NOT valid — the series digit
 *               is required for letter-series plates.
 *   - number:   4 or 5 digits. 5-digit groups render with a dot before the last
 *               two digits (`NNN.NN`); 4-digit groups render plain (`NNNN`).
 *
 * Single source of truth — every read/write of a plate should pass through here
 * so stored values and lookups stay consistent. `normalizePlate` is idempotent
 * on canonical input.
 */

// Matches the canonical output form (and validates stored values).
// Series must be a letter+digit (e.g. G2) or two letters (e.g. LD) — never a bare letter.
const CANONICAL_PLATE_REGEX = /^\d{2}(?:[A-Z]\d|[A-Z]{2})-(?:\d{3}\.\d{2}|\d{4})$/;

/**
 * Normalize arbitrary user/OCR input into the canonical Vietnamese plate form.
 * Returns '' when the input cannot be parsed as a Vietnamese plate.
 */
const normalizePlate = (raw) => {
  const s = `${raw || ''}`.toUpperCase();

  // province (2 digits) + series letters (1–2), then the remainder.
  const head = s.match(/(\d{2})[^A-Z0-9]*([A-Z]{1,2})(.*)$/);
  if (!head) return '';

  const [, province, letters, rest] = head;

  let seriesDigit = '';
  let numberDigits;

  // An explicit separator splits the (optional) series digit from the number —
  // trust it: `30E-12345` → series '', number 12345; `29X1-2345` → series 1, number 2345.
  const sep = rest.match(/^\s*(\d?)\s*[-_.\s]+\s*([\d.\s]+)$/);
  if (sep) {
    seriesDigit = sep[1] || '';
    numberDigits = sep[2].replace(/[^0-9]/g, '');
  } else {
    // No separator: take the trailing digits. Only treat a leading digit as the
    // series when there are 6 (series + 5-digit number); otherwise prefer a
    // 5-digit number (`30E12345` → 30E-123.45, not 30E1-2345).
    const tail = rest.replace(/[^0-9]/g, '');
    if (tail.length >= 6) {
      seriesDigit = tail.slice(0, tail.length - 5);
      numberDigits = tail.slice(tail.length - 5);
    } else {
      numberDigits = tail;
    }
  }

  if (seriesDigit.length > 1) return '';
  if (numberDigits.length < 4 || numberDigits.length > 5) return '';

  const formattedNumber =
    numberDigits.length === 5
      ? `${numberDigits.slice(0, 3)}.${numberDigits.slice(3)}`
      : numberDigits;

  return `${province}${letters}${seriesDigit}-${formattedNumber}`;
};

/**
 * True when `value` is already a canonical Vietnamese plate.
 * (Run `normalizePlate` first to canonicalize, then validate.)
 */
const isValidVietnamPlate = (value) => CANONICAL_PLATE_REGEX.test(`${value || ''}`);

/**
 * Build a separator-insensitive RegExp that matches any stored plate whose
 * alphanumeric core equals this plate's core. Lets a lookup match the SAME
 * plate even when it was stored in a different format (e.g. `59G2-03880`,
 * `59G2-038.80`, `59G2 038 80` all match). Returns null if there is no core.
 *
 * Note: this matches format variants only — it does NOT match different
 * characters (e.g. `59G…` vs `59G2…` stay distinct, since they are different plates).
 */
const plateMatchRegex = (raw) => {
  const core = `${raw || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!core) return null;
  const body = core
    .split('')
    .map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('[^A-Z0-9]*');
  return new RegExp(`^${body}$`, 'i');
};

module.exports = { normalizePlate, isValidVietnamPlate, plateMatchRegex, CANONICAL_PLATE_REGEX };
