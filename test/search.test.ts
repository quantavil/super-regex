import { expect, test, describe } from "bun:test";
import { findAllMatchesInLine, SearchConfig } from "../src/search";

describe("findAllMatchesInLine", () => {
  test("finds matches via RegExp", () => {
    const config: SearchConfig = {
      searchRegex: /foo/g,
      queryString: "foo",
      isPipe: false,
      pipeRegExps: null
    };
    const results = findAllMatchesInLine("this is foo and foo", config, null);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ start: 8, end: 11, text: "foo" });
    expect(results[1]).toEqual({ start: 16, end: 19, text: "foo" });
  });

  test("populates foundWords set when using RegExp and pipes", () => {
    const config: SearchConfig = {
      searchRegex: /foo|bar/g,
      queryString: "foo|bar",
      isPipe: true,
      pipeRegExps: [
        { word: "foo", re: /foo/ },
        { word: "bar", re: /bar/ },
        { word: "missing", re: /missing/ }
      ]
    };
    const foundWords = new Set<string>();
    const results = findAllMatchesInLine("only foo here", config, foundWords);
    expect(results).toHaveLength(1);
    expect(foundWords.has("foo")).toBe(true);
    expect(foundWords.has("bar")).toBe(false);
  });

  test("finds matches via text indexOf", () => {
    const config: SearchConfig = {
      searchRegex: null,
      queryString: "foo",
      isPipe: false,
      pipeRegExps: null
    };
    const results = findAllMatchesInLine("this is foo and foo", config, null);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ start: 8, end: 11, text: "foo" });
    expect(results[1]).toEqual({ start: 16, end: 19, text: "foo" });
  });

  test("finds matches via text mode with pipes and populates foundWords", () => {
    const config: SearchConfig = {
      searchRegex: null,
      queryString: "foo|bar",
      isPipe: true,
      pipeRegExps: [
        { word: "foo", re: /foo/ },
        { word: "bar", re: /bar/ }
      ]
    };
    const foundWords = new Set<string>();
    const results = findAllMatchesInLine("foo test bar", config, foundWords);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ start: 0, end: 3, text: "foo" });
    expect(results[1]).toEqual({ start: 9, end: 12, text: "bar" });
    expect(foundWords.has("foo")).toBe(true);
    expect(foundWords.has("bar")).toBe(true);
  });

  test("sorts text mode pipe results", () => {
    const config: SearchConfig = {
      searchRegex: null,
      queryString: "bar|foo",
      isPipe: true,
      pipeRegExps: [
        { word: "bar", re: /bar/ },
        { word: "foo", re: /foo/ }
      ]
    };
    const foundWords = new Set<string>();
    // 'foo' comes before 'bar' in string, but 'bar' is checked first in pipeRegExps
    const results = findAllMatchesInLine("foo then bar", config, foundWords);
    expect(results).toHaveLength(2);
    // Should be sorted by start position
    expect(results[0]).toEqual({ start: 0, end: 3, text: "foo" });
    expect(results[1]).toEqual({ start: 9, end: 12, text: "bar" });
  });

  test("returns empty array for empty config elements", () => {
     const config: SearchConfig = {
      searchRegex: null,
      queryString: "",
      isPipe: false,
      pipeRegExps: null
    };
    const results = findAllMatchesInLine("foo then bar", config, null);
    expect(results).toHaveLength(0);
  });
});
