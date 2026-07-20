import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLE_FORMAT_VERSION_V4,
  BUNDLE_HEADER_SIZE,
  BUNDLE_PLAYER_INDEX_HTML,
  BUNDLE_WEB_ICON_192_FILE_NAME,
  BUNDLE_WEB_ICON_512_FILE_NAME,
  BUNDLE_WEB_ICON_FILES,
  createBundleInstructions,
  createBundlePlayerIndexHtml,
  createBundleResult,
  createBundleWebManifest,
  createProjectExportService,
  normalizeExportFileEntries,
  parseBundle,
} from "../../src/deps/services/shared/projectExportService.js";

const originalFetch = globalThis.fetch;
const readRepositoryFile = (relativeUrl) =>
  readFileSync(fileURLToPath(new URL(relativeUrl, import.meta.url)), "utf8");
const webPlayerIndexHtml = readRepositoryFile("../../static/bundle/index.html");
const macosPlayerIndexHtml = readRepositoryFile(
  "../../scripts/player-templates/macos/index.html",
);
const windowsPlayerIndexHtml = readRepositoryFile(
  "../../scripts/player-templates/windows/index.html",
);
const macosPlayerBuildScript = readRepositoryFile(
  "../../scripts/build-macos-player-template.js",
);
const windowsPlayerBuildScript = readRepositoryFile(
  "../../scripts/build-windows-player-template.js",
);

