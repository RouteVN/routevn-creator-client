import { describe, expect, it, vi } from "vitest";
import { createUrlPackageSource } from "../../src/deps/clients/importPackageClient.js";
import { createResourcePackageImportService } from "../../src/deps/services/shared/resourcePackageImportService.js";
import { ASSET_PACKAGE_KIND } from "../../src/internal/assetPackageResources.js";

const assetManifest = () => ({
  schema: "routevn.import-pack.v1",
  package: {
    kind: ASSET_PACKAGE_KIND,
    id: "asset.package",
    name: "Asset Package",
    version: "1.0.0",
    description: "Images, sounds, and videos.",
  },
  repository: {
    files: {
      items: {
        "file.image": {
          id: "file.image",
          mimeType: "image/png",
          size: 3,
          source: { url: "../files/image.png" },
        },
        "file.sound": {
          id: "file.sound",
          mimeType: "audio/mpeg",
          size: 3,
          source: { url: "../files/sound.mp3" },
        },
        "file.video": {
          id: "file.video",
          mimeType: "video/mp4",
          size: 3,
          source: { url: "../files/video.mp4" },
        },
        "file.video-thumbnail": {
          id: "file.video-thumbnail",
          mimeType: "image/webp",
          size: 3,
          source: { url: "../files/video.webp" },
        },
      },
    },
    images: {
      items: {
        "folder.images": {
          id: "folder.images",
          type: "folder",
          name: "Images",
        },
        "folder.images.city": {
          id: "folder.images.city",
          type: "folder",
          name: "City",
        },
        "image.city": {
          id: "image.city",
          type: "image",
          name: "City",
          fileId: "file.image",
        },
      },
      tree: [
        {
          id: "folder.images",
          children: [
            {
              id: "folder.images.city",
              children: [{ id: "image.city" }],
            },
          ],
        },
      ],
    },
    sounds: {
      items: {
        "folder.sounds": {
          id: "folder.sounds",
          type: "folder",
          name: "Sounds",
        },
        "sound.theme": {
          id: "sound.theme",
          type: "sound",
          name: "Theme",
          fileId: "file.sound",
          duration: 1000,
        },
      },
      tree: [{ id: "folder.sounds", children: [{ id: "sound.theme" }] }],
    },
    videos: {
      items: {
        "folder.videos": {
          id: "folder.videos",
          type: "folder",
          name: "Videos",
        },
        "video.intro": {
          id: "video.intro",
          type: "video",
          name: "Intro",
          fileId: "file.video",
          thumbnailFileId: "file.video-thumbnail",
          duration: 2000,
          width: 1920,
          height: 1080,
        },
      },
      tree: [{ id: "folder.videos", children: [{ id: "video.intro" }] }],
    },
  },
});

const repositoryState = {
  transforms: {
    items: {
      "folder.transforms": {
        id: "folder.transforms",
        type: "folder",
        name: "Transforms",
      },
    },
    tree: [{ id: "folder.transforms" }],
  },
  images: {
    items: {
      "folder.images": {
        id: "folder.images",
        type: "folder",
        name: "Images",
      },
      "image.existing": {
        id: "image.existing",
        type: "image",
        name: "Existing",
        fileId: "file.existing",
      },
    },
    tree: [
      {
        id: "folder.images",
        children: [{ id: "image.existing" }],
      },
    ],
  },
  sounds: { items: {}, tree: [] },
  videos: { items: {}, tree: [] },
  tags: {},
};

