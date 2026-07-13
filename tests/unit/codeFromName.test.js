const { initialsCode, STOP_WORDS_VI } = require("../../src/utils/codeFromName");

describe("initialsCode — sinh mã từ tên (floor: không stop-words)", () => {
  test.each([
    ["Tầng 1", "T1"],
    ["Tầng 2", "T2"],
    ["Hầm B1", "HB1"],
    ["Tầng trệt", "TT"],
    ["tầng lửng", "TL"],
  ])("%s → %s", (name, expected) => {
    expect(initialsCode(name)).toBe(expected);
  });

  test("tên rỗng → fallback", () => {
    expect(initialsCode("", { fallback: "F" })).toBe("F");
    expect(initialsCode("   ", { fallback: "F" })).toBe("F");
  });

  test("cắt theo maxLen", () => {
    expect(initialsCode("Một Hai Ba Bốn Năm Sáu", { maxLen: 4 })).toBe("MHBB");
  });
});

describe("initialsCode — zone (stop-words tiếng Việt, maxLen 4)", () => {
  const opts = { stopWords: STOP_WORDS_VI, maxLen: 4, fallback: "Z" };

  test.each([
    ["Dãy cho khách vãng lai", "VL"],
    ["Khu đặt trước tầng 1", "DTT1"],
    ["Dãy A", "A"],
    ["Dãy khách có package", "PA"],
  ])("%s → %s", (name, expected) => {
    expect(initialsCode(name, opts)).toBe(expected);
  });

  test("tên toàn từ phụ → dùng lại toàn bộ từ", () => {
    // "Dãy khu" chỉ gồm stop-words → quay về initials không lọc: DK
    expect(initialsCode("Dãy khu", opts)).toBe("DK");
  });

  test("mã 1 ký tự → lấy 2 chữ đầu của từ có nghĩa", () => {
    expect(initialsCode("Dãy VIP", opts)).toBe("VI");
  });
});
