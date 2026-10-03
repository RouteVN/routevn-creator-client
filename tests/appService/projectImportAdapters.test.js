import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  androidBridge: vi.fn(),
  iosBridge: vi.fn(),
  invoke: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  join: vi.fn(),
}));

vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  NO_BRIDGE_TIMEOUT: Number.POSITIVE_INFINITY,
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
  Channel: class {
    onmessage = () => {};
  },
  convertFileSrc: vi.fn((path) => path),
  invoke: mocked.invoke,
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
  getProjectInfoByPath: vi.fn(async () => ({
    id: "project-one",
    name: "Project One",
    description: "",
    language: "en",
    iconFileId: null,
  })),
});

const createParams = ({ db, projectService, filePicker }) => ({
  appActivity: {
    isActive: () => true,
    subscribeActive: (listener) => {
      listener(true);
      return () => {};
    },
  },
  db,
  router: {
    getPayload: () => ({}),
  },
  globalUI: {},
  filePicker: filePicker ?? {},
  openUrl: vi.fn(),
  appVersion: "test",
  platform: "test",
  distribution: "test",
  updatesEnabled: false,
  projectService,
  subject: {},
});

beforeEach(() => {
  vi.stubGlobal("window", {});
  mocked.androidBridge.mockReset();
  mocked.iosBridge.mockReset();
  mocked.invoke.mockReset();
  mocked.readDir.mockReset();
  mocked.exists.mockReset();
  mocked.join.mockReset();
  mocked.readDir.mockResolvedValue([]);
  mocked.exists.mockResolvedValue(true);
  mocked.join.mockImplementation(async (...parts) => parts.join("/"));
  mocked.invoke.mockResolvedValue({ renamed: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("desktop project import adapters", () => {
  it("normalizes file names before validating a picked folder", async () => {
    const db = createDb();
    const projectService = createProjectService();
    const appService = createDesktopAppService(
      createParams({ db, projectService }),
    );
    const invokeCalls = [];
    mocked.invoke.mockImplementation(async (command, payload) => {
      invokeCalls.push({ command, payload });
      return { renamed: 0 };
    });

    await appService.openExistingProject("/projects/project-one");

    expect(invokeCalls[0]).toEqual({
      command: "normalize_project_file_names",
      payload: { projectPath: "/projects/project-one" },
    });
    const entries = await db.get("projectEntries");
    expect(entries[0].projectPath).toBe("/projects/project-one");
  });

  it("surfaces normalize failures with the stable error code", async () => {
    const appService = createDesktopAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );
    mocked.invoke.mockRejectedValue(
      new Error("fileNameConflict: abc.png and abc.jpg both map to abc"),
    );

    await expect(
      appService.openExistingProject("/projects/project-one"),
    ).rejects.toThrow("fileNameConflict: abc.png and abc.jpg both map to abc");
  });

  it("downloads the archive into the destination parent and registers the result", async () => {
    const db = createDb();
    const appService = createDesktopAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    const commands = [];
    mocked.invoke.mockImplementation(async (command, payload) => {
      commands.push({ command, payload });
      if (command === "download_project_archive") {
        return { projectPath: "/projects/parent/project-one" };
      }
      return { renamed: 0 };
    });

    const project = await appService.importProjectFromUrl({
      url: "https://example.com/project-one.zip",
      destinationFolder: "/projects/parent",
    });

    expect(commands[0]).toEqual({
      command: "download_project_archive",
      payload: {
        url: "https://example.com/project-one.zip",
        destinationParent: "/projects/parent",
        onProgress: expect.any(Object),
      },
    });
    expect(commands[1]).toEqual({
      command: "normalize_project_file_names",
      payload: { projectPath: "/projects/parent/project-one" },
    });
    expect(project.projectPath).toBe("/projects/parent/project-one");
    const entries = await db.get("projectEntries");
    expect(entries[0].projectPath).toBe("/projects/parent/project-one");
  });

  it("forwards channel events and reports finishing before registering", async () => {
    const appService = createDesktopAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );
    mocked.invoke.mockImplementation(async (command, payload) => {
      if (command === "download_project_archive") {
        payload.onProgress.onmessage({
          stage: "downloading",
          current: 5,
          total: 10,
        });
        payload.onProgress.onmessage({
          stage: "extracting",
          current: 1,
          total: 2,
        });
        return { projectPath: "/projects/parent/project-one" };
      }
      return { renamed: 0 };
    });
    const events = [];

    await appService.importProjectFromUrl({
      url: "https://example.com/project-one.zip",
      destinationFolder: "/projects/parent",
      onProgress: (event) => events.push(event),
    });

    expect(events).toEqual([
      { stage: "downloading", current: 5, total: 10 },
      { stage: "extracting", current: 1, total: 2 },
      { stage: "finishing", current: 0, total: 0 },
    ]);
  });

  it("works without a progress callback", async () => {
    const appService = createDesktopAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );
    mocked.invoke.mockImplementation(async (command, payload) => {
      if (command === "download_project_archive") {
        payload.onProgress.onmessage({
          stage: "downloading",
          current: 1,
          total: 2,
        });
        return { projectPath: "/projects/parent/project-one" };
      }
      return { renamed: 0 };
    });

    await expect(
      appService.importProjectFromUrl({
        url: "https://example.com/project-one.zip",
        destinationFolder: "/projects/parent",
      }),
    ).resolves.toBeDefined();
  });

  it("rejects an invalid import URL before invoking native code", async () => {
    const appService = createDesktopAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );

    await expect(
      appService.importProjectFromUrl({
        url: "http://example.com/project-one.zip",
        destinationFolder: "/projects/parent",
      }),
    ).rejects.toThrow(/^invalidUrl: /);
    expect(mocked.invoke).not.toHaveBeenCalled();
  });

  it("rejects a missing destination folder", async () => {
    const appService = createDesktopAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );

    await expect(
      appService.importProjectFromUrl({
        url: "https://example.com/project-one.zip",
      }),
    ).rejects.toThrow(/^importFailed: /);
    expect(mocked.invoke).not.toHaveBeenCalled();
  });

  it("does not support archive pickers on desktop", async () => {
    const appService = createDesktopAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );

    await expect(appService.openArchivePicker()).rejects.toThrow(
      /not supported/,
    );
    await expect(appService.importProjectFromArchive()).rejects.toThrow(
      /not supported/,
    );
  });
});

