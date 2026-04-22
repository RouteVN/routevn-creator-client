import { describe, expect, it } from "vitest";
import {
  normalizeExportFileMimeType,
  resolveBundleAssetMimeType,
} from "../../src/internal/bundleRuntimeAssets.js";

describe("resolveBundleAssetMimeType", () => {
  it("keeps a specific bundle mime type", () => {
    expect(
      resolveBundleAssetMimeType({
        bundleMime: "image/png",
        detectedMime: "image/jpeg",
      }),
    ).toBe("image/png");
  });

  it("prefers detected mime when bundle mime is generic octet-stream", () => {
    expect(
      resolveBundleAssetMimeType({
        bundleMime: "application/octet-stream",
        detectedMime: "font/ttf",
      }),
    ).toBe("font/ttf");
  });

  it("falls back to generic octet-stream when no better mime is available", () => {
    expect(
      resolveBundleAssetMimeType({
        bundleMime: "application/octet-stream",
        detectedMime: undefined,
      }),
    ).toBe("application/octet-stream");
  });

  it("prefers detected mime when bundle font mime is invalid", () => {
    expect(
      resolveBundleAssetMimeType({
        bundleMime: "font/sample_font",
        detectedMime: "font/ttf",
      }),
    ).toBe("font/ttf");
  });
});

describe("normalizeExportFileMimeType", () => {
  it("keeps valid font mime types", () => {
    expect(
      normalizeExportFileMimeType({
        mimeType: "font/ttf",
        assetType: "font",
      }),
    ).toBe("font/ttf");
  });

  it("drops invalid font mime types so export can fall back to sniffing", () => {
    expect(
      normalizeExportFileMimeType({
        mimeType: "font/sample_font",
        assetType: "font",
      }),
    ).toBeUndefined();
  });
});
