import { describe, expect, it } from "vitest";
import { validateNewFontData } from "../../src/internal/fontValidation.js";
import { inspectNewFontFile } from "../../src/internal/fontCapabilities.js";
import { createTestFontBytes } from "../support/fontFixtures.js";
import { createVariableWoff2Bytes } from "../support/woff2FontFixture.js";

describe("font container validation", () => {
  it("rejects changed table data even when weight metadata can still be read", async () => {
    const bytes = createTestFontBytes({
      variableRange: { minWeight: 100, defaultWeight: 400, maxWeight: 900 },
    });
    bytes[bytes.length - 5] ^= 0xff;
    await expect(
      inspectNewFontFile(new File([bytes], "font-one.ttf")),
    ).rejects.toMatchObject({ code: "invalid_font_data" });
  });

  it("rejects truncated, overlapping, duplicate, and out-of-bounds tables", () => {
    const make = () =>
      createTestFontBytes({
        variableRange: { minWeight: 100, defaultWeight: 400, maxWeight: 900 },
      });
    const truncated = make().subarray(0, 30);
    const overlapping = make();
    new DataView(overlapping.buffer).setUint32(36, 60);
    const duplicate = make();
    duplicate.set(duplicate.subarray(12, 16), 28);
    const outside = make();
    new DataView(outside.buffer).setUint32(20, 0xfffffffc);
    for (const bytes of [truncated, overlapping, duplicate, outside]) {
      expect(() => validateNewFontData(bytes)).toThrow();
    }
  });

  it("ignores head checksumAdjustment without modifying the input", () => {
    const bytes = new Uint8Array(44);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x00010000);
    view.setUint16(4, 1);
    bytes.set(new TextEncoder().encode("head"), 12);
    view.setUint32(20, 28);
    view.setUint32(24, 16);
    view.setUint32(36, 0x12345678);
    const original = bytes.slice();
    expect(() => validateNewFontData(bytes)).not.toThrow();
    expect(bytes).toEqual(original);
  });

  it("accepts valid WOFF2 and rejects truncated compressed payloads", () => {
    const bytes = createVariableWoff2Bytes();
    expect(() => validateNewFontData(bytes)).not.toThrow();
    expect(() =>
      validateNewFontData(bytes.subarray(0, bytes.length - 1)),
    ).toThrow();
    const invalid = bytes.slice();
    new DataView(invalid.buffer).setUint32(20, bytes.length);
    expect(() => validateNewFontData(invalid)).toThrow("compressed data");
  });

  it("bounds WOFF2 declared decompression before entering a decoder", () => {
    const bytes = new Uint8Array(56);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 0x774f4632);
    view.setUint32(4, 0x00010000);
    view.setUint32(8, bytes.length);
    view.setUint16(12, 1);
    bytes.set([0, 0x81, 0x80, 0x80, 0x80, 0], 48);
    expect(() => validateNewFontData(bytes)).toThrow("128 MB");
  });
});
