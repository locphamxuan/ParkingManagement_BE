/**
 * Sinh mã ngắn từ tên tiếng Việt: bỏ dấu, lấy chữ cái đầu mỗi từ,
 * giữ nguyên token chứa số ("Hầm B1" → HB1, "Tầng 1" → T1).
 * Dùng cho Floor/Zone — collision do service xử lý (thêm số đuôi).
 */

// Từ phụ không mang nghĩa phân biệt trong tên zone (đã bỏ dấu, lowercase).
const STOP_WORDS_VI = ["day", "khu", "vuc", "cho", "cua", "va", "co", "cac", "khach", "zone", "area", "the"];

const stripDiacritics = (str) =>
  String(str)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");

/**
 * @param {string} name
 * @param {object} [opts]
 * @param {string[]} [opts.stopWords] các từ bị bỏ qua khi lấy chữ đầu
 * @param {number} [opts.maxLen] độ dài tối đa của mã
 * @param {string} [opts.fallback] mã dùng khi tên không sinh được ký tự nào
 */
const initialsCode = (name, { stopWords = [], maxLen = 10, fallback = "X" } = {}) => {
  const clean = stripDiacritics(name).toUpperCase().trim();
  const allTokens = clean.split(/[^A-Z0-9]+/).filter(Boolean);
  if (!allTokens.length) return fallback;

  const stop = new Set(stopWords.map((w) => stripDiacritics(w).toUpperCase()));
  let tokens = allTokens.filter((t) => !stop.has(t));
  // Lọc hết sạch thì quay về toàn bộ từ — thà mã dài còn hơn mã rỗng.
  if (!tokens.length) tokens = allTokens;

  let code = tokens.map((t) => (/\d/.test(t) ? t : t[0])).join("");
  // Mã 1 ký tự quá dễ trùng → lấy 2 chữ cái đầu của từ có nghĩa đầu tiên.
  if (code.length < 2) code = tokens[0].slice(0, 2);
  return code.slice(0, maxLen) || fallback;
};

module.exports = { initialsCode, STOP_WORDS_VI };
