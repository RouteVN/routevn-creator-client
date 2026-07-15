import { describe, expect, it } from "vitest";
import { createMacosNativeVersion } from "../../src/internal/nativeApplicationVersion.js";

describe("macOS native application versions", () => {
  it("maps release action indexes to stable plist versions", () => {
    expect(createMacosNativeVersion(0)).toEqual({
      shortVersion: "1.0.0",
      bundleVersion: "1",
    });
    expect(createMacosNativeVersion(42)).toEqual({
      shortVersion: "1.0.42",
      bundleVersion: "43",
    });
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER, "invalid"])(
    "rejects invalid action index %s",
    (actionIndex) => {
      expect(() => createMacosNativeVersion(actionIndex)).toThrow(
        "macOS export requires a valid non-negative release action index.",
      );
    },
  );
});
