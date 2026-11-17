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

  it("still reads a package by its manifest URL, with files relative to it", async () => {
    const image = new TextEncoder().encode("image bytes");
    const manifest = { schema: "routevn.import-pack.v1" };
    const fetchImpl = vi.fn(async (url) =>
      url.pathname.endsWith(".json")
        ? new Response(JSON.stringify(manifest), {
            headers: { "content-type": "application/json" },
          })
        : new Response(image, { headers: { "content-type": "image/png" } }),
    );
    const source = createImportPackageClient({ fetchImpl }).openPackage({
      url: "https://assets.example/packs/asset-package.json",
    });

    const opened = await source.readManifest();
    expect(opened).toMatchObject({
      manifest,
      manifestUrl: "https://assets.example/packs/asset-package.json",
    });
    const file = await source.readFile({
      descriptor: { mimeType: "image/png", source: { url: "./files/image" } },
    });
    expect(file.bytes).toEqual(image);
    expect(fetchImpl.mock.calls[1][0].href).toBe(
      "https://assets.example/packs/files/image",
    );
  });
});

// A package with one image, as the app exports it: a stored ZIP.
const packageZip = async ({ imageBytes = 4000, comment } = {}) => {
  const image = new Uint8Array(imageBytes).map((_, index) => index % 251);
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
  const zip = new JSZip();
  zip.file("asset-package.json", JSON.stringify(manifest));
  zip.file("files/image", image);
  const bytes = await zip.generateAsync({ type: "uint8array", comment });
  return { bytes, image, manifest };
};

// A server for one file. With `ranges` it answers byte ranges, open-ended
// ones too, as most file servers do; without, it ignores them and sends the
// whole file. `headers` are sent with every response.
const fileServer = (bytes, { ranges = true, headers = {} } = {}) =>
  vi.fn(async (_url, init = {}) => {
    const match = /^bytes=(\d+)-(\d*)$/.exec(init.headers?.Range ?? "");
    if (!ranges || !match) {
      return new Response(bytes, { status: 200, headers });
    }
    const start = Number(match[1]);
    const end = match[2] === "" ? bytes.length - 1 : Number(match[2]);
    return new Response(bytes.slice(start, end + 1), {
      status: 206,
      headers: { ...headers, "content-length": `${end - start + 1}` },
    });
  });

const rangesOf = (fetchImpl) =>
  fetchImpl.mock.calls.map(([, init]) => init.headers.Range);

