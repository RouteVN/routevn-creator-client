import { describe, expect, it } from "vitest";
import {
  isValidDeviceLanguage,
  isValidFormFactor,
  isValidUiLanguage,
  isValidUiLanguageSource,
  isValidUpdateTrigger,
  isValidWebViewVersion,
  normalizeDeviceLanguage,
} from "../../src/internal/updateUsage.js";

// The same table as src-tauri/src/update_device_info.rs; keep both aligned.
describe("update-check usage field normalization", () => {
  it.each([
    ["ja-JP", "ja"],
    ["en-GB", "en"],
    ["en_US", "en"],
    ["pt-BR", "pt"],
    ["ja-JP-u-ca-japanese", "ja"],
    ["th", "th"],
    ["fil", "fil"],
    ["zh-Hans-CN", "zh-hans"],
    ["zh-Hant-TW", "zh-hant"],
    ["zh-Hant", "zh-hant"],
    ["zh-CN", "zh-hans"],
    ["zh-SG", "zh-hans"],
    ["zh-TW", "zh-hant"],
    ["zh-HK", "zh-hant"],
    ["zh-MO", "zh-hant"],
    ["zh", "zh-hans"],
    ["zh-x-tw", "zh-hans"],
    ["zh-u-nu-hanidec", "zh-hans"],
    ["zh-TW-x-foo", "zh-hant"],
    ["ja-x-tw", "ja"],
    ["zh-u-ca-japanese", "zh-hans"],
    ["zh-419", "zh-hans"],
    ["sr-Latn-RS", "sr"],
    ["en-Latn-US", "en"],
    ["en", "en"],
    [" ja-JP ", "ja"],
    ["", "unknown"],
    ["123", "unknown"],
    ["C", "unknown"],
    ["POSIX", "unknown"],
  ])("normalizes %j to %j", (raw, expected) => {
    expect(normalizeDeviceLanguage(raw)).toBe(expected);
  });

  it.each([undefined, null, 18, {}, ["ja"]])(
    "normalizes unreadable %p to unknown",
    (raw) => {
      expect(normalizeDeviceLanguage(raw)).toBe("unknown");
    },
  );

  it("always returns a value the API accepts for device.language", () => {
    for (const raw of ["ja-JP", "garbage", "", null]) {
      expect(isValidDeviceLanguage(normalizeDeviceLanguage(raw))).toBe(true);
    }
  });

  it.each([
    ["ja", true],
    ["zh-hans", true],
    ["th", true],
    ["en-US", false],
    ["EN", false],
    ["unknown", false],
    ["und-XXX", false],
    [18, false],
  ])("validates uiLanguage %p as %p", (value, expected) => {
    expect(isValidUiLanguage(value)).toBe(expected);
  });

  it.each([
    ["128", true],
    ["2.46", true],
    ["128.0.6613.84", false],
    ["", false],
    ["128.", false],
    [".128", false],
    ["012345", false],
  ])("validates webViewVersion %p as %p", (value, expected) => {
    expect(isValidWebViewVersion(value)).toBe(expected);
  });

  it("validates the field enums", () => {
    for (const value of ["phone", "tablet", "desktop"])
      expect(isValidFormFactor(value)).toBe(true);
    expect(isValidFormFactor("watch")).toBe(false);
    for (const value of ["default", "selected"])
      expect(isValidUiLanguageSource(value)).toBe(true);
    expect(isValidUiLanguageSource("auto")).toBe(false);
    for (const value of ["launch", "periodic", "manual"])
      expect(isValidUpdateTrigger(value)).toBe(true);
    expect(isValidUpdateTrigger("background")).toBe(false);
  });
});
