import { afterEach, describe, expect, it, vi } from "vitest";
import { createEditorThumbnailService } from "../../src/deps/services/shared/editorThumbnailService.js";
import { createThumbnailSourceHash } from "../../src/internal/thumbnailSourceHash.js";
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
    getCurrentProjectId: () => projectId,
    getRepositoryState: () => repositoryState,
    getFileContent: vi.fn(async (fileId) => {
      const content = { url: `blob:${fileId}`, type: "", revoke: vi.fn() };
      fileContents.push(content);
      return content;
    }),
    storeFile: vi.fn(async () => {
      storedFileCount += 1;
      return {
        fileId: `stored-${storedFileCount}`,
        fileRecords: [{ id: `record-${storedFileCount}` }],
      };
    }),
    // The update lands in the repository, as a command would.
    updateTransform: vi.fn(async ({ transformId, data }) => {
      Object.assign(repositoryState.transforms.items[transformId], data);
      return { valid: true };
    }),
    renderThumbnail: vi.fn(async () => thumbnailImage),
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
    const [{ file }] = deps.storeFile.mock.calls[0];
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
    expect(deps.storeFile).not.toHaveBeenCalled();
    expect(repositoryState.transforms.items["transform-1"]).toMatchObject({
      thumbnailFileId: "thumb-old",
    });
    expect(warn).toHaveBeenCalledWith(
      "[editorThumbnails] Failed to update a thumbnail",
      { transformId: "transform-1", error: expect.any(Error) },
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
      { transformId: "transform-2", result: { valid: false } },
    );
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
});
