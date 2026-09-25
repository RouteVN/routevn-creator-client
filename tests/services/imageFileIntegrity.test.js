import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectAssetService } from "../../src/deps/services/shared/projectAssetService.js";
import { computeSha256 } from "../../src/deps/clients/sha256.js";

afterEach(() => vi.unstubAllGlobals());

const setup = async () => {
  const original = new Uint8Array([1, 2, 3, 4]);
  const metadata = Object.freeze({
    mimeType: "image/png",
    size: 4,
    sha256: await computeSha256(original),
  });
  const revoke = vi.fn();
  const read = vi.fn(async () => ({ url: "asset://image-one", revoke }));
  const fetchFile = vi.fn(async () => new Response(original));
  vi.stubGlobal("fetch", fetchFile);
  vi.stubGlobal(
    "Image",
    vi.fn(() => {
      throw new Error("Must not decode originals");
    }),
  );
  const service = createProjectAssetService({
    fileAdapter: { getFileContent: read },
    resolveFileMetadata: () => metadata,
  });
  return { service, metadata, read, fetchFile, revoke };
};

describe("background image integrity checks", () => {
  it("rejects modified originals before scene loading and retains URLs for valid images", async () => {
    const { service, fetchFile, revoke } = await setup();
    const options = { verifyImageIntegrity: true };
    fetchFile.mockResolvedValueOnce(new Response(new Uint8Array([4, 3, 2, 1])));
    await expect(
      service.getFileContent("image-one", options),
    ).rejects.toMatchObject({
      fileId: "image-one",
      code: "file_integrity_mismatch",
    });
    expect(revoke).toHaveBeenCalledTimes(2);
    const content = await service.getFileContent("image-one", options);
    expect(content.url).toBe("asset://image-one");
    expect(content).not.toHaveProperty("buffer");
    expect(Image).not.toHaveBeenCalled();
  });

  it("checks saved hashes without decoding or changing metadata", async () => {
    const { service, metadata, revoke, fetchFile } = await setup();
    await expect(service.checkFileIntegrity("image-one")).resolves.toEqual({
      verified: true,
    });
    expect(fetchFile).toHaveBeenCalledWith(
      "asset://image-one",
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(revoke).toHaveBeenCalledOnce();
    expect(metadata.size).toBe(4);
    expect(Image).not.toHaveBeenCalled();
  });

  it("reports same-size corruption and missing files, then permits recovery", async () => {
    const { service, read, fetchFile } = await setup();
    fetchFile.mockResolvedValueOnce(new Response(new Uint8Array([4, 3, 2, 1])));
    await expect(service.checkFileIntegrity("image-one")).rejects.toMatchObject(
      { fileId: "image-one", code: "file_integrity_mismatch" },
    );
    read.mockRejectedValueOnce(new Error("missing"));
    await expect(service.checkFileIntegrity("image-one")).rejects.toMatchObject(
      { fileId: "image-one", code: "file_unavailable" },
    );
    await expect(service.checkFileIntegrity("image-one")).resolves.toEqual({
      verified: true,
    });
  });

  it("shares pending checks and reads only one file at a time", async () => {
    const { service, read, fetchFile } = await setup();
    let finish;
    fetchFile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.checkFileIntegrity("image-one");
    const duplicate = service.checkFileIntegrity("image-one");
    const second = service.checkFileIntegrity("image-two");
    await vi.waitFor(() => expect(fetchFile).toHaveBeenCalledOnce());
    expect(first).toBe(duplicate);
    expect(read).toHaveBeenCalledOnce();
    finish(new Response(new Uint8Array([1, 2, 3, 4])));
    await Promise.all([first, duplicate, second]);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("releases the integrity queue when the native file read never returns", async () => {
    const { service, read, revoke } = await setup();
    let release;
    read.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    vi.useFakeTimers();
    try {
      const first = service
        .checkFileIntegrity("image-one")
        .catch((error) => error);
      const second = service.checkFileIntegrity("image-two");
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await first).toMatchObject({
        fileId: "image-one",
        code: "operation_timeout",
      });
      await expect(second).resolves.toEqual({ verified: true });
      release({ url: "asset://late", revoke });
      await vi.advanceTimersByTimeAsync(0);
      expect(revoke).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not invent a checksum for legacy files", async () => {
    const metadata = Object.freeze({ size: 4 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(4))),
    );
    const service = createProjectAssetService({
      fileAdapter: { getFileContent: async () => ({ url: "asset://legacy" }) },
      resolveFileMetadata: () => metadata,
    });
    await expect(service.checkFileIntegrity("legacy")).resolves.toEqual({
      verified: false,
    });
    expect(metadata).not.toHaveProperty("sha256");
  });
});
