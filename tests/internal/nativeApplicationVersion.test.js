import { describe, expect, it } from "vitest";
import {
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
