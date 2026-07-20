import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";

const clone = (value) =>
  value === undefined ? undefined : structuredClone(value);

const createHarness = ({
  projectInfo: initialProjectInfo,
  platformDetails: initialPlatformDetails = {},
  legacyPlatformDetails: initialLegacyPlatformDetails = {},
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
  const platformDetails = {
    web: clone(initialPlatformDetails.web),
    windows: clone(initialPlatformDetails.windows),
    macos: clone(initialPlatformDetails.macos),
  };
  const legacyPlatformDetails = {
    web: clone(initialLegacyPlatformDetails.web),
    windows: clone(initialLegacyPlatformDetails.windows),
    macos: clone(initialLegacyPlatformDetails.macos),
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
        if (key === "platformDetails.web") {
          return clone(platformDetails.web);
        }
        if (key === "platformDetails.windows") {
          return clone(platformDetails.windows);
        }
        if (key === "platformDetails.macos") {
          return clone(platformDetails.macos);
        }
        if (key === "releaseInfo.web") {
          return clone(legacyPlatformDetails.web);
        }
        if (key === "releaseInfo.windows") {
          return clone(legacyPlatformDetails.windows);
        }
        if (key === "releaseInfo.macos") {
          return clone(legacyPlatformDetails.macos);
        }
        return undefined;
      }),
      set: vi.fn(async (key, value) => {
        if (key === "projectInfo") {
          projectInfo = clone(value);
        }
        if (key === "platformDetails.web") {
          platformDetails.web = clone(value);
        }
        if (key === "platformDetails.windows") {
          platformDetails.windows = clone(value);
        }
        if (key === "platformDetails.macos") {
          platformDetails.macos = clone(value);
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
    getPlatformDetails: (platform) => clone(platformDetails[platform]),
    service,
    store,
  };
};

describe("projectRepositoryService platform details", () => {
  it("starts empty and explicitly creates each platform once", async () => {
    const harness = createHarness();

    await expect(
      harness.service.getCurrentPlatformDetails("web"),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.getCurrentPlatformDetails("windows"),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.getCurrentPlatformDetails("macos"),
    ).resolves.toBeUndefined();
    await expect(
      harness.service.updateCurrentPlatformDetails("web", {
        applicationName: "Web Project",
      }),
    ).rejects.toThrow("do not exist");
    await expect(
      harness.service.getCurrentPlatformDetailsDefaults("web"),
    ).resolves.toEqual({
      applicationName: "Project One",
      applicationIdentifier: "",
      iconFileId: "project-icon-1",
      shortName: "",
      description: "",
      themeColorId: "",
      backgroundColorId: "",
    });
    await expect(
      harness.service.getCurrentPlatformDetailsDefaults("macos"),
    ).resolves.toMatchObject({
      applicationIdentifier: "",
    });
    expect(harness.getPlatformDetails("web")).toBeUndefined();

    await expect(
      harness.service.createCurrentPlatformDetails("web", {
        applicationName: "Web Release",
        shortName: "Release",
      }),
    ).resolves.toEqual({
      applicationName: "Web Release",
      applicationIdentifier: "",
      iconFileId: "project-icon-1",
      shortName: "Release",
      description: "",
      themeColorId: "",
      backgroundColorId: "",
    });
    await expect(
      harness.service.createCurrentPlatformDetails("windows"),
    ).resolves.toEqual({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
      applicationIdentifier: "",
      publisher: "",
      description: "",
      copyright: "",
    });
    await expect(
      harness.service.createCurrentPlatformDetails("macos"),
    ).resolves.toEqual({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
      applicationIdentifier: "",
      publisher: "",
      description: "",
      copyright: "",
      category: "",
    });
    await expect(
      harness.service.createCurrentPlatformDetails("web"),
    ).rejects.toThrow("already exist");

    await harness.service.updateCurrentProjectInfo({
      name: "Project Two",
      iconFileId: "project-icon-2",
    });

    expect(harness.getPlatformDetails("web")).toMatchObject({
      applicationName: "Web Release",
      iconFileId: "project-icon-1",
    });
    expect(harness.getPlatformDetails("windows")).toMatchObject({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
    });
    expect(harness.getPlatformDetails("macos")).toMatchObject({
      applicationName: "Project One",
      iconFileId: "project-icon-1",
    });
    expect(harness.store.app.get).not.toHaveBeenCalledWith("platformDetails");
    expect(harness.store.app.set).not.toHaveBeenCalledWith(
      "platformDetails",
      expect.anything(),
    );
  });

  it("migrates preview storage keys into the platform details namespace", async () => {
    const harness = createHarness({
      legacyPlatformDetails: {
        web: {
          applicationName: "Web Project",
          iconFileId: "web-icon-1",
          shortName: "Project",
          description: "Web description",
          themeColorId: "theme-color-1",
          backgroundColorId: "background-color-1",
        },
      },
    });

    await expect(
      harness.service.getCurrentPlatformDetails("web"),
    ).resolves.toMatchObject({
      applicationName: "Web Project",
      iconFileId: "web-icon-1",
      shortName: "Project",
    });
    expect(harness.getPlatformDetails("web")).toMatchObject({
      applicationName: "Web Project",
      applicationIdentifier: "namespace-1",
      iconFileId: "web-icon-1",
      shortName: "Project",
    });
    expect(harness.store.app.set).toHaveBeenCalledWith(
      "platformDetails.web",
      expect.objectContaining({
        applicationName: "Web Project",
        applicationIdentifier: "namespace-1",
      }),
    );
  });

  it("preserves and updates the editable Web application identifier", async () => {
    const harness = createHarness({
      platformDetails: {
        web: {
          applicationName: "Web Project",
          applicationIdentifier: "com.example.web-project",
          iconFileId: "web-icon-1",
          shortName: "Project",
          description: "Web release",
          themeColorId: "",
          backgroundColorId: "",
        },
      },
    });

    await expect(
      harness.service.getCurrentPlatformDetails("web"),
    ).resolves.toMatchObject({
      applicationIdentifier: "com.example.web-project",
    });

    await harness.service.updateCurrentPlatformDetails("web", {
      applicationIdentifier: "com.example.web-project-two",
    });
    expect(harness.getPlatformDetails("web")).toMatchObject({
      applicationIdentifier: "com.example.web-project-two",
    });
  });

  it("preserves and updates the editable macOS application identifier", async () => {
    const harness = createHarness({
      platformDetails: {
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
      harness.service.getCurrentPlatformDetails("macos"),
    ).resolves.toMatchObject({
      applicationIdentifier: "com.changed.mac-project",
    });
    expect(harness.getPlatformDetails("macos")).toMatchObject({
      applicationIdentifier: "com.changed.mac-project",
    });

    await harness.service.updateCurrentPlatformDetails("macos", {
      applicationIdentifier: "com.another.changed-identity",
      description: "Updated Mac release",
    });
    expect(harness.getPlatformDetails("macos")).toMatchObject({
      applicationIdentifier: "com.another.changed-identity",
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
      harness.service.createCurrentPlatformDetails("web"),
      harness.service.createCurrentPlatformDetails("windows"),
      harness.service.createCurrentPlatformDetails("macos"),
    ]);

    await harness.service.updateCurrentProjectInfo({
      iconFileId: "project-icon-1",
    });
    expect(harness.getPlatformDetails("web").iconFileId).toBe(
      "project-icon-1",
    );
    expect(harness.getPlatformDetails("windows").iconFileId).toBe(
      "project-icon-1",
    );
    expect(harness.getPlatformDetails("macos").iconFileId).toBe(
      "project-icon-1",
    );

    await harness.service.updateCurrentPlatformDetails("windows", {
      iconFileId: "windows-icon-1",
    });
    await harness.service.updateCurrentPlatformDetails("macos", {
      iconFileId: null,
    });
    await harness.service.updateCurrentProjectInfo({
      iconFileId: "project-icon-2",
    });

    expect(harness.getProjectInfo().iconFileId).toBe("project-icon-2");
    expect(harness.getPlatformDetails("web").iconFileId).toBe(
      "project-icon-1",
    );
    expect(harness.getPlatformDetails("windows").iconFileId).toBe(
      "windows-icon-1",
    );
    expect(harness.getPlatformDetails("macos").iconFileId).toBe(
      "project-icon-2",
    );
  });

  it("updates platform release keys independently", async () => {
    const harness = createHarness();
    await Promise.all([
      harness.service.createCurrentPlatformDetails("web"),
      harness.service.createCurrentPlatformDetails("windows"),
      harness.service.createCurrentPlatformDetails("macos"),
    ]);

    await harness.service.updateCurrentPlatformDetails("web", {
      themeColorId: "color-theme",
      backgroundColorId: "color-background",
    });

    await harness.service.updateCurrentPlatformDetails("windows", {
      applicationName: "Windows Project",
      iconFileId: "windows-icon-1",
      applicationIdentifier: "com.example.windows-project",
      publisher: "Example Publisher",
      description: "Windows description",
      copyright: "Copyright Example Publisher",
    });

    expect(harness.getPlatformDetails("windows")).toEqual({
      applicationName: "Windows Project",
      iconFileId: "windows-icon-1",
      applicationIdentifier: "com.example.windows-project",
      publisher: "Example Publisher",
      description: "Windows description",
      copyright: "Copyright Example Publisher",
    });
    expect(harness.getPlatformDetails("web").applicationName).toBe(
      "Project One",
    );
    expect(harness.getPlatformDetails("web")).toMatchObject({
      themeColorId: "color-theme",
      backgroundColorId: "color-background",
    });
    expect(harness.getPlatformDetails("macos").applicationName).toBe(
      "Project One",
    );
  });
});
