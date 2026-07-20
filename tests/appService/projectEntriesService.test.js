import { describe, expect, it, vi } from "vitest";
import { createProjectEntriesService } from "../../src/deps/services/shared/projectEntriesService.js";

const createDb = (initialEntries = []) => {
  let entries = structuredClone(initialEntries);

  return {
    get: vi.fn(async (key) => {
      if (key !== "projectEntries") {
        return undefined;
      }

      return structuredClone(entries);
    }),
    set: vi.fn(async (key, value) => {
      if (key === "projectEntries") {
        entries = structuredClone(value);
      }
    }),
  };
};

const createService = (
  initialEntries = [],
  {
    projectService = {
      getProjectInfoByPath: vi.fn(async () => {
        throw new Error("unexpected getProjectInfoByPath call");
      }),
    },
    platformAdapter = {
      isDuplicateProjectEntry: ({ entries, entry }) => {
        return entries.some(
          (project) => project?.projectPath === entry?.projectPath,
        );
      },
      mapProjectEntryToProject: (entry) => ({
        projectPath: entry?.projectPath,
      }),
    },
  } = {},
) => {
  const db = createDb(initialEntries);
  const service = createProjectEntriesService({
    db,
    getCurrentProjectId: () => "",
    projectService,
    platformAdapter,
  });

  return { db, service };
};

