import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { createAssetPackageExportService } from "../../src/deps/services/shared/assetPackageExportService.js";

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
  it("creates a ZIP containing package.json and the referenced file bytes", async () => {
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
      "files/",
      "files/file%20image",
      "files/file-sound",
      "package.json",
    ]);
    expect(JSON.parse(await zip.file("package.json").async("string"))).toEqual(
      manifest,
    );
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
      await zip.file("package.json").async("string"),
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
    const renderSpritesheetPreview = vi.fn(
      async () => new Blob(["spritesheet-video"], { type: "video/webm" }),
    );
    const renderFontPreview = vi.fn(
      async () => new Blob(["font-image"], { type: "image/png" }),
    );
    const renderTextStylePreview = vi.fn(
      async () => new Blob(["text-style-image"], { type: "image/png" }),
    );
    const renderAnimationPreviews = vi.fn(async ({ animations }) =>
      animations.map(({ animationId }) => ({
        animationId,
        blob: new Blob([`${animationId}-video`], { type: "video/webm" }),
      })),
    );
    const renderParticlePreview = vi.fn(
      async () => new Blob(["particle-video"], { type: "video/mp4" }),
    );
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
    const exported = JSON.parse(await zip.file("package.json").async("string"));
    expect(
      exported.repository.spritesheets.items["spritesheet.hero"]
        .previewMediaFileId,
    ).toBe("spritesheet-preview.spritesheet.hero.webm");
    expect(
      exported.repository.fonts.items["font.body"].previewMediaFileId,
    ).toBe("font-preview.font.body.png");
    expect(
      exported.repository.textStyles.items["text-style.body"]
        .previewMediaFileId,
    ).toBe("text-style-preview.text-style.body.png");
    expect(
      exported.repository.animations.items["animation.fade"].previewMediaFileId,
    ).toBe("animation-preview.animation.fade.webm");
    expect(
      exported.repository.animations.items["animation.slide"]
        .previewMediaFileId,
    ).toBe("animation-preview.animation.slide.webm");
    expect(
      exported.repository.particles.items["particle.sparkle"]
        .previewMediaFileId,
    ).toBe("particle-preview.particle.sparkle.mp4");
    expect(
      exported.repository.files.items[
        "spritesheet-preview.spritesheet.hero.webm"
      ].mimeType,
    ).toBe("video/webm");
    expect(
      exported.repository.files.items["particle-preview.particle.sparkle.mp4"]
        .mimeType,
    ).toBe("video/mp4");
    expect(
      exported.repository.files.items["animation-preview.animation.fade.webm"]
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
});
