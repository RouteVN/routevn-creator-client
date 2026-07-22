import { afterEach, describe, expect, it, vi } from "vitest";
import { createFontInfoExtractor } from "../../src/pages/fonts/support/fontInfoExtractor.js";

const EXPECTED_PREVIEW_CHARACTERS = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."0123456789",
  ..."!@#$%^&*()-_=+[]{};:'\",.<>/?\\|`~",
];

const extractFontInfo = async (fontData) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      arrayBuffer: async () => fontData.buffer,
    })),
  );
  const extractor = createFontInfoExtractor({
    getFileContent: vi.fn(async () => ({ url: "font://test-font" })),
    loadFont: vi.fn(async () => ({ style: "normal" })),
  });

  return extractor.extractFontInfo({
    id: "font-1",
    fileId: "file-1",
    fontFamily: "Test Font",
    name: "test-font.ttf",
  });
};

describe("font info extractor", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses one fixed visible ASCII preview without cmap detection", async () => {
    const fontData = new Uint8Array(12);
    fontData.set([0x00, 0x01, 0x00, 0x00]);
    const fontInfo = await extractFontInfo(fontData);

    expect(fontInfo.glyphs.map((glyph) => glyph.char)).toEqual(
      EXPECTED_PREVIEW_CHARACTERS,
    );
    expect(fontInfo).not.toHaveProperty("previewRows");
    expect(fontInfo).not.toHaveProperty("supportedScripts");
    expect(fontInfo).not.toHaveProperty("weightClass");
    expect(fontInfo).not.toHaveProperty("isVariableFont");
    expect(fontInfo).not.toHaveProperty("supportsItalics");
    expect(fontInfo).not.toHaveProperty("glyphCount");
  });

  it("does not add a preview note for WOFF2 fonts", async () => {
    const fontData = new Uint8Array(12);
    fontData.set([0x77, 0x4f, 0x46, 0x32]);
    const fontInfo = await extractFontInfo(fontData);

    expect(fontInfo.format).toBe("WOFF2");
    expect(fontInfo).not.toHaveProperty("previewNote");
    expect(fontInfo.glyphs).toHaveLength(94);
  });
});
