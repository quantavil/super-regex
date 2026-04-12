import { expect, test, describe } from "bun:test";
import { buildRegex, getReplacementText, pluralize, escapeRegex } from "../src/utils";

describe("buildRegex", () => {
  test("creates a valid RegExp from pattern", () => {
    const regex = buildRegex("hello");
    expect(regex.source).toBe("hello");
    expect(regex.flags).toBe("gm");
  });

  test("applies case insensitive flag when specified", () => {
    const regex = buildRegex("hello", { caseInsensitive: true });
    expect(regex.flags).toBe("gim");
  });

  test("wraps with word boundaries when wholeWord is true", () => {
    const regex = buildRegex("hello", { wholeWord: true });
    expect(regex.source).toBe("\\b(?:hello)\\b");
    expect(regex.flags).toBe("gm");
  });

  test("correctly matches pattern based on flags", () => {
    const caseSensitive = buildRegex("A");
    expect(caseSensitive.test("A")).toBe(true);
    caseSensitive.lastIndex = 0;
    expect(caseSensitive.test("a")).toBe(false);

    const caseInsensitive = buildRegex("A", { caseInsensitive: true });
    expect(caseInsensitive.test("a")).toBe(true);
  });
});

describe("getReplacementText", () => {
  test("returns basic replacement when useRegEx is false", () => {
    const result = getReplacementText(false, "hello world", /world/g, "Earth");
    expect(result).toBe("Earth");
  });

  test("returns replacement when searchRegex is null", () => {
    const result = getReplacementText(true, "hello world", null, "Earth");
    expect(result).toBe("Earth");
  });

  test("applies RegExp replacement on matchText", () => {
    // Tests functionality like capture group parsing
    const result = getReplacementText(true, "foo 123 bar", /(\d+)/g, "number:$1");
    expect(result).toBe("foo number:123 bar");
  });

  test("applies standard string replacement cleanly", () => {
    const result = getReplacementText(true, "hello", /h/g, "H");
    expect(result).toBe("Hello");
  });
});

describe("pluralize", () => {
  test("singular when count is 1", () => {
    expect(pluralize("match", 1)).toBe("1 match");
    expect(pluralize("file", 1)).toBe("1 file");
  });

  test("adds 'es' for words ending in ch/s/x", () => {
    expect(pluralize("match", 3)).toBe("3 matches");
  });

  test("adds 's' for regular words", () => {
    expect(pluralize("file", 5)).toBe("5 files");
    expect(pluralize("replacement", 2)).toBe("2 replacements");
  });

  test("handles zero", () => {
    expect(pluralize("match", 0)).toBe("0 matches");
  });
});

describe("escapeRegex", () => {
  test("escapes special regex characters", () => {
    expect(escapeRegex("a.b*c+d")).toBe("a\\.b\\*c\\+d");
  });

  test("escapes brackets and parens", () => {
    expect(escapeRegex("[foo](bar)")).toBe("\\[foo\\]\\(bar\\)");
  });

  test("passes through plain text", () => {
    expect(escapeRegex("hello world")).toBe("hello world");
  });
});
