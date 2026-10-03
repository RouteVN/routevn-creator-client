import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  androidBridge: vi.fn(),
  iosBridge: vi.fn(),
  invoke: vi.fn(),
  readDir: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
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
  mkdir: mocked.mkdir,
  remove: mocked.remove,
  rename: mocked.rename,
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
  mocked.mkdir.mockReset();
  mocked.remove.mockReset();
  mocked.rename.mockReset();
  mocked.join.mockReset();
  mocked.readDir.mockResolvedValue([]);
  mocked.exists.mockResolvedValue(true);
  mocked.join.mockImplementation(async (...parts) => parts.join("/"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const GIB = 1024 ** 3;

// What a typical project zip holds: a wrapper folder, an asset with an
// extension, one without, a metadata file, and macOS junk that is ignored.
const PROJECT_ZIP_ENTRIES = [
  { name: "Project One/project.db", size: 100, isDirectory: false },
  { name: "Project One/files/", size: 0, isDirectory: true },
  { name: "Project One/files/abc.png", size: 10, isDirectory: false },
  { name: "Project One/files/def", size: 5, isDirectory: false },
  { name: "Project One/file-metadata/abc.mime", size: 3, isDirectory: false },
  { name: "__MACOSX/Project One/._project.db", size: 1, isDirectory: false },
];

// The files the plan extracts: Rule A already applied to `files/`.
const PLANNED_FILES = [
  { entry: "Project One/project.db", path: "project.db" },
  { entry: "Project One/files/abc.png", path: "files/abc" },
  { entry: "Project One/files/def", path: "files/def" },
  {
    entry: "Project One/file-metadata/abc.mime",
    path: "file-metadata/abc.mime",
  },
];

const file = (name) => ({
  name,
  isFile: true,
  isDirectory: false,
  isSymlink: false,
});
const directory = (name) => ({
  name,
  isFile: false,
  isDirectory: true,
  isSymlink: false,
});
const link = (name) => ({
  name,
  isFile: false,
  isDirectory: false,
  isSymlink: true,
});

describe("desktop project import adapters", () => {
  const mockDirectories = (directories) => {
    mocked.readDir.mockImplementation(async (path) => directories[path] ?? []);
  };

  const mockNative = ({
    entries = PROJECT_ZIP_ENTRIES,
    serverSendsFileName = true,
    failOn,
  } = {}) => {
    const contentDisposition = serverSendsFileName
      ? 'attachment; filename="Project One.zip"'
      : undefined;
    const calls = [];
    mocked.invoke.mockImplementation(async (command, payload) => {
      calls.push({ command, payload });
      if (command === failOn) {
        throw new Error("downloadFailed: HTTP 500");
      }
      if (command === "download_file") {
        payload.onProgress.onmessage({ current: 0, total: 10 });
        payload.onProgress.onmessage({ current: 10, total: 10 });
        return {
          finalUrl: "https://example.com/files/project-one.zip",
          contentDisposition,
          bytes: 10,
        };
      }
      if (command === "list_archive") {
        return { entries };
      }
      if (command === "extract_archive") {
        payload.onProgress.onmessage({ current: 5, total: 18 });
        return { files: PLANNED_FILES.length, bytes: 18 };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    return calls;
  };

  // Free except for the folders in `taken`; validating a project folder
  // finds its project.db and files.
  const mockFreeNames = (taken = []) => {
    mocked.exists.mockImplementation(
      async (path) =>
        taken.includes(path) ||
        path.endsWith("/project.db") ||
        path.endsWith("/files"),
    );
  };

  const createService = ({ db = createDb(), projectService } = {}) =>
    createDesktopAppService(
      createParams({
        db,
        projectService: projectService ?? createProjectService(),
      }),
    );

  describe("a picked folder", () => {
    it("renames files to their file ids before validating the folder", async () => {
      const db = createDb();
      mockDirectories({
        "/projects/project-one": [directory("files"), file("project.db")],
        "/projects/project-one/files": [file("abc.png"), file("def")],
      });

      await createService({ db }).openExistingProject("/projects/project-one");

      expect(mocked.rename).toHaveBeenCalledTimes(1);
      expect(mocked.rename).toHaveBeenCalledWith(
        "/projects/project-one/files/abc.png",
        "/projects/project-one/files/abc",
      );
      const entries = await db.get("projectEntries");
      expect(entries[0].projectPath).toBe("/projects/project-one");
    });

    it("renames nothing when two names would become the same id", async () => {
      mockDirectories({
        "/projects/project-one": [directory("files")],
        "/projects/project-one/files": [file("abc.png"), file("abc.jpg")],
      });

      await expect(
        createService().openExistingProject("/projects/project-one"),
      ).rejects.toThrow(/^fileNameConflict: /);
      expect(mocked.rename).not.toHaveBeenCalled();
    });

    it("refuses a name that cannot be a file id", async () => {
      mockDirectories({
        "/projects/project-one": [directory("files")],
        "/projects/project-one/files": [file("a b.png")],
      });

      await expect(
        createService().openExistingProject("/projects/project-one"),
      ).rejects.toThrow(/^invalidFileName: /);
      expect(mocked.rename).not.toHaveBeenCalled();
    });

    it("refuses a files folder that is a link", async () => {
      mockDirectories({
        "/projects/project-one": [link("files")],
        "/projects/project-one/files": [file("abc.png")],
      });

      await expect(
        createService().openExistingProject("/projects/project-one"),
      ).rejects.toThrow(/^importFailed: /);
      expect(mocked.rename).not.toHaveBeenCalled();
    });

    it("undoes the renames already made when one fails", async () => {
      mockDirectories({
        "/projects/project-one": [directory("files")],
        "/projects/project-one/files": [file("abc.png"), file("def.png")],
      });
      mocked.rename.mockImplementation(async (from) => {
        if (from.endsWith("def.png")) {
          throw new Error("permission denied");
        }
      });

      await expect(
        createService().openExistingProject("/projects/project-one"),
      ).rejects.toThrow(/^importFailed: /);

      expect(mocked.rename.mock.calls).toEqual([
        [
          "/projects/project-one/files/abc.png",
          "/projects/project-one/files/abc",
        ],
        [
          "/projects/project-one/files/def.png",
          "/projects/project-one/files/def",
        ],
        [
          "/projects/project-one/files/abc",
          "/projects/project-one/files/abc.png",
        ],
      ]);
    });

    it("leaves a project that needs no renames alone", async () => {
      mockDirectories({
        "/projects/project-one": [directory("files")],
        "/projects/project-one/files": [file("abc"), file(".DS_Store")],
      });

      await createService().openExistingProject("/projects/project-one");

      expect(mocked.rename).not.toHaveBeenCalled();
    });
  });

  describe("a URL", () => {
    const importFromUrl = (appService, extra = {}) =>
      appService.importProjectFromUrl({
        url: "https://example.com/files/project-one.zip",
        destinationFolder: "/projects/parent",
        ...extra,
      });

    it("downloads, extracts only the planned files and registers the moved folder", async () => {
      const db = createDb();
      const calls = mockNative();
      mockFreeNames();

      const project = await importFromUrl(createService({ db }));

      expect(calls.map((call) => call.command)).toEqual([
        "download_file",
        "list_archive",
        "extract_archive",
      ]);
      const stagingDir = mocked.mkdir.mock.calls[0][0];
      expect(stagingDir).toMatch(/^\/projects\/parent\/routevn-import-/);
      expect(calls[0].payload).toMatchObject({
        url: "https://example.com/files/project-one.zip",
        destination: `${stagingDir}/archive.zip`,
        maxBytes: 4 * GIB,
      });
      expect(calls[1].payload).toEqual({
        archive: `${stagingDir}/archive.zip`,
        maxEntries: 50_000,
      });
      expect(calls[2].payload).toMatchObject({
        archive: `${stagingDir}/archive.zip`,
        destination: `${stagingDir}/extracted`,
        files: PLANNED_FILES,
        maxBytes: 8 * GIB,
      });
      expect(mocked.rename).toHaveBeenCalledWith(
        `${stagingDir}/extracted`,
        "/projects/parent/Project One",
      );
      expect(mocked.remove).toHaveBeenCalledWith(stagingDir, {
        recursive: true,
      });
      expect(project.projectPath).toBe("/projects/parent/Project One");
      const entries = await db.get("projectEntries");
      expect(entries[0].projectPath).toBe("/projects/parent/Project One");
    });

    it("rewrites a Google Drive link before downloading", async () => {
      const calls = mockNative();
      mockFreeNames();

      await importFromUrl(createService(), {
        url: "https://drive.google.com/file/d/1HYPkPo6yHL_D_zeHVz0vTMHN9d58AgOc/view?usp=drive_link",
      });

      expect(calls[0].payload.url).toBe(
        "https://drive.usercontent.google.com/download?id=1HYPkPo6yHL_D_zeHVz0vTMHN9d58AgOc&export=download&confirm=t",
      );
    });

    it("names the folder from the URL when the server sends no filename", async () => {
      mockNative({ serverSendsFileName: false });
      mockFreeNames();

      const project = await importFromUrl(createService());

      expect(project.projectPath).toBe("/projects/parent/project-one");
    });

    it("picks the next free name instead of replacing a folder", async () => {
      mockNative();
      mockFreeNames([
        "/projects/parent/Project One",
        "/projects/parent/Project One 2",
      ]);

      const project = await importFromUrl(createService());

      expect(project.projectPath).toBe("/projects/parent/Project One 3");
    });

    it("reports downloading, extracting and finishing in order", async () => {
      mockNative();
      mockFreeNames();
      const events = [];

      await importFromUrl(createService(), {
        onProgress: (event) => events.push(event),
      });

      expect(events).toEqual([
        { stage: "downloading", current: 0, total: 10 },
        { stage: "downloading", current: 10, total: 10 },
        { stage: "extracting", current: 5, total: 18 },
        { stage: "finishing", current: 0, total: 0 },
      ]);
    });

    it("works without a progress callback", async () => {
      mockNative();
      mockFreeNames();

      await expect(importFromUrl(createService())).resolves.toBeDefined();
    });

    it("rejects an invalid URL before touching the disk", async () => {
      await expect(
        importFromUrl(createService(), {
          url: "http://example.com/project-one.zip",
        }),
      ).rejects.toThrow(/^invalidUrl: /);

      expect(mocked.invoke).not.toHaveBeenCalled();
      expect(mocked.mkdir).not.toHaveBeenCalled();
    });

    it("rejects a missing destination folder", async () => {
      await expect(
        importFromUrl(createService(), { destinationFolder: undefined }),
      ).rejects.toThrow(/^importFailed: /);

      expect(mocked.invoke).not.toHaveBeenCalled();
    });

    it("removes the staging folder when the download fails", async () => {
      mockNative({ failOn: "download_file" });

      await expect(importFromUrl(createService())).rejects.toThrow(
        "downloadFailed: HTTP 500",
      );

      expect(mocked.remove).toHaveBeenCalledWith(
        mocked.mkdir.mock.calls[0][0],
        { recursive: true },
      );
      expect(mocked.rename).not.toHaveBeenCalled();
    });

    it("rejects an archive without project.db before extracting", async () => {
      const calls = mockNative({
        entries: [{ name: "readme.txt", size: 3, isDirectory: false }],
      });

      await expect(importFromUrl(createService())).rejects.toThrow(
        /^invalidArchive: /,
      );

      expect(calls.map((call) => call.command)).not.toContain(
        "extract_archive",
      );
      expect(mocked.remove).toHaveBeenCalledTimes(1);
    });

    it("rejects an unsafe entry name before extracting", async () => {
      const calls = mockNative({
        entries: [
          { name: "project.db", size: 1, isDirectory: false },
          { name: "files/../escape", size: 1, isDirectory: false },
        ],
      });

      await expect(importFromUrl(createService())).rejects.toThrow(
        /^unsafeArchiveEntry: /,
      );

      expect(calls.map((call) => call.command)).not.toContain(
        "extract_archive",
      );
    });

    it("removes the moved folder when the project cannot be registered", async () => {
      mockNative();
      mockFreeNames();
      const projectService = {
        getProjectInfoByPath: vi.fn(async () => {
          throw new Error("file is not a database");
        }),
      };

      await expect(
        importFromUrl(createService({ projectService })),
      ).rejects.toThrow("file is not a database");

      expect(mocked.remove).toHaveBeenCalledWith(
        "/projects/parent/Project One",
        { recursive: true },
      );
    });
  });

  it("does not support archive pickers on desktop", async () => {
    const appService = createService();

    await expect(appService.openArchivePicker()).rejects.toThrow(
      /not supported/,
    );
    await expect(appService.importProjectFromArchive()).rejects.toThrow(
      /not supported/,
    );
  });
});

// Android and iOS speak the same import operations over their own bridges.
const describeMobileImport = ({
  label,
  bridge,
  createService,
  progressCallback,
  importPayload,
  finishPayload,
  finishOptions,
}) => {
  const createNative = ({
    entries = PROJECT_ZIP_ENTRIES,
    result,
    failOn,
    folders = {},
  } = {}) => {
    const calls = [];
    bridge.mockImplementation(async (method, payload, options) => {
      calls.push({ method, payload, options });
      if (method === failOn) {
        throw new Error("downloadFailed: HTTP 500");
      }
      switch (method) {
        case "createImportStaging":
          return { stagingId: "staging-one" };
        case "removeImportStaging":
          return {};
        case "downloadImportFile":
          window[progressCallback]({
            stagingId: "someone-else",
            current: 1,
            total: 9,
          });
          window[progressCallback]({
            stagingId: payload.stagingId,
            current: 0,
            total: 10,
          });
          window[progressCallback]({
            stagingId: payload.stagingId,
            current: 10,
            total: 10,
          });
          return {
            finalUrl: payload.url,
            contentDisposition: undefined,
            bytes: 10,
          };
        case "copyImportFile":
          return { bytes: 10 };
        case "listImportArchive":
          return { entries };
        case "extractImportArchive":
          window[progressCallback]({
            stagingId: payload.stagingId,
            current: 5,
            total: 18,
          });
          return { files: PLANNED_FILES.length, bytes: 18 };
        case "listImportDirectory":
          return { entries: folders[payload.path] ?? [] };
        case "importProjectFolder":
          return result ? result(payload) : finishPayload(payload);
        default:
          throw new Error(`Unexpected ${label} bridge method: ${method}`);
      }
    });
    return calls;
  };

  const methodsOf = (calls) => calls.map((call) => call.method);

  describe(`${label} project import adapters`, () => {
    it("imports a picked zip through staging and registers the project", async () => {
      const db = createDb();
      const calls = createNative();

      const project = await createService({ db }).importProjectFromArchive({
        uri: "content://archives/project-one.zip",
      });

      expect(methodsOf(calls)).toEqual([
        "createImportStaging",
        "copyImportFile",
        "listImportArchive",
        "extractImportArchive",
        "importProjectFolder",
        "removeImportStaging",
      ]);
      expect(calls[1].payload).toEqual({
        stagingId: "staging-one",
        uri: "content://archives/project-one.zip",
        path: "archive.zip",
        maxBytes: 4 * GIB,
      });
      expect(calls[3].payload).toEqual({
        stagingId: "staging-one",
        path: "archive.zip",
        destination: "extracted",
        files: PLANNED_FILES,
        maxBytes: 8 * GIB,
      });
      expect(calls[4].payload).toMatchObject({
        stagingId: "staging-one",
        path: "extracted",
      });
      expect(calls[5].payload).toEqual({ stagingId: "staging-one" });
      expect(project.name).toBe("Project One");
      expect((await db.get("projectEntries"))[0].name).toBe("Project One");
    });

    it("downloads from a URL through staging and registers the entry", async () => {
      const db = createDb();
      const calls = createNative();

      await createService({ db }).importProjectFromUrl({
        url: "https://example.com/project-one.zip",
      });

      expect(methodsOf(calls)).toEqual([
        "createImportStaging",
        "downloadImportFile",
        "listImportArchive",
        "extractImportArchive",
        "importProjectFolder",
        "removeImportStaging",
      ]);
      expect(calls[1].payload).toEqual({
        stagingId: "staging-one",
        url: "https://example.com/project-one.zip",
        path: "archive.zip",
        maxBytes: 4 * GIB,
      });
      expect(await db.get("projectEntries")).toHaveLength(1);
    });

    it("never times out the calls that move a lot of data", async () => {
      const calls = createNative();

      await createService().importProjectFromUrl({
        url: "https://example.com/project-one.zip",
      });

      const finish = calls.find(
        (call) => call.method === "importProjectFolder",
      );
      expect(finish.options).toEqual(finishOptions);
    });

    it("forwards progress for its own staging folder only", async () => {
      createNative();
      const events = [];

      await createService().importProjectFromUrl({
        url: "https://example.com/project-one.zip",
        onProgress: (event) => events.push(event),
      });

      expect(events).toEqual([
        { stage: "downloading", current: 0, total: 10 },
        { stage: "downloading", current: 10, total: 10 },
        { stage: "extracting", current: 5, total: 18 },
        { stage: "finishing", current: 0, total: 0 },
      ]);
    });

    it("stops listening once the import settles", async () => {
      createNative();
      const onProgress = vi.fn();

      await createService().importProjectFromUrl({
        url: "https://example.com/project-one.zip",
        onProgress,
      });
      onProgress.mockClear();
      window[progressCallback]({
        stagingId: "staging-one",
        current: 1,
        total: 2,
      });

      expect(onProgress).not.toHaveBeenCalled();
    });

    it("removes the staging folder and registers nothing when a step fails", async () => {
      const db = createDb();
      const calls = createNative({ failOn: "downloadImportFile" });
      const onProgress = vi.fn();

      await expect(
        createService({ db }).importProjectFromUrl({
          url: "https://example.com/project-one.zip",
          onProgress,
        }),
      ).rejects.toThrow("downloadFailed: HTTP 500");
      window[progressCallback]({
        stagingId: "staging-one",
        current: 1,
        total: 2,
      });

      expect(methodsOf(calls).at(-1)).toBe("removeImportStaging");
      expect(onProgress).not.toHaveBeenCalled();
      expect(await db.get("projectEntries")).toEqual([]);
    });

    it("rejects an invalid URL before calling the bridge", async () => {
      createNative();

      await expect(
        createService().importProjectFromUrl({
          url: "ftp://example.com/a.zip",
        }),
      ).rejects.toThrow(/^invalidUrl: /);
      expect(bridge).not.toHaveBeenCalled();
    });

    it("rejects a zip that is not a project before extracting anything", async () => {
      const calls = createNative({
        entries: [{ name: "notes.txt", size: 3, isDirectory: false }],
      });

      await expect(
        createService().importProjectFromArchive({
          uri: "content://archives/other.zip",
        }),
      ).rejects.toThrow(/^invalidArchive: /);

      expect(methodsOf(calls)).not.toContain("extractImportArchive");
      expect(methodsOf(calls).at(-1)).toBe("removeImportStaging");
    });

    it("does not fail the import when the staging cleanup fails", async () => {
      const calls = [];
      createNative();
      const implementation = bridge.getMockImplementation();
      bridge.mockImplementation(async (method, payload, options) => {
        calls.push(method);
        if (method === "removeImportStaging") {
          throw new Error("cannot delete");
        }
        return implementation(method, payload, options);
      });
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        createService().importProjectFromArchive({
          uri: "content://archives/project-one.zip",
        }),
      ).resolves.toBeDefined();
    });

    it("delegates the archive picker to the file picker client", async () => {
      const filePicker = {
        openArchivePicker: vi.fn(async () => ({
          uri: "content://archives/project-one.zip",
          name: "project-one.zip",
        })),
      };

      await expect(
        createService({ filePicker }).openArchivePicker({
          title: "Select Project Zip File",
        }),
      ).resolves.toEqual({
        uri: "content://archives/project-one.zip",
        name: "project-one.zip",
      });
      expect(filePicker.openArchivePicker).toHaveBeenCalledWith({
        title: "Select Project Zip File",
      });
    });

    it("maps a cancelled archive picker to undefined", async () => {
      const filePicker = { openArchivePicker: vi.fn(async () => null) };

      await expect(
        createService({ filePicker }).openArchivePicker(),
      ).resolves.toBeUndefined();
    });

    describe("a picked folder", () => {
      const folder = "content://tree/project-one";

      it("sends the renames Rule A needs and imports the folder", async () => {
        const calls = createNative({
          folders: {
            "": [
              { name: "project.db", kind: "file" },
              { name: "files", kind: "directory" },
            ],
            files: [
              { name: "abc.png", kind: "file" },
              { name: "def", kind: "file" },
            ],
          },
        });

        await createService().openExistingProject(folder);

        expect(
          calls
            .filter((call) => call.method === "listImportDirectory")
            .map((call) => call.payload),
        ).toEqual([
          { uri: folder, path: "" },
          { uri: folder, path: "files" },
        ]);
        const finish = calls.find(
          (call) => call.method === "importProjectFolder",
        );
        expect(finish.payload).toMatchObject({
          uri: folder,
          fileRenames: [{ from: "abc.png", to: "abc" }],
        });
      });

      it("imports nothing when two names would become the same id", async () => {
        const calls = createNative({
          folders: {
            "": [{ name: "files", kind: "directory" }],
            files: [
              { name: "abc.png", kind: "file" },
              { name: "ABC", kind: "file" },
            ],
          },
        });

        await expect(
          createService().openExistingProject(folder),
        ).rejects.toThrow(/^fileNameConflict: /);
        expect(methodsOf(calls)).not.toContain("importProjectFolder");
      });

      it("refuses a files folder that is a link", async () => {
        const calls = createNative({
          folders: { "": [{ name: "files", kind: "symlink" }] },
        });

        await expect(
          createService().openExistingProject(folder),
        ).rejects.toThrow(/^importFailed: /);
        expect(methodsOf(calls)).not.toContain("importProjectFolder");
      });
    });
  });
};

describeMobileImport({
  label: "android",
  bridge: mocked.androidBridge,
  progressCallback: "__routeVNAndroidProjectImportProgress",
  createService: ({ db = createDb(), projectService, filePicker } = {}) =>
    createAndroidAppService(
      createParams({
        db,
        projectService: projectService ?? createProjectService(),
        filePicker,
      }),
    ),
  importPayload: () => ({
    id: "imported-id",
    name: "Project One",
    description: "",
    language: "en",
    iconFileId: null,
  }),
  finishPayload: (payload) => ({
    id: payload.projectId,
    name: "Project One",
    description: "",
    language: "en",
    iconFileId: null,
  }),
  finishOptions: { timeoutMs: Number.POSITIVE_INFINITY },
});

describe("android project import identity", () => {
  it("fails and cleans up when the imported identity does not match", async () => {
    const db = createDb();
    const methods = [];
    mocked.androidBridge.mockImplementation(async (method, payload) => {
      methods.push(method);
      switch (method) {
        case "createImportStaging":
          return { stagingId: "staging-one" };
        case "copyImportFile":
          return { bytes: 1 };
        case "listImportArchive":
          return { entries: PROJECT_ZIP_ENTRIES };
        case "extractImportArchive":
          return { files: 4, bytes: 18 };
        case "removeImportStaging":
          return {};
        case "importProjectFolder":
          return { id: "different-id", name: "Project One" };
        default:
          throw new Error(`Unexpected Android bridge method: ${method}`);
      }
    });
    const appService = createAndroidAppService(
      createParams({ db, projectService: createProjectService() }),
    );

    await expect(
      appService.importProjectFromArchive({
        uri: "content://archives/project-one.zip",
      }),
    ).rejects.toThrow(/^importFailed: /);

    expect(methods.at(-1)).toBe("removeImportStaging");
    expect(await db.get("projectEntries")).toEqual([]);
  });
});

const iosImportPayload = () => ({
  id: "project-one",
  projectFilePath: "/projects/project-one/project.db",
  name: "Project One",
  description: "",
  language: "en",
  iconFileId: null,
});

describeMobileImport({
  label: "ios",
  bridge: mocked.iosBridge,
  progressCallback: "__routeVNIOSProjectImportProgress",
  createService: ({ db = createDb(), projectService, filePicker } = {}) =>
    createIOSAppService(
      createParams({
        db,
        projectService: projectService ?? createProjectService(),
        filePicker,
      }),
    ),
  importPayload: iosImportPayload,
  finishPayload: iosImportPayload,
  finishOptions: undefined,
});

describe("ios project import of a project that is already in the library", () => {
  const importPayload = iosImportPayload;
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

  // The staging steps succeed; `finish` answers the storage step.
  const mockStaging = (finish) => {
    mocked.iosBridge.mockImplementation(async (method, payload) => {
      switch (method) {
        case "createImportStaging":
          return { stagingId: "staging-one" };
        case "removeImportStaging":
          return {};
        case "downloadImportFile":
          return { finalUrl: payload.url, bytes: 1 };
        case "copyImportFile":
          return { bytes: 1 };
        case "listImportArchive":
          return { entries: PROJECT_ZIP_ENTRIES };
        case "extractImportArchive":
          return { files: 4, bytes: 18 };
        default:
          return finish(method, payload);
      }
    });
  };

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
      (appService) =>
        appService.importProjectFromArchive({
          uri: "file:///tmp/project-one.zip",
        }),
    ],
    [
      "URL",
      (appService) =>
        appService.importProjectFromUrl({
          url: "https://example.com/project-one.zip",
        }),
    ],
  ])(
    "rejects a listed project from a %s import without touching its entry",
    async (_label, run) => {
      const { db, appService } = await createExistingSetup();
      db.set.mockClear();
      mockStaging(() => incoming());

      await expect(run(appService)).rejects.toThrow(/^projectExists: /);

      expect(mocked.iosBridge).not.toHaveBeenCalledWith(
        "renameLegacyProjectFolder",
        expect.anything(),
      );
      expect(await db.get("projectEntries")).toEqual([existingEntry]);
      expect(await db.get("iosRemovedProjectIds")).toEqual([]);
      expect(db.set).not.toHaveBeenCalled();
    },
  );

  it("restores a hidden project, renaming its id-named folder after the project, and keeps its entry dates", async () => {
    const { db, appService } = await createExistingSetup({
      removed: ["project-one"],
    });
    mockStaging((method) => {
      if (method === "renameLegacyProjectFolder") {
        return {
          ...importPayload(),
          name: "Existing Name",
          projectFilePath: "/projects/Existing Name/project.db",
        };
      }
      return {
        ...importPayload(),
        name: "Existing Name",
        alreadyImported: true,
      };
    });

    const project = await appService.importProjectFromArchive({
      uri: "file:///tmp/project-one.zip",
    });

    expect(mocked.iosBridge).toHaveBeenCalledWith("renameLegacyProjectFolder", {
      projectId: "project-one",
    });
    expect(project.id).toBe("project-one");
    expect(await db.get("iosRemovedProjectIds")).toEqual([]);
    const entries = await db.get("projectEntries");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      id: "project-one",
      name: "Existing Name",
      projectFilePath: "/projects/Existing Name/project.db",
      createdAt: 111,
      lastOpenedAt: 222,
    });
  });

  it("does not rename anything when the import is a new project", async () => {
    const db = createDb();
    const appService = createIOSAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    mockStaging(() => ({ ...importPayload(), alreadyImported: false }));

    await appService.importProjectFromArchive({
      uri: "file:///tmp/project-one.zip",
    });

    expect(mocked.iosBridge).not.toHaveBeenCalledWith(
      "renameLegacyProjectFolder",
      expect.anything(),
    );
    expect((await db.get("projectEntries"))[0].id).toBe("project-one");
  });

  it("restores a previously removed project when it is imported again", async () => {
    const db = createDb();
    await db.set("iosRemovedProjectIds", ["project-one"]);
    const appService = createIOSAppService(
      createParams({ db, projectService: createProjectService() }),
    );
    mockStaging(() => importPayload());

    await appService.importProjectFromArchive({
      uri: "file:///tmp/project-one.zip",
    });

    expect(await db.get("iosRemovedProjectIds")).toEqual([]);
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