describe("projectEntriesService", () => {
  it("caches the settled project list in memory after the first load", async () => {
    const { service } = createService([
      {
        id: "project-1",
        projectPath: "/projects/project-one",
        name: "Project One",
        description: "",
        language: "en",
        iconFileId: null,
      },
    ]);

    expect(service.getCachedProjects()).toBeUndefined();

    const projects = await service.loadAllProjects();
    projects[0].name = "Changed outside the cache";

    expect(service.getCachedProjects()).toEqual([
      expect.objectContaining({
        id: "project-1",
        name: "Project One",
        projectPath: "/projects/project-one",
      }),
    ]);
  });

  it("keeps the in-memory project list aligned with entry updates", async () => {
    const { service } = createService([
      {
        id: "project-1",
        projectPath: "/projects/project-one",
        name: "Project One",
        description: "",
        language: "en",
        iconFileId: null,
      },
    ]);
    await service.loadAllProjects();

    await service.updateProjectEntry("project-1", {
      name: "Project One Updated",
    });

    expect(service.getCachedProjects()).toEqual([
      expect.objectContaining({
        id: "project-1",
        name: "Project One Updated",
      }),
    ]);
  });

  it("updates project metadata caches without writing the source database again", async () => {
    const cleanupIcon = vi.fn();
    const { db, service } = createService(
      [
        {
          id: "project-1",
          projectPath: "/projects/project-one",
          name: "Project One",
          description: "Description",
          language: "en",
          iconFileId: "icon-1",
        },
      ],
      {
        platformAdapter: {
          isDuplicateProjectEntry: ({ entries, entry }) => {
            return entries.some(
              (project) => project?.projectPath === entry?.projectPath,
            );
          },
          mapProjectEntryToProject: (entry) => ({
            projectPath: entry?.projectPath,
          }),
          loadProjectIcon: vi.fn(async () => ({
            url: "blob:icon-1",
            cleanup: cleanupIcon,
          })),
        },
      },
    );
    await service.loadAllProjects();
    service.setCurrentProjectEntry({ id: "project-1", source: "local" });
    db.set.mockClear();

    service.updateCachedProject("project-1", {
      name: "Project One Updated",
      description: "Updated description",
      language: "zh-Hans",
      iconFileId: "icon-2",
    });

    expect(service.getCachedProjects()).toEqual([
      expect.objectContaining({
        id: "project-1",
        name: "Project One Updated",
        description: "Updated description",
        language: "zh-Hans",
        iconFileId: "icon-2",
      }),
    ]);
    expect(service.getCachedProjects()[0]).not.toHaveProperty("iconUrl");
    expect(service.getCurrentProjectEntry()).toEqual(
      expect.objectContaining({
        id: "project-1",
        name: "Project One Updated",
        language: "zh-Hans",
        iconFileId: "icon-2",
      }),
    );
    expect(cleanupIcon).toHaveBeenCalledTimes(1);
    expect(db.set).not.toHaveBeenCalled();
  });

  it("replaces an existing local project entry when the same project id is re-added from a new path", async () => {
    const { service } = createService([
      {
        id: "project-1",
        projectPath: "/old/project-two-migrated",
        name: "Project Two",
        description: "old description",
        language: "en",
        iconFileId: "icon-old",
        createdAt: 100,
        lastOpenedAt: 200,
      },
    ]);

    const entries = await service.addProjectEntry({
      id: "project-1",
      projectPath: "/new/project-two-migrated",
      name: "Project Two",
      description: "new description",
      language: "ja",
      iconFileId: "icon-new",
      createdAt: 300,
      lastOpenedAt: null,
    });

    expect(entries).toEqual([
      {
        id: "project-1",
        projectPath: "/new/project-two-migrated",
        name: "Project Two",
        description: "new description",
        language: "ja",
        iconFileId: "icon-new",
        createdAt: 100,
        lastOpenedAt: 200,
      },
    ]);
  });

  it("still rejects adding a different project on an already imported path", async () => {
    const { service } = createService([
      {
        id: "project-1",
        projectPath: "/projects/project-two-migrated",
        name: "Project Two",
      },
    ]);

    await expect(
      service.addProjectEntry({
        id: "project-2",
        projectPath: "/projects/project-two-migrated",
        name: "Another Project",
      }),
    ).rejects.toThrow("This project has already been added.");
  });

  it("repairs missing local project ids from the project path on load", async () => {
    const getProjectInfoByPath = vi.fn(async (projectPath) => ({
      id: "project-1",
      name: "Project Two",
      description: "Recovered",
      language: "ja",
      iconFileId: "icon-1",
      projectPath,
    }));
    const { db, service } = createService(
      [
        {
          id: "",
          projectPath: "/projects/project-two-migrated",
          name: "",
          description: "",
          iconFileId: null,
        },
      ],
      {
        projectService: {
          getProjectInfoByPath,
        },
      },
    );

    const projects = await service.loadAllProjects();

    expect(projects).toEqual([
      expect.objectContaining({
        id: "project-1",
        name: "Project Two",
        description: "Recovered",
        language: "ja",
        iconFileId: "icon-1",
        projectPath: "/projects/project-two-migrated",
      }),
    ]);
    expect(db.set).toHaveBeenCalledWith("projectEntries", [
      {
        id: "project-1",
        projectPath: "/projects/project-two-migrated",
        name: "Project Two",
        description: "Recovered",
        language: "ja",
        iconFileId: "icon-1",
      },
    ]);
  });

  it("preserves the working path when duplicate repaired entries merge by project id", async () => {
    const getProjectInfoByPath = vi.fn(async () => ({
      id: "project-1",
      name: "Project Two",
      description: "Recovered",
      language: "zh-Hans",
      iconFileId: "icon-1",
    }));
    const { db, service } = createService(
      [
        {
          id: "project-1",
          projectPath: "/projects/working",
          name: "Project Two",
          description: "Working",
          iconFileId: "icon-working",
        },
        {
          id: "",
          projectPath: "/projects/stale",
          name: "",
          description: "",
          iconFileId: null,
        },
      ],
      {
        projectService: {
          getProjectInfoByPath,
        },
      },
    );

    const projects = await service.loadAllProjects();

    expect(projects).toEqual([
      expect.objectContaining({
        id: "project-1",
        projectPath: "/projects/working",
      }),
    ]);
    expect(db.set).toHaveBeenCalledWith("projectEntries", [
      {
        id: "project-1",
        projectPath: "/projects/working",
        name: "Project Two",
        description: "Recovered",
        language: "zh-Hans",
        iconFileId: "icon-1",
      },
    ]);
  });

  it("normalizes legacy cached project languages when loading projects", async () => {
    const { db, service } = createService([
      {
        id: "project-1",
        projectPath: "/projects/sample-project",
        name: "Sample Project",
        description: "",
        iconFileId: null,
        createdAt: 100,
        lastOpenedAt: null,
      },
    ]);

    const projects = await service.loadAllProjects();

    expect(projects).toEqual([
      expect.objectContaining({
        id: "project-1",
        language: "en",
      }),
    ]);
    expect(db.set).toHaveBeenCalledWith("projectEntries", [
      {
        id: "project-1",
        projectPath: "/projects/sample-project",
        name: "Sample Project",
        description: "",
        language: "en",
        iconFileId: null,
        createdAt: 100,
        lastOpenedAt: null,
      },
    ]);
  });

  it("removes a stale local project entry by path when its id is missing", async () => {
    const { service } = createService([
      {
        id: "",
        projectPath: "/projects/project-two-migrated",
        name: "Broken Project Two",
      },
    ]);

    const entries = await service.removeProjectEntryByPath(
      "/projects/project-two-migrated",
    );

    expect(entries).toEqual([]);
  });
});
