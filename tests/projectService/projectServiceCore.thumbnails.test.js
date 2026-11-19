import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  repositoryService: {
    getEnsuredProjectId: vi.fn(),
    getCachedRepository: vi.fn(),
  },
  collabService: {
    commandApi: {
      updateTransform: vi.fn(),
      updateParticle: vi.fn(),
      updateLayoutItem: vi.fn(),
      updateAnimation: vi.fn(),
    },
  },
  assetService: {
    getFileContent: vi.fn(),
    storeFileForProject: vi.fn(),
  },
  renderThumbnailImage: vi.fn(),
  releaseThumbnailRenderer: vi.fn(),
}));

vi.mock("../../src/deps/services/shared/projectRepositoryService.js", () => ({
  createProjectRepositoryService: vi.fn(() => mocked.repositoryService),
}));

vi.mock("../../src/deps/services/shared/projectCollabCore.js", () => ({
  createProjectCollabCore: vi.fn(() => mocked.collabService),
}));

vi.mock("../../src/deps/services/shared/projectAssetService.js", () => ({
  createProjectAssetService: vi.fn(() => mocked.assetService),
}));

vi.mock("../../src/deps/services/shared/projectExportService.js", () => ({
  createProjectExportService: vi.fn(() => ({})),
}));

// The off-screen renderer needs a browser.
vi.mock("../../src/deps/clients/web/editorThumbnails.js", () => ({
  renderThumbnailImage: mocked.renderThumbnailImage,
  releaseThumbnailRenderer: mocked.releaseThumbnailRenderer,
}));

import { createProjectServiceCore } from "../../src/deps/services/shared/projectServiceCore.js";

const createRepositoryState = () => ({
  project: { resolution: { width: 1920, height: 1080 } },
  images: { items: {}, tree: [] },
  animations: {
    items: {
      "animation-1": {
        id: "animation-1",
        type: "animation",
        name: "Animation One",
        animation: {
          type: "update",
          tween: { x: { keyframes: [{ duration: 300, value: 100 }] } },
        },
      },
    },
    tree: [{ id: "animation-1" }],
  },
});

const createTestProjectService = () =>
  createProjectServiceCore({
    router: { getPayload: () => ({ p: "project-1" }) },
    db: {},
    filePicker: {},
    idGenerator: () => "generated-id",
    now: () => 0,
    collabLog: () => {},
    creatorVersion: 1,
    storageAdapter: { initializeProject: vi.fn() },
    fileAdapter: {},
    collabAdapter: {},
  });

describe("projectServiceCore thumbnails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const repositoryState = createRepositoryState();
    mocked.repositoryService.getEnsuredProjectId.mockReturnValue("project-1");
    mocked.repositoryService.getCachedRepository.mockReturnValue({
      getState: () => repositoryState,
    });
    mocked.renderThumbnailImage.mockResolvedValue(
      "data:image/jpeg;base64,AA==",
    );
    mocked.assetService.storeFileForProject.mockResolvedValue({
      fileId: "stored-1",
      fileRecord: { id: "record-1" },
    });
    mocked.collabService.commandApi.updateAnimation.mockImplementation(
      async ({ animationId, data }) => {
        Object.assign(repositoryState.animations.items[animationId], data);
        return { valid: true };
      },
    );
  });

  it("draws an animation's thumbnail in the open project and saves it with the animation's own command", async () => {
    const projectService = createTestProjectService();

    await projectService.requestAnimationThumbnails();

    expect(mocked.renderThumbnailImage).toHaveBeenCalledOnce();
    expect(mocked.renderThumbnailImage.mock.calls[0][0]).toMatchObject({
      width: 1920,
      height: 1080,
      animationFrame: { timeMs: 150, preparationPassCount: 1 },
    });
    expect(mocked.assetService.storeFileForProject).toHaveBeenCalledWith({
      projectId: "project-1",
      file: expect.any(Blob),
    });
    expect(
      mocked.collabService.commandApi.updateAnimation,
    ).toHaveBeenCalledWith({
      animationId: "animation-1",
      data: {
        thumbnailFileId: "stored-1",
        thumbnailSourceHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      },
      fileRecords: [{ id: "record-1" }],
    });
    expect(
      mocked.collabService.commandApi.updateTransform,
    ).not.toHaveBeenCalled();
    expect(
      mocked.collabService.commandApi.updateParticle,
    ).not.toHaveBeenCalled();
    expect(
      mocked.collabService.commandApi.updateLayoutItem,
    ).not.toHaveBeenCalled();
    expect(mocked.releaseThumbnailRenderer).toHaveBeenCalledOnce();

    // The saved hash matches, so the next request draws nothing.
    await projectService.requestAnimationThumbnails({
      animationIds: ["animation-1"],
    });
    expect(mocked.renderThumbnailImage).toHaveBeenCalledOnce();
  });
});
