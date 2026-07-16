import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";

const noopCollabAdapter = {
  beforeCreateRepository: async () => undefined,
  afterCreateRepository: async () => undefined,
};

describe("projectRepositoryService project-info cache sync", () => {
  it("syncs a project language edit to the global project entry", async () => {
    let projectInfo = {
      id: "project-1",
      namespace: "namespace-1",
      nativeApplicationIdentifier: "vn.routevn.player.sample",
      name: "Sample Project",
      description: "Sample description",
      language: "en",
      iconFileId: "icon-1",
    };
    const projectEntries = [
      {
        id: "project-1",
        projectPath: "/projects/sample-project",
        name: "Sample Project",
        description: "Sample description",
        language: "en",
        iconFileId: "icon-1",
        createdAt: 100,
        lastOpenedAt: 200,
      },
    ];
    const appSet = vi.fn(async (key, value) => {
      if (key === "projectInfo") {
        projectInfo = structuredClone(value);
      }
    });
    const store = {
      app: {
        get: vi.fn(async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }
          if (key === "projectInfo") {
            return structuredClone(projectInfo);
          }
          return undefined;
        }),
        set: appSet,
      },
    };
    const db = {
      get: vi.fn(async (key) => {
        if (key === "projectEntries") {
          return structuredClone(projectEntries);
        }
        return undefined;
      }),
      set: vi.fn(async () => {}),
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/projects/${projectId}`,
        cacheKey: `/projects/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({ p: "project-1" }),
      },
      db,
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const updatedProjectInfo = await service.updateCurrentProjectInfo({
      language: "ja",
    });

    expect(updatedProjectInfo.language).toBe("ja");
    expect(appSet).toHaveBeenCalledWith(
      "projectInfo",
      expect.objectContaining({ language: "ja" }),
    );
    expect(db.set).toHaveBeenCalledWith("projectEntries", [
      {
        ...projectEntries[0],
        language: "ja",
      },
    ]);
  });
});
