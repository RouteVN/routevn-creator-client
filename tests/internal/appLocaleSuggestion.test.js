import { describe, expect, it } from "vitest";
import {
  APP_LOCALE_OPTIONS,
  resolveAppLocaleSuggestion,
} from "../../src/internal/ui/appLocale.js";

const availableLocales = APP_LOCALE_OPTIONS.map((option) => option.value);
const suggest = (deviceLanguages, options = {}) =>
  resolveAppLocaleSuggestion({ deviceLanguages, availableLocales, ...options });

describe("resolveAppLocaleSuggestion", () => {
  it.each([
    [["ja-JP"], "ja"],
    [["ja"], "ja"],
    [["zh-CN"], "zh-hans"],
    [["zh-Hans-HK"], "zh-hans"],
    [["zh-SG"], "zh-hans"],
    [["zh"], "zh-hans"],
    [["zh-TW"], "zh-hant"],
    [["zh-HK"], "zh-hant"],
    [["zh-MO"], "zh-hant"],
    [["zh-Hant-HK"], "zh-hant"],
    [["zh_Hant_TW"], "zh-hant"],
    [["ko-KR"], "ko"],
    [["ko"], "ko"],
    [["pt-BR"], "pt"],
    [["fr-CA", "en-US"], "fr"],
    [["in-ID"], "id"],
    [["uk_UA"], "uk"],
  ])("suggests the app locale for %j", (deviceLanguages, locale) => {
    expect(suggest(deviceLanguages)).toBe(locale);
  });

  it.each([
    ["English first", ["en-US", "ja-JP"]],
    ["Chinese for a region with no clear script", ["zh-US"]],
    ["a language the app does not have", ["de-DE"]],
    ["no device languages", []],
  ])("suggests nothing for %s", (_case, deviceLanguages) => {
    expect(suggest(deviceLanguages)).toBeUndefined();
  });

  it("suggests nothing once the user has chosen a language, English too", () => {
    expect(suggest(["ja-JP"], { storedLocale: "en" })).toBeUndefined();
    expect(suggest(["ja-JP"], { storedLocale: "ja" })).toBeUndefined();
  });

  it("ignores a stored language the app no longer has", () => {
    expect(suggest(["ja-JP"], { storedLocale: "xx" })).toBe("ja");
  });

  it("suggests nothing once closed, whatever the device language", () => {
    expect(suggest(["ja-JP"], { dismissed: true })).toBeUndefined();
    expect(suggest(["fr-FR"], { dismissed: true })).toBeUndefined();
  });
});
