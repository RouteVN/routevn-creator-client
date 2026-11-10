import { describe, expect, it } from "vitest";
import {
  createAndroidNativeVersion,
  isValidNativeApplicationVersion,
  isValidAndroidVersionCode,
  createMacosNativeVersion,
  isValidMacosBuildNumber,
} from "../../src/internal/nativeApplicationVersion.js";

describe("macOS native application versions", () => {
  it("uses the manually entered version and build number", () => {
    expect(createMacosNativeVersion("2.4.1", "258")).toEqual({
      shortVersion: "2.4.1",
      bundleVersion: "258",
    });
    expect(() => createMacosNativeVersion("2.4", "258")).toThrow(
      "macOS export requires a three-component numeric version.",
    );
    expect(() => createMacosNativeVersion("02.4.1", "258")).toThrow(
      "macOS export requires a three-component numeric version.",
    );
  });

  it("requires a positive numeric build number", () => {
    expect(isValidMacosBuildNumber("1")).toBe(true);
    expect(isValidMacosBuildNumber("258")).toBe(true);
    expect(isValidMacosBuildNumber("0")).toBe(false);
    expect(isValidMacosBuildNumber("01")).toBe(false);
    expect(isValidMacosBuildNumber("18446744073709551616")).toBe(false);
    expect(() => createMacosNativeVersion("2.4.1", "0")).toThrow(
      "macOS export requires a positive numeric build number.",
    );
  });
});

describe("shared native version contract", () => {
  it.each(["0.0.0", "1.2.3", "18446744073709551615.0.1"])(
    "accepts %s for both native platforms",
    (value) => {
      expect(isValidNativeApplicationVersion(value)).toBe(true);
    },
  );
  it.each([
    undefined,
    123,
    "1.2",
    "v1.2.3",
    "01.2.3",
    "1.2.3-beta",
    "18446744073709551616.0.1",
  ])("rejects %s", (value) => {
    expect(isValidNativeApplicationVersion(value)).toBe(false);
  });
  it.each(["1", "123", "2100000000"])("accepts Android build %s", (value) => {
    expect(isValidAndroidVersionCode(value)).toBe(true);
  });
  it.each([
    undefined,
    1,
    "",
    "0",
    "01",
    "-1",
    "1.0",
    "1e3",
    " 1",
    "1\n",
    "2100000001",
    "999999999999999999999999",
  ])("rejects Android build %s", (value) => {
    expect(isValidAndroidVersionCode(value)).toBe(false);
  });
  it("converts an Android build to a numeric versionCode", () => {
    expect(createAndroidNativeVersion("1.2.3", "2100000000")).toEqual({
      versionName: "1.2.3",
      versionCode: 2100000000,
    });
    expect(() => createAndroidNativeVersion("1.2", "1")).toThrow(
      "three-component",
    );
    expect(() => createAndroidNativeVersion("1.2.3", "0")).toThrow(
      "build number",
    );
  });
});
