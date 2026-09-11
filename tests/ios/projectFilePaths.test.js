import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Subject from "../../src/deps/subject.js";
import { createAppService } from "../../src/deps/services/ios/appService.js";
import { createAppServiceCore } from "../../src/deps/services/shared/appServiceCore.js";

const { callIOSBridge } = vi.hoisted(() => ({ callIOSBridge: vi.fn() }));
vi.mock("../../src/deps/clients/ios/bridge.js", () => ({ callIOSBridge }));

let dom;
beforeEach(() => {
  dom = new JSDOM("<!doctype html><body></body>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  callIOSBridge.mockReset();
});
afterEach(() => {
  dom.window.close();
  vi.unstubAllGlobals();
});

const createService = (entries = [], projectService) => {
  const values = new Map([["projectEntries", entries]]);
  const db = {
    get: async (key) => structuredClone(values.get(key)),
    set: async (key, value) => values.set(key, structuredClone(value)),
  };
  return createAppService({
    db,
    router: { getPayload: () => ({}) },
    subject: new Subject(),
    globalUI: { showToast: vi.fn() },
    platform: "ios",
    projectService,
  });
};

describe("iOS project file paths", () => {
  it.each(["iPhone", "iPad"])(
    "uses native %s identification for project paths, creation previews and exports",
    async (deviceName) => {
      const service = createService();
      callIOSBridge.mockResolvedValue({ configured: false, deviceName });
      await service.initializeProjectFolderSetup();
      const root =
        "/private/Containers/Shared/AppGroup/example/File Provider Storage/My Projects";
      expect(service.getFileDisplayPath(`${root}/Project One/project.db`)).toBe(
        `On My ${deviceName} / My Projects / Project One / project.db`,
      );
      expect(
        service.getFileDisplayPath(
          `file://${root.replaceAll(" ", "%20")}/Project%20One_v1.zip`,
        ),
      ).toBe(`On My ${deviceName} / My Projects / Project One_v1.zip`);
      callIOSBridge.mockResolvedValue({
        folderName: "Project One",
        folderPath: `${root}/Project One`,
      });
      expect(
        await service.previewNewProjectLocation({ name: "Project One" }),
      ).toEqual({
        folderName: "Project One",
        displayPath: `On My ${deviceName} / My Projects / Project One`,
      });
    },
  );

  it.each([
    [
      "file:///private/var/mobile/Containers/Shared/AppGroup/example/File%20Provider%20Storage/RouteVN%20Projects/Project%20One_Version%201%20(2).zip",
      "On My iPhone / RouteVN Projects / Project One_Version 1 (2).zip",
    ],
    [
      "file:///private/var/mobile/Library/Mobile%20Documents/com~apple~CloudDocs/Exports/Project%20One_v1.zip",
      "iCloud Drive / Exports / Project One_v1.zip",
    ],
    [
      "file:///private/provider/example/Exports/%E7%89%A9%E8%AA%9E_100%25%20%2520.zip",
      "Exports / 物語_100% %20.zip",
    ],
    ["/selected/Exports/100%20.zip", "Exports / 100%20.zip"],
  ])(
    "formats saved file %s without changing the filename",
    (path, displayPath) => {
      expect(createService().getFileDisplayPath(path)).toBe(displayPath);
    },
  );

  it("keeps desktop file paths unchanged without an iOS adapter", () => {
    const service = createAppServiceCore({
      router: { getPayload: () => ({}) },
      subject: new Subject(),
    });
    const path = "/Users/author/Downloads/Project One_Version 1.zip";
    expect(service.getFileDisplayPath(path)).toBe(path);
  });

  it("previews the native sanitized destination as a readable folder path", async () => {
    callIOSBridge.mockResolvedValue({
      folderName: "Project-One (2)",
      folderPath:
        "/private/Containers/Shared/AppGroup/example/File Provider Storage/RouteVN Projects/Project-One (2)",
    });
    const preview = await createService().previewNewProjectLocation({
      name: "Project/One",
    });
    expect(callIOSBridge).toHaveBeenCalledWith("previewNewProjectLocation", {
      name: "Project/One",
    });
    expect(preview).toEqual({
      folderName: "Project-One (2)",
      displayPath: "On My iPhone / RouteVN Projects / Project-One (2)",
    });
  });

  it("uses the current native database location instead of a cached container path", async () => {
    const project = {
      id: "project-1",
      name: "Project One",
      language: "en",
      projectFilePath: "/selected/RouteVN Projects/Project One/project.db",
    };
    const service = createService([
      { ...project, projectFilePath: "/old/project.db" },
    ]);
    callIOSBridge.mockResolvedValue([project]);

    const projects = await service.loadAllProjects();
    expect(callIOSBridge).toHaveBeenCalledWith("listProjectFolders");
    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject(project);
    // The display path must not become the project identity used for opening
    // or deleting; iOS storage continues to address projects by id.
    expect(projects[0].projectPath).toBeUndefined();
    expect(projects[0].id).toBe("project-1");
  });

  it("removes cached internal projects from the listing", async () => {
    const service = createService([
      {
        id: "project-1",
        name: "Project One",
        language: "en",
        projectFilePath:
          "/old/Library/Application Support/RouteVN Creator/databases/projects/project-1/project.db",
      },
    ]);
    callIOSBridge.mockResolvedValue([]);

    expect(await service.loadAllProjects()).toEqual([]);
    expect(await service.getProjectEntries()).toEqual([]);
  });

  it("fails when the selected folder cannot be read instead of showing cached projects", async () => {
    const service = createService([
      { id: "project-1", name: "Project One", language: "en" },
    ]);
    callIOSBridge.mockRejectedValue(new Error("Folder unavailable"));

    await expect(service.loadAllProjects()).rejects.toThrow(
      "Folder unavailable",
    );
  });

  it("returns the file path immediately after creating a project", async () => {
    const projectService = { initializeProject: vi.fn(async () => {}) };
    const filePath = "/selected/RouteVN Projects/project-1/project.db";
    callIOSBridge.mockResolvedValue({
      exists: true,
      projectFilePath: filePath,
    });
    const project = await createService([], projectService).createNewProject({
      name: "Project One",
      description: "",
      language: "en",
      template: "default",
      projectResolution: { width: 1920, height: 1080 },
    });
    expect(projectService.initializeProject).toHaveBeenCalledOnce();
    expect(callIOSBridge).toHaveBeenCalledWith("getProjectStorageStatus", {
      projectId: project.id,
    });
    expect(project.projectFilePath).toBe(filePath);
    expect(project.projectPath).toBeUndefined();
  });

  it("continues listing projects on an older shell that has no file-path field", async () => {
    callIOSBridge.mockResolvedValue([
      { id: "project-1", name: "Project One", language: "en" },
    ]);
    const projects = await createService().loadAllProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("Project One");
    expect(projects[0].projectFilePath).toBeUndefined();
  });
});
