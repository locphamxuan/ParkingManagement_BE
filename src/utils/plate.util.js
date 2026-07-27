/**
 * Vietnamese license-plate normalization & validation.
 * Phủ đủ các định dạng biển dân sự hiện hành của Việt Nam:
 *
 *   province: 2 chữ số (mã tỉnh/thành).
 *   series  : 1–2 chữ cái + (tuỳ chọn) 1 chữ số:
 *     - Ô TÔ          → 1 chữ cái:           30A, 51F, 36C        (vd 30A-123.45)
 *     - XE MÁY        → 1 chữ cái + 1 số:     59X1, 29B1, 60F8     (vd 59X1-234.56)
 *     - Đặc biệt/liên doanh → 2 chữ cái:      51LD, 80NG, 29MĐ→MD  (vd 51LD-123.45)
 *     - Hiếm           → 2 chữ cái + 1 số:    59AB1                (vd 59AB1-234.56)
 *   number  : 4 hoặc 5 chữ số. Nhóm 5 số hiển thị dấu chấm trước 2 số cuối
 *             (`NNN.NN`); nhóm 4 số để trơn (`NNNN`).
 *
 * Single source of truth — mọi nơi đọc/ghi biển số nên đi qua đây để giá trị lưu
 * và tra cứu luôn nhất quán. `normalizePlate` idempotent với input đã canonical.
 */

// Khớp dạng canonical (đồng thời validate giá trị đã lưu).
// Series = 1–2 chữ cái + tuỳ chọn 1 chữ số → phủ cả ô tô (30A), xe máy (59X1),
// biển 2 chữ (51LD) và biển 2 chữ + số (59AB1).
const CANONICAL_PLATE_REGEX = /^\d{2}[A-Z]{1,2}\d?-(?:\d{3}\.\d{2}|\d{4})$/;

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

module.exports = { normalizePlate, isValidVietnamPlate, plateMatchRegex };
