import { describe, expect, it } from "vitest";
import {
  APP_THEME_CLASS_NAMES,
  APP_THEME_IDS,
  getThemeClassName,
  isDarkTheme,
  normalizeTheme,
} from "../../src/internal/theme.js";

describe("app themes", () => {
  it("registers Black, Dark, and Light with stable persisted ids", () => {
    expect(APP_THEME_IDS).toEqual(["soft-dark", "dark", "light"]);
    expect(APP_THEME_CLASS_NAMES).toEqual([
      "theme-soft-dark",
      "theme-dark",
      "theme-light",
    ]);
  });

  it("normalizes and classifies the supported themes", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("soft-dark")).toBe("soft-dark");
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("soft-dark")).toBe(true);
    expect(isDarkTheme("light")).toBe(false);
    expect(getThemeClassName("dark")).toBe("theme-dark");
    expect(getThemeClassName("soft-dark")).toBe("theme-soft-dark");
  });

  it("defaults unsupported themes to Dark and keeps legacy light behavior", () => {
    expect(normalizeTheme("unknown")).toBe("soft-dark");
    expect(normalizeTheme("neutral-light")).toBe("soft-dark");
    expect(normalizeTheme("light-soft")).toBe("light");
    expect(normalizeTheme("light-warm")).toBe("light");
  });
});
