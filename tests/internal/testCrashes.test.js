import { describe, expect, it } from "vitest";
import { readTestCrashKind } from "../../src/internal/testCrashes.js";

describe("readTestCrashKind", () => {
  it("maps each test crash project name to its crash kind", () => {
    expect(readTestCrashKind("ROUTEVN_TEST_PANIC_CRASH")).toBe("panic");
    expect(readTestCrashKind("ROUTEVN_TEST_NATIVE_CRASH")).toBe("native");
    expect(readTestCrashKind("ROUTEVN_TEST_APP_CRASH")).toBe("app");
    expect(readTestCrashKind("ROUTEVN_TEST_WEBVIEW_CRASH")).toBe("webview");
  });

  it("ignores ordinary names, near misses and object keys", () => {
    for (const name of [
      "Project One",
      "routevn_test_panic_crash",
      " ROUTEVN_TEST_PANIC_CRASH",
      "constructor",
      "toString",
      "",
      undefined,
    ]) {
      expect(readTestCrashKind(name)).toBeUndefined();
    }
  });
});
