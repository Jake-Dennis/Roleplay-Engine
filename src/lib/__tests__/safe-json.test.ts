import { describe, it, expect } from "bun:test";
import { safeParse, safeParseWarn } from "../safe-json";

describe("safeParse", () => {
  it("parses valid JSON", () => {
    expect(safeParse('{"a": 1}')).toEqual({ a: 1 });
    expect(safeParse("[1, 2, 3]")).toEqual([1, 2, 3]);
    expect(safeParse('"hello"')).toBe("hello");
    expect(safeParse("42")).toBe(42);
  });

  it("returns null on invalid JSON without fallback", () => {
    expect(safeParse("{bad}")).toBeNull();
    expect(safeParse("not json")).toBeNull();
    expect(safeParse("")).toBeNull();
  });

  it("returns fallback on invalid JSON", () => {
    expect(safeParse("{bad}", {})).toEqual({});
    expect(safeParse("nope", [])).toEqual([]);
    expect(safeParse("nope", "default")).toBe("default");
  });

  it("returns fallback for null/undefined input", () => {
    expect(safeParse(null, "fallback")).toBe("fallback");
    expect(safeParse(undefined, "fallback")).toBe("fallback");
  });

  it("returns null for null/undefined without fallback", () => {
    expect(safeParse(null)).toBeNull();
    expect(safeParse(undefined)).toBeNull();
  });

  it("preserves types via generic", () => {
    const result = safeParse<{ x: number }>('{"x": 10}');
    expect(result).toEqual({ x: 10 });
  });
});

describe("safeParseWarn", () => {
  it("parses valid JSON", () => {
    expect(safeParseWarn('{"b": 2}', "test")).toEqual({ b: 2 });
  });

  it("returns null on invalid JSON without fallback", () => {
    expect(safeParseWarn("{bad}", "test label")).toBeNull();
  });

  it("returns fallback on invalid JSON", () => {
    expect(safeParseWarn("{bad}", "test label", { fallback: true })).toEqual({ fallback: true });
  });

  it("returns fallback for null/undefined input", () => {
    expect(safeParseWarn(null, "test", "fb")).toBe("fb");
    expect(safeParseWarn(undefined, "test", "fb")).toBe("fb");
  });
});