const createService = ({
  commitResult = { valid: true },
  stageResult,
} = {}) => {
  let id = 0;
  let currentProjectId = "project-one";
  const currentRepositoryState = structuredClone(repositoryState);
  const importClient = {
    limits: { totalBytes: 1_000_000, downloadConcurrency: 2 },
    fetchManifest: vi.fn(async () => ({
      manifest: assetManifest(),
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    })),
    downloadFile: vi.fn(async () => ({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: "image/png",
    })),
  };
  // A manifest URL's source reads through fetchManifest and downloadFile, as
  // the real client's does.
  importClient.openPackage = vi.fn(({ url }) =>
    createUrlPackageSource({ client: importClient, url }),
  );
  const assetService = {
    validateResourceImportFile: vi.fn(async () => {}),
    stageResourceImportFile: vi.fn(
      async ({ file, fileId, thumbnailFileId }) => {
        if (stageResult) return stageResult({ file, fileId, thumbnailFileId });
        const fileRecords = [
          {
            id: fileId,
            mimeType: file.type,
            size: 3,
            sha256: "file-sha",
          },
        ];
        if (thumbnailFileId) {
          fileRecords.push({
            id: thumbnailFileId,
            mimeType: "image/webp",
            size: 2,
            sha256: "thumb-sha",
          });
        }
        return {
          fileId,
          thumbnailFileId,
          dimensions: { width: 1, height: 1 },
          displayName: "Pixel",
          fileRecords,
        };
      },
    ),
    discardResourceImportFiles: vi.fn(async () => ({
      deletedFileIds: [],
      retainedFileIds: [],
    })),
    finalizeResourceImportFiles: vi.fn(),
  };
  const commandApi = {
    commitAssetImportPackage: vi.fn(async () => commitResult),
  };
  const service = createResourcePackageImportService({
    idGenerator: () => `generated-${++id}`,
    getCurrentProjectId: () => currentProjectId,
    getRepositoryState: () => currentRepositoryState,
    getRepositoryRevision: () => 5,
    assetService,
    commandApi,
    importClient,
  });
  return {
    service,
    importClient,
    assetService,
    commandApi,
    currentRepositoryState,
    setCurrentProjectId(projectId) {
      currentProjectId = projectId;
    },
  };
};

