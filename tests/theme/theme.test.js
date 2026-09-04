import { describe, expect, it } from "vitest";
import {
  APP_THEME_CLASS_NAMES,
  APP_THEME_IDS,
  getThemeClassName,
  isDarkTheme,
  normalizeTheme,
} from "../../src/internal/theme.js";

describe("app themes", () => {
  it("registers the soft dark and neutral light themes", () => {
    expect(APP_THEME_IDS).toEqual([
      "dark",
      "light",
      "soft-dark",
      "neutral-light",
    ]);
    expect(APP_THEME_CLASS_NAMES).toEqual([
      "theme-dark",
      "theme-light",
      "theme-soft-dark",
      "theme-neutral-light",
    ]);
  });

  it("normalizes and classifies the additional themes", () => {
    expect(normalizeTheme("soft-dark")).toBe("soft-dark");
    expect(normalizeTheme("neutral-light")).toBe("neutral-light");
    expect(isDarkTheme("soft-dark")).toBe(true);
    expect(isDarkTheme("neutral-light")).toBe(false);
    expect(getThemeClassName("soft-dark")).toBe("theme-soft-dark");
    expect(getThemeClassName("neutral-light")).toBe("theme-neutral-light");
  });

  it("keeps existing fallback and legacy light behavior", () => {
    expect(normalizeTheme("unknown")).toBe("dark");
    expect(normalizeTheme("light-soft")).toBe("light");
    expect(normalizeTheme("light-warm")).toBe("light");
  });
});
