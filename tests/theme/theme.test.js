import { describe, expect, it } from "vitest";
import {
  APP_THEME_CLASS_NAMES,
  APP_THEME_IDS,
  getThemeClassName,
  isDarkTheme,
  normalizeTheme,
} from "../../src/internal/theme.js";

describe("app themes", () => {
  it("registers Dark, Black, and Light with direct ids", () => {
    expect(APP_THEME_IDS).toEqual(["dark", "black", "light"]);
    expect(APP_THEME_CLASS_NAMES).toEqual([
      "theme-dark",
      "theme-black",
      "theme-light",
    ]);
  });

  it("normalizes and classifies the supported themes", () => {
    expect(normalizeTheme("dark")).toBe("dark");
    expect(normalizeTheme("black")).toBe("black");
    expect(isDarkTheme("dark")).toBe(true);
    expect(isDarkTheme("black")).toBe(true);
    expect(isDarkTheme("light")).toBe(false);
    expect(getThemeClassName("dark")).toBe("theme-dark");
    expect(getThemeClassName("black")).toBe("theme-black");
  });

  it("defaults unsupported themes to Dark and normalizes legacy ids", () => {
    expect(normalizeTheme("unknown")).toBe("dark");
    expect(normalizeTheme("neutral-light")).toBe("dark");
    expect(normalizeTheme("soft-dark")).toBe("dark");
    expect(normalizeTheme("light-soft")).toBe("light");
    expect(normalizeTheme("light-warm")).toBe("light");
  });
});