describe("importPackageClient: a package ZIP file on this device", () => {
  it("reads the manifest and files from a Blob without any request", async () => {
    const { bytes, image, manifest } = await packageZip();
    const fetchImpl = vi.fn();
    const file = new File([bytes], "Pack One.zip");
    const source = createImportPackageClient({ fetchImpl }).openPackage({
      zip: { file },
    });

    const opened = await source.readManifest();
    expect(opened.manifest).toEqual(manifest);
    expect(opened.manifestUrl).toBe("local-file:///Pack%20One.zip");
    const read = await source.readFile({
      descriptor: manifest.repository.files.items.image,
    });
    expect(read.bytes).toEqual(image);
    expect(read.contentType).toBe("image/png");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reads a ZIP larger than its end record search, and one with a comment", async () => {
    for (const options of [{ imageBytes: 200_000 }, { comment: "Pack One" }]) {
      const { bytes, image, manifest } = await packageZip(options);
      const source = createImportPackageClient({
        fetchImpl: vi.fn(),
      }).openPackage({ zip: { file: new Blob([bytes]) } });

      await source.readManifest();
      const read = await source.readFile({
        descriptor: manifest.repository.files.items.image,
      });
      expect(read.bytes).toEqual(image);
    }
  });

  it("keeps the size, hash and limit checks", async () => {
    const { bytes, manifest } = await packageZip();
    const descriptor = manifest.repository.files.items.image;
    const open = async (limits) => {
      const source = createImportPackageClient({
        fetchImpl: vi.fn(),
        limits,
      }).openPackage({ zip: { file: new Blob([bytes]) } });
      await source.readManifest();
      return source;
    };

    const source = await open();
    await expect(
      source.readFile({
        descriptor: { ...descriptor, sha256: "0".repeat(64) },
      }),
    ).rejects.toMatchObject({ code: "integrity_mismatch" });
    await expect(
      source.readFile({ descriptor: { ...descriptor, size: 3999 } }),
    ).rejects.toMatchObject({ code: "integrity_mismatch" });
    await expect(
      source.readFile({
        descriptor: { mimeType: "image/png", source: { url: "../secret" } },
      }),
    ).rejects.toMatchObject({ code: "file_not_found" });
    await expect(
      (await open({ fileBytes: 3999 })).readFile({ descriptor }),
    ).rejects.toMatchObject({ code: "file_too_large" });
    await expect(open({ manifestBytes: 10 })).rejects.toMatchObject({
      code: "manifest_too_large",
    });
    await expect(open({ directoryBytes: 10 })).rejects.toMatchObject({
      code: "manifest_too_large",
    });
  });

  it("refuses a file that is not a package ZIP", async () => {
    const client = createImportPackageClient({ fetchImpl: vi.fn() });
    const openFile = (parts) =>
      client.openPackage({ zip: { file: new Blob(parts) } }).readManifest();

    await expect(openFile(["not a zip file"])).rejects.toMatchObject({
      code: "package_invalid",
    });
    await expect(openFile([])).rejects.toMatchObject({
      code: "package_invalid",
    });
    const { bytes } = await packageZip();
    await expect(
      openFile([bytes.subarray(0, bytes.length - 40)]),
    ).rejects.toMatchObject({ code: "package_invalid" });

    const compressed = new JSZip();
    compressed.file("asset-package.json", "{}".repeat(500));
    await expect(
      openFile([
        await compressed.generateAsync({
          type: "uint8array",
          compression: "DEFLATE",
        }),
      ]),
    ).rejects.toMatchObject({
      code: "package_invalid",
      message: "The asset package has a compressed file.",
    });

    const other = new JSZip();
    other.file("readme.txt", "hello");
    await expect(
      openFile([await other.generateAsync({ type: "uint8array" })]),
    ).rejects.toMatchObject({ code: "manifest_not_found" });
  });

  it("refuses a file that can no longer be read, and stops when cancelled", async () => {
    const { bytes } = await packageZip();
    const client = createImportPackageClient({ fetchImpl: vi.fn() });
    const unreadable = {
      name: "pack.zip",
      size: bytes.length,
      slice: () => ({
        arrayBuffer: async () => {
          throw new Error("The file was moved.");
        },
      }),
    };
    await expect(
      client.openPackage({ zip: { file: unreadable } }).readManifest(),
    ).rejects.toMatchObject({ code: "package_invalid" });

    const controller = new AbortController();
    controller.abort();
    await expect(
      client
        .openPackage({ zip: { file: new Blob([bytes]) } })
        .readManifest({ signal: controller.signal }),
    ).rejects.toMatchObject({ code: "cancelled" });
  });
});

