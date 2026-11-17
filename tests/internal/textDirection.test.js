import { describe, expect, it } from "vitest";
import { getTextDirection } from "../../src/internal/textDirection.js";

describe("getTextDirection", () => {
  it.each([
    ["ar", "rtl"],
    ["ur", "rtl"],
    ["fa", "rtl"],
    ["ar-EG", "rtl"],
    ["en", "ltr"],
    ["ja", "ltr"],
    ["zh-Hans", "ltr"],
    ["pa-Guru", "ltr"],
  ])("writes %s as %s", (languageTag, direction) => {
    expect(getTextDirection(languageTag)).toBe(direction);
  });
});
