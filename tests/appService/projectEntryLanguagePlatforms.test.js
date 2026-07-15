import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  androidBridge: vi.fn(),
  iosBridge: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  join: vi.fn(),
}));

vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  callAndroidBridge: mocked.androidBridge,
}));

vi.mock("../../src/deps/clients/ios/bridge.js", () => ({
  callIOSBridge: mocked.iosBridge,
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  readDir: mocked.readDir,
  exists: mocked.exists,
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: mocked.join,
}));

vi.mock("@tauri-apps/api/core", () => ({
  convertFileSrc: vi.fn((path) => path),
  invoke: vi.fn(),
}));

import { createAppService as createDesktopAppService } from "../../src/deps/services/appService.js";
import { createAppService as createAndroidAppService } from "../../src/deps/services/android/appService.js";
import { createAppService as createIOSAppService } from "../../src/deps/services/ios/appService.js";
import { createAppService as createWebAppService } from "../../src/deps/services/web/appService.js";

const createDb = () => {
  const values = new Map([["projectEntries", []]]);

  return {
    get: vi.fn(async (key) => structuredClone(values.get(key))),
    set: vi.fn(async (key, value) => {
      values.set(key, structuredClone(value));
    }),
  };
};

const createProjectService = () => ({
  initializeProject: vi.fn(async () => {}),
  storeFileForProject: vi.fn(),
  updateProjectInfoByPath: vi.fn(async () => {}),
});

const createParams = ({ db, projectService }) => ({
  db,
  router: {
    getPayload: () => ({}),
  },
  globalUI: {},
  filePicker: {},
  openUrl: vi.fn(),
  appVersion: "test",
  platform: "test",
  distribution: "test",
  updatesEnabled: false,
  projectService,
  subject: {},
});

describe("project-entry language platform propagation", () => {
  beforeEach(() => {
    mocked.androidBridge.mockReset();
    mocked.iosBridge.mockReset();
    mocked.readDir.mockReset();
    mocked.exists.mockReset();
    mocked.join.mockReset();
    mocked.readDir.mockResolvedValue([]);
    mocked.exists.mockResolvedValue(true);
    mocked.join.mockImplementation(async (...parts) => parts.join("/"));
  });

  it.each([
    ["web", createWebAppService, {}],
    ["desktop", createDesktopAppService, { projectPath: "/projects/sample" }],
    ["android", createAndroidAppService, {}],
    ["ios", createIOSAppService, {}],
  ])(
    "stores language when creating a project on %s",
    async (_, createAppService, platformFields) => {
      const db = createDb();
      const projectService = createProjectService();
      const appService = createAppService(createParams({ db, projectService }));

      const project = await appService.createNewProject({
        name: "Sample Project",
        description: "Sample description",
        language: "ja",
        template: "blank",
        projectResolution: { width: 1920, height: 1080 },
        ...platformFields,
      });

      expect(project.language).toBe("ja");
      await expect(db.get("projectEntries")).resolves.toEqual([
        expect.objectContaining({
          id: project.id,
          language: "ja",
        }),
      ]);
      expect(projectService.initializeProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectInfo: expect.objectContaining({ language: "ja" }),
        }),
      );
    },
  );

  it("keeps language when importing a desktop project", async () => {
    const db = createDb();
    const projectService = {
      ...createProjectService(),
      getProjectInfoByPath: vi.fn(async () => ({
        id: "project-1",
        name: "Sample Project",
        description: "Sample description",
        language: "zh-hans",
        iconFileId: null,
      })),
    };
    const appService = createDesktopAppService(
      createParams({ db, projectService }),
    );

    const project = await appService.openExistingProject(
      "/imports/sample-project",
    );

    expect(project.language).toBe("zh-hans");
    await expect(db.get("projectEntries")).resolves.toEqual([
      expect.objectContaining({ language: "zh-hans" }),
    ]);
  });

  it.each([
    ["android", createAndroidAppService, mocked.androidBridge],
    ["ios", createIOSAppService, mocked.iosBridge],
  ])(
    "keeps language when discovering %s projects",
    async (_, createAppService, bridge) => {
      bridge.mockResolvedValue([
        {
          id: "project-1",
          name: "Sample Project",
          description: "Sample description",
          language: "zh-hans",
          iconFileId: null,
        },
      ]);
      if (createAppService === createAndroidAppService) {
        bridge.mockReturnValue([
          {
            id: "project-1",
            name: "Sample Project",
            description: "Sample description",
            language: "zh-hans",
            iconFileId: null,
          },
        ]);
      }
      const db = createDb();
      const appService = createAppService(
        createParams({ db, projectService: createProjectService() }),
      );

      const projects = await appService.loadAllProjects();

      expect(projects).toEqual([
        expect.objectContaining({
          id: "project-1",
          language: "zh-hans",
        }),
      ]);
      await expect(db.get("projectEntries")).resolves.toEqual([
        expect.objectContaining({ language: "zh-hans" }),
      ]);
    },
  );
});
