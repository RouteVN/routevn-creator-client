import { beforeEach, describe, expect, it, vi } from "vitest";

// A small in-memory disk of folders and project databases. A loaded database
// stays bound to the file it opened, as it does on macOS and Linux after the
// file is deleted.
const disk = vi.hoisted(() => ({
  folders: new Set(),
  databases: new Map(),
}));

const mocked = vi.hoisted(() => ({
  load: vi.fn(),
  invoke: vi.fn(),
  mkdir: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
}));

const isInside = (path, folder) =>
  path === folder || path.startsWith(`${folder}/`);

const parentOf = (path) => path.slice(0, path.lastIndexOf("/"));

const nameOf = (path) => path.slice(path.lastIndexOf("/") + 1);

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: mocked.load,
  },
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(
    async (path) => disk.folders.has(path) || disk.databases.has(path),
  ),
  readDir: vi.fn(async (path) => [
    ...[...disk.folders]
      .filter((folder) => parentOf(folder) === path)
      .map((folder) => ({ name: nameOf(folder), isDirectory: true })),
    ...[...disk.databases.keys()]
      .filter((file) => parentOf(file) === path)
      .map((file) => ({ name: nameOf(file), isFile: true })),
  ]),
  mkdir: mocked.mkdir,
  remove: mocked.remove,
  rename: mocked.rename,
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@tauri-apps/api/path", () => ({
  join: vi.fn(async (...parts) => parts.join("/")),
  resolveResource: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  Channel: class {
    onmessage = () => {};
  },
  convertFileSrc: vi.fn((path) => path),
  invoke: mocked.invoke,
}));

import { createAppService } from "../../src/deps/services/appService.js";
import { createProjectService } from "../../src/deps/services/projectService.js";

const PROJECT_PATH = "/projects/parent/Project One";
const PROJECT_DB_PATH = `sqlite:${PROJECT_PATH}/project.db`;

const createAppDb = () => {
  const values = new Map([["projectEntries", []]]);

  return {
    get: vi.fn(async (key) => structuredClone(values.get(key))),
    set: vi.fn(async (key, value) => {
      values.set(key, structuredClone(value));
    }),
  };
};

const createServices = () => {
  const db = createAppDb();
  const router = {
    getPayload: () => ({}),
  };
  const projectService = createProjectService({
    router,
    db,
    filePicker: {},
    creatorVersion: 2,
  });
  const appService = createAppService({
    db,
    router,
    globalUI: {},
    filePicker: {},
    openUrl: vi.fn(),
    appVersion: "test",
    platform: "tauri",
    distribution: "direct",
    updatesEnabled: false,
    projectService,
    subject: {},
  });

  return { db, appService };
};

// The app state of the project.db that the next download extracts.
let archiveAppState;

const loadedDatabases = [];

beforeEach(() => {
  disk.folders.clear();
  disk.databases.clear();
  loadedDatabases.length = 0;
  for (const mock of Object.values(mocked)) {
    mock.mockReset();
  }

  mocked.mkdir.mockImplementation(async (path) => {
    disk.folders.add(path);
  });
  mocked.remove.mockImplementation(async (path) => {
    for (const folder of disk.folders) {
      if (isInside(folder, path)) {
        disk.folders.delete(folder);
      }
    }
    for (const file of disk.databases.keys()) {
      if (isInside(file, path)) {
        disk.databases.delete(file);
      }
    }
  });
  mocked.rename.mockImplementation(async (from, to) => {
    const movedFolders = [...disk.folders].filter((folder) =>
      isInside(folder, from),
    );
    for (const folder of movedFolders) {
      disk.folders.delete(folder);
      disk.folders.add(`${to}${folder.slice(from.length)}`);
    }
    const movedDatabases = [...disk.databases].filter(([file]) =>
      isInside(file, from),
    );
    for (const [file, contents] of movedDatabases) {
      disk.databases.delete(file);
      disk.databases.set(`${to}${file.slice(from.length)}`, contents);
    }
  });

  mocked.invoke.mockImplementation(async (command, payload) => {
    if (command === "download_file") {
      return {
        finalUrl: "https://example.com/files/project-one.zip",
        contentDisposition: 'attachment; filename="Project One.zip"',
      };
    }
    if (command === "list_archive") {
      return {
        entries: [
          { name: "Project One/project.db", size: 100, isDirectory: false },
        ],
      };
    }
    if (command === "extract_archive") {
      disk.databases.set(`${payload.destination}/project.db`, {
        appState: structuredClone(archiveAppState),
      });
      return {};
    }
    throw new Error(`Unexpected command: ${command}`);
  });

  mocked.load.mockImplementation(async (dbPath) => {
    const file = disk.databases.get(dbPath.slice("sqlite:".length));
    const database = {
      dbPath,
      select: vi.fn(async (_sql, [key] = []) => {
        const value = file.appState[key];
        return value === undefined ? [] : [{ value: JSON.stringify(value) }];
      }),
      execute: vi.fn(async (sql, args = []) => {
        if (sql.startsWith("INSERT OR REPLACE INTO app_state")) {
          file.appState[args[0]] = JSON.parse(args[1]);
        }
        return { rowsAffected: 1 };
      }),
      close: vi.fn(async () => {}),
    };
    loadedDatabases.push(database);
    return database;
  });
});

const importFromUrl = (appService) =>
  appService.importProjectFromUrl({
    url: "https://example.com/files/project-one.zip",
    destinationFolder: "/projects/parent",
  });

describe("desktop URL import of a project that cannot be registered", () => {
  it("closes the project database before removing the folder, so the next import into that folder opens its own file", async () => {
    const { db, appService } = createServices();
    archiveAppState = {
      creatorVersion: 1,
      projectInfo: { id: "project-one", name: "Project One" },
    };

    await expect(importFromUrl(appService)).rejects.toThrow(
      "incompatible project with version 1",
    );

    const [firstDatabase] = loadedDatabases;
    expect(firstDatabase.dbPath).toBe(PROJECT_DB_PATH);
    expect(firstDatabase.close).toHaveBeenCalledTimes(1);
    const folderRemoval = mocked.remove.mock.calls.findIndex(
      ([path]) => path === PROJECT_PATH,
    );
    expect(folderRemoval).not.toBe(-1);
    expect(firstDatabase.close.mock.invocationCallOrder[0]).toBeLessThan(
      mocked.remove.mock.invocationCallOrder[folderRemoval],
    );
    expect(disk.folders.has(PROJECT_PATH)).toBe(false);
    expect(await db.get("projectEntries")).toEqual([]);

    archiveAppState = {
      creatorVersion: 2,
      projectInfo: {
        id: "project-two",
        namespace: "project-two-namespace",
        nativeApplicationIdentifier: "vn.routevn.player.project-two",
        name: "Project Two",
        language: "en",
      },
    };

    const project = await importFromUrl(appService);

    expect(project).toMatchObject({
      id: "project-two",
      name: "Project Two",
      projectPath: PROJECT_PATH,
    });
    expect(loadedDatabases.map((database) => database.dbPath)).toEqual([
      PROJECT_DB_PATH,
      PROJECT_DB_PATH,
    ]);
    expect(firstDatabase.select).toHaveBeenCalledTimes(1);
    expect(await db.get("projectEntries")).toEqual([
      expect.objectContaining({
        id: "project-two",
        projectPath: PROJECT_PATH,
      }),
    ]);
  });
});