describe("android project import adapters", () => {
  const importPayload = () => ({
    id: "imported-id",
    name: "Project One",
    description: "",
    language: "en",
    iconFileId: null,
  });

  it("imports a picked zip archive and registers the project entry", async () => {
    const db = createDb();
    const appService = createAndroidAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    mocked.androidBridge.mockImplementation(async (method, payload) => {
      if (method === "importProjectArchive") {
        return { ...importPayload(), id: payload.projectId };
      }
      throw new Error(`Unexpected Android bridge method: ${method}`);
    });

    const project = await appService.importProjectFromArchive({
      uri: "content://archives/project-one.zip",
    });

    expect(mocked.androidBridge).toHaveBeenCalledWith(
      "importProjectArchive",
      {
        uri: "content://archives/project-one.zip",
        projectId: project.id,
      },
      { timeoutMs: Number.POSITIVE_INFINITY },
    );
    expect(project.name).toBe("Project One");
    const entries = await db.get("projectEntries");
    expect(entries[0].id).toBe(project.id);
    expect(entries[0].name).toBe("Project One");
  });

  it("downloads from a URL through the bridge and registers the entry", async () => {
    const db = createDb();
    const appService = createAndroidAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    mocked.androidBridge.mockImplementation(async (method, payload) => {
      if (method === "importProjectArchiveFromUrl") {
        return { ...importPayload(), id: payload.projectId };
      }
      throw new Error(`Unexpected Android bridge method: ${method}`);
    });

    const project = await appService.importProjectFromUrl({
      url: "https://example.com/project-one.zip",
    });

    expect(mocked.androidBridge).toHaveBeenCalledWith(
      "importProjectArchiveFromUrl",
      {
        url: "https://example.com/project-one.zip",
        projectId: project.id,
      },
      { timeoutMs: Number.POSITIVE_INFINITY },
    );
    const entries = await db.get("projectEntries");
    expect(entries[0].id).toBe(project.id);
  });

  it("forwards native progress for its own project id only", async () => {
    const appService = createAndroidAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );
    mocked.androidBridge.mockImplementation(async (method, payload) => {
      window.__routeVNAndroidProjectImportProgress({
        projectId: "someone-else",
        stage: "downloading",
        current: 1,
        total: 9,
      });
      window.__routeVNAndroidProjectImportProgress({
        projectId: payload.projectId,
        stage: "downloading",
        current: 5,
        total: 10,
      });
      window.__routeVNAndroidProjectImportProgress({
        projectId: payload.projectId,
        stage: "extracting",
        current: 2,
        total: 4,
      });
      return { ...importPayload(), id: payload.projectId };
    });
    const events = [];

    await appService.importProjectFromUrl({
      url: "https://example.com/project-one.zip",
      onProgress: (event) => events.push(event),
    });

    expect(events).toEqual([
      { stage: "downloading", current: 5, total: 10 },
      { stage: "extracting", current: 2, total: 4 },
    ]);
  });

  it("stops listening once the archive import settles", async () => {
    const appService = createAndroidAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );
    let importedId;
    mocked.androidBridge.mockImplementation(async (method, payload) => {
      importedId = payload.projectId;
      return { ...importPayload(), id: payload.projectId };
    });
    const onProgress = vi.fn();

    await appService.importProjectFromArchive({
      uri: "content://archives/project-one.zip",
      onProgress,
    });
    window.__routeVNAndroidProjectImportProgress({
      projectId: importedId,
      stage: "extracting",
      current: 1,
      total: 2,
    });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("stops listening when the bridge call fails", async () => {
    const appService = createAndroidAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );
    let failedId;
    mocked.androidBridge.mockImplementation(async (method, payload) => {
      failedId = payload.projectId;
      throw new Error("downloadFailed: HTTP 500");
    });
    const onProgress = vi.fn();

    await expect(
      appService.importProjectFromUrl({
        url: "https://example.com/project-one.zip",
        onProgress,
      }),
    ).rejects.toThrow("downloadFailed: HTTP 500");
    window.__routeVNAndroidProjectImportProgress({
      projectId: failedId,
      stage: "downloading",
      current: 1,
      total: 2,
    });

    expect(onProgress).not.toHaveBeenCalled();
  });

  it("rejects an invalid URL before calling the bridge", async () => {
    const appService = createAndroidAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );

    await expect(
      appService.importProjectFromUrl({ url: "ftp://example.com/a.zip" }),
    ).rejects.toThrow(/^invalidUrl: /);
    expect(mocked.androidBridge).not.toHaveBeenCalled();
  });

  it("delegates the archive picker to the file picker client", async () => {
    const filePicker = {
      openArchivePicker: vi.fn(async () => ({
        uri: "content://archives/project-one.zip",
        name: "project-one.zip",
      })),
    };
    const appService = createAndroidAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
        filePicker,
      }),
    );

    await expect(
      appService.openArchivePicker({ title: "Select Project Zip File" }),
    ).resolves.toEqual({
      uri: "content://archives/project-one.zip",
      name: "project-one.zip",
    });
    expect(filePicker.openArchivePicker).toHaveBeenCalledWith({
      title: "Select Project Zip File",
    });
  });

  it("maps a cancelled archive picker to undefined", async () => {
    const filePicker = {
      openArchivePicker: vi.fn(async () => null),
    };
    const appService = createAndroidAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
        filePicker,
      }),
    );

    await expect(appService.openArchivePicker()).resolves.toBeUndefined();
  });

  it("fails when the imported identity does not match", async () => {
    const appService = createAndroidAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );
    mocked.androidBridge.mockImplementation(async (method) => {
      if (method === "importProjectArchive") {
        return { ...importPayload(), id: "different-id" };
      }
      throw new Error(`Unexpected Android bridge method: ${method}`);
    });

    await expect(
      appService.importProjectFromArchive({
        uri: "content://archives/project-one.zip",
      }),
    ).rejects.toThrow(/^importFailed: /);
    const entries = await createDb().get("projectEntries");
    expect(entries).toEqual([]);
  });
});

