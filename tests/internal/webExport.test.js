import { describe, expect, it } from "vitest";
import {
  normalizeWebScreenFadeDuration,
  WEB_SCREEN_FADE_DURATIONS,
} from "../../src/internal/webExport.js";

describe("web screen fade lengths", () => {
  it("lists 0 to 2000 ms in steps of 100", () => {
    expect(WEB_SCREEN_FADE_DURATIONS).toHaveLength(21);
    expect(WEB_SCREEN_FADE_DURATIONS[0]).toBe(0);
    expect(WEB_SCREEN_FADE_DURATIONS[6]).toBe(600);
    expect(WEB_SCREEN_FADE_DURATIONS.at(-1)).toBe(2000);
  });

  it("uses no fade for a missing or unreadable length", () => {
    for (const value of [undefined, null, "", "abc", Number.NaN]) {
      expect(normalizeWebScreenFadeDuration(value)).toBe(0);
    }
  });

  it("moves a length to the nearest step inside the range", () => {
    expect(normalizeWebScreenFadeDuration(600)).toBe(600);
    expect(normalizeWebScreenFadeDuration("1200")).toBe(1200);
    expect(normalizeWebScreenFadeDuration(22)).toBe(0);
    expect(normalizeWebScreenFadeDuration(650)).toBe(700);
    expect(normalizeWebScreenFadeDuration(5000)).toBe(2000);
    expect(normalizeWebScreenFadeDuration(-300)).toBe(0);
  });
});