describe("resourcePackageImportService", () => {
  it("rejects manifests without the asset-package kind", async () => {
    const { service, importClient } = createService();
    const legacyManifest = assetManifest();
    delete legacyManifest.package.kind;
    importClient.fetchManifest.mockResolvedValue({
      manifest: legacyManifest,
      manifestUrl: "http://localhost:4179/manifests/legacy.json",
    });

    const result = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/legacy.json",
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "invalid_package_kind" },
    });
  });

  it("imports nested image, sound, and video assets from one package", async () => {
    const { service, importClient, assetService, commandApi } = createService();
    importClient.fetchManifest.mockResolvedValue({
      manifest: assetManifest(),
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    importClient.downloadFile.mockImplementation(async ({ descriptor }) => ({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: descriptor.mimeType,
    }));

    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });

    expect(planned.valid).toBe(true);
    expect(planned.plan).toMatchObject({
      resources: [
        { type: "image", resourceType: "images", name: "City" },
        { type: "sound", resourceType: "sounds", name: "Theme" },
        { type: "video", resourceType: "videos", name: "Intro" },
      ],
    });
    expect(planned.plan.entries.map((entry) => entry.data.name)).toEqual([
      "Images",
      "City",
      "City",
      "Sounds",
      "Theme",
      "Videos",
      "Intro",
    ]);

    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
    });

    expect(result).toMatchObject({
      valid: true,
      importedCount: 3,
    });
    expect(importClient.downloadFile).toHaveBeenCalledTimes(4);
    expect(assetService.stageResourceImportFile).toHaveBeenCalledTimes(4);
    expect(
      assetService.stageResourceImportFile.mock.calls.every(
        ([payload]) => payload.processImage === false,
      ),
    ).toBe(true);
    expect(commandApi.commitAssetImportPackage).toHaveBeenCalledOnce();
    const commit = commandApi.commitAssetImportPackage.mock.calls[0][0];
    expect(commit.entries.map((entry) => entry.data.name)).toEqual([
      "Images",
      "City",
      "City",
      "Sounds",
      "Theme",
      "Videos",
      "Intro",
    ]);
    const video = commit.entries.find(
      (entry) => entry.resourceType === "videos" && !entry.folder,
    );
    expect(video.data).toMatchObject({
      fileId: expect.stringMatching(/^generated-/),
      thumbnailFileId: expect.stringMatching(/^generated-/),
    });
  });

  it("downloads only selected asset files and their folder ancestry", async () => {
    const { service, importClient, commandApi } = createService();
    importClient.fetchManifest.mockResolvedValue({
      manifest: assetManifest(),
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    importClient.downloadFile.mockImplementation(async ({ descriptor }) => ({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: descriptor.mimeType,
    }));
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const video = planned.plan.resources.find(
      (resource) => resource.resourceType === "videos",
    );

    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      selectedResourceIds: [video.sourceId],
    });

    expect(result).toMatchObject({
      valid: true,
      importedCount: 1,
    });
    expect(importClient.downloadFile).toHaveBeenCalledTimes(2);
    const commit = commandApi.commitAssetImportPackage.mock.calls[0][0];
    expect(commit.entries.map((entry) => entry.data.name)).toEqual([
      "Videos",
      "Intro",
    ]);
  });

  it("imports a v2 pick with the dependencies it uses, in folders named after the pack", async () => {
    // The author picked a text style and an image; the text style's font and
    // color come as dependencies.
    const v2Manifest = () => {
      const manifest = assetManifest();
      manifest.schema = "routevn.import-pack.v2";
      manifest.repository.files.items["file.font"] = {
        id: "file.font",
        mimeType: "font/woff2",
        size: 3,
        source: { url: "../files/serif.woff2" },
      };
      manifest.repository.textStyles = {
        items: {
          "folder.styles": {
            id: "folder.styles",
            type: "folder",
            name: "Styles",
          },
          "style.title": {
            id: "style.title",
            type: "textStyle",
            name: "Title",
            fontId: ["font.serif"],
            colorId: "color.gold",
            fontSize: 48,
            lineHeight: 1.2,
            fontWeight: "700",
          },
        },
        tree: [{ id: "folder.styles", children: [{ id: "style.title" }] }],
      };
      manifest.dependencies = {
        fonts: {
          items: {
            "font.serif": {
              id: "font.serif",
              type: "font",
              name: "Serif",
              fileId: "file.font",
              fontFamily: "Serif",
            },
          },
        },
        colors: {
          items: {
            "color.gold": {
              id: "color.gold",
              type: "color",
              name: "Gold",
              hex: "#FFD84D",
            },
          },
        },
      };
      return manifest;
    };
    const importWith = async (pickName) => {
      const { service, importClient, commandApi } = createService();
      importClient.fetchManifest.mockResolvedValue({
        manifest: v2Manifest(),
        manifestUrl: "http://localhost:4179/manifests/assets.json",
      });
      importClient.downloadFile.mockImplementation(async ({ descriptor }) => ({
        bytes: new Uint8Array([1, 2, 3]),
        byteLength: 3,
        contentType: descriptor.mimeType,
      }));
      const planned = await service.createResourceImportPlan({
        url: "http://localhost:4179/manifests/assets.json",
        dependencyFolderName: "Fantasy UI",
      });
      expect(planned.plan.resources.map((resource) => resource.name)).toEqual([
        "City",
        "Theme",
        "Intro",
        "Title",
      ]);
      const pick = planned.plan.resources.find(
        (resource) => resource.name === pickName,
      );
      // Without a choice for each dependency, the import is refused.
      if (pickName === "Title") {
        expect(
          service.validateResourceImportPlan({
            planId: planned.plan.planId,
            selectedResourceIds: [pick.sourceId],
          }),
        ).toMatchObject({
          valid: false,
          error: { code: "dependency_choice_required" },
        });
      }
      const result = await service.executeResourceImportPlan({
        planId: planned.plan.planId,
        selectedResourceIds: [pick.sourceId],
        dependencyReplacements: Object.fromEntries(
          planned.plan.dependencies.map((dependency) => [
            dependency.sourceId,
            "pack",
          ]),
        ),
      });
      return {
        result,
        entries: commandApi.commitAssetImportPackage.mock.calls[0][0].entries,
      };
    };

    const styled = await importWith("Title");
    expect(styled.result).toMatchObject({ valid: true, importedCount: 3 });
    const names = (entries) =>
      entries.map((entry) => `${entry.resourceType}/${entry.data.name}`);
    expect(names(styled.entries).sort()).toEqual([
      "colors/Fantasy UI",
      "colors/Gold",
      "fonts/Fantasy UI",
      "fonts/Serif",
      "textStyles/Styles",
      "textStyles/Title",
    ]);
    const byName = (resourceType, name) =>
      styled.entries.find(
        (entry) =>
          entry.resourceType === resourceType && entry.data.name === name,
      );
    expect(byName("fonts", "Serif").parentDestinationId).toBe(
      byName("fonts", "Fantasy UI").destinationId,
    );
    expect(byName("textStyles", "Title").data).toMatchObject({
      fontId: [byName("fonts", "Serif").destinationId],
      colorId: byName("colors", "Gold").destinationId,
    });

    const image = await importWith("City");
    expect(image.result).toMatchObject({ valid: true, importedCount: 1 });
    expect(names(image.entries)).toEqual([
      "images/Images",
      "images/City",
      "images/City",
    ]);
  });

  it("sends a layout's story link to the section the importer chose", async () => {
    const { service, importClient, commandApi, currentRepositoryState } =
      createService();
    currentRepositoryState.scenes = {
      items: {
        "scene-1": {
          type: "scene",
          name: "Title",
          sections: {
            items: { "section-1": { name: "Start" } },
            tree: [{ id: "section-1" }],
          },
        },
      },
      tree: [{ id: "scene-1" }],
    };
    const manifest = assetManifest();
    manifest.schema = "routevn.import-pack.v2";
    manifest.repository.layouts = {
      items: {
        "folder.menus": { id: "folder.menus", type: "folder", name: "Menus" },
        "layout.title": {
          id: "layout.title",
          type: "layout",
          name: "Title Menu",
          layoutType: "general",
          elements: {
            items: {
              start: {
                id: "start",
                type: "container",
                name: "Start",
                x: 0,
                y: 0,
                width: 0,
                height: 0,
                click: {
                  payload: {
                    actions: {
                      resetStoryAtSection: { sectionId: "link.start" },
                      pushOverlay: { resourceId: "link.menu" },
                    },
                  },
                },
              },
            },
            tree: [{ id: "start" }],
          },
        },
      },
      tree: [{ id: "folder.menus", children: [{ id: "layout.title" }] }],
    };
    manifest.links = {
      items: {
        "link.start": { kind: "section", name: "Start", sceneName: "Title" },
        "link.menu": {
          kind: "layout",
          name: "Menu Page",
          layoutType: "general",
        },
      },
    };
    currentRepositoryState.layouts = {
      items: {
        "layout.confirm": {
          type: "layout",
          name: "Confirm",
          layoutType: "confirmDialog",
        },
        "layout.menu": {
          type: "layout",
          name: "Menu",
          layoutType: "general",
        },
      },
      tree: [{ id: "layout.confirm" }, { id: "layout.menu" }],
    };
    importClient.fetchManifest.mockResolvedValue({
      manifest,
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    expect(planned.plan.links.map((link) => link.id)).toEqual([
      "link.start",
      "link.menu",
    ]);
    const layout = planned.plan.resources.find(
      (resource) => resource.name === "Title Menu",
    );

    // A section the project does not have is refused.
    expect(
      service.validateResourceImportPlan({
        planId: planned.plan.planId,
        selectedResourceIds: [layout.sourceId],
        linkTargets: {
          "link.start": "section-gone",
          "link.menu": "layout.menu",
        },
      }),
    ).toMatchObject({
      valid: false,
      error: { code: "link_target_missing" },
    });

    // A layout link takes a layout of its layout's type only.
    expect(
      service.validateResourceImportPlan({
        planId: planned.plan.planId,
        selectedResourceIds: [layout.sourceId],
        linkTargets: {
          "link.start": "section-1",
          "link.menu": "layout.confirm",
        },
      }),
    ).toMatchObject({
      valid: false,
      error: { code: "link_target_missing" },
    });

    // Every link the selection uses must be set.
    expect(
      service.validateResourceImportPlan({
        planId: planned.plan.planId,
        selectedResourceIds: [layout.sourceId],
        linkTargets: { "link.start": "section-1", "link.menu": "" },
      }),
    ).toMatchObject({
      valid: false,
      error: { code: "link_target_required" },
    });

    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      selectedResourceIds: [layout.sourceId],
      linkTargets: { "link.start": "section-1", "link.menu": "layout.menu" },
    });
    expect(result).toMatchObject({ valid: true });
    const committed =
      commandApi.commitAssetImportPackage.mock.calls[0][0].entries.find(
        (entry) => entry.data.name === "Title Menu",
      );
    expect(committed.data.elements.items.start.click.payload.actions).toEqual({
      resetStoryAtSection: { sectionId: "section-1" },
      pushOverlay: { resourceId: "layout.menu" },
    });
  });

  it("uses the project's resource for a replaced dependency, and leaves out what only it used", async () => {
    const { service, importClient, commandApi, currentRepositoryState } =
      createService();
    currentRepositoryState.textStyles = {
      items: {
        "style.own": { type: "textStyle", name: "Heading" },
      },
      tree: [{ id: "style.own" }],
    };
    currentRepositoryState.colors = {
      items: { "color.own": { type: "color", name: "Gold", hex: "#FFD84D" } },
      tree: [{ id: "color.own" }],
    };
    const manifest = assetManifest();
    manifest.schema = "routevn.import-pack.v2";
    manifest.repository.files.items["file.font"] = {
      id: "file.font",
      mimeType: "font/woff2",
      size: 3,
      source: { url: "../files/serif.woff2" },
    };
    manifest.repository.layouts = {
      items: {
        "folder.menus": { id: "folder.menus", type: "folder", name: "Menus" },
        "layout.title": {
          id: "layout.title",
          type: "layout",
          name: "Title Menu",
          layoutType: "general",
          elements: {
            items: {
              heading: {
                id: "heading",
                type: "text",
                name: "Heading",
                text: "Title",
                textStyleId: "style.title",
              },
            },
            tree: [{ id: "heading" }],
          },
        },
      },
      tree: [{ id: "folder.menus", children: [{ id: "layout.title" }] }],
    };
    manifest.dependencies = {
      textStyles: {
        items: {
          "style.title": {
            id: "style.title",
            type: "textStyle",
            name: "Title",
            fontId: ["font.serif"],
            colorId: "color.gold",
            fontSize: 48,
            lineHeight: 1.2,
            fontWeight: "700",
          },
        },
      },
      fonts: {
        items: {
          "font.serif": {
            id: "font.serif",
            type: "font",
            name: "Serif",
            fileId: "file.font",
            fontFamily: "Serif",
          },
        },
      },
      colors: {
        items: {
          "color.gold": {
            id: "color.gold",
            type: "color",
            name: "Gold",
            hex: "#FFD84D",
          },
        },
      },
    };
    importClient.fetchManifest.mockResolvedValue({
      manifest,
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const layout = planned.plan.resources.find(
      (resource) => resource.name === "Title Menu",
    );
    const dependency = (name) =>
      planned.plan.dependencies.find((resource) => resource.name === name);

    // A replacement of another type is refused.
    expect(
      service.validateResourceImportPlan({
        planId: planned.plan.planId,
        selectedResourceIds: [layout.sourceId],
        dependencyReplacements: { [dependency("Title").sourceId]: "color.own" },
      }),
    ).toMatchObject({
      valid: false,
      error: { code: "dependency_replacement_missing" },
    });

    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      selectedResourceIds: [layout.sourceId],
      dependencyReplacements: { [dependency("Title").sourceId]: "style.own" },
    });
    expect(result).toMatchObject({ valid: true, importedCount: 1 });
    const { entries } = commandApi.commitAssetImportPackage.mock.calls[0][0];
    // The text style, and the font and color only it used, stay out.
    expect(
      entries.map((entry) => `${entry.resourceType}/${entry.data.name}`),
    ).toEqual(["layouts/Menus", "layouts/Title Menu"]);
    expect(
      entries.find((entry) => entry.data.name === "Title Menu").data.elements
        .items.heading.textStyleId,
    ).toBe("style.own");
    expect(importClient.downloadFile).not.toHaveBeenCalled();
  });

  it("downloads package previews through the bounded import client", async () => {
    const { service, importClient } = createService();
    importClient.fetchManifest.mockResolvedValue({
      manifest: assetManifest(),
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    importClient.downloadFile.mockImplementation(async ({ descriptor }) => ({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: descriptor.mimeType,
    }));
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const video = planned.plan.resources.find(
      (resource) => resource.resourceType === "videos",
    );

    const result = await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: video.previewSourceId,
      operationId: "preview-operation",
    });

    expect(result).toMatchObject({
      valid: true,
      preview: {
        sourceFileId: "file.video-thumbnail",
        mimeType: "image/webp",
        kind: "image",
        bytes: expect.any(Uint8Array),
      },
    });
    expect(importClient.downloadFile).toHaveBeenCalledWith({
      descriptor:
        assetManifest().repository.files.items["file.video-thumbnail"],
      manifestUrl: "http://localhost:4179/manifests/assets.json",
      signal: expect.any(AbortSignal),
    });
  });

  it("reads a published package's manifest and previews through its own source", async () => {
    const { service, importClient } = createService();
    const zip = {
      url: "https://files.example/asset-store/PackageFile00001",
      size: 1000,
      directoryOffset: 900,
      directorySize: 100,
    };
    const source = {
      readManifest: vi.fn(async () => ({
        manifest: assetManifest(),
        manifestUrl: zip.url,
      })),
      readFile: vi.fn(async ({ descriptor }) => ({
        bytes: new Uint8Array([1, 2, 3]),
        byteLength: 3,
        contentType: descriptor.mimeType,
      })),
    };
    importClient.openPackage.mockReturnValue(source);

    const planned = await service.createResourceImportPlan({ zip });
    expect(importClient.openPackage).toHaveBeenCalledWith({
      url: undefined,
      zip,
    });
    const video = planned.plan.resources.find(
      (resource) => resource.resourceType === "videos",
    );
    const result = await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: video.previewSourceId,
    });

    expect(result).toMatchObject({ valid: true });
    expect(source.readFile).toHaveBeenCalledWith({
      descriptor:
        assetManifest().repository.files.items["file.video-thumbnail"],
      signal: expect.any(AbortSignal),
    });
    expect(importClient.downloadFile).not.toHaveBeenCalled();
  });

  it("loads a sound's audio for its full-screen preview", async () => {
    const { service, importClient } = createService();
    importClient.fetchManifest.mockResolvedValue({
      manifest: assetManifest(),
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    importClient.downloadFile.mockImplementation(async ({ descriptor }) => ({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: descriptor.mimeType,
    }));
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const sound = planned.plan.resources.find(
      (resource) => resource.resourceType === "sounds",
    );

    const result = await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: sound.largePreviewSourceId,
    });

    expect(result).toMatchObject({
      valid: true,
      preview: {
        sourceFileId: "file.sound",
        mimeType: "audio/mpeg",
        kind: "audio",
      },
    });
  });

  it("enforces the total download limit while loading previews", async () => {
    const { service, importClient } = createService();
    importClient.fetchManifest.mockResolvedValue({
      manifest: assetManifest(),
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    importClient.downloadFile.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: importClient.limits.totalBytes + 1,
      contentType: "image/webp",
    });
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const video = planned.plan.resources.find(
      (resource) => resource.resourceType === "videos",
    );

    const result = await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: video.previewSourceId,
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "download_too_large" },
    });
  });

  // The test package's files, 6 bytes each, without sizes in the manifest,
  // under a 10-byte limit.
  const createSizedService = () => {
    const context = createService();
    const manifest = assetManifest();
    for (const file of Object.values(manifest.repository.files.items)) {
      delete file.size;
    }
    context.importClient.fetchManifest.mockResolvedValue({
      manifest,
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    context.importClient.limits.totalBytes = 10;
    context.importClient.downloadFile.mockImplementation(
      async ({ descriptor }) => ({
        bytes: new Uint8Array(6),
        byteLength: 6,
        contentType: descriptor.mimeType,
      }),
    );
    return context;
  };
  const downloadsOf = (importClient, fileId) =>
    importClient.downloadFile.mock.calls.filter(
      ([{ descriptor }]) => descriptor.id === fileId,
    ).length;

  it("caps a plan's previews together at the total download limit", async () => {
    const { service } = createSizedService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const [image, , video] = planned.plan.resources;

    const first = await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: image.largePreviewSourceId,
    });
    const second = await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: video.largePreviewSourceId,
    });

    expect(first.valid).toBe(true);
    expect(second).toMatchObject({
      valid: false,
      error: { code: "download_too_large" },
    });
  });

  it("keeps previews of what an import leaves out out of its download limit", async () => {
    const { service, importClient } = createSizedService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const [image, , video] = planned.plan.resources;
    const preview = await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: video.largePreviewSourceId,
    });
    expect(preview.valid).toBe(true);

    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      selectedResourceIds: [image.sourceId],
    });

    expect(result).toMatchObject({ valid: true, importedCount: 1 });
    expect(downloadsOf(importClient, "file.image")).toBe(1);
  });

  it("imports a file read for its preview without reading it again, counting it once", async () => {
    const { service, importClient, commandApi } = createSizedService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const image = planned.plan.resources[0];
    expect(image.largePreviewSourceId).toBe("file.image");
    await service.loadResourceImportPreview({
      planId: planned.plan.planId,
      sourceFileId: image.largePreviewSourceId,
    });

    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      selectedResourceIds: [image.sourceId],
    });

    expect(result).toMatchObject({ valid: true, importedCount: 1 });
    expect(downloadsOf(importClient, "file.image")).toBe(1);
    expect(commandApi.commitAssetImportPackage).toHaveBeenCalledOnce();
  });

  it("still refuses an import whose files exceed the download limit", async () => {
    const { service, commandApi } = createSizedService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const video = planned.plan.resources[2];

    // The video and its thumbnail are 12 bytes.
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      selectedResourceIds: [video.sourceId],
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "download_too_large" },
    });
    expect(commandApi.commitAssetImportPackage).not.toHaveBeenCalled();
  });

  it("discards a plan left without importing it, with its previews, once", async () => {
    const { service, importClient, assetService } = createService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const { planId } = planned.plan;
    const image = planned.plan.resources[0];
    await service.loadResourceImportPreview({
      planId,
      sourceFileId: image.previewSourceId,
    });

    expect(service.discardResourceImportPlan({ planId })).toEqual({
      discarded: true,
    });
    expect(service.discardResourceImportPlan({ planId })).toEqual({
      discarded: false,
    });
    expect(assetService.finalizeResourceImportFiles).toHaveBeenCalledWith({
      planId,
    });
    expect(assetService.discardResourceImportFiles).not.toHaveBeenCalled();
    // Its cached preview went with it.
    await expect(
      service.loadResourceImportPreview({
        planId,
        sourceFileId: image.previewSourceId,
      }),
    ).resolves.toMatchObject({
      valid: false,
      error: { code: "plan_expired" },
    });
    await expect(
      service.executeResourceImportPlan({ planId }),
    ).resolves.toMatchObject({
      valid: false,
      error: { code: "plan_expired" },
    });
    expect(importClient.downloadFile).toHaveBeenCalledTimes(1);
  });

  it("leaves an imported plan as it is when it is discarded", async () => {
    const { service, assetService } = createService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const { planId } = planned.plan;
    const result = await service.executeResourceImportPlan({ planId });
    expect(result.valid).toBe(true);
    assetService.finalizeResourceImportFiles.mockClear();

    expect(service.discardResourceImportPlan({ planId })).toEqual({
      discarded: false,
    });
    expect(assetService.finalizeResourceImportFiles).not.toHaveBeenCalled();
    expect(assetService.discardResourceImportFiles).not.toHaveBeenCalled();
  });

  it("finishes an import whose plan is discarded while its files download", async () => {
    const { service, importClient, commandApi } = createService();
    let releaseDownloads;
    const downloadsHeld = new Promise((resolve) => {
      releaseDownloads = resolve;
    });
    importClient.downloadFile.mockImplementation(async ({ descriptor }) => {
      await downloadsHeld;
      return {
        bytes: new Uint8Array([1, 2, 3]),
        byteLength: 3,
        contentType: descriptor.mimeType,
      };
    });
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const { planId } = planned.plan;

    const importing = service.executeResourceImportPlan({ planId });
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.discardResourceImportPlan({ planId });
    releaseDownloads();

    await expect(importing).resolves.toMatchObject({
      valid: true,
      importedCount: 3,
    });
    expect(commandApi.commitAssetImportPackage).toHaveBeenCalledOnce();
  });

  it("rejects corrupt generalized media before staging", async () => {
    const { service, importClient, assetService, commandApi } = createService();
    importClient.fetchManifest.mockResolvedValue({
      manifest: assetManifest(),
      manifestUrl: "http://localhost:4179/manifests/assets.json",
    });
    importClient.downloadFile.mockImplementation(async ({ descriptor }) => ({
      bytes: new Uint8Array([1, 2, 3]),
      byteLength: 3,
      contentType: descriptor.mimeType,
    }));
    assetService.validateResourceImportFile.mockRejectedValue(
      new Error("decode failed"),
    );
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const image = planned.plan.resources.find(
      (resource) => resource.resourceType === "images",
    );

    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
      selectedResourceIds: [image.sourceId],
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "file_type_unsupported" },
    });
    expect(assetService.stageResourceImportFile).not.toHaveBeenCalled();
    expect(commandApi.commitAssetImportPackage).not.toHaveBeenCalled();
  });

  it("cleans every staged blob when the atomic command batch is rejected", async () => {
    const { service, assetService } = createService({
      commitResult: {
        valid: false,
        error: { code: "validation_failed", message: "Rejected" },
      },
    });
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
    });
    expect(result.valid).toBe(false);
    expect(assetService.discardResourceImportFiles).toHaveBeenCalledTimes(1);
    expect(
      assetService.discardResourceImportFiles.mock.calls[0][0].fileIds,
    ).toHaveLength(4);
  });

  it("requests plan cleanup when staging fails before returning file records", async () => {
    const { service, assetService, commandApi } = createService();
    assetService.stageResourceImportFile.mockRejectedValue(
      new Error("thumbnail generation failed"),
    );
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
    });
    expect(result.valid).toBe(false);
    expect(commandApi.commitAssetImportPackage).not.toHaveBeenCalled();
    expect(assetService.discardResourceImportFiles).toHaveBeenCalledWith({
      planId: planned.plan.planId,
      fileIds: [],
    });
  });

  it("cancels an active manifest request", async () => {
    const { service, importClient } = createService();
    importClient.fetchManifest.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              const error = new Error("cancelled");
              error.name = "AbortError";
              reject(error);
            },
            { once: true },
          );
        }),
    );
    const pending = service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
      operationId: "cancel-me",
    });
    expect(service.cancelResourceImport({ operationId: "cancel-me" })).toEqual({
      cancelled: true,
    });
    const result = await pending;
    expect(result.valid).toBe(false);
  });

  it("rejects execution when the current project changed after review", async () => {
    const {
      service,
      importClient,
      assetService,
      commandApi,
      setCurrentProjectId,
    } = createService();
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    setCurrentProjectId("project-two");
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
    });

    expect(result).toMatchObject({
      valid: false,
      error: { code: "project_changed" },
    });
    expect(importClient.downloadFile).not.toHaveBeenCalled();
    expect(assetService.stageResourceImportFile).not.toHaveBeenCalled();
    expect(commandApi.commitAssetImportPackage).not.toHaveBeenCalled();
  });

  it("retains staged blobs when commit confirmation has an unknown outcome", async () => {
    const { service, assetService, commandApi } = createService();
    const unknownOutcome = new Error("confirmation interrupted");
    unknownOutcome.commitOutcome = "unknown";
    commandApi.commitAssetImportPackage.mockRejectedValue(unknownOutcome);
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const result = await service.executeResourceImportPlan({
      planId: planned.plan.planId,
    });
    expect(result).toMatchObject({
      valid: false,
      error: { code: "commit_outcome_unknown", retryable: true },
    });
    expect(assetService.discardResourceImportFiles).not.toHaveBeenCalled();
  });

  it("recovers an unknown commit without downloading or deleting its blobs again", async () => {
    const {
      service,
      assetService,
      commandApi,
      importClient,
      currentRepositoryState,
    } = createService();
    const unknownOutcome = new Error("confirmation interrupted");
    unknownOutcome.commitOutcome = "unknown";
    commandApi.commitAssetImportPackage.mockRejectedValueOnce(unknownOutcome);
    const planned = await service.createResourceImportPlan({
      url: "http://localhost:4179/manifests/assets.json",
    });
    const execution = {
      planId: planned.plan.planId,
    };
    const firstResult = await service.executeResourceImportPlan(execution);
    expect(firstResult.valid).toBe(false);

    for (const entry of planned.plan.entries) {
      currentRepositoryState[entry.resourceType].items[entry.destinationId] = {
        id: entry.destinationId,
        ...entry.data,
      };
    }
    const secondResult = await service.executeResourceImportPlan(execution);

    expect(secondResult).toMatchObject({
      valid: true,
      recoveredFromPreviousCommit: true,
    });
    expect(importClient.downloadFile).toHaveBeenCalledTimes(4);
    expect(commandApi.commitAssetImportPackage).toHaveBeenCalledTimes(1);
    expect(assetService.discardResourceImportFiles).not.toHaveBeenCalled();
    expect(assetService.finalizeResourceImportFiles).toHaveBeenCalledWith({
      planId: planned.plan.planId,
    });
  });
});