describe("importPackageClient: a package ZIP at a URL", () => {
  const url = "https://files.example/download?id=pack-one";

  it("reads a ZIP in place from a server with byte ranges, finding its size and directory", async () => {
    const { bytes, image, manifest } = await packageZip({
      imageBytes: 200_000,
    });
    const fetchImpl = fileServer(bytes);
    const source = createImportPackageClient({ fetchImpl }).openPackage({
      zip: { url },
    });

    const opened = await source.readManifest();
    expect(opened.manifest).toEqual(manifest);
    expect(opened.manifestUrl).toBe(url);
    const read = await source.readFile({
      descriptor: manifest.repository.files.items.image,
    });
    expect(read.bytes).toEqual(image);

    // The first request finds out what the link is and how long; the ZIP's
    // last bytes then give the end record and the directory in one range;
    // the manifest and the file are a range each.
    const ranges = rangesOf(fetchImpl);
    expect(ranges[0]).toBe("bytes=0-");
    expect(ranges[1]).toBe(`bytes=${bytes.length - 65557}-${bytes.length - 1}`);
    expect(ranges).toHaveLength(4);
    for (const range of ranges.slice(1)) {
      expect(range).toMatch(/^bytes=\d+-\d+$/);
    }
  });

  it("takes the size from Content-Range when the server shows it", async () => {
    const { bytes, manifest } = await packageZip();
    // A server that sends its ranges in parts: the first answer is shorter
    // than the ZIP, and only Content-Range tells its whole size.
    const fetchImpl = vi.fn(async (_url, init) => {
      const [, first, last] = /^bytes=(\d+)-(\d*)$/.exec(init.headers.Range);
      const start = Number(first);
      const end = last === "" ? Math.min(99, bytes.length - 1) : Number(last);
      return new Response(bytes.slice(start, end + 1), {
        status: 206,
        headers: {
          "content-length": `${end - start + 1}`,
          "content-range": `bytes ${start}-${end}/${bytes.length}`,
        },
      });
    });
    const source = createImportPackageClient({ fetchImpl }).openPackage({
      zip: { url },
    });

    expect((await source.readManifest()).manifest).toEqual(manifest);
  });

  it("downloads the ZIP once from a server without byte ranges and reads it from memory", async () => {
    const { bytes, image, manifest } = await packageZip({
      imageBytes: 200_000,
    });
    const fetchImpl = fileServer(bytes, { ranges: false });
    const source = createImportPackageClient({ fetchImpl }).openPackage({
      zip: { url },
    });

    const opened = await source.readManifest();
    expect(opened.manifest).toEqual(manifest);
    const read = await source.readFile({
      descriptor: manifest.repository.files.items.image,
    });
    expect(read.bytes).toEqual(image);
    await expect(
      source.readFile({
        descriptor: {
          ...manifest.repository.files.items.image,
          sha256: "0".repeat(64),
        },
      }),
    ).rejects.toMatchObject({ code: "integrity_mismatch" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("bounds a whole download by the total download limit", async () => {
    const { bytes } = await packageZip();
    const limits = { totalBytes: bytes.length - 1 };
    // Refused from its declared length, before the body is read.
    const declared = createImportPackageClient({
      fetchImpl: fileServer(bytes, {
        ranges: false,
        headers: { "content-length": `${bytes.length}` },
      }),
      limits,
    });
    await expect(
      declared.openPackage({ zip: { url } }).readManifest(),
    ).rejects.toMatchObject({ code: "download_too_large" });
    // Refused while it downloads, when the server does not say how long.
    const undeclared = createImportPackageClient({
      fetchImpl: fileServer(bytes, { ranges: false }),
      limits,
    });
    await expect(
      undeclared.openPackage({ zip: { url } }).readManifest(),
    ).rejects.toMatchObject({ code: "download_too_large" });

    const fits = createImportPackageClient({
      fetchImpl: fileServer(bytes, { ranges: false }),
      limits: { totalBytes: bytes.length },
    });
    await expect(
      fits.openPackage({ zip: { url } }).readManifest(),
    ).resolves.toMatchObject({ manifestUrl: url });
  });

  it("refuses what is not a ZIP, and a link that is not HTTPS", async () => {
    const page = new TextEncoder().encode("<!doctype html><title>Sign in");
    const client = createImportPackageClient({
      fetchImpl: fileServer(page, { headers: { "content-type": "text/html" } }),
    });
    await expect(
      client.openPackage({ zip: { url } }).readManifest(),
    ).rejects.toMatchObject({ code: "package_invalid" });
    expect(() =>
      client.openPackage({ zip: { url: "http://files.example/pack.zip" } }),
    ).toThrow("must use HTTPS");
    expect(() => client.openPackage({ zip: { url: "pack.zip" } })).toThrow(
      "valid import URL",
    );
  });

  it("reports a missing package and a server that needs a sign-in", async () => {
    const respond = (status) =>
      createImportPackageClient({
        fetchImpl: async () => new Response("", { status }),
      })
        .openPackage({ zip: { url } })
        .readManifest();

    await expect(respond(404)).rejects.toMatchObject({
      code: "manifest_not_found",
    });
    await expect(respond(403)).rejects.toMatchObject({
      code: "authorization_required",
    });
  });
});

describe("importPackageClient: a link to a ZIP or a manifest", () => {
  it("reads a ZIP whatever the link's path and content type say", async () => {
    const { bytes, manifest } = await packageZip();
    for (const ranges of [true, false]) {
      const fetchImpl = fileServer(bytes, {
        ranges,
        headers: { "content-type": "application/octet-stream" },
      });
      const source = createImportPackageClient({ fetchImpl }).openPackage({
        link: "https://files.example/packs/asset-package.json",
      });

      expect((await source.readManifest()).manifest).toEqual(manifest);
      await expect(
        source.readFile({ descriptor: manifest.repository.files.items.image }),
      ).resolves.toMatchObject({ byteLength: 4000 });
    }
  });

  it("reads a manifest, with its files relative to it", async () => {
    const image = new TextEncoder().encode("image bytes");
    const manifest = { schema: "routevn.import-pack.v1" };
    const fetchImpl = vi.fn(async (requestUrl) =>
      requestUrl.pathname === "/packs/one"
        ? new Response(JSON.stringify(manifest), {
            headers: { "content-type": "application/json" },
          })
        : new Response(image, { headers: { "content-type": "image/png" } }),
    );
    const source = createImportPackageClient({ fetchImpl }).openPackage({
      link: "https://assets.example/packs/one",
    });

    const opened = await source.readManifest();
    expect(opened).toMatchObject({
      manifest,
      manifestUrl: "https://assets.example/packs/one",
    });
    const file = await source.readFile({
      descriptor: { mimeType: "image/png", source: { url: "./files/image" } },
    });
    expect(file.bytes).toEqual(image);
    expect(fetchImpl.mock.calls.at(-1)[0].href).toBe(
      "https://assets.example/packs/files/image",
    );
  });

  it("says a link is neither when it returns a page or other text", async () => {
    const open = (body, contentType) =>
      createImportPackageClient({
        fetchImpl: async () =>
          new Response(body, { headers: { "content-type": contentType } }),
      })
        .openPackage({ link: "https://drive.example/file/d/abc/view" })
        .readManifest();

    await expect(
      open("<!doctype html><title>Sign in", "text/html"),
    ).rejects.toMatchObject({ code: "package_link_unsupported" });
    await expect(open("not json", "application/json")).rejects.toMatchObject({
      code: "package_link_unsupported",
    });
  });

  it("refuses a link that is not HTTPS before any request", () => {
    const fetchImpl = vi.fn();
    const client = createImportPackageClient({ fetchImpl });
    expect(() =>
      client.openPackage({ link: "http://assets.example/pack.zip" }),
    ).toThrow("must use HTTPS");
    expect(() => client.openPackage({ link: "" })).toThrow("valid import URL");
    expect(
      client.openPackage({ link: "http://localhost:4179/pack.zip" }),
    ).toBeDefined();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("cannot read a file before the link has been opened", () => {
    const source = createImportPackageClient({
      fetchImpl: vi.fn(),
    }).openPackage({ link: "https://assets.example/pack.zip" });
    expect(() => source.readFile({ descriptor: {} })).toThrow(
      "could not be read",
    );
  });

  it("times out a link that never answers, and one whose download stalls", async () => {
    const stalled = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          "abort",
          () => reject(new DOMException("Aborted", "AbortError")),
          { once: true },
        );
      });
    await expect(
      createImportPackageClient({
        fetchImpl: stalled,
        limits: { manifestTimeoutMs: 5 },
      })
        .openPackage({ link: "https://assets.example/pack.zip" })
        .readManifest(),
    ).rejects.toMatchObject({ code: "manifest_timeout", retryable: true });

    // The ZIP starts, then nothing more arrives.
    const { bytes } = await packageZip();
    const halfSent = async (_url, { signal }) =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.subarray(0, 100));
            signal.addEventListener("abort", () =>
              controller.error(new DOMException("Aborted", "AbortError")),
            );
          },
        }),
        { status: 200 },
      );
    await expect(
      createImportPackageClient({
        fetchImpl: halfSent,
        limits: { packageTimeoutMs: 5 },
      })
        .openPackage({ link: "https://assets.example/pack.zip" })
        .readManifest(),
    ).rejects.toMatchObject({ code: "manifest_timeout", retryable: true });
  });
});
