import { describe, expect, it } from "vitest";
import { stableStringify } from "../../src/internal/stableStringify.js";

describe("stableStringify", () => {
  it("sorts every object's keys and keeps array order", () => {
    expect(
      stableStringify({
        b: 1,
        a: { d: [3, { f: 1, e: 2 }], c: "x" },
      }),
    ).toBe('{"a":{"c":"x","d":[3,{"e":2,"f":1}]},"b":1}');
  });

  it("gives the same text for the same values in any key order", () => {
    expect(stableStringify({ x: 1, y: { p: true, q: null } })).toBe(
      stableStringify({ y: { q: null, p: true }, x: 1 }),
    );
  });

  it("leaves out undefined object values, as JSON.stringify does", () => {
    expect(stableStringify({ b: undefined, a: 1 })).toBe('{"a":1}');
    expect(stableStringify([undefined])).toBe("[null]");
  });
});