describe("ios project import adapters", () => {
  const importPayload = () => ({
    id: "project-one",
    projectFilePath: "/projects/project-one/project.db",
    name: "Project One",
    description: "",
    language: "en",
    iconFileId: null,
  });

  it("imports a picked zip archive and registers the project entry", async () => {
    const db = createDb();
    const appService = createIOSAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    mocked.iosBridge.mockImplementation(async (method) => {
      if (method === "importProjectArchive") {
        return importPayload();
      }
      throw new Error(`Unexpected iOS bridge method: ${method}`);
    });

    const project = await appService.importProjectFromArchive({
      uri: "file:///tmp/project-one.zip",
    });

    expect(mocked.iosBridge).toHaveBeenCalledWith("importProjectArchive", {
      uri: "file:///tmp/project-one.zip",
    });
    expect(project.name).toBe("Project One");
    const entries = await db.get("projectEntries");
    expect(entries[0].id).toBe("project-one");
    expect(entries[0].name).toBe("Project One");
  });

  it("downloads from a URL through the bridge and registers the entry", async () => {
    const db = createDb();
    const appService = createIOSAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    mocked.iosBridge.mockImplementation(async (method, payload) => {
      if (method === "importProjectArchiveFromUrl") {
        expect(payload.url).toBe("https://example.com/project-one.zip");
        return importPayload();
      }
      throw new Error(`Unexpected iOS bridge method: ${method}`);
    });

    const project = await appService.importProjectFromUrl({
      url: "https://example.com/project-one.zip",
    });

    expect(project.id).toBe("project-one");
    const entries = await db.get("projectEntries");
    expect(entries[0].id).toBe("project-one");
  });

  it.each([
    [
      "URL",
      "importProjectArchiveFromUrl",
      (appService, onProgress) =>
        appService.importProjectFromUrl({
          url: "https://example.com/project-one.zip",
          onProgress,
        }),
    ],
    [
      "archive",
      "importProjectArchive",
      (appService, onProgress) =>
        appService.importProjectFromArchive({
          uri: "file:///tmp/project-one.zip",
          onProgress,
        }),
    ],
  ])(
    "forwards native progress for a %s import",
    async (_label, method, run) => {
      const appService = createIOSAppService(
        createParams({
          db: createDb(),
          projectService: createProjectService(),
        }),
      );
      mocked.iosBridge.mockImplementation(async (calledMethod) => {
        expect(calledMethod).toBe(method);
        window.__routeVNIOSProjectImportProgress({
          stage: "downloading",
          current: 3,
          total: 6,
        });
        window.__routeVNIOSProjectImportProgress({
          stage: "finishing",
          current: 0,
          total: 0,
        });
        return importPayload();
      });
      const events = [];
      const onProgress = (event) => events.push(event);

      await run(appService, onProgress);
      window.__routeVNIOSProjectImportProgress({
        stage: "extracting",
        current: 1,
        total: 2,
      });

      expect(events).toEqual([
        { stage: "downloading", current: 3, total: 6 },
        { stage: "finishing", current: 0, total: 0 },
      ]);
    },
  );

  describe("a project that is already in the library", () => {
    const existingEntry = {
      id: "project-one",
      projectFilePath: "/projects/project-one/project.db",
      name: "Existing Name",
      description: "Existing description",
      language: "en",
      iconFileId: null,
      createdAt: 111,
      lastOpenedAt: 222,
    };

    const incoming = () => ({
      ...importPayload(),
      name: "Incoming Name",
      description: "Incoming description",
      alreadyImported: true,
    });

    const createExistingSetup = async ({ removed = [] } = {}) => {
      const db = createDb();
      await db.set("projectEntries", [existingEntry]);
      await db.set("iosRemovedProjectIds", removed);
      const appService = createIOSAppService(
        createParams({ db, projectService: createProjectService() }),
      );
      return { db, appService };
    };

    it.each([
      [
        "archive",
        "importProjectArchive",
        (appService) =>
          appService.importProjectFromArchive({
            uri: "file:///tmp/project-one.zip",
          }),
      ],
      [
        "URL",
        "importProjectArchiveFromUrl",
        (appService) =>
          appService.importProjectFromUrl({
            url: "https://example.com/project-one.zip",
          }),
      ],
    ])(
      "rejects a listed project from a %s import without touching its entry",
      async (_label, method, run) => {
        const { db, appService } = await createExistingSetup();
        db.set.mockClear();
        mocked.iosBridge.mockImplementation(async (calledMethod) => {
          expect(calledMethod).toBe(method);
          return incoming();
        });

        await expect(run(appService)).rejects.toThrow(/^projectExists: /);

        expect(await db.get("projectEntries")).toEqual([existingEntry]);
        expect(await db.get("iosRemovedProjectIds")).toEqual([]);
        expect(db.set).not.toHaveBeenCalled();
      },
    );

    it("restores a hidden project instead of rejecting it, keeping its entry dates", async () => {
      const { db, appService } = await createExistingSetup({
        removed: ["project-one"],
      });
      mocked.iosBridge.mockImplementation(async () => ({
        ...importPayload(),
        name: "Existing Name",
        alreadyImported: true,
      }));

      const project = await appService.importProjectFromArchive({
        uri: "file:///tmp/project-one.zip",
      });

      expect(project.id).toBe("project-one");
      expect(await db.get("iosRemovedProjectIds")).toEqual([]);
      const entries = await db.get("projectEntries");
      expect(entries).toHaveLength(1);
      expect(entries[0]).toMatchObject({
        id: "project-one",
        name: "Existing Name",
        createdAt: 111,
        lastOpenedAt: 222,
      });
    });

    it("still imports a project that is not in the library yet", async () => {
      const db = createDb();
      const appService = createIOSAppService(
        createParams({ db, projectService: createProjectService() }),
      );
      mocked.iosBridge.mockImplementation(async () => ({
        ...importPayload(),
        alreadyImported: false,
      }));

      const project = await appService.importProjectFromArchive({
        uri: "file:///tmp/project-one.zip",
      });

      expect(project.name).toBe("Project One");
      expect((await db.get("projectEntries"))[0].id).toBe("project-one");
    });
  });

  it("restores a previously removed project when it is imported again", async () => {
    const db = createDb();
    await db.set("iosRemovedProjectIds", ["project-one"]);
    const appService = createIOSAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    mocked.iosBridge.mockImplementation(async (method) => {
      if (method === "importProjectArchive") {
        return importPayload();
      }
      throw new Error(`Unexpected iOS bridge method: ${method}`);
    });

    await appService.importProjectFromArchive({
      uri: "file:///tmp/project-one.zip",
    });

    expect(await db.get("iosRemovedProjectIds")).toEqual([]);
  });

  it("delegates the archive picker to the file picker client", async () => {
    const filePicker = {
      openArchivePicker: vi.fn(async () => ({
        uri: "file:///tmp/project-one.zip",
        name: "project-one.zip",
      })),
    };
    const appService = createIOSAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
        filePicker,
      }),
    );

    await expect(
      appService.openArchivePicker({ title: "Select Project Zip File" }),
    ).resolves.toEqual({
      uri: "file:///tmp/project-one.zip",
      name: "project-one.zip",
    });
  });
});

describe("web project import adapters", () => {
  it("does not support archive or URL imports", async () => {
    const appService = createWebAppService(
      createParams({
        db: createDb(),
        projectService: createProjectService(),
      }),
    );

    await expect(appService.openArchivePicker()).rejects.toThrow(
      /not supported/,
    );
    await expect(appService.importProjectFromArchive()).rejects.toThrow(
      /not supported/,
    );
    await expect(appService.importProjectFromUrl()).rejects.toThrow(
      /not supported/,
    );
  });
});
