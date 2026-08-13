import { describe, expect, it, vi } from "vitest";
import {
  createImportPackageClient,
  resolveImportUrl,
} from "../../src/deps/clients/importPackageClient.js";

describe("importPackageClient", () => {
  it("requires HTTPS except for localhost test servers", () => {
    expect(
      resolveImportUrl("https://assets.example/asset-package.json").href,
    ).toBe("https://assets.example/asset-package.json");
    expect(
      resolveImportUrl("http://localhost:4179/asset-package.json").href,
    ).toBe("http://localhost:4179/asset-package.json");
    expect(() =>
      resolveImportUrl("http://assets.example/asset-package.json"),
    ).toThrow("must use HTTPS");
  });

  it("reads a bounded JSON manifest", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('{"schema":"routevn.import-pack.v1"}', {
          headers: { "content-type": "application/json" },
        }),
    );
    const client = createImportPackageClient({ fetchImpl });
    const result = await client.fetchManifest({
      url: "https://assets.example/asset-package.json",
    });
    expect(result.manifest.schema).toBe("routevn.import-pack.v1");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it("rejects manifest responses over the byte limit", async () => {
    const client = createImportPackageClient({
      fetchImpl: async () =>
        new Response("12345", {
          headers: {
            "content-length": "5",
            "content-type": "application/json",
          },
        }),
      limits: { manifestBytes: 4 },
    });
    await expect(
      client.fetchManifest({
        url: "https://assets.example/asset-package.json",
      }),
    ).rejects.toMatchObject({ code: "manifest_too_large" });
  });

  it("resolves relative files and verifies SHA-256", async () => {
    const bytes = new TextEncoder().encode("verified");
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const fetchImpl = vi.fn(
      async () =>
        new Response(bytes, { headers: { "content-type": "image/png" } }),
    );
    const client = createImportPackageClient({ fetchImpl });
    const result = await client.downloadFile({
      manifestUrl: "https://assets.example/packs/asset-package.json",
      descriptor: {
        mimeType: "image/png",
        sha256,
        source: { url: "../files/image.png" },
      },
    });
    expect(result.byteLength).toBe(bytes.byteLength);
    expect(fetchImpl.mock.calls[0][0].href).toBe(
      "https://assets.example/files/image.png",
    );
  });

  it("returns a stable integrity error", async () => {
    const client = createImportPackageClient({
      fetchImpl: async () =>
        new Response("changed", {
          headers: { "content-type": "image/png" },
        }),
    });
    await expect(
      client.downloadFile({
        manifestUrl: "https://assets.example/asset-package.json",
        descriptor: {
          mimeType: "image/png",
          sha256: "0".repeat(64),
          source: { url: "image.png" },
        },
      }),
    ).rejects.toMatchObject({ code: "integrity_mismatch" });
  });

  it("times out a manifest request", async () => {
    const client = createImportPackageClient({
      fetchImpl: (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
      limits: { manifestTimeoutMs: 5 },
    });
    await expect(
      client.fetchManifest({
        url: "https://assets.example/asset-package.json",
      }),
    ).rejects.toMatchObject({ code: "manifest_timeout", retryable: true });
  });
});
