import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  repositoryService: {
    getEnsuredProjectId: vi.fn(() => "project-1"),
    subscribeSkippedDrafts: vi.fn(),
  },
}));

vi.mock("../../src/deps/services/shared/projectRepositoryService.js", () => ({
  createProjectRepositoryService: vi.fn(() => mocked.repositoryService),
}));

vi.mock("../../src/deps/services/shared/projectCollabCore.js", () => ({
  createProjectCollabCore: vi.fn(() => ({ commandApi: {} })),
}));

vi.mock("../../src/deps/services/shared/projectAssetService.js", () => ({
  createProjectAssetService: vi.fn(() => ({})),
}));

vi.mock("../../src/deps/services/shared/projectExportService.js", () => ({
  createProjectExportService: vi.fn(() => ({})),
}));

import { createProjectServiceCore } from "../../src/deps/services/shared/projectServiceCore.js";

describe("projectServiceCore subscribeSkippedDrafts", () => {
  it("passes the left-out drafts of the open project with its id", () => {
    const unsubscribe = vi.fn();
    mocked.repositoryService.subscribeSkippedDrafts.mockReturnValue(
      unsubscribe,
    );
    const projectService = createProjectServiceCore({
      router: { getPayload: () => ({ p: "project-1" }) },
      db: {},
      filePicker: {},
      idGenerator: () => "generated-id",
      collabLog: () => {},
      creatorVersion: 1,
      storageAdapter: {},
      fileAdapter: {},
      collabAdapter: {},
    });
    const listener = vi.fn();
    const skippedDrafts = [
      {
        draftId: "draft-1",
        type: "scene.update",
        sceneId: "scene-1",
        sectionId: undefined,
        error: { code: "validation_failed", message: "Invalid local draft" },
      },
    ];

    expect(
      projectService.subscribeSkippedDrafts(listener, {
        projectId: "project-1",
      }),
    ).toBe(unsubscribe);
    const [repositoryListener, options] =
      mocked.repositoryService.subscribeSkippedDrafts.mock.calls[0];
    expect(options).toEqual({ projectId: "project-1" });

    repositoryListener(skippedDrafts);

    expect(listener).toHaveBeenCalledWith({
      projectId: "project-1",
      skippedDrafts,
    });
  });
});
