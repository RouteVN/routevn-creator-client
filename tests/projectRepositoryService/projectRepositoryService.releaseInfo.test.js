import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";

const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);

const createHarness = ({
  projectInfo: initialProjectInfo,
  platformReleaseInfo: initialPlatformReleaseInfo = {},
} = {}) => {
  let projectInfo = clone(
    initialProjectInfo ?? {
      id: "project-1",
      namespace: "namespace-1",
      nativeApplicationIdentifier: "vn.routevn.player.project-one",
      name: "Project One",
      description: "Project description",
      language: "en",
      iconFileId: "project-icon-1",
    },
  );
  const platformReleaseInfo = {
    web: clone(initialPlatformReleaseInfo.web),
    windows: clone(initialPlatformReleaseInfo.windows),
    macos: clone(initialPlatformReleaseInfo.macos),
  };

  const store = {
    app: {
      get: vi.fn(async (key) => {
        if (key === "creatorVersion") {
          return 1;
        }
        if (key === "projectInfo") {
          return clone(projectInfo);
        }
        if (key === "releaseInfo.web") {
          return clone(platformReleaseInfo.web);
        }
        if (key === "releaseInfo.windows") {
          return clone(platformReleaseInfo.windows);
        }
        if (key === "releaseInfo.macos") {
          return clone(platformReleaseInfo.macos);
        }
        return undefined;
      }),
      set: vi.fn(async (key, value) => {
        if (key === "projectInfo") {
          projectInfo = clone(value);
        }
        if (key === "releaseInfo.web") {
          platformReleaseInfo.web = clone(value);
        }
        if (key === "releaseInfo.windows") {
          platformReleaseInfo.windows = clone(value);
        }
        if (key === "releaseInfo.macos") {
          platformReleaseInfo.macos = clone(value);
        }
      }),
    },
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
    db: {
      get: vi.fn(async () => []),
      set: vi.fn(async () => undefined),
    },
    creatorVersion: 1,
    storageAdapter,
    collabAdapter: {
      beforeCreateRepository: async () => undefined,
      afterCreateRepository: async () => undefined,
    },
  });

  return {
    getProjectInfo: () => clone(projectInfo),
    getPlatformReleaseInfo: (platform) => clone(platformReleaseInfo[platform]),
    service,
    store,
  };
};

