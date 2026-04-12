import { expect, test, describe } from "bun:test";
import { buildRegex } from "../src/utils";

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
