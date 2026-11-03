import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { createAssetPackageExportService } from "../../src/deps/services/shared/assetPackageExportService.js";
import { createRendererStartError } from "../../src/internal/rendererStartError.js";

const createManifest = () => ({
  schema: "routevn.import-pack.v1",
  package: {
    id: "placeholder.asset-package",
    name: "Placeholder Asset Package",
    version: "1.0.0",
    description: "Placeholder asset package description.",
  },
  repository: {
    files: {
      items: {
        "file image": {
          id: "file image",
          mimeType: "image/png",
          source: { url: "./files/file%20image" },
        },
        "file-sound": {
          id: "file-sound",
          mimeType: "audio/mpeg",
          source: { url: "./files/file-sound" },
        },
      },
    },
  },
});

describe("asset package export service", () => {
  it("creates a ZIP containing asset-package.json and the referenced file bytes", async () => {
    const revokeByFileId = new Map();
    const getFileContent = vi.fn(async (fileId) => {
      const revoke = vi.fn();
      revokeByFileId.set(fileId, revoke);
      return { url: `project-file://${fileId}`, revoke };
    });
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode(`bytes:${url}`).buffer,
    }));
    const service = createAssetPackageExportService({
      getFileContent,
      fetchImpl,
    });
    const manifest = createManifest();

    const bundle = await service.createAssetPackageBundle({ manifest });

    expect(bundle.type).toBe("application/zip");
    const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual([
      "asset-package.json",
      "files/",
      "files/file%20image",
      "files/file-sound",
    ]);
    expect(
      JSON.parse(await zip.file("asset-package.json").async("string")),
    ).toEqual(manifest);
    expect(await zip.file("files/file%20image").async("string")).toBe(
      "bytes:project-file://file image",
    );
    expect(await zip.file("files/file-sound").async("string")).toBe(
      "bytes:project-file://file-sound",
    );
    expect(getFileContent).toHaveBeenCalledTimes(2);
    expect(revokeByFileId.get("file image")).toHaveBeenCalledOnce();
    expect(revokeByFileId.get("file-sound")).toHaveBeenCalledOnce();
  });

  it("releases file content when a file cannot be read", async () => {
    const revoke = vi.fn();
    const service = createAssetPackageExportService({
      getFileContent: vi.fn(async () => ({
        url: "project-file://missing",
        revoke,
      })),
      fetchImpl: vi.fn(async () => ({ ok: false })),
    });

    await expect(
      service.createAssetPackageBundle({ manifest: createManifest() }),
    ).rejects.toThrow("Could not read asset package file 'file image'.");
    expect(revoke).toHaveBeenCalledOnce();
  });

  it("adds export-only waveform PNG previews for sounds", async () => {
    const manifest = createManifest();
    manifest.repository.files.items["file-waveform"] = {
      id: "file-waveform",
      mimeType: "application/json",
      source: { url: "./files/file-waveform" },
    };
    manifest.repository.sounds = {
      items: {
        "sound.theme": {
          id: "sound.theme",
          type: "sound",
          name: "Theme",
          fileId: "file-sound",
          waveformDataFileId: "file-waveform",
        },
      },
      tree: [{ id: "sound.theme" }],
    };
    const sourceManifest = structuredClone(manifest);
    const waveformData = { amplitudes: [0, 64, 255], duration: 1.5 };
    const renderWaveformThumbnail = vi.fn(
      async () => new Blob(["waveform-png"], { type: "image/png" }),
    );
    const getFileContent = vi.fn(async (fileId) => ({
      url: `project-file://${fileId}`,
      revoke: vi.fn(),
    }));
    const fetchImpl = vi.fn(async (url) => {
      const fileId = url.replace("project-file://", "");
      const bytes =
        fileId === "file-waveform"
          ? new TextEncoder().encode(JSON.stringify(waveformData))
          : new TextEncoder().encode(`bytes:${fileId}`);
      return {
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      };
    });
    const service = createAssetPackageExportService({
      getFileContent,
      fetchImpl,
      renderWaveformThumbnail,
    });

    const bundle = await service.createAssetPackageBundle({ manifest });

    expect(manifest).toEqual(sourceManifest);
    expect(renderWaveformThumbnail).toHaveBeenCalledWith({ waveformData });
    const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
    const exportedManifest = JSON.parse(
      await zip.file("asset-package.json").async("string"),
    );
    const previewFileId = "waveform-preview.sound.theme.png";
    expect(
      exportedManifest.repository.sounds.items["sound.theme"]
        .previewMediaFileId,
    ).toBe(previewFileId);
    expect(exportedManifest.repository.files.items[previewFileId]).toEqual({
      id: previewFileId,
      type: "image",
      name: "Theme preview.png",
      mimeType: "image/png",
      size: 12,
      source: { url: `./files/${previewFileId}` },
    });
    expect(await zip.file(`files/${previewFileId}`).async("string")).toBe(
      "waveform-png",
    );
    expect(getFileContent).not.toHaveBeenCalledWith(previewFileId);
  });

  it("fails the whole export with preview-stage context", async () => {
    const manifest = createManifest();
    manifest.repository.files.items["file-waveform"] = {
      id: "file-waveform",
      mimeType: "application/json",
      source: { url: "./files/file-waveform" },
    };
    manifest.repository.sounds = {
      items: {
        "sound.theme": {
          id: "sound.theme",
          type: "sound",
          name: "Theme",
          fileId: "file-sound",
          waveformDataFileId: "file-waveform",
        },
      },
      tree: [{ id: "sound.theme" }],
    };
    const service = createAssetPackageExportService({
      getFileContent: vi.fn(async (fileId) => ({
        url: `project-file://${fileId}`,
        revoke: vi.fn(),
      })),
      fetchImpl: vi.fn(async (url) => ({
        ok: true,
        arrayBuffer: async () =>
          new TextEncoder().encode(
            url.endsWith("file-waveform")
              ? JSON.stringify({ amplitudes: [0, 255] })
              : url,
          ).buffer,
      })),
      renderWaveformThumbnail: vi.fn(async () => {
        throw new Error("Canvas encoding failed");
      }),
    });

    await expect(
      service.createAssetPackageBundle({ manifest }),
    ).rejects.toThrow(
      "Failed to generate sound waveform previews: Canvas encoding failed",
    );
  });

  it("generates previews for a v2 package's dependencies too", async () => {
    // A text style the author picked, using a font that comes as a dependency.
    const manifest = createManifest();
    manifest.schema = "routevn.import-pack.v2";
    manifest.repository.files.items["file-font"] = {
      id: "file-font",
      mimeType: "font/woff2",
      source: { url: "./files/file-font" },
    };
    manifest.repository.textStyles = {
      items: {
        "text-style.title": {
          id: "text-style.title",
          type: "textStyle",
          name: "Title",
          fontId: ["font.serif"],
          fontSize: 48,
          lineHeight: 1.2,
          fontWeight: "700",
        },
      },
      tree: [{ id: "text-style.title" }],
    };
    manifest.dependencies = {
      fonts: {
        items: {
          "font.serif": {
            id: "font.serif",
            type: "font",
            name: "Serif",
            fileId: "file-font",
            fontFamily: "Serif",
          },
        },
      },
    };
    const sourceRepository = {
      ...structuredClone(manifest.repository),
      fonts: structuredClone(manifest.dependencies.fonts),
    };
    const renderFontPreview = vi.fn(async () => ({
      previewBlob: new Blob(["font-image"], { type: "image/png" }),
      thumbnailBlob: new Blob(["font-thumbnail"], { type: "image/png" }),
    }));
    const renderTextStylePreview = vi.fn(async () => ({
      previewBlob: new Blob(["text-style-image"], { type: "image/png" }),
      thumbnailBlob: new Blob(["text-style-thumbnail"], { type: "image/png" }),
    }));
    const service = createAssetPackageExportService({
      getFileContent: vi.fn(async (fileId) => ({
        url: `project-file://${fileId}`,
        revoke: vi.fn(),
      })),
      getRepositoryState: () => sourceRepository,
      fetchImpl: vi.fn(async (url) => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
      })),
      renderFontPreview,
      renderTextStylePreview,
    });

    const bundle = await service.createAssetPackageBundle({ manifest });

    const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
    const exported = JSON.parse(
      await zip.file("asset-package.json").async("string"),
    );
    const font = exported.dependencies.fonts.items["font.serif"];
    expect(font.previewMediaFileId).toBe("font-preview.font.serif.png");
    expect(font.thumbnailMediaFileId).toBe("font-thumbnail.font.serif.png");
    expect(exported.repository.files.items).toHaveProperty(
      "font-preview.font.serif.png",
    );
    expect(zip.file("files/font-preview.font.serif.png")).not.toBeNull();
    expect(
      exported.repository.textStyles.items["text-style.title"]
        .previewMediaFileId,
    ).toBe("text-style-preview.text-style.title.png");
  });

  it("generates export-only previews for visual resource types", async () => {
    const manifest = createManifest();
    manifest.repository.files.items["file-spritesheet"] = {
      id: "file-spritesheet",
      mimeType: "image/png",
      source: { url: "./files/file-spritesheet" },
    };
    manifest.repository.files.items["file-font"] = {
      id: "file-font",
      mimeType: "font/woff2",
      source: { url: "./files/file-font" },
    };
    manifest.repository.spritesheets = {
      items: {
        "spritesheet.hero": {
          id: "spritesheet.hero",
          type: "spritesheet",
          name: "Hero",
          fileId: "file-spritesheet",
          jsonData: { frames: { idle: { frame: { x: 0, y: 0, w: 8, h: 8 } } } },
          animations: { idle: { frames: ["idle"], fps: 12 } },
        },
      },
      tree: [{ id: "spritesheet.hero" }],
    };
    manifest.repository.fonts = {
      items: {
        "font.body": {
          id: "font.body",
          type: "font",
          name: "Body",
          fileId: "file-font",
          fontFamily: "Body",
        },
      },
      tree: [{ id: "font.body" }],
    };
    manifest.repository.colors = {
      items: {
        "color.body": {
          id: "color.body",
          type: "color",
          name: "Body",
          hex: "#112233",
        },
      },
      tree: [{ id: "color.body" }],
    };
    manifest.repository.textStyles = {
      items: {
        "text-style.body": {
          id: "text-style.body",
          type: "textStyle",
          name: "Body",
          fontId: ["font.body"],
          colorId: "color.body",
          fontSize: 24,
          lineHeight: 1.5,
          fontWeight: "400",
        },
      },
      tree: [{ id: "text-style.body" }],
    };
    manifest.repository.animations = {
      items: {
        "animation.fade": {
          id: "animation.fade",
          type: "animation",
          name: "Fade",
          preview: { target: { imageId: "image.animation-target" } },
          animation: {
            type: "update",
            tween: {
              alpha: {
                initialValue: 0,
                keyframes: [{ duration: 500, value: 1 }],
              },
            },
          },
        },
        "animation.slide": {
          id: "animation.slide",
          type: "animation",
          name: "Slide",
          animation: {
            type: "update",
            tween: {
              x: {
                initialValue: 0,
                keyframes: [{ duration: 500, value: 100 }],
              },
            },
          },
        },
      },
      tree: [{ id: "animation.fade" }, { id: "animation.slide" }],
    };
    manifest.repository.particles = {
      items: {
        "particle.sparkle": {
          id: "particle.sparkle",
          type: "particle",
          name: "Sparkle",
          width: 640,
          height: 360,
          modules: { appearance: { texture: "circle" } },
        },
      },
      tree: [{ id: "particle.sparkle" }],
    };
    const sourceManifest = structuredClone(manifest);
    const sourceRepository = structuredClone(manifest.repository);
    sourceRepository.project = { resolution: { width: 640, height: 360 } };
    sourceRepository.files.items["file-animation-target"] = {
      id: "file-animation-target",
      mimeType: "image/png",
    };
    sourceRepository.images = {
      items: {
        "image.animation-target": {
          id: "image.animation-target",
          type: "image",
          fileId: "file-animation-target",
        },
      },
      tree: [{ id: "image.animation-target" }],
    };
    const renderSpritesheetPreview = vi.fn(async () => ({
      previewBlob: new Blob(["spritesheet-video"], { type: "video/webm" }),
      thumbnailBlob: new Blob(["spritesheet-thumbnail"], {
        type: "video/webm",
      }),
    }));
    const renderFontPreview = vi.fn(async () => ({
      previewBlob: new Blob(["font-image"], { type: "image/png" }),
      thumbnailBlob: new Blob(["font-thumbnail"], { type: "image/png" }),
    }));
    const renderTextStylePreview = vi.fn(async () => ({
      previewBlob: new Blob(["text-style-image"], { type: "image/png" }),
      thumbnailBlob: new Blob(["text-style-thumbnail"], {
        type: "image/png",
      }),
    }));
    const renderAnimationPreviews = vi.fn(async ({ animations }) =>
      animations.map(({ animationId }) => ({
        animationId,
        previewBlob: new Blob([`${animationId}-video`], {
          type: "video/webm",
        }),
        thumbnailBlob: new Blob([`${animationId}-thumbnail`], {
          type: "video/webm",
        }),
      })),
    );
    const renderParticlePreview = vi.fn(async () => ({
      previewBlob: new Blob(["particle-video"], { type: "video/mp4" }),
      thumbnailBlob: new Blob(["particle-thumbnail"], { type: "video/mp4" }),
    }));
    const service = createAssetPackageExportService({
      getFileContent: vi.fn(async (fileId) => ({
        url: `project-file://${fileId}`,
        revoke: vi.fn(),
      })),
      getRepositoryState: () => sourceRepository,
      fetchImpl: vi.fn(async (url) => ({
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(url).buffer,
      })),
      renderSpritesheetPreview,
      renderFontPreview,
      renderTextStylePreview,
      renderAnimationPreviews,
      renderParticlePreview,
    });

    const bundle = await service.createAssetPackageBundle({ manifest });

    expect(manifest).toEqual(sourceManifest);
    const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
    const exported = JSON.parse(
      await zip.file("asset-package.json").async("string"),
    );
    expect(
      exported.repository.spritesheets.items["spritesheet.hero"]
        .previewMediaFileId,
    ).toBe("spritesheet-preview.spritesheet.hero.webm");
    expect(
      exported.repository.spritesheets.items["spritesheet.hero"]
        .thumbnailMediaFileId,
    ).toBe("spritesheet-thumbnail.spritesheet.hero.webm");
    expect(
      exported.repository.fonts.items["font.body"].previewMediaFileId,
    ).toBe("font-preview.font.body.png");
    expect(
      exported.repository.fonts.items["font.body"].thumbnailMediaFileId,
    ).toBe("font-thumbnail.font.body.png");
    expect(
      exported.repository.textStyles.items["text-style.body"]
        .previewMediaFileId,
    ).toBe("text-style-preview.text-style.body.png");
    expect(
      exported.repository.textStyles.items["text-style.body"]
        .thumbnailMediaFileId,
    ).toBe("text-style-thumbnail.text-style.body.png");
    expect(
      exported.repository.animations.items["animation.fade"].previewMediaFileId,
    ).toBe("animation-preview.animation.fade.webm");
    expect(
      exported.repository.animations.items["animation.fade"]
        .thumbnailMediaFileId,
    ).toBe("animation-thumbnail.animation.fade.webm");
    expect(
      exported.repository.animations.items["animation.slide"]
        .previewMediaFileId,
    ).toBe("animation-preview.animation.slide.webm");
    expect(
      exported.repository.particles.items["particle.sparkle"]
        .previewMediaFileId,
    ).toBe("particle-preview.particle.sparkle.mp4");
    expect(
      exported.repository.particles.items["particle.sparkle"]
        .thumbnailMediaFileId,
    ).toBe("particle-thumbnail.particle.sparkle.mp4");
    expect(
      exported.repository.files.items[
        "spritesheet-preview.spritesheet.hero.webm"
      ].mimeType,
    ).toBe("video/webm");
    expect(
      exported.repository.files.items["font-preview.font.body.png"],
    ).toMatchObject({
      type: "image",
      name: "Body preview.png",
      mimeType: "image/png",
    });
    expect(
      exported.repository.files.items["font-thumbnail.font.body.png"],
    ).toMatchObject({
      type: "image",
      name: "Body thumbnail.png",
      mimeType: "image/png",
    });
    expect(
      exported.repository.files.items["text-style-preview.text-style.body.png"],
    ).toMatchObject({
      type: "image",
      name: "Body preview.png",
      mimeType: "image/png",
    });
    expect(
      exported.repository.files.items[
        "text-style-thumbnail.text-style.body.png"
      ],
    ).toMatchObject({
      type: "image",
      name: "Body thumbnail.png",
      mimeType: "image/png",
    });
    expect(
      exported.repository.files.items["particle-preview.particle.sparkle.mp4"]
        .mimeType,
    ).toBe("video/mp4");
    expect(
      exported.repository.files.items["animation-preview.animation.fade.webm"]
        .mimeType,
    ).toBe("video/webm");
    expect(
      exported.repository.files.items["animation-thumbnail.animation.fade.webm"]
        .mimeType,
    ).toBe("video/webm");
    expect(renderSpritesheetPreview).toHaveBeenCalledOnce();
    expect(renderFontPreview).toHaveBeenCalledOnce();
    expect(renderTextStylePreview).toHaveBeenCalledWith(
      expect.objectContaining({
        color: "#112233",
        fontFamilies: ["Body"],
      }),
    );
    expect(renderAnimationPreviews).toHaveBeenCalledOnce();
    expect(renderAnimationPreviews).toHaveBeenCalledWith(
      expect.objectContaining({
        animations: [
          expect.objectContaining({
            animationId: "animation.fade",
            animation: expect.objectContaining({ id: "animation.fade" }),
            imageAssets: [
              expect.objectContaining({
                fileId: "file-animation-target",
                mimeType: "image/png",
              }),
            ],
          }),
          expect.objectContaining({
            animationId: "animation.slide",
            animation: expect.objectContaining({ id: "animation.slide" }),
            imageAssets: [],
          }),
        ],
        projectResolution: { width: 640, height: 360 },
      }),
    );
    expect(
      exported.repository.files.items["file-animation-target"],
    ).toBeUndefined();
    expect(renderParticlePreview).toHaveBeenCalledOnce();
  });

  describe("layout previews", () => {
    const createLayout = ({ id, name, imageIds = ["image.art"] }) => ({
      id,
      type: "layout",
      name,
      layoutType: "general",
      thumbnailFileId: "file-thumbnail",
      elements: {
        items: Object.fromEntries(
          imageIds.map((imageId, index) => [
            `art-${index}`,
            {
              id: `art-${index}`,
              type: "sprite",
              imageId,
              x: 0,
              y: 0,
              width: 64,
              height: 64,
            },
          ]),
        ),
        tree: imageIds.map((_, index) => ({ id: `art-${index}` })),
      },
    });
    const createCollection = (layouts) => ({
      items: Object.fromEntries(layouts.map((layout) => [layout.id, layout])),
      tree: layouts.map((layout) => ({ id: layout.id })),
    });
    // The project a pack is exported from, and the manifest of the pack:
    // `picks` are the layouts the author picked and `dependencies` the ones
    // they use. Both hold the project's layouts, as sanitized clones.
    const createLayoutExport = ({
      picks,
      dependencies = [],
      missingLayouts = [],
    }) => {
      const manifest = createManifest();
      manifest.schema = "routevn.import-pack.v2";
      manifest.repository.files.items["file-thumbnail"] = {
        id: "file-thumbnail",
        mimeType: "image/jpeg",
        source: { url: "./files/file-thumbnail" },
      };
      manifest.repository.layouts = {
        items: {
          "folder.menus": {
            id: "folder.menus",
            type: "folder",
            name: "Menus",
          },
          ...createCollection(picks).items,
        },
        tree: [
          {
            id: "folder.menus",
            children: picks.map((layout) => ({ id: layout.id })),
          },
        ],
      };
      if (dependencies.length > 0) {
        manifest.dependencies = {
          layouts: createCollection(dependencies),
        };
      }
      const sourceRepository = structuredClone(manifest.repository);
      sourceRepository.project = { resolution: { width: 1280, height: 720 } };
      sourceRepository.layouts.items = {
        ...sourceRepository.layouts.items,
        ...createCollection(dependencies).items,
      };
      // Layouts the pack names that the project no longer has.
      for (const layout of missingLayouts) {
        manifest.repository.layouts.items[layout.id] = layout;
      }
      sourceRepository.files.items["file-art"] = {
        id: "file-art",
        mimeType: "image/png",
      };
      sourceRepository.files.items["file-other"] = {
        id: "file-other",
        mimeType: "image/png",
      };
      sourceRepository.files.items["file-lost"] = {
        id: "file-lost",
        mimeType: "image/png",
      };
      sourceRepository.images = {
        items: {
          "image.art": {
            id: "image.art",
            type: "image",
            fileId: "file-art",
            width: 64,
            height: 64,
          },
          "image.other": {
            id: "image.other",
            type: "image",
            fileId: "file-other",
            width: 64,
            height: 64,
          },
          "image.lost": {
            id: "image.lost",
            type: "image",
            fileId: "file-lost",
            width: 64,
            height: 64,
          },
        },
        tree: [
          { id: "image.art" },
          { id: "image.other" },
          { id: "image.lost" },
        ],
      };
      return { manifest, sourceRepository };
    };
    // The project's files, as `getFileContent` reads them. A file the project
    // lost cannot be read, and `contents` holds what was read of each file.
    const createProjectFiles = () => {
      const contents = {};
      const getFileContent = vi.fn(async (fileId) => {
        if (fileId === "file-lost") {
          throw new Error("The file is gone.");
        }
        const content = { url: `project-file://${fileId}`, revoke: vi.fn() };
        contents[fileId] ??= [];
        contents[fileId].push(content);
        return content;
      });
      return { getFileContent, contents };
    };
    const createService = ({
      sourceRepository,
      createLayoutPreviewRenderer,
      getFileContent = createProjectFiles().getFileContent,
    }) =>
      createAssetPackageExportService({
        getFileContent,
        getRepositoryState: () => sourceRepository,
        fetchImpl: vi.fn(async (url) => ({
          ok: true,
          arrayBuffer: async () => new TextEncoder().encode(url).buffer,
        })),
        createLayoutPreviewRenderer,
      });
    const readExportedManifest = async (bundle) => {
      const zip = await JSZip.loadAsync(await bundle.arrayBuffer());
      return {
        zip,
        exported: JSON.parse(
          await zip.file("asset-package.json").async("string"),
        ),
      };
    };

    it("adds a full-size preview to picked and dependency layouts, not folders", async () => {
      const { manifest, sourceRepository } = createLayoutExport({
        picks: [createLayout({ id: "layout.title", name: "Project One" })],
        dependencies: [
          createLayout({ id: "layout.popup", name: "Project Two" }),
        ],
      });
      const render = vi
        .fn()
        .mockResolvedValueOnce(new Blob(["title-image"], { type: "image/png" }))
        .mockResolvedValueOnce(
          new Blob(["popup-image"], { type: "image/png" }),
        );
      const destroy = vi.fn(async () => {});
      const createLayoutPreviewRenderer = vi.fn(async () => ({
        render,
        destroy,
      }));
      const { getFileContent, contents } = createProjectFiles();
      const service = createService({
        sourceRepository,
        createLayoutPreviewRenderer,
        getFileContent,
      });

      const bundle = await service.createAssetPackageBundle({ manifest });

      const { zip, exported } = await readExportedManifest(bundle);
      const title = exported.repository.layouts.items["layout.title"];
      const popup = exported.dependencies.layouts.items["layout.popup"];
      expect(title.previewMediaFileId).toBe("layout-preview.layout.title.png");
      expect(popup.previewMediaFileId).toBe("layout-preview.layout.popup.png");
      expect(title.thumbnailFileId).toBe("file-thumbnail");
      expect(
        exported.repository.layouts.items["folder.menus"],
      ).not.toHaveProperty("previewMediaFileId");
      expect(
        exported.repository.files.items["layout-preview.layout.title.png"],
      ).toMatchObject({
        type: "image",
        name: "Project One preview.png",
        mimeType: "image/png",
        size: "title-image".length,
      });
      expect(
        await zip.file("files/layout-preview.layout.title.png").async("string"),
      ).toBe("title-image");
      expect(
        await zip.file("files/layout-preview.layout.popup.png").async("string"),
      ).toBe("popup-image");
      // The manifest passed in is left as it was.
      expect(
        manifest.repository.layouts.items["layout.title"],
      ).not.toHaveProperty("previewMediaFileId");

      expect(createLayoutPreviewRenderer).toHaveBeenCalledOnce();
      expect(render).toHaveBeenCalledTimes(2);
      expect(render).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          width: 1280,
          height: 720,
          renderState: expect.objectContaining({
            elements: [expect.objectContaining({ src: "file-art" })],
          }),
          // The renderer gets the URL the project gives for each file, not
          // its bytes.
          assets: {
            "file-art": { url: "project-file://file-art", type: "image/png" },
          },
        }),
      );
      expect(getFileContent).toHaveBeenCalledWith("file-art", {
        verifyImageIntegrity: true,
      });
      // Each layout's URLs are let go of once it is drawn.
      expect(contents["file-art"]).toHaveLength(2);
      for (const content of contents["file-art"]) {
        expect(content.revoke).toHaveBeenCalledOnce();
      }
      expect(destroy).toHaveBeenCalledOnce();
    });

    it("reads a layout's files at the same time", async () => {
      const { manifest, sourceRepository } = createLayoutExport({
        picks: [
          createLayout({
            id: "layout.title",
            name: "Project One",
            imageIds: ["image.art", "image.other"],
          }),
        ],
      });
      let reading = 0;
      let mostReading = 0;
      const getFileContent = vi.fn(async (fileId, options) => {
        const content = { url: `project-file://${fileId}`, revoke: vi.fn() };
        if (options === undefined) {
          return content;
        }
        reading += 1;
        mostReading = Math.max(mostReading, reading);
        await new Promise((resolve) => setTimeout(resolve, 0));
        reading -= 1;
        return content;
      });
      const render = vi.fn(
        async () => new Blob(["title-image"], { type: "image/png" }),
      );
      const service = createService({
        sourceRepository,
        getFileContent,
        createLayoutPreviewRenderer: async () => ({
          render,
          destroy: async () => {},
        }),
      });

      await service.createAssetPackageBundle({ manifest });

      expect(mostReading).toBe(2);
      expect(render.mock.calls[0][0].assets).toEqual({
        "file-art": { url: "project-file://file-art", type: "image/png" },
        "file-other": { url: "project-file://file-other", type: "image/png" },
      });
    });

    it("lets go of the files it read when another of the layout cannot be read", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { manifest, sourceRepository } = createLayoutExport({
        picks: [
          createLayout({
            id: "layout.lost",
            name: "Project One",
            imageIds: ["image.art", "image.lost"],
          }),
        ],
      });
      const { getFileContent, contents } = createProjectFiles();
      const render = vi.fn();
      const service = createService({
        sourceRepository,
        getFileContent,
        createLayoutPreviewRenderer: async () => ({
          render,
          destroy: async () => {},
        }),
      });

      const bundle = await service.createAssetPackageBundle({ manifest });

      const { exported } = await readExportedManifest(bundle);
      expect(
        exported.repository.layouts.items["layout.lost"],
      ).not.toHaveProperty("previewMediaFileId");
      expect(render).not.toHaveBeenCalled();
      expect(contents["file-art"]).toHaveLength(1);
      expect(contents["file-art"][0].revoke).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce();
      warn.mockRestore();
    });

    it("still exports when a layout cannot be drawn, without that layout's preview", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { manifest, sourceRepository } = createLayoutExport({
        picks: [
          createLayout({ id: "layout.broken", name: "Project One" }),
          createLayout({
            id: "layout.lost",
            name: "Project Two",
            imageIds: ["image.lost"],
          }),
          createLayout({ id: "layout.fine", name: "Project Three" }),
        ],
      });
      const render = vi
        .fn()
        .mockRejectedValueOnce(new Error("Canvas lost"))
        .mockResolvedValueOnce(new Blob(["fine-image"], { type: "image/png" }));
      const destroy = vi.fn(async () => {});
      const { getFileContent, contents } = createProjectFiles();
      const service = createService({
        sourceRepository,
        getFileContent,
        createLayoutPreviewRenderer: async () => ({ render, destroy }),
      });

      const bundle = await service.createAssetPackageBundle({ manifest });

      const { zip, exported } = await readExportedManifest(bundle);
      const layouts = exported.repository.layouts.items;
      // The files of the layout that failed to draw are let go of too.
      for (const content of contents["file-art"]) {
        expect(content.revoke).toHaveBeenCalledOnce();
      }
      expect(layouts["layout.broken"]).not.toHaveProperty("previewMediaFileId");
      expect(layouts["layout.lost"]).not.toHaveProperty("previewMediaFileId");
      expect(layouts["layout.fine"].previewMediaFileId).toBe(
        "layout-preview.layout.fine.png",
      );
      expect(Object.keys(exported.repository.files.items).sort()).toEqual([
        "file image",
        "file-sound",
        "file-thumbnail",
        "layout-preview.layout.fine.png",
      ]);
      expect(zip.file("files/layout-preview.layout.broken.png")).toBeNull();
      // The layout using a lost file is not drawn at all.
      expect(render).toHaveBeenCalledTimes(2);
      expect(warn).toHaveBeenCalledTimes(2);
      expect(warn.mock.calls.map(([message]) => message)).toEqual([
        expect.stringContaining("layout.broken"),
        expect.stringContaining("layout.lost"),
      ]);
      expect(destroy).toHaveBeenCalledOnce();
      warn.mockRestore();
    });

    describe("a renderer that cannot start", () => {
      const createStartFailureExport = () =>
        createLayoutExport({
          picks: [
            createLayout({ id: "layout.first", name: "Project One" }),
            createLayout({ id: "layout.second", name: "Project Two" }),
            createLayout({ id: "layout.third", name: "Project Three" }),
          ],
        });

      it("exports without previews when the renderer cannot be created", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { manifest, sourceRepository } = createStartFailureExport();
        const failure = new Error("Failed to fetch module");
        const createLayoutPreviewRenderer = vi.fn(async () => {
          throw failure;
        });
        const service = createService({
          sourceRepository,
          createLayoutPreviewRenderer,
        });

        const bundle = await service.createAssetPackageBundle({ manifest });

        const { zip, exported } = await readExportedManifest(bundle);
        for (const layout of Object.values(exported.repository.layouts.items)) {
          expect(layout).not.toHaveProperty("previewMediaFileId");
        }
        expect(
          Object.keys(zip.files).some((path) =>
            path.includes("layout-preview"),
          ),
        ).toBe(false);
        expect(createLayoutPreviewRenderer).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
        warn.mockRestore();
      });

      it("stops drawing at the first layout the graphics context cannot be made for", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { manifest, sourceRepository } = createStartFailureExport();
        const failure = createRendererStartError(new Error("No WebGL"));
        const render = vi.fn().mockRejectedValue(failure);
        const destroy = vi.fn(async () => {});
        const service = createService({
          sourceRepository,
          createLayoutPreviewRenderer: async () => ({ render, destroy }),
        });

        const bundle = await service.createAssetPackageBundle({ manifest });

        const { exported } = await readExportedManifest(bundle);
        for (const layout of Object.values(exported.repository.layouts.items)) {
          expect(layout).not.toHaveProperty("previewMediaFileId");
        }
        expect(render).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledOnce();
        expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
        expect(destroy).toHaveBeenCalledOnce();
        warn.mockRestore();
      });

      it("keeps the previews made before the graphics context could not be made again", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const { manifest, sourceRepository } = createStartFailureExport();
        const render = vi
          .fn()
          .mockResolvedValueOnce(
            new Blob(["first-image"], { type: "image/png" }),
          )
          .mockRejectedValueOnce(createRendererStartError(new Error("Lost")))
          .mockResolvedValue(new Blob(["late-image"], { type: "image/png" }));
        const destroy = vi.fn(async () => {});
        const service = createService({
          sourceRepository,
          createLayoutPreviewRenderer: async () => ({ render, destroy }),
        });

        const bundle = await service.createAssetPackageBundle({ manifest });

        const { zip, exported } = await readExportedManifest(bundle);
        const layouts = exported.repository.layouts.items;
        expect(layouts["layout.first"].previewMediaFileId).toBe(
          "layout-preview.layout.first.png",
        );
        expect(
          await zip
            .file("files/layout-preview.layout.first.png")
            .async("string"),
        ).toBe("first-image");
        expect(layouts["layout.second"]).not.toHaveProperty(
          "previewMediaFileId",
        );
        expect(layouts["layout.third"]).not.toHaveProperty(
          "previewMediaFileId",
        );
        // Nothing is drawn after the failure.
        expect(render).toHaveBeenCalledTimes(2);
        expect(warn).toHaveBeenCalledOnce();
        expect(destroy).toHaveBeenCalledOnce();
        warn.mockRestore();
      });
    });

    it("exports with every preview when freeing the renderer fails, and warns", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { manifest, sourceRepository } = createLayoutExport({
        picks: [createLayout({ id: "layout.title", name: "Project One" })],
      });
      const failure = new Error("Destroy failed");
      const destroy = vi.fn(async () => {
        throw failure;
      });
      const service = createService({
        sourceRepository,
        createLayoutPreviewRenderer: async () => ({
          render: async () => new Blob(["title-image"], { type: "image/png" }),
          destroy,
        }),
      });

      const bundle = await service.createAssetPackageBundle({ manifest });

      const { exported } = await readExportedManifest(bundle);
      expect(
        exported.repository.layouts.items["layout.title"].previewMediaFileId,
      ).toBe("layout-preview.layout.title.png");
      expect(destroy).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(expect.any(String), failure);
      warn.mockRestore();
    });

    it("does not start a renderer for a package without layouts to draw", async () => {
      const { manifest, sourceRepository } = createLayoutExport({
        picks: [],
        missingLayouts: [
          createLayout({ id: "layout.gone", name: "Project One" }),
        ],
      });
      const createLayoutPreviewRenderer = vi.fn();
      const service = createService({
        sourceRepository,
        createLayoutPreviewRenderer,
      });

      const bundle = await service.createAssetPackageBundle({ manifest });

      const { exported } = await readExportedManifest(bundle);
      expect(createLayoutPreviewRenderer).not.toHaveBeenCalled();
      expect(
        exported.repository.layouts.items["layout.gone"],
      ).not.toHaveProperty("previewMediaFileId");
    });
  });
});
