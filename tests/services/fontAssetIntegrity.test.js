import { afterEach, describe, expect, it, vi } from "vitest";
import { computeSha256 } from "../../src/deps/clients/sha256.js";
import { createProjectAssetService } from "../../src/deps/services/shared/projectAssetService.js";

describe("project font integrity", () => {
  afterEach(() => vi.unstubAllGlobals());

  const setup = ({ bytes, metadata, readError } = {}) => {
    const revoke = vi.fn();
    const fetchFile = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetchFile);
    const service = createProjectAssetService({
      fileAdapter: {
        getFileContent: async () => {
          if (readError) throw readError;
          return { url: "asset://font-one", revoke };
        },
      },
      resolveFileMetadata: () => metadata,
    });
    return { service, fetchFile, revoke };
  };

  it("checks the saved hash and returns the verified bytes with an owned URL", async () => {
    const bytes = new TextEncoder().encode("original bytes");
    const metadata = Object.freeze({
      mimeType: "font/ttf",
      size: bytes.length,
      sha256: await computeSha256(bytes),
    });
    const { service, fetchFile, revoke } = setup({ bytes, metadata });
    const content = await service.getFileContent("font-one");
    expect(new Uint8Array(content.buffer)).toEqual(bytes);
    expect(content.url).toMatch(/^blob:/);
    expect(content.type).toBe("font/ttf");
    expect(fetchFile).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledOnce();
    content.revoke();
  });

  it.each(["same-size change", "truncated"])(
    "rejects %s with the font ID before any decoder runs",
    async (damage) => {
      const original = new TextEncoder().encode("original");
      const bytes = new TextEncoder().encode(
        damage === "truncated" ? "part" : "modified",
      );
      const metadata = Object.freeze({
        mimeType: "font/woff2",
        size: original.length,
        sha256: await computeSha256(original),
      });
      const { service, revoke } = setup({ bytes, metadata });
      await expect(service.getFileContent("font-one")).rejects.toMatchObject({
        fileId: "font-one",
        code: "font_integrity_mismatch",
      });
      expect(revoke).toHaveBeenCalledOnce();
    },
  );

  it("keeps legacy fonts without a hash readable without changing their metadata", async () => {
    const metadata = Object.freeze({ mimeType: "font/woff" });
    const { service } = setup({ bytes: new Uint8Array([1, 2, 3]), metadata });
    const content = await service.getFileContent("font-one");
    expect(content.buffer.byteLength).toBe(3);
    expect(metadata).not.toHaveProperty("sha256");
    content.revoke();
  });

  it("identifies missing fonts and leaves media URL-backed", async () => {
    const missing = setup({
      metadata: { mimeType: "font/ttf" },
      readError: new Error("missing"),
    });
    await expect(
      missing.service.getFileContent("font-one"),
    ).rejects.toMatchObject({
      fileId: "font-one",
      code: "font_file_unavailable",
    });
    const media = setup({ metadata: { mimeType: "video/mp4" } });
    const content = await media.service.getFileContent("video-one");
    expect(content.url).toBe("asset://font-one");
    expect(media.fetchFile).not.toHaveBeenCalled();
    expect(media.revoke).not.toHaveBeenCalled();
  });

  it("does not call a font damaged when the hashing runtime is unavailable", async () => {
    const { service } = setup({
      bytes: new Uint8Array([1]),
      metadata: { mimeType: "font/ttf", sha256: "a".repeat(64) },
    });
    vi.stubGlobal("crypto", {
      subtle: {
        digest: async () => {
          throw new Error("hashing unavailable");
        },
      },
    });
    await expect(service.getFileContent("font-one")).rejects.toMatchObject({
      code: "font_file_unavailable",
    });
  });

  it("verifies stored fonts using the shared fallback when Web Crypto is absent", async () => {
    const bytes = new TextEncoder().encode("font bytes");
    const metadata = {
      mimeType: "font/ttf",
      size: bytes.length,
      sha256: await computeSha256(bytes),
    };
    const { service } = setup({ bytes, metadata });
    vi.stubGlobal("crypto", {});
    const content = await service.getFileContent("font-one");
    expect(new Uint8Array(content.buffer)).toEqual(bytes);
    content.revoke();
  });
});
