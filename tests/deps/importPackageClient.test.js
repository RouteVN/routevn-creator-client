import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import {
  createImportPackageClient,
  resolveImportUrl,
} from "../../src/deps/clients/importPackageClient.js";

const sha256Of = async (bytes) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");

// A published package as the store serves it: a stored ZIP, its size and
// where its central directory is.
const publishedPackage = async (files) => {
  const zip = new JSZip();
  for (const [name, data] of Object.entries(files)) zip.file(name, data);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const end = bytes.length - 22;
  const view = new DataView(bytes.buffer, bytes.byteOffset + end);
  return {
    bytes,
    zip: {
      url: "https://files.example/asset-store/PackageFile00001",
      size: bytes.length,
      directorySize: view.getUint32(12, true),
      directoryOffset: view.getUint32(16, true),
    },
  };
};

// A files server that answers only explicit byte ranges, like the CDN.
const rangeServer = (bytes) =>
  vi.fn(async (_url, { headers }) => {
    const match = /^bytes=(\d+)-(\d+)$/.exec(headers?.Range ?? "");
    if (!match) return new Response(bytes, { status: 200 });
    const [start, end] = [Number(match[1]), Number(match[2])];
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { "content-length": `${end - start + 1}` },
    });
  });

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

  it("reads a published package's manifest and files from its ZIP with explicit ranges", async () => {
    const image = new TextEncoder().encode("image bytes");
    const manifest = {
      schema: "routevn.import-pack.v1",
      repository: {
        files: {
          items: {
            image: {
              mimeType: "image/png",
              size: image.byteLength,
              sha256: await sha256Of(image),
              source: { url: "./files/image" },
            },
          },
        },
      },
    };
    const { bytes, zip } = await publishedPackage({
      "asset-package.json": JSON.stringify(manifest),
      "files/image": image,
    });
    const fetchImpl = rangeServer(bytes);
    const source = createImportPackageClient({ fetchImpl }).openPackage({
      zip,
    });

    const opened = await source.readManifest();
    expect(opened.manifest).toEqual(manifest);
    const file = await source.readFile({
      descriptor: manifest.repository.files.items.image,
    });
    expect(file.bytes).toEqual(image);
    expect(file.contentType).toBe("image/png");

    // The directory, the manifest, then the file: each an explicit range,
    // with nothing that would need a CORS preflight.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url.href).toBe(zip.url);
      expect(Object.keys(init.headers)).toEqual(["Range"]);
      expect(init.headers.Range).toMatch(/^bytes=\d+-\d+$/);
      expect(init.cache).toBe("default");
    }
    expect(fetchImpl.mock.calls[0][1].headers.Range).toBe(
      `bytes=${zip.directoryOffset}-${zip.directoryOffset + zip.directorySize - 1}`,
    );
  });

  it("refuses a package file outside the package or with a changed hash", async () => {
    const { bytes, zip } = await publishedPackage({
      "asset-package.json": "{}",
      "files/image": "image bytes",
    });
    const source = createImportPackageClient({
      fetchImpl: rangeServer(bytes),
    }).openPackage({ zip });
    await source.readManifest();
    await expect(
      source.readFile({
        descriptor: { mimeType: "image/png", source: { url: "../secret" } },
      }),
    ).rejects.toMatchObject({ code: "file_not_found" });
    await expect(
      source.readFile({
        descriptor: {
          mimeType: "image/png",
          sha256: "0".repeat(64),
          source: { url: "./files/image" },
        },
      }),
    ).rejects.toMatchObject({ code: "integrity_mismatch" });
  });

  it("refuses a files server that ignores byte ranges", async () => {
    const { bytes, zip } = await publishedPackage({
      "asset-package.json": "{}",
    });
    const source = createImportPackageClient({
      fetchImpl: async () => new Response(bytes, { status: 200 }),
    }).openPackage({ zip });
    await expect(source.readManifest()).rejects.toMatchObject({
      code: "range_unsupported",
    });
  });

  it("refuses a package location that doesn't fit the package", () => {
    const client = createImportPackageClient({ fetchImpl: vi.fn() });
    expect(() =>
      client.openPackage({
        zip: {
          url: "https://files.example/p",
          size: 100,
          directoryOffset: 90,
          directorySize: 20,
        },
      }),
    ).toThrow("could not be read");
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