describe("projectExportService", () => {
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("loads persistence in native players and custom chrome only on Windows", () => {
    expect(BUNDLE_PLAYER_INDEX_HTML).not.toContain("windowChrome.js");
    expect(BUNDLE_PLAYER_INDEX_HTML).not.toContain(
      "player-runtime-persistence-host.js",
    );
    expect(macosPlayerIndexHtml).not.toContain("windowChrome.js");
    expect(macosPlayerIndexHtml).toContain(
      '<script src="./player-runtime-persistence-host.js"></script>',
    );
    expect(
      macosPlayerIndexHtml.indexOf("player-runtime-persistence-host.js"),
    ).toBeLessThan(macosPlayerIndexHtml.indexOf("./main.js"));
    expect(windowsPlayerIndexHtml).toContain(
      '<script src="./windowChrome.js" defer></script>',
    );
    expect(windowsPlayerIndexHtml).toContain(
      '<script src="./player-runtime-persistence-host.js"></script>',
    );
    expect(windowsPlayerIndexHtml.indexOf("windowChrome.js")).toBeLessThan(
      windowsPlayerIndexHtml.indexOf("player-runtime-persistence-host.js"),
    );
    expect(
      windowsPlayerIndexHtml.indexOf("player-runtime-persistence-host.js"),
    ).toBeLessThan(windowsPlayerIndexHtml.indexOf("./main.js"));
    expect(
      windowsPlayerIndexHtml.replace(
        '  <script src="./windowChrome.js" defer></script>\n',
        "",
      ),
    ).toBe(macosPlayerIndexHtml);
  });

  it("stages dedicated desktop index documents instead of deriving the web document", () => {
    expect(macosPlayerBuildScript).toContain(
      '"scripts/player-templates/macos/index.html"',
    );
    expect(windowsPlayerBuildScript).toContain(
      '"scripts/player-templates/windows/index.html"',
    );
    expect(macosPlayerBuildScript).not.toContain("BUNDLE_PLAYER_INDEX_HTML");
    expect(windowsPlayerBuildScript).not.toContain("BUNDLE_PLAYER_INDEX_HTML");
  });

  it("keeps the loading and click-to-start surface only in the web player HTML", () => {
    for (const html of [BUNDLE_PLAYER_INDEX_HTML, webPlayerIndexHtml]) {
      expect(html).toContain('<body data-player-start="click">');
      expect(html).toContain('<div id="loading">Loading...</div>');
      expect(html).toContain("#loading.ready");
    }

    for (const html of [macosPlayerIndexHtml, windowsPlayerIndexHtml]) {
      expect(html).toContain('<body data-player-start="automatic">');
      expect(html).toContain('<div id="loading"></div>');
      expect(html).not.toContain('<div id="loading">Loading...</div>');
      expect(html).not.toContain("#loading.ready");
    }
  });

  it("sizes the player canvas within custom window chrome", () => {
    expect(BUNDLE_PLAYER_INDEX_HTML).toContain(
      "var(--rvn-app-viewport-height, 100vh)",
    );
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
        {
          bundleMetadata: {
            project: {
              namespace: "project-one",
              iconFileId: "icon-1",
            },
          },
        },
        [{ fileId: "file-1", mimeType: "image/png" }],
        "/tmp/export.zip",
      ),
    ).resolves.toBe("/tmp/export.zip");
    expect(createDistributionZipStreamedToPath).toHaveBeenCalledWith({
      projectData: {
        bundleMetadata: {
          project: {
            namespace: "project-one",
            iconFileId: "icon-1",
          },
        },
      },
      fileEntries: [{ id: "file-1", mimeType: "image/png" }],
      outputPath: "/tmp/export.zip",
      staticFiles: {
        indexHtml: expect.any(String),
        manifestJson: expect.any(String),
        mainJs: undefined,
        webIconFileId: "icon-1",
        webIconFiles: BUNDLE_WEB_ICON_FILES,
      },
      getCurrentReference,
      getFileContent,
    });
  });

  it("delegates macOS application exports through the stable file-adapter contract", async () => {
    const promptMacosApplicationPath = vi.fn(async () => "/tmp/Game.app.zip");
    const getMacosExportAvailability = vi.fn(async () => ({
      application: true,
      templateAvailable: true,
      hostSupported: true,
    }));
    const createMacosApplicationToPath = vi.fn(async ({ outputPath }) => ({
      outputPath,
    }));
    const getCurrentReference = vi.fn(() => ({
      projectPath: "/tmp/project-1",
    }));
    const service = createProjectExportService({
      fileAdapter: {
        promptMacosApplicationPath,
        getMacosExportAvailability,
        createMacosApplicationToPath,
      },
      filePicker: {
        saveFilePicker: vi.fn(),
      },
      getCurrentReference,
      getFileContent: vi.fn(),
    });

    await expect(service.promptMacosApplicationPath("Game")).resolves.toBe(
      "/tmp/Game.app.zip",
    );
    await expect(service.getMacosExportAvailability()).resolves.toMatchObject({
      application: true,
    });
    await expect(
      service.createMacosApplicationToPath(
        { projectData: {} },
        [{ fileId: "image-1", mimeType: "image/png" }],
        "/tmp/Game.app.zip",
        {
          title: "Game",
          shortVersion: "1.0.3",
          bundleVersion: "4",
          applicationIdentifier: "vn.routevn.player.game",
          publisher: "Studio One",
          description: "A visual novel",
          copyright: "Copyright © 2026 Studio One",
          category: "public.app-category.games",
          iconFileId: "icon-1",
        },
      ),
    ).resolves.toEqual({ outputPath: "/tmp/Game.app.zip" });
    expect(createMacosApplicationToPath).toHaveBeenCalledWith({
      projectData: { projectData: {} },
      fileEntries: [{ id: "image-1", mimeType: "image/png" }],
      outputPath: "/tmp/Game.app.zip",
      title: "Game",
      shortVersion: "1.0.3",
      bundleVersion: "4",
      applicationIdentifier: "vn.routevn.player.game",
      publisher: "Studio One",
      description: "A visual novel",
      copyright: "Copyright © 2026 Studio One",
      category: "public.app-category.games",
      iconFileId: "icon-1",
      options: {},
      getCurrentReference,
    });
  });

  it("delegates all Windows release metadata through the stable file-adapter contract", async () => {
    const createWindowsPortableExecutableToPath = vi.fn(async () => ({
      outputPath: "/tmp/Game.exe",
    }));
    const createWindowsInstallerToPath = vi.fn(async () => ({
      outputPath: "/tmp/Game Setup.exe",
    }));
    const getCurrentReference = vi.fn(() => ({
      projectPath: "/tmp/project-1",
    }));
    const service = createProjectExportService({
      fileAdapter: {
        createWindowsPortableExecutableToPath,
        createWindowsInstallerToPath,
      },
      filePicker: {
        saveFilePicker: vi.fn(),
      },
      getCurrentReference,
      getFileContent: vi.fn(),
    });
    const metadata = {
      title: "Game",
      version: "1.0.0.4",
      applicationIdentifier: "vn.routevn.player.game",
      publisher: "Studio One",
      description: "A visual novel",
      copyright: "Copyright © 2026 Studio One",
      iconFileId: "icon-1",
    };

    await service.createWindowsPortableExecutableToPath(
      { projectData: {} },
      [{ fileId: "image-1", mimeType: "image/png" }],
      "/tmp/Game.exe",
      metadata,
    );
    await service.createWindowsInstallerToPath(
      { projectData: {} },
      [{ fileId: "image-1", mimeType: "image/png" }],
      "/tmp/Game Setup.exe",
      metadata,
    );

    const expectedPayload = {
      projectData: { projectData: {} },
      fileEntries: [{ id: "image-1", mimeType: "image/png" }],
      outputPath: expect.any(String),
      ...metadata,
      options: {},
      getCurrentReference,
    };
    expect(createWindowsPortableExecutableToPath).toHaveBeenCalledWith(
      expectedPayload,
    );
    expect(createWindowsInstallerToPath).toHaveBeenCalledWith(expectedPayload);
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

  it("stores project title and icon metadata in bundle instructions", () => {
    expect(
      createBundleInstructions({
        projectData: {},
        project: {
          namespace: "project-one",
          title: "Project One",
          iconFileId: "icon-1",
        },
      }).bundleMetadata.project,
    ).toEqual({
      namespace: "project-one",
      title: "Project One",
      iconFileId: "icon-1",
    });
  });

  it("stores Web release metadata and renders it into Web export files", () => {
    const project = {
      namespace: "project-one",
      title: "Project One",
      iconFileId: "icon-1",
      web: {
        themeColor: "#112233",
        backgroundColor: "#000000",
      },
    };
    const instructions = createBundleInstructions({ projectData: {}, project });

    expect(instructions.bundleMetadata.project.web).toEqual(project.web);

    const indexHtml = createBundlePlayerIndexHtml({
      title: project.title,
      ...project.web,
      iconFileName512: BUNDLE_WEB_ICON_512_FILE_NAME,
    });
    expect(indexHtml).toContain("<title>Project One</title>");
    expect(indexHtml).toContain(
      '<meta name="application-name" content="Project One" />',
    );
    expect(indexHtml).not.toContain('<meta name="description"');
    expect(indexHtml).toContain(
      '<meta name="theme-color" content="#112233" />',
    );
    expect(indexHtml).toContain("background: #000000;");
    expect(indexHtml).toContain(
      `<link rel="icon" href="./${BUNDLE_WEB_ICON_512_FILE_NAME}" />`,
    );

    const manifest = JSON.parse(
      createBundleWebManifest({
        title: project.title,
        ...project.web,
        iconFileName192: BUNDLE_WEB_ICON_192_FILE_NAME,
        iconFileName512: BUNDLE_WEB_ICON_512_FILE_NAME,
      }),
    );
    expect(manifest).toMatchObject({
      name: "Project One",
      short_name: "Project One",
      theme_color: "#112233",
      background_color: "#000000",
      icons: [
        {
          src: `./${BUNDLE_WEB_ICON_192_FILE_NAME}`,
          sizes: "192x192",
          type: "image/png",
          purpose: "any",
        },
        {
          src: `./${BUNDLE_WEB_ICON_512_FILE_NAME}`,
          sizes: "512x512",
          type: "image/png",
          purpose: "any",
        },
      ],
    });
    expect(manifest).not.toHaveProperty("description");
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