describe("projectRepositoryService release info", () => {
  it("starts empty and explicitly creates each platform once", async () => {
    const harness = createHarness();

    await expect(
      harness.service.getCurrentPlatformReleaseInfo("web"),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.getCurrentPlatformReleaseInfo("windows"),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.getCurrentPlatformReleaseInfo("macos"),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.updateCurrentPlatformReleaseInfo("web", {
        applicationName: "Web Project",
      }),
    ).rejects.toThrow("does not exist");
    await expect(
      harness.service.getCurrentPlatformReleaseInfoDefaults("web"),
    ).resolves.toEqual({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
      shortName: "",
      description: "",
      themeColorId: "",
      backgroundColorId: "",
    });
    await expect(
      harness.service.getCurrentPlatformReleaseInfoDefaults("macos"),
    ).resolves.toMatchObject({
      applicationIdentifier: "vn.routevn.player.project-one",
    });
    expect(harness.getPlatformReleaseInfo("web")).toBeUndefined();

    await expect(
      harness.service.createCurrentPlatformReleaseInfo("web", {
        applicationName: "Web Release",
        shortName: "Release",
      }),
    ).resolves.toEqual({
      applicationName: "Web Release",
      iconFileId: "project-icon-1",
      shortName: "Release",
      description: "",
      themeColorId: "",
      backgroundColorId: "",
    });
    await expect(
      harness.service.createCurrentPlatformReleaseInfo("windows"),
    ).resolves.toEqual({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
      applicationIdentifier: "",
      publisher: "",
      description: "",
      copyright: "",
    });
    await expect(
      harness.service.createCurrentPlatformReleaseInfo("macos"),
    ).resolves.toEqual({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
      applicationIdentifier: "vn.routevn.player.project-one",
      publisher: "",
      description: "",
      copyright: "",
      category: "",
    });
    await expect(
      harness.service.createCurrentPlatformReleaseInfo("web"),
    ).rejects.toThrow("already exists");

    await harness.service.updateCurrentProjectInfo({
      name: "Project Two",
      iconFileId: "project-icon-2",
    });

    expect(harness.getPlatformReleaseInfo("web")).toMatchObject({
      applicationName: "Web Release",
      iconFileId: "project-icon-1",
    });
    expect(harness.getPlatformReleaseInfo("windows")).toMatchObject({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
    });
    expect(harness.getPlatformReleaseInfo("macos")).toMatchObject({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
    });
    expect(harness.store.app.get).not.toHaveBeenCalledWith("releaseInfo");
    expect(harness.store.app.set).not.toHaveBeenCalledWith(
      "releaseInfo",
      expect.anything(),
    );
  });

  it("migrates and locks macOS release info to the stable project identity", async () => {
    const harness = createHarness({
      platformReleaseInfo: {
        macos: {
          applicationName: "Mac Project",
          iconFileId: "mac-icon-1",
          applicationIdentifier: "com.changed.mac-project",
          publisher: "Studio One",
          description: "Mac release",
          copyright: "Copyright Studio One",
          category: "public.app-category.games",
        },
      },
    });

    await expect(
      harness.service.getCurrentPlatformReleaseInfo("macos"),
    ).resolves.toMatchObject({
      applicationIdentifier: "vn.routevn.player.project-one",
    });
    expect(harness.getPlatformReleaseInfo("macos")).toMatchObject({
      applicationIdentifier: "vn.routevn.player.project-one",
    });

    await harness.service.updateCurrentPlatformReleaseInfo("macos", {
      applicationIdentifier: "com.another.changed-identity",
      description: "Updated Mac release",
    });
    expect(harness.getPlatformReleaseInfo("macos")).toMatchObject({
      applicationIdentifier: "vn.routevn.player.project-one",
      description: "Updated Mac release",
    });
  });

  it("fills empty platform icons from the next project icon upload only", async () => {
    const harness = createHarness({
      projectInfo: {
        id: "project-1",
        namespace: "namespace-1",
        nativeApplicationIdentifier: "vn.routevn.player.project-one",
        name: "Project One",
        description: "Project description",
        language: "en",
        iconFileId: null,
      },
    });

    await Promise.all([
      harness.service.createCurrentPlatformReleaseInfo("web"),
      harness.service.createCurrentPlatformReleaseInfo("windows"),
      harness.service.createCurrentPlatformReleaseInfo("macos"),
    ]);

    await harness.service.updateCurrentProjectInfo({
      iconFileId: "project-icon-1",
    });
    expect(harness.getPlatformReleaseInfo("web").iconFileId).toBe(
      "project-icon-1",
    );
    expect(harness.getPlatformReleaseInfo("windows").iconFileId).toBe(
      "project-icon-1",
    );
    expect(harness.getPlatformReleaseInfo("macos").iconFileId).toBe(
      "project-icon-1",
    );

    await harness.service.updateCurrentPlatformReleaseInfo("windows", {
      iconFileId: "windows-icon-1",
    });
    await harness.service.updateCurrentPlatformReleaseInfo("macos", {
      iconFileId: null,
    });
    await harness.service.updateCurrentProjectInfo({
      iconFileId: "project-icon-2",
    });

    expect(harness.getProjectInfo().iconFileId).toBe("project-icon-2");
    expect(harness.getPlatformReleaseInfo("web").iconFileId).toBe(
      "project-icon-1",
    );
    expect(harness.getPlatformReleaseInfo("windows").iconFileId).toBe(
      "windows-icon-1",
    );
    expect(harness.getPlatformReleaseInfo("macos").iconFileId).toBe(
      "project-icon-2",
    );
  });

  it("updates platform release keys independently", async () => {
    const harness = createHarness();
    await Promise.all([
      harness.service.createCurrentPlatformReleaseInfo("web"),
      harness.service.createCurrentPlatformReleaseInfo("windows"),
      harness.service.createCurrentPlatformReleaseInfo("macos"),
    ]);

    await harness.service.updateCurrentPlatformReleaseInfo("web", {
      themeColorId: "color-theme",
      backgroundColorId: "color-background",
    });

    await harness.service.updateCurrentPlatformReleaseInfo("windows", {
      applicationName: "Windows Project",
      iconFileId: "windows-icon-1",
      applicationIdentifier: "com.example.windows-project",
      publisher: "Example Publisher",
      description: "Windows description",
      copyright: "Copyright Example Publisher",
    });

    expect(harness.getPlatformReleaseInfo("windows")).toEqual({
      applicationName: "Windows Project",
      iconFileId: "windows-icon-1",
      applicationIdentifier: "com.example.windows-project",
      publisher: "Example Publisher",
      description: "Windows description",
      copyright: "Copyright Example Publisher",
    });
    expect(harness.getPlatformReleaseInfo("web").applicationName).toBe(
      "Project One",
    );
    expect(harness.getPlatformReleaseInfo("web")).toMatchObject({
      themeColorId: "color-theme",
      backgroundColorId: "color-background",
    });
    expect(harness.getPlatformReleaseInfo("macos").applicationName).toBe(
      "Project One",
    );
  });
});
