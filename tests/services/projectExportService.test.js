import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLE_FORMAT_VERSION_V4,
  BUNDLE_HEADER_SIZE,
  createBundleResult,
  createProjectExportService,
  normalizeExportFileEntries,
  parseBundle,
} from "../../src/deps/services/shared/projectExportService.js";

const originalFetch = globalThis.fetch;

describe("projectExportService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("delegates promptDistributionZipPath through the stable file-adapter contract", async () => {
    const promptDistributionZipPath = vi.fn(async () => undefined);
    const service = createProjectExportService({
      fileAdapter: {
        downloadBundle: vi.fn(),
        createDistributionZip: vi.fn(),
        createDistributionZipStreamed: vi.fn(),
        promptDistributionZipPath,
        createDistributionZipStreamedToPath: vi.fn(),
      },
      filePicker: {
        saveFilePicker: vi.fn(),
      },
      getCurrentReference: vi.fn(),
      getFileContent: vi.fn(),
    });

    await expect(
      service.promptDistributionZipPath("project-one"),
    ).resolves.toBeUndefined();
    expect(promptDistributionZipPath).toHaveBeenCalledWith({
      zipName: "project-one",
      options: {},
      filePicker: {
        saveFilePicker: expect.any(Function),
      },
    });
  });

  it("delegates createDistributionZipStreamedToPath through the stable file-adapter contract", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
    }));
    const createDistributionZipStreamedToPath = vi.fn(
      async ({ outputPath }) => outputPath,
    );
    const getCurrentReference = vi.fn(() => ({
      projectPath: "/tmp/project-1",
    }));
    const getFileContent = vi.fn();
    const service = createProjectExportService({
      fileAdapter: {
        downloadBundle: vi.fn(),
        createDistributionZip: vi.fn(),
        createDistributionZipStreamed: vi.fn(),
        promptDistributionZipPath: vi.fn(),
        createDistributionZipStreamedToPath,
      },
      filePicker: {
        saveFilePicker: vi.fn(),
      },
      getCurrentReference,
      getFileContent,
    });

    await expect(
      service.createDistributionZipStreamedToPath(
        { project: { namespace: "project-one" } },
        [{ fileId: "file-1", mimeType: "image/png" }],
        "/tmp/export.zip",
      ),
    ).resolves.toBe("/tmp/export.zip");
    expect(createDistributionZipStreamedToPath).toHaveBeenCalledWith({
      projectData: {
        project: {
          namespace: "project-one",
        },
      },
      fileEntries: [{ id: "file-1", mimeType: "image/png" }],
      outputPath: "/tmp/export.zip",
      staticFiles: {
        indexHtml: expect.any(String),
        mainJs: undefined,
      },
      getCurrentReference,
      getFileContent,
    });
  });

  it("normalizes export file entries into stable id/mime objects", () => {
    expect(
      normalizeExportFileEntries([
        { fileId: "file-2", mimeType: "image/png" },
        { id: "file-2" },
        { id: "file-3", mime: "font/ttf" },
        { fileId: "file-4" },
      ]),
    ).toEqual([
      { id: "file-2", mimeType: "image/png" },
      { id: "file-3", mimeType: "font/ttf" },
      { id: "file-4" },
    ]);
  });

  it("stores repeated raw assets once in bundle format v4", async () => {
    const repeatedBytes = Uint8Array.from(
      Array.from({ length: 160 * 1024 }, (_, index) => index % 251),
    );
    const { bundle } = await createBundleResult(
      {
        projectData: {
          story: {
            initialSceneId: "scene-1",
            scenes: {
              "scene-1": {
                initialSectionId: "section-1",
                sections: {
                  "section-1": {
                    lines: [],
                  },
                },
              },
            },
          },
        },
      },
      {
        "file-a": {
          buffer: repeatedBytes,
          mime: "application/octet-stream",
        },
        "file-b": {
          buffer: repeatedBytes,
          mime: "application/octet-stream",
        },
      },
    );

    const parsed = await parseBundle(bundle);

    expect(parsed.version).toBe(4);
    expect(parsed.manifest.assets["file-a"].chunks).toEqual(
      parsed.manifest.assets["file-b"].chunks,
    );
    expect(parsed.manifest.assets["file-a"].encoding).toBe("raw");
    expect(parsed.manifest.assets["file-a"].chunks).toHaveLength(1);
    const totalChunkReferences =
      Object.values(parsed.manifest.assets).reduce(
        (sum, asset) => sum + (asset?.chunks?.length ?? 0),
        0,
      ) + (parsed.manifest.instructions?.chunks?.length ?? 0);
    expect(Object.keys(parsed.manifest.chunks).length).toBeLessThan(
      totalChunkReferences,
    );
    expect(Array.from(parsed.assets["file-a"].buffer)).toEqual(
      Array.from(repeatedBytes),
    );
    expect(Array.from(parsed.assets["file-b"].buffer)).toEqual(
      Array.from(repeatedBytes),
    );
  });

  it("stores non-identical raw assets separately in bundle format v4", async () => {
    const baseBytes = Uint8Array.from(
      Array.from({ length: 96 * 1024 }, (_, index) => index % 251),
    );
    const variantBytes = Uint8Array.from(
      Array.from({ length: 96 * 1024 }, (_, index) => (index * 7) % 251),
    );

    const { bundle } = await createBundleResult(
      {
        projectData: {
          story: {
            initialSceneId: "scene-1",
            scenes: {
              "scene-1": {
                initialSectionId: "section-1",
                sections: {
                  "section-1": {
                    lines: [],
                  },
                },
              },
            },
          },
        },
      },
      {
        base: {
          buffer: baseBytes,
          mime: "application/octet-stream",
        },
        shifted: {
          buffer: variantBytes,
          mime: "application/octet-stream",
        },
      },
    );

    const parsed = await parseBundle(bundle);
    const baseChunks = parsed.manifest.assets.base.chunks;
    const shiftedChunks = parsed.manifest.assets.shifted.chunks;

    expect(baseChunks).toHaveLength(1);
    expect(shiftedChunks).toHaveLength(1);
    expect(baseChunks).not.toEqual(shiftedChunks);
    expect(Array.from(parsed.assets.base.buffer)).toEqual(
      Array.from(baseBytes),
    );
    expect(Array.from(parsed.assets.shifted.buffer)).toEqual(
      Array.from(variantBytes),
    );
  });

  it("parses bundle format v4 diced-image assets with atlas payloads", async () => {
    const textEncoder = new TextEncoder();
    const rawAssetChunk = Uint8Array.from([1, 2, 3]);
    const atlasChunk = Uint8Array.from([9, 8, 7, 6]);
    const instructionsChunk = textEncoder.encode(
      JSON.stringify({
        projectData: {
          story: {
            initialSceneId: "scene-1",
            scenes: {
              "scene-1": {
                initialSectionId: "section-1",
                sections: {
                  "section-1": {
                    lines: [],
                  },
                },
              },
            },
          },
        },
      }),
    );
    const manifest = {
      chunking: {
        algorithm: "none",
        mode: "whole-file-only",
      },
      imageOptimization: {
        algorithm: "sprite-dicing",
        eligibleMimeTypes: ["image/png", "image/jpeg", "image/webp"],
        grouping: "decoded-image-dimensions",
        unitSize: 64,
        padding: 0,
        trimTransparent: false,
        atlasSizeLimit: 2048,
        ppu: 1,
        pivot: { x: 0, y: 0 },
      },
      chunks: {
        "chunk-raw": {
          start: 0,
          length: rawAssetChunk.byteLength,
          sha256: "chunk-raw",
        },
        "chunk-atlas": {
          start: rawAssetChunk.byteLength,
          length: atlasChunk.byteLength,
          sha256: "chunk-atlas",
        },
        "chunk-instructions": {
          start: rawAssetChunk.byteLength + atlasChunk.byteLength,
          length: instructionsChunk.byteLength,
          sha256: "chunk-instructions",
        },
      },
      assets: {
        rawAsset: {
          encoding: "raw",
          mime: "application/octet-stream",
          size: rawAssetChunk.byteLength,
          chunks: ["chunk-raw"],
        },
        dicedAsset: {
          encoding: "diced-image",
          mime: "image/png",
          size: 16,
          width: 2,
          height: 2,
          atlasId: "atlas-1",
          vertices: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 2, y: 2 },
            { x: 0, y: 2 },
          ],
          uvs: [
            { u: 0, v: 0 },
            { u: 1, v: 0 },
            { u: 1, v: 1 },
            { u: 0, v: 1 },
          ],
          indices: [0, 1, 2, 0, 2, 3],
          rect: { x: 0, y: 0, width: 2, height: 2 },
          pivot: { x: 0, y: 0 },
        },
      },
      atlases: {
        "atlas-1": {
          mime: "image/png",
          size: atlasChunk.byteLength,
          chunks: ["chunk-atlas"],
        },
      },
      instructions: {
        mime: "application/json",
        size: instructionsChunk.byteLength,
        chunks: ["chunk-instructions"],
      },
    };
    const manifestBytes = textEncoder.encode(JSON.stringify(manifest));
    const bundle = new Uint8Array(
      BUNDLE_HEADER_SIZE +
        manifestBytes.byteLength +
        rawAssetChunk.byteLength +
        atlasChunk.byteLength +
        instructionsChunk.byteLength,
    );

    bundle[0] = BUNDLE_FORMAT_VERSION_V4;
    new DataView(bundle.buffer).setUint32(1, manifestBytes.byteLength, false);
    bundle.set(manifestBytes, BUNDLE_HEADER_SIZE);
    bundle.set(rawAssetChunk, BUNDLE_HEADER_SIZE + manifestBytes.byteLength);
    bundle.set(
      atlasChunk,
      BUNDLE_HEADER_SIZE + manifestBytes.byteLength + rawAssetChunk.byteLength,
    );
    bundle.set(
      instructionsChunk,
      BUNDLE_HEADER_SIZE +
        manifestBytes.byteLength +
        rawAssetChunk.byteLength +
        atlasChunk.byteLength,
    );

    const parsed = await parseBundle(bundle);

    expect(parsed.version).toBe(4);
    expect(Array.from(parsed.assets.rawAsset.buffer)).toEqual(
      Array.from(rawAssetChunk),
    );
    expect(parsed.assets.dicedAsset).toMatchObject({
      encoding: "diced-image",
      atlasId: "atlas-1",
      width: 2,
      height: 2,
      indices: [0, 1, 2, 0, 2, 3],
    });
    expect(Array.from(parsed.atlases["atlas-1"].buffer)).toEqual(
      Array.from(atlasChunk),
    );
    expect(parsed.instructions.projectData.story.initialSceneId).toBe(
      "scene-1",
    );
  });

});
