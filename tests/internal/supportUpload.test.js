import { describe, expect, it } from "vitest";
import {
  DEBUG_CODE_INPUT_PATTERN,
  isDebugCode,
  normalizeDebugCode,
} from "../../src/internal/supportUpload.js";

describe("support codes", () => {
  it("reads a code typed in either case, with spaces or hyphens", () => {
    expect(normalizeDebugCode(" k7q-m4x ")).toBe("K7QM4X");
    expect(normalizeDebugCode("K7Q M4X")).toBe("K7QM4X");
    expect(isDebugCode(normalizeDebugCode("k7q-m4x"))).toBe(true);
  });

  it("takes six characters without 0, 1, I or O", () => {
    expect(isDebugCode("K7QM4X")).toBe(true);
    expect(isDebugCode("ABCDEFGHJKLMNPQRSTUVWXYZ")).toBe(false);
    for (const code of [
      "K7QM4",
      "K7QM4XY",
      "K7QM40",
      "K7QM41",
      "K7QMIX",
      "K7QMOX",
    ]) {
      expect(isDebugCode(code)).toBe(false);
    }
  });

  it("lets the code field accept exactly what reads as a code", () => {
    const typed = [
      "K7QM4X",
      "k7qm4x",
      "K7Q-M4X",
      " K7Q M4X ",
      "K7QM4",
      "K7QM4XX",
      "K7QM0X",
      "k7qmox",
      "k7qm1x",
      "K7QM4!",
      "K7-Q-M-4-X",
    ];
    for (const text of typed) {
      expect(DEBUG_CODE_INPUT_PATTERN.test(text), text).toBe(
        isDebugCode(normalizeDebugCode(text)),
      );
    }
  });
});
