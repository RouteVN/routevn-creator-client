import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorThumbnailService } from "../../src/deps/services/shared/editorThumbnailService.js";
import { createThumbnailSourceHash } from "../../src/deps/services/shared/thumbnailSourceHash.js";
import {
  createParticleThumbnailSource,
  PARTICLE_THUMBNAIL_VERSION,
} from "../../src/internal/particlePreview.js";
import {
  createTransformThumbnailSource,
  TRANSFORM_THUMBNAIL_VERSION,
} from "../../src/internal/transformPreview.js";

const transformValues = {
  x: 960,
  y: 1080,
  scaleX: 1,
  scaleY: 1,
  anchorX: 0.5,
  anchorY: 1,
  rotation: 0,
};

const createRepositoryState = () => ({
  project: { resolution: { width: 1920, height: 1080 } },
  images: {
    tree: [{ id: "image-1" }],
    items: {
      "image-1": {
        id: "image-1",
        type: "image",
        name: "Image One",
        fileId: "file-1",
        fileType: "image/webp",
        width: 1920,
        height: 1080,
      },
    },
  },
  characters: { tree: [], items: {} },
  particles: {
    tree: [{ id: "particle-1" }],
    items: {
      "particle-1": {
        id: "particle-1",
        type: "particle",
        name: "Particle One",
        width: 640.4,
        height: 360,
        seed: 7,
        modules: {
          emission: {},
          appearance: { texture: "image-1" },
        },
        preview: { background: { imageId: "image-1" } },
      },
    },
  },
  transforms: {
    tree: [{ id: "folder-1" }, { id: "transform-1" }, { id: "transform-2" }],
    items: {
      "folder-1": { id: "folder-1", type: "folder", name: "Folder One" },
      "transform-1": {
        id: "transform-1",
        type: "transform",
        name: "Transform One",
        ...transformValues,
        thumbnailFileId: "thumb-old",
        preview: {
          background: { imageId: "image-1" },
          target: { imageId: "image-1" },
        },
      },
      "transform-2": {
        id: "transform-2",
        type: "transform",
        name: "Transform Two",
        ...transformValues,
      },
    },
  },
});

const thumbnailImage = "data:image/jpeg;base64,dGh1bWI=";

const createService = ({ repositoryState = createRepositoryState() } = {}) => {
  let projectId = "project-1";
  let storedFileCount = 0;
  const fileContents = [];
  const deps = {
    getEnsuredProjectId: () => projectId,
    getRepositoryState: () => repositoryState,
    getFileContent: vi.fn(async (fileId) => {
      const content = { url: `blob:${fileId}`, type: "", revoke: vi.fn() };
      fileContents.push(content);
      return content;
    }),
    // As storeFileForProject returns: the file and its one record.
    storeFileForProject: vi.fn(async () => {
      storedFileCount += 1;
      return {
        fileId: `stored-${storedFileCount}`,
        fileRecord: { id: `record-${storedFileCount}` },
      };
    }),
    // The update lands in the repository, as a command would.
    updateTransform: vi.fn(async ({ transformId, data }) => {
      Object.assign(repositoryState.transforms.items[transformId], data);
      return { valid: true };
    }),
    updateParticle: vi.fn(async ({ particleId, data }) => {
      Object.assign(repositoryState.particles.items[particleId], data);
      return { valid: true };
    }),
    renderThumbnail: vi.fn(async () => thumbnailImage),
    releaseRenderer: vi.fn(async () => {}),
    waitUntilIdle: vi.fn(async () => {}),
  };
  return {
    deps,
    repositoryState,
    fileContents,
    service: createEditorThumbnailService(deps),
    switchProject: (nextProjectId) => {
      projectId = nextProjectId;
    },
  };
};

