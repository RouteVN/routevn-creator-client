import { describe, expect, it } from "vitest";
import {
  compareUpdateVersions,
  isUpdateVersion,
} from "../../src/internal/updateVersion.js";

describe("application release precedence", () => {
  it("orders the SemVer prerelease examples numerically and lexically", () => {
    const versions = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.9.0",
      "1.10.0",
    ];
    for (let index = 1; index < versions.length; index += 1) {
      expect(compareUpdateVersions(versions[index - 1], versions[index])).toBe(
        -1,
      );
      expect(compareUpdateVersions(versions[index], versions[index - 1])).toBe(
        1,
      );
    }
    expect(compareUpdateVersions("v1.0.0+build.1", "1.0.0+build.2")).toBe(0);
    expect(
      compareUpdateVersions("1.0.0-9007199254740992", "1.0.0-9007199254740993"),
    ).toBe(-1);
  });

  it.each([
    undefined,
    null,
    "",
    "1.0",
    "01.0.0",
    "1.0.0-01",
    "1.0.0-a..b",
    "1.0.0+",
    "vv1.0.0",
    "1.0.0\n",
    "1.0.0-" + "a".repeat(128),
  ])("rejects invalid version %s", (value) => {
    expect(isUpdateVersion(value)).toBe(false);
    expect(() => compareUpdateVersions(value, "1.0.0")).toThrow();
  });
});
