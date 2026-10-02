import { describe, expect, it } from "vitest";
import { isTouchLandscape } from "../../src/internal/touchLayout.js";

describe("touch landscape layout", () => {
  it.each([
    ["phone portrait", 390, 844, false],
    ["tablet portrait", 820, 1180, false],
    ["tablet landscape", 1180, 820, true],
    ["small tablet landscape", 1133, 744, true],
    ["small Android tablet landscape", 962, 530, true],
    ["half Split View on a landscape tablet", 590, 820, false],
    ["landscape window narrower than a tablet", 700, 500, false],
    ["square window", 1024, 1024, false],
    ["landscape below the minimum width", 767, 600, false],
    ["landscape at the minimum width", 768, 600, true],
    ["window metrics not loaded yet", 0, 0, false],
  ])("%s (%i × %i) is %s", (_name, width, height, expected) => {
    expect(isTouchLandscape({ isTouchMode: true, width, height })).toBe(
      expected,
    );
  });

  it("is never touch landscape in the pointer UI", () => {
    expect(
      isTouchLandscape({ isTouchMode: false, width: 1440, height: 900 }),
    ).toBe(false);
  });
});