const hashOf = async (repositoryState, transformId) =>
  createThumbnailSourceHash({
    version: TRANSFORM_THUMBNAIL_VERSION,
    renderState: createTransformThumbnailSource({
      item: repositoryState.transforms.items[transformId],
      repositoryState,
    }).renderState,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("editor thumbnail service", () => {
  it("draws, stores, and saves a thumbnail that no longer matches, with its hash", async () => {
    const { deps, repositoryState, fileContents, service } = createService();
    const expectedHash = await hashOf(repositoryState, "transform-1");

    await service.requestTransformThumbnails({ transformIds: ["transform-1"] });

    // The background and the target share one file, which loads once.
    expect(deps.getFileContent.mock.calls).toEqual([
      ["file-1", { verifyImageIntegrity: true }],
    ]);
    const [renderOptions] = deps.renderThumbnail.mock.calls[0];
    expect(renderOptions).toEqual({
      width: 1920,
      height: 1080,
      renderState: createTransformThumbnailSource({
        item: repositoryState.transforms.items["transform-1"],
        repositoryState,
      }).renderState,
      imageAssets: { "file-1": { url: "blob:file-1", type: "image/webp" } },
    });
    expect(
      renderOptions.renderState.elements.map(({ id, type, src }) => [
        id,
        type,
        src,
      ]),
    ).toEqual([
      ["transform-background", "sprite", "file-1"],
      ["transform-target", "sprite", "file-1"],
    ]);
    const [{ projectId, file }] = deps.storeFileForProject.mock.calls[0];
    expect(projectId).toBe("project-1");
    expect([file.type, file.size]).toEqual(["image/jpeg", "thumb".length]);
    expect(deps.updateTransform.mock.calls).toEqual([
      [
        {
          transformId: "transform-1",
          data: {
            thumbnailFileId: "stored-1",
            thumbnailSourceHash: expectedHash,
          },
          fileRecords: [{ id: "record-1" }],
        },
      ],
    ]);
    expect(expectedHash).toMatch(/^[0-9a-f]{64}$/);
    expect(fileContents[0].revoke).toHaveBeenCalledOnce();
  });

  it("leaves an up-to-date thumbnail alone, so asking again is cheap", async () => {
    const { deps, service } = createService();

    await service.requestTransformThumbnails({ transformIds: ["transform-1"] });
    await service.requestTransformThumbnails({ transformIds: ["transform-1"] });

    expect(deps.renderThumbnail).toHaveBeenCalledOnce();
    expect(deps.updateTransform).toHaveBeenCalledOnce();
  });

  it("draws again once what the thumbnail shows changes", async () => {
    const { deps, repositoryState, service } = createService();
    await service.requestTransformThumbnails({ transformIds: ["transform-1"] });

    repositoryState.transforms.items["transform-1"].x = 100;
    await service.requestTransformThumbnails({ transformIds: ["transform-1"] });
    // A name is not drawn, so it changes nothing.
    repositoryState.transforms.items["transform-1"].name = "Renamed";
    await service.requestTransformThumbnails({ transformIds: ["transform-1"] });

    expect(deps.renderThumbnail).toHaveBeenCalledTimes(2);
    expect(
      repositoryState.transforms.items["transform-1"].thumbnailSourceHash,
    ).toBe(await hashOf(repositoryState, "transform-1"));
  });

  it("checks every transform when none are named, and skips folders", async () => {
    const { deps, repositoryState, service } = createService();
    repositoryState.transforms.items["transform-1"].thumbnailSourceHash =
      await hashOf(repositoryState, "transform-1");

    await service.requestTransformThumbnails();

    expect(
      deps.updateTransform.mock.calls.map(([call]) => call.transformId),
    ).toEqual(["transform-2"]);
    // A transform without preview images draws the gray screen and square.
    expect(deps.getFileContent).not.toHaveBeenCalled();
    expect(deps.renderThumbnail.mock.calls[0][0].imageAssets).toEqual({});
  });

  it("keeps the old thumbnail while a preview image cannot be read", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, repositoryState, service } = createService();
    deps.getFileContent.mockRejectedValue(new Error("File file-1 is missing."));

    await service.requestTransformThumbnails({ transformIds: ["transform-1"] });

    expect(deps.renderThumbnail).not.toHaveBeenCalled();
    expect(deps.storeFileForProject).not.toHaveBeenCalled();
    expect(repositoryState.transforms.items["transform-1"]).toMatchObject({
      thumbnailFileId: "thumb-old",
    });
    expect(warn).toHaveBeenCalledWith(
      "[editorThumbnails] Failed to update a thumbnail",
      { kind: "transform", id: "transform-1", error: expect.any(Error) },
    );
  });

  it("logs a failure and goes on with the next transform", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, service } = createService();
    deps.renderThumbnail.mockRejectedValueOnce(
      new Error("The canvas returned no thumbnail image."),
    );

    await expect(service.requestTransformThumbnails()).resolves.toBe(undefined);

    expect(warn).toHaveBeenCalledOnce();
    expect(
      deps.updateTransform.mock.calls.map(([call]) => call.transformId),
    ).toEqual(["transform-2"]);
  });

  it("logs a rejected update", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { deps, service } = createService();
    deps.updateTransform.mockResolvedValue({ valid: false });

    await service.requestTransformThumbnails({ transformIds: ["transform-2"] });

    expect(warn).toHaveBeenCalledWith(
      "[editorThumbnails] The thumbnail update was rejected",
      { kind: "transform", id: "transform-2", result: { valid: false } },
    );
  });

  it("checks hashes without waiting, and waits for the app to be idle only to draw", async () => {
    const { deps, repositoryState, service } = createService();
    repositoryState.transforms.items["transform-1"].thumbnailSourceHash =
      await hashOf(repositoryState, "transform-1");

    await service.requestTransformThumbnails();

    expect(deps.waitUntilIdle).toHaveBeenCalledOnce();
    expect(deps.renderThumbnail).toHaveBeenCalledOnce();
  });

  it("draws the transform as it is once the app is idle", async () => {
    const { deps, repositoryState, service } = createService();
    deps.waitUntilIdle.mockImplementationOnce(async () => {
      repositoryState.transforms.items["transform-2"].x = 100;
    });

    await service.requestTransformThumbnails({ transformIds: ["transform-2"] });

    const [{ renderState }] = deps.renderThumbnail.mock.calls[0];
    expect(renderState.elements[1]).toMatchObject({ x: 100 });
    expect(
      repositoryState.transforms.items["transform-2"].thumbnailSourceHash,
    ).toBe(await hashOf(repositoryState, "transform-2"));
  });

  it("stores and saves nothing once the project closes while it draws or stores", async () => {
    const { deps, service, switchProject } = createService();
    deps.renderThumbnail.mockImplementationOnce(async () => {
      switchProject(undefined);
      return thumbnailImage;
    });

    await service.requestTransformThumbnails({ transformIds: ["transform-2"] });
    expect(deps.storeFileForProject).not.toHaveBeenCalled();

    switchProject("project-1");
    deps.storeFileForProject.mockImplementationOnce(async () => {
      switchProject("project-2");
      return { fileId: "stored-1", fileRecord: { id: "record-1" } };
    });
    await service.requestTransformThumbnails({ transformIds: ["transform-2"] });
    expect(deps.storeFileForProject).toHaveBeenCalledOnce();
    expect(deps.updateTransform).not.toHaveBeenCalled();
  });

  it("asks for nothing while no project is open", async () => {
    const { deps, service, switchProject } = createService();
    switchProject(undefined);

    await service.requestTransformThumbnails();

    expect(deps.renderThumbnail).not.toHaveBeenCalled();
    expect(deps.waitUntilIdle).not.toHaveBeenCalled();
  });

  it("drops what was asked for in a project that is no longer open", async () => {
    const { deps, service, switchProject } = createService();
    let finishIdle;
    deps.waitUntilIdle.mockReturnValueOnce(
      new Promise((resolve) => {
        finishIdle = resolve;
      }),
    );

    const running = service.requestTransformThumbnails();
    switchProject("project-2");
    finishIdle();
    await running;

    expect(deps.renderThumbnail).not.toHaveBeenCalled();
    expect(deps.updateTransform).not.toHaveBeenCalled();
  });

  it("runs one job at a time, once per transform however often it is asked", async () => {
    const { deps, service } = createService();
    let finishRender;
    deps.renderThumbnail.mockReturnValueOnce(
      new Promise((resolve) => {
        finishRender = () => resolve(thumbnailImage);
      }),
    );

    const running = service.requestTransformThumbnails({
      transformIds: ["transform-1"],
    });
    await vi.waitFor(() => expect(deps.renderThumbnail).toHaveBeenCalled());
    service.requestTransformThumbnails({ transformIds: ["transform-2"] });
    service.requestTransformThumbnails({ transformIds: ["transform-2"] });
    expect(deps.renderThumbnail).toHaveBeenCalledOnce();
    finishRender();
    await running;

    expect(
      deps.updateTransform.mock.calls.map(([call]) => call.transformId),
    ).toEqual(["transform-1", "transform-2"]);
  });

  it("draws a particle at its own size once it has run a while, and saves it as a particle", async () => {
    const { deps, repositoryState, service } = createService();
    const item = repositoryState.particles.items["particle-1"];
    const source = createParticleThumbnailSource({ item, repositoryState });

    await service.requestParticleThumbnails();

    const [options] = deps.renderThumbnail.mock.calls[0];
    expect(options).toEqual({
      width: 640,
      height: 360,
      renderState: source.renderState,
      imageAssets: { "file-1": { url: "blob:file-1", type: "image/webp" } },
      settleMs: 1500,
    });
    // The particle draws its texture's file, on its background.
    const particleElement = options.renderState.elements.find(
      (element) => element.type === "particles",
    );
    expect(particleElement).toMatchObject({ seed: 7, width: 640 });
    expect(deps.updateParticle).toHaveBeenCalledWith({
      particleId: "particle-1",
      data: {
        thumbnailFileId: "stored-1",
        thumbnailSourceHash: await createThumbnailSourceHash({
          version: PARTICLE_THUMBNAIL_VERSION,
          renderState: source.renderState,
        }),
      },
      fileRecords: [{ id: "record-1" }],
    });
    expect(deps.updateTransform).not.toHaveBeenCalled();

    await service.requestParticleThumbnails({ particleIds: ["particle-1"] });
    expect(deps.renderThumbnail).toHaveBeenCalledOnce();
  });

  it("frees its renderer once the queue is empty, and only after it drew", async () => {
    const { deps, service } = createService();

    await service.requestTransformThumbnails();

    expect(deps.renderThumbnail).toHaveBeenCalledTimes(2);
    expect(deps.releaseRenderer).toHaveBeenCalledOnce();
    expect(deps.releaseRenderer.mock.invocationCallOrder[0]).toBeGreaterThan(
      deps.renderThumbnail.mock.invocationCallOrder[1],
    );

    // Nothing out of date, so nothing drawn and nothing to free.
    await service.requestTransformThumbnails();
    expect(deps.renderThumbnail).toHaveBeenCalledTimes(2);
    expect(deps.releaseRenderer).toHaveBeenCalledOnce();
  });

  it("frees its renderer after a drawing failed too", async () => {
    const { deps, service } = createService();
    deps.renderThumbnail.mockRejectedValue(new Error("render failed"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await service.requestTransformThumbnails({
        transformIds: ["transform-1"],
      });
    } finally {
      warn.mockRestore();
    }

    expect(deps.releaseRenderer).toHaveBeenCalledOnce();
  });
});
