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
  stat: vi.fn(),
  copyFile: vi.fn(),
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
  stat: mocked.stat,
  copyFile: mocked.copyFile,
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
  releaseRepositoryByPath: vi.fn(async () => {}),
});

const createParams = ({ db, projectService }) => ({
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
  filePicker: {},
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
  for (const mock of Object.values(mocked)) {
    mock.mockReset();
  }
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

// A desktop zip or URL import's destination: an empty folder the user picked.
const DESTINATION = "/projects/Project One";

// The destination folder after a desktop import of a typical project zip.
const IMPORTED_PROJECT = [
  `${DESTINATION}/file-metadata`,
  `${DESTINATION}/file-metadata/abc.mime`,
  `${DESTINATION}/files`,
  `${DESTINATION}/files/abc`,
  `${DESTINATION}/files/def`,
  `${DESTINATION}/project.db`,
];

// Tauri fs `readDir` entries.
const dirEntry = (name, kind) => ({
  name,
  isFile: kind === "file",
  isDirectory: kind === "directory",
  isSymlink: kind === "link",
});
const file = (name) => dirEntry(name, "file");

describe("desktop project import adapters", () => {
  const mockProjectFolder = (files, filesKind = "directory") => {
    const directories = {
      "/projects/project-one": [
        dirEntry("files", filesKind),
        file("project.db"),
      ],
      "/projects/project-one/files": files,
    };
    mocked.readDir.mockImplementation(async (path) => directories[path] ?? []);
  };

  // Native commands. Extraction writes the planned files into `fileSystem`.
  const mockNative = ({
    entries = PROJECT_ZIP_ENTRIES,
    fileSystem,
    onDownload,
  } = {}) => {
    const calls = [];
    mocked.invoke.mockImplementation(async (command, payload) => {
      calls.push({ command, payload });
      if (command === "download_file") {
        onDownload?.();
        payload.onProgress.onmessage({ current: 0, total: 10 });
        payload.onProgress.onmessage({ current: 10, total: 10 });
        return {
          finalUrl: "https://example.com/files/project-one.zip",
          contentDisposition: 'attachment; filename="Project One.zip"',
          bytes: 10,
        };
      }
      if (command === "list_archive") {
        return { entries };
      }
      if (command === "extract_archive") {
        for (const { path } of payload.files) {
          fileSystem?.add(`${payload.destination}/${path}`, "file");
        }
        payload.onProgress.onmessage({ current: 5, total: 18 });
        return { files: PLANNED_FILES.length, bytes: 18 };
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    return calls;
  };

  // An in-memory file system behind the fs plugin, holding the destination
  // folder and the `contents` it starts with (names mapped to their kind).
  // `list(folder)` returns every path below a folder, sorted.
  const mockFileSystem = (contents = {}) => {
    const paths = new Map([[DESTINATION, "directory"]]);
    const isWithin = (path, folder) =>
      path === folder || path.startsWith(`${folder}/`);
    const add = (path, kind) => {
      const segments = path.split("/");
      for (let index = 2; index < segments.length; index += 1) {
        paths.set(segments.slice(0, index).join("/"), "directory");
      }
      paths.set(path, kind);
    };
    for (const [name, kind] of Object.entries(contents)) {
      add(`${DESTINATION}/${name}`, kind);
    }

    mocked.mkdir.mockImplementation(async (path) => {
      add(path, "directory");
    });
    mocked.rename.mockImplementation(async (from, to) => {
      const moving = [...paths].filter(([path]) => isWithin(path, from));
      for (const [path, kind] of moving) {
        paths.delete(path);
        paths.set(`${to}${path.slice(from.length)}`, kind);
      }
    });
    mocked.remove.mockImplementation(async (target) => {
      for (const path of paths.keys()) {
        if (isWithin(path, target)) {
          paths.delete(path);
        }
      }
    });
    mocked.exists.mockImplementation(async (path) => paths.has(path));
    mocked.readDir.mockImplementation(async (folder) =>
      [...paths]
        .filter(
          ([path]) =>
            path.startsWith(`${folder}/`) &&
            !path.slice(folder.length + 1).includes("/"),
        )
        .map(([path, kind]) => dirEntry(path.slice(folder.length + 1), kind)),
    );

    return {
      add,
      has: (path) => paths.has(path),
      list: (folder) =>
        [...paths.keys()]
          .filter((path) => path.startsWith(`${folder}/`))
          .sort(),
    };
  };

  const createService = ({ db = createDb(), projectService } = {}) =>
    createDesktopAppService(
      createParams({
        db,
        projectService: projectService ?? createProjectService(),
      }),
    );

  describe("a picked folder", () => {
    it("renames files to their file ids once the folder is known to be a project", async () => {
      const db = createDb();
      mockProjectFolder([file("abc.png"), file("def")]);

      await createService({ db }).openExistingProject("/projects/project-one");

      expect(mocked.rename).toHaveBeenCalledTimes(1);
      expect(mocked.rename).toHaveBeenCalledWith(
        "/projects/project-one/files/abc.png",
        "/projects/project-one/files/abc",
      );
      const entries = await db.get("projectEntries");
      expect(entries[0].projectPath).toBe("/projects/project-one");
    });

    it.each([
      [
        "has no project.db",
        () => {
          mocked.exists.mockImplementation(async (path) =>
            path.endsWith("/files"),
          );
        },
        "Missing project.db",
      ],
      [
        "has a database that cannot be read",
        (projectService) => {
          projectService.getProjectInfoByPath.mockRejectedValue(
            new Error("file is not a database"),
          );
        },
        "file is not a database",
      ],
      [
        "has two names for the same id",
        () => mockProjectFolder([file("abc.png"), file("abc.jpg")]),
        /^fileNameConflict: /,
      ],
      [
        "has a files folder that is a link",
        () => mockProjectFolder([file("abc.png")], "link"),
        /^importFailed: /,
      ],
    ])(
      "renames nothing in a folder that %s",
      async (_label, arrange, error) => {
        mockProjectFolder([file("abc.png")]);
        const projectService = createProjectService();
        arrange(projectService);

        await expect(
          createService({ projectService }).openExistingProject(
            "/projects/project-one",
          ),
        ).rejects.toThrow(error);
        expect(mocked.rename).not.toHaveBeenCalled();
      },
    );

    it("undoes the renames already made when one fails", async () => {
      mockProjectFolder([file("abc.png"), file("def.png")]);
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
  });

  describe("a picked zip file", () => {
    const ZIP_PATH = "/Users/me/Downloads/Project One.zip";
    const importFromZip = (appService, extra = {}) =>
      appService.importProjectFromArchive({
        uri: ZIP_PATH,
        destinationFolder: DESTINATION,
        ...extra,
      });

    it("opens a zip-only picker and returns the file's path and name", async () => {
      const openFilePicker = vi.fn(async () => ZIP_PATH);
      const appService = createDesktopAppService({
        ...createParams({
          db: createDb(),
          projectService: createProjectService(),
        }),
        filePicker: { openFilePicker },
      });

      const archive = await appService.openArchivePicker({
        title: "Select Project Zip File",
      });

      expect(openFilePicker).toHaveBeenCalledWith({
        title: "Select Project Zip File",
        filters: [{ name: "Zip", extensions: ["zip"] }],
      });
      expect(archive).toEqual({ uri: ZIP_PATH, name: "Project One.zip" });
    });

    it("resolves to undefined when the picker is cancelled", async () => {
      const appService = createDesktopAppService({
        ...createParams({
          db: createDb(),
          projectService: createProjectService(),
        }),
        filePicker: { openFilePicker: vi.fn(async () => null) },
      });

      expect(await appService.openArchivePicker()).toBeUndefined();
    });

    it("copies the zip into staging, extracts it and moves the project into the destination folder", async () => {
      const db = createDb();
      const fileSystem = mockFileSystem();
      const calls = mockNative({ fileSystem });
      mocked.stat.mockResolvedValue({ size: 10 });
      const events = [];

      const project = await importFromZip(createService({ db }), {
        onProgress: (event) => events.push(event),
      });

      const stagingDir = mocked.mkdir.mock.calls[0][0];
      expect(stagingDir).toMatch(/^\/projects\/Project One\/routevn-import-/);
      expect(mocked.copyFile).toHaveBeenCalledWith(
        ZIP_PATH,
        `${stagingDir}/archive.zip`,
      );
      expect(calls.map((call) => call.command)).toEqual([
        "list_archive",
        "extract_archive",
      ]);
      expect(calls[1].payload).toMatchObject({
        archive: `${stagingDir}/archive.zip`,
        destination: `${stagingDir}/extracted`,
        files: PLANNED_FILES,
      });
      expect(mocked.remove).toHaveBeenCalledWith(stagingDir, {
        recursive: true,
      });
      expect(fileSystem.list(DESTINATION)).toEqual(IMPORTED_PROJECT);
      expect(project.projectPath).toBe(DESTINATION);
      const entries = await db.get("projectEntries");
      expect(entries[0].projectPath).toBe(DESTINATION);
      expect(events).toEqual([
        { stage: "extracting", current: 5, total: 18 },
        { stage: "finishing", current: 0, total: 0 },
      ]);
    });

    it("rejects a zip over the archive size limit without copying it", async () => {
      mockFileSystem();
      const calls = mockNative();
      mocked.stat.mockResolvedValue({ size: 4 * GIB + 1 });

      await expect(importFromZip(createService())).rejects.toThrow(
        /^tooLarge: /,
      );

      expect(mocked.copyFile).not.toHaveBeenCalled();
      expect(calls).toEqual([]);
      expect(mocked.remove).toHaveBeenCalledTimes(1);
    });

    it("requires a destination folder", async () => {
      await expect(
        importFromZip(createService(), { destinationFolder: undefined }),
      ).rejects.toThrow(/^importFailed: /);

      expect(mocked.mkdir).not.toHaveBeenCalled();
    });

    it("refuses a destination folder that is not empty before copying anything", async () => {
      const fileSystem = mockFileSystem({ "notes.txt": "file" });
      mocked.stat.mockResolvedValue({ size: 10 });

      await expect(importFromZip(createService())).rejects.toThrow(
        /^importFailed: /,
      );

      expect(mocked.mkdir).not.toHaveBeenCalled();
      expect(mocked.copyFile).not.toHaveBeenCalled();
      expect(fileSystem.list(DESTINATION)).toEqual([
        `${DESTINATION}/notes.txt`,
      ]);
    });
  });

  describe("a URL", () => {
    const importFromUrl = (appService, extra = {}) =>
      appService.importProjectFromUrl({
        url: "https://example.com/files/project-one.zip",
        destinationFolder: DESTINATION,
        ...extra,
      });

    it("downloads, extracts only the planned files, reports progress and registers the destination folder", async () => {
      const db = createDb();
      const fileSystem = mockFileSystem();
      const calls = mockNative({ fileSystem });
      const events = [];

      const project = await importFromUrl(createService({ db }), {
        onProgress: (event) => events.push(event),
      });

      expect(calls.map((call) => call.command)).toEqual([
        "download_file",
        "list_archive",
        "extract_archive",
      ]);
      const stagingDir = mocked.mkdir.mock.calls[0][0];
      expect(stagingDir).toMatch(/^\/projects\/Project One\/routevn-import-/);
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
      expect(mocked.remove).toHaveBeenCalledWith(stagingDir, {
        recursive: true,
      });
      expect(fileSystem.list(DESTINATION)).toEqual(IMPORTED_PROJECT);
      expect(project.projectPath).toBe(DESTINATION);
      const entries = await db.get("projectEntries");
      expect(entries[0].projectPath).toBe(DESTINATION);
      expect(events).toEqual([
        { stage: "downloading", current: 0, total: 10 },
        { stage: "downloading", current: 10, total: 10 },
        { stage: "extracting", current: 5, total: 18 },
        { stage: "finishing", current: 0, total: 0 },
      ]);
    });

    it("creates the files folder when the archive holds no assets", async () => {
      const fileSystem = mockFileSystem();
      mockNative({
        fileSystem,
        entries: [
          { name: "Project One/project.db", size: 100, isDirectory: false },
        ],
      });

      const project = await importFromUrl(createService());

      expect(project.projectPath).toBe(DESTINATION);
      expect(fileSystem.list(DESTINATION)).toEqual([
        `${DESTINATION}/files`,
        `${DESTINATION}/project.db`,
      ]);
    });

    it("rewrites a Google Drive link before downloading", async () => {
      const fileSystem = mockFileSystem();
      const calls = mockNative({ fileSystem });

      await importFromUrl(createService(), {
        url: "https://drive.google.com/file/d/1HYPkPo6yHL_D_zeHVz0vTMHN9d58AgOc/view?usp=drive_link",
      });

      expect(calls[0].payload.url).toBe(
        "https://drive.usercontent.google.com/download?id=1HYPkPo6yHL_D_zeHVz0vTMHN9d58AgOc&export=download&confirm=t",
      );
    });

    it("refuses a destination folder that is not empty before downloading", async () => {
      const fileSystem = mockFileSystem({ "notes.txt": "file" });
      const calls = mockNative({ fileSystem });

      await expect(importFromUrl(createService())).rejects.toThrow(
        /^importFailed: /,
      );

      expect(calls).toEqual([]);
      expect(mocked.mkdir).not.toHaveBeenCalled();
      expect(fileSystem.list(DESTINATION)).toEqual([
        `${DESTINATION}/notes.txt`,
      ]);
    });

    it("moves nothing into a destination folder that gained a file during the import", async () => {
      const db = createDb();
      const fileSystem = mockFileSystem();
      mockNative({
        fileSystem,
        onDownload: () => fileSystem.add(`${DESTINATION}/notes.txt`, "file"),
      });

      await expect(importFromUrl(createService({ db }))).rejects.toThrow(
        /^importFailed: /,
      );

      expect(fileSystem.list(DESTINATION)).toEqual([
        `${DESTINATION}/notes.txt`,
      ]);
      expect(await db.get("projectEntries")).toEqual([]);
    });

    it("moves the entries back when one cannot be moved", async () => {
      const fileSystem = mockFileSystem();
      mockNative({ fileSystem });
      const move = mocked.rename.getMockImplementation();
      // project.db and files/ are moved first; file-metadata/ fails.
      mocked.rename.mockImplementation(async (from, to) => {
        if (to === `${DESTINATION}/file-metadata`) {
          throw new Error("permission denied");
        }
        await move(from, to);
      });

      await expect(importFromUrl(createService())).rejects.toThrow(
        /^importFailed: /,
      );

      expect(mocked.rename).toHaveBeenCalledWith(
        `${DESTINATION}/project.db`,
        expect.stringMatching(/\/extracted\/project\.db$/),
      );
      expect(fileSystem.list(DESTINATION)).toEqual([]);
      expect(fileSystem.has(DESTINATION)).toBe(true);
    });

    it("rejects an archive without project.db before extracting", async () => {
      mockFileSystem();
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

    // The project's storage is released before the moved entries are removed,
    // and the destination folder itself is kept, empty.
    const expectReleasedBeforeEmptying = (projectService, fileSystem) => {
      expect(projectService.releaseRepositoryByPath).toHaveBeenCalledWith(
        DESTINATION,
      );
      const firstRemoval = mocked.remove.mock.calls.findIndex(
        ([path]) => path === `${DESTINATION}/project.db`,
      );
      expect(firstRemoval).not.toBe(-1);
      expect(
        projectService.releaseRepositoryByPath.mock.invocationCallOrder[0],
      ).toBeLessThan(mocked.remove.mock.invocationCallOrder[firstRemoval]);
      expect(fileSystem.list(DESTINATION)).toEqual([]);
      expect(fileSystem.has(DESTINATION)).toBe(true);
    };

    it("releases the project's storage, then empties the destination folder when the project cannot be registered", async () => {
      const db = createDb();
      const fileSystem = mockFileSystem();
      mockNative({ fileSystem });
      const projectService = createProjectService();
      projectService.getProjectInfoByPath.mockRejectedValue(
        new Error("file is not a database"),
      );

      await expect(
        importFromUrl(createService({ db, projectService })),
      ).rejects.toThrow("file is not a database");

      expectReleasedBeforeEmptying(projectService, fileSystem);
      expect(await db.get("projectEntries")).toEqual([]);
    });

    it("removes the entry it added when saving the project list fails after the entry was stored", async () => {
      const db = createDb();
      const setEntries = db.set.getMockImplementation();
      db.set.mockImplementationOnce(async (key, value) => {
        await setEntries(key, value);
        throw new Error("disk I/O error");
      });
      const fileSystem = mockFileSystem();
      mockNative({ fileSystem });
      const projectService = createProjectService();

      await expect(
        importFromUrl(createService({ db, projectService })),
      ).rejects.toThrow("disk I/O error");

      expectReleasedBeforeEmptying(projectService, fileSystem);
      expect(await db.get("projectEntries")).toEqual([]);
    });

    it("still empties the destination folder and removes its entry when releasing the project's storage fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const db = createDb();
      const setEntries = db.set.getMockImplementation();
      db.set.mockImplementationOnce(async (key, value) => {
        await setEntries(key, value);
        throw new Error("disk I/O error");
      });
      const fileSystem = mockFileSystem();
      mockNative({ fileSystem });
      const projectService = createProjectService();
      projectService.releaseRepositoryByPath.mockRejectedValue(
        new Error("database is locked"),
      );

      await expect(
        importFromUrl(createService({ db, projectService })),
      ).rejects.toThrow("disk I/O error");

      expect(fileSystem.list(DESTINATION)).toEqual([]);
      expect(await db.get("projectEntries")).toEqual([]);
    });

    it("leaves an entry that already had the destination folder's path as it was", async () => {
      const staleEntry = {
        id: "project-two",
        projectPath: DESTINATION,
        name: "Project Two",
      };
      const db = createDb();
      await db.set("projectEntries", [staleEntry]);
      const fileSystem = mockFileSystem();
      mockNative({ fileSystem });
      const projectService = createProjectService();

      await expect(
        importFromUrl(createService({ db, projectService })),
      ).rejects.toThrow(/^projectExists: /);

      expectReleasedBeforeEmptying(projectService, fileSystem);
      expect(await db.get("projectEntries")).toEqual([staleEntry]);
    });
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

// Android and iOS speak the same import operations over their own bridges.
const ANDROID = {
  label: "android",
  bridge: mocked.androidBridge,
  progressCallback: "__routeVNAndroidTransferProgress",
  createAppService: createAndroidAppService,
  // Android's storage step answers with the project id the app chose.
  storeProject: (payload) => ({
    id: payload.projectId,
    name: "Project One",
    description: "",
    language: "en",
    iconFileId: null,
  }),
  finishOptions: { timeoutMs: Number.POSITIVE_INFINITY },
};
const IOS = {
  label: "ios",
  bridge: mocked.iosBridge,
  progressCallback: "__routeVNIOSTransferProgress",
  createAppService: createIOSAppService,
  storeProject: iosImportPayload,
  finishOptions: undefined,
};

const createMobileService = (platform, { db = createDb() } = {}) =>
  platform.createAppService(
    createParams({ db, projectService: createProjectService() }),
  );

// The bridge answers every import method; `answers` replaces single methods.
const mockMobileNative = (
  platform,
  { entries = PROJECT_ZIP_ENTRIES, folders = {}, answers = {} } = {},
) => {
  const { bridge, progressCallback } = platform;
  const report = (tempFolderId, current, total) => {
    window[progressCallback]({ tempFolderId, current, total });
  };
  const handlers = {
    createTempFolder: () => ({ tempFolderId: "staging-one" }),
    removeTempFolder: () => ({}),
    downloadFile: (payload) => {
      report("someone-else", 1, 9);
      report(payload.tempFolderId, 0, 10);
      report(payload.tempFolderId, 10, 10);
      return { finalUrl: payload.url, bytes: 10 };
    },
    copyImportFile: () => ({ bytes: 10 }),
    listImportArchive: () => ({ entries }),
    extractImportArchive: (payload) => {
      report(payload.tempFolderId, 5, 18);
      return { files: PLANNED_FILES.length, bytes: 18 };
    },
    listImportDirectory: (payload) => ({
      entries: folders[payload.path] ?? [],
    }),
    importProjectFolder: platform.storeProject,
    ...answers,
  };
  const calls = [];
  bridge.mockImplementation(async (method, payload, options) => {
    calls.push({ method, payload, options });
    if (!handlers[method]) {
      throw new Error(`Unexpected ${platform.label} bridge method: ${method}`);
    }
    return handlers[method](payload);
  });
  return calls;
};

const methodsOf = (calls) => calls.map((call) => call.method);

describe.each([ANDROID, IOS])("$label project import adapters", (platform) => {
  it("imports a picked zip through staging and registers the project", async () => {
    const db = createDb();
    const calls = mockMobileNative(platform);

    const project = await createMobileService(platform, {
      db,
    }).importProjectFromArchive({
      uri: "content://archives/project-one.zip",
    });

    expect(methodsOf(calls)).toEqual([
      "createTempFolder",
      "copyImportFile",
      "listImportArchive",
      "extractImportArchive",
      "importProjectFolder",
      "removeTempFolder",
    ]);
    expect(calls[1].payload).toEqual({
      tempFolderId: "staging-one",
      uri: "content://archives/project-one.zip",
      path: "archive.zip",
      maxBytes: 4 * GIB,
    });
    expect(calls[3].payload).toEqual({
      tempFolderId: "staging-one",
      path: "archive.zip",
      destination: "extracted",
      files: PLANNED_FILES,
      maxBytes: 8 * GIB,
    });
    expect(calls[4].payload).toMatchObject({
      tempFolderId: "staging-one",
      path: "extracted",
    });
    // Android never times out the storage step of a large project.
    expect(calls[4].options).toEqual(platform.finishOptions);
    expect(calls[5].payload).toEqual({ tempFolderId: "staging-one" });
    expect(project.name).toBe("Project One");
    expect((await db.get("projectEntries"))[0].name).toBe("Project One");
  });

  it("downloads a URL, registers the project and forwards progress for its own temporary folder only", async () => {
    const db = createDb();
    const calls = mockMobileNative(platform);
    const events = [];

    await createMobileService(platform, { db }).importProjectFromUrl({
      url: "https://example.com/project-one.zip",
      onProgress: (event) => events.push(event),
    });

    expect(methodsOf(calls)).toEqual([
      "createTempFolder",
      "downloadFile",
      "listImportArchive",
      "extractImportArchive",
      "importProjectFolder",
      "removeTempFolder",
    ]);
    expect(await db.get("projectEntries")).toHaveLength(1);
    expect(calls[1].payload).toEqual({
      tempFolderId: "staging-one",
      url: "https://example.com/project-one.zip",
      path: "archive.zip",
      maxBytes: 4 * GIB,
    });
    expect(events).toEqual([
      { stage: "downloading", current: 0, total: 10 },
      { stage: "downloading", current: 10, total: 10 },
      { stage: "extracting", current: 5, total: 18 },
      { stage: "finishing", current: 0, total: 0 },
    ]);
  });

  it("sends the renames Rule A needs with a picked folder", async () => {
    const folder = "content://tree/project-one";
    const calls = mockMobileNative(platform, {
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

    await createMobileService(platform).openExistingProject(folder);

    expect(
      calls
        .filter((call) => call.method === "listImportDirectory")
        .map((call) => call.payload),
    ).toEqual([
      { uri: folder, path: "" },
      { uri: folder, path: "files" },
    ]);
    const finish = calls.find((call) => call.method === "importProjectFolder");
    expect(finish.payload).toMatchObject({
      uri: folder,
      fileRenames: [{ from: "abc.png", to: "abc" }],
    });
  });
});

describe("mobile project import failures", () => {
  it.each([
    [
      "the download fails",
      {
        downloadFile: () => {
          throw new Error("downloadFailed: HTTP 500");
        },
      },
      "downloadFailed: HTTP 500",
    ],
    [
      "the stored Android project has another id",
      {
        importProjectFolder: () => ({
          id: "different-id",
          name: "Project One",
        }),
      },
      /^importFailed: /,
    ],
  ])(
    "removes the staging folder, stops listening and registers nothing when %s",
    async (_label, answers, error) => {
      const db = createDb();
      const calls = mockMobileNative(ANDROID, { answers });
      const onProgress = vi.fn();

      await expect(
        createMobileService(ANDROID, { db }).importProjectFromUrl({
          url: "https://example.com/project-one.zip",
          onProgress,
        }),
      ).rejects.toThrow(error);
      onProgress.mockClear();
      window[ANDROID.progressCallback]({
        tempFolderId: "staging-one",
        current: 1,
        total: 2,
      });

      expect(methodsOf(calls).at(-1)).toBe("removeTempFolder");
      expect(onProgress).not.toHaveBeenCalled();
      expect(await db.get("projectEntries")).toEqual([]);
    },
  );

  it("does not fail the import when the staging cleanup fails", async () => {
    mockMobileNative(ANDROID, {
      answers: {
        removeTempFolder: () => {
          throw new Error("cannot delete");
        },
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      createMobileService(ANDROID).importProjectFromArchive({
        uri: "content://archives/project-one.zip",
      }),
    ).resolves.toBeDefined();
  });
});

describe("ios project import of a project that is already in the library", () => {
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

  const createExistingSetup = async ({ removed = [] } = {}) => {
    const db = createDb();
    await db.set("projectEntries", [existingEntry]);
    await db.set("iosRemovedProjectIds", removed);
    return { db, appService: createMobileService(IOS, { db }) };
  };

  it("rejects a listed project without touching its entry", async () => {
    const { db, appService } = await createExistingSetup();
    db.set.mockClear();
    mockMobileNative(IOS, {
      answers: {
        importProjectFolder: () => ({
          ...iosImportPayload(),
          name: "Incoming Name",
          description: "Incoming description",
          alreadyImported: true,
        }),
      },
    });

    await expect(
      appService.importProjectFromArchive({
        uri: "file:///tmp/project-one.zip",
      }),
    ).rejects.toThrow(/^projectExists: /);

    expect(mocked.iosBridge).not.toHaveBeenCalledWith(
      "renameLegacyProjectFolder",
      expect.anything(),
    );
    expect(await db.get("projectEntries")).toEqual([existingEntry]);
    expect(await db.get("iosRemovedProjectIds")).toEqual([]);
    expect(db.set).not.toHaveBeenCalled();
  });

  it("restores a hidden project, renaming its id-named folder after the project, and keeps its entry dates", async () => {
    const { db, appService } = await createExistingSetup({
      removed: ["project-one"],
    });
    mockMobileNative(IOS, {
      answers: {
        importProjectFolder: () => ({
          ...iosImportPayload(),
          name: "Existing Name",
          alreadyImported: true,
        }),
        renameLegacyProjectFolder: () => ({
          ...iosImportPayload(),
          name: "Existing Name",
          projectFilePath: "/projects/Existing Name/project.db",
        }),
      },
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
});
