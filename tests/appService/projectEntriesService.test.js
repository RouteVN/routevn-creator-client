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
    projectService = {},
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
  it("replaces an existing local project entry when the same project id is re-added from a new path", async () => {
    const { service } = createService([
      {
        id: "project-1",
        projectPath: "/old/DiaLune-migrated",
        name: "DiaLune",
        description: "old description",
        iconFileId: "icon-old",
        createdAt: 100,
        lastOpenedAt: 200,
      },
    ]);

    const entries = await service.addProjectEntry({
      id: "project-1",
      projectPath: "/new/DiaLune-migrated",
      name: "DiaLune",
      description: "new description",
      iconFileId: "icon-new",
      createdAt: 300,
      lastOpenedAt: null,
    });

    expect(entries).toEqual([
      {
        id: "project-1",
        projectPath: "/new/DiaLune-migrated",
        name: "DiaLune",
        description: "new description",
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
        projectPath: "/projects/DiaLune-migrated",
        name: "DiaLune",
      },
    ]);

    await expect(
      service.addProjectEntry({
        id: "project-2",
        projectPath: "/projects/DiaLune-migrated",
        name: "Another Project",
      }),
    ).rejects.toThrow("This project has already been added.");
  });

  it("repairs missing local project ids from the project path on load", async () => {
    const getProjectInfoByPath = vi.fn(async (projectPath) => ({
      id: "project-1",
      name: "DiaLune",
      description: "Recovered",
      iconFileId: "icon-1",
      projectPath,
    }));
    const { db, service } = createService(
      [
        {
          id: "",
          projectPath: "/projects/DiaLune-migrated",
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
        name: "DiaLune",
        description: "Recovered",
        iconFileId: "icon-1",
        projectPath: "/projects/DiaLune-migrated",
      }),
    ]);
    expect(db.set).toHaveBeenCalledWith("projectEntries", [
      {
        id: "project-1",
        projectPath: "/projects/DiaLune-migrated",
        name: "DiaLune",
        description: "Recovered",
        iconFileId: "icon-1",
      },
    ]);
  });

  it("removes a stale local project entry by path when its id is missing", async () => {
    const { service } = createService([
      {
        id: "",
        projectPath: "/projects/DiaLune-migrated",
        name: "Broken DiaLune",
      },
    ]);

    const entries = await service.removeProjectEntryByPath(
      "/projects/DiaLune-migrated",
    );

    expect(entries).toEqual([]);
  });
});
