import SqliteDatabase from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const factories = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts) => parts.join("/"),
}));
vi.mock("../../src/deps/clients/tauri/sqliteConnectionManager.js", () => ({
  getManagedSqliteConnection: ({ dbPath }) => factories.open(dbPath),
}));
vi.mock("../../src/deps/clients/android/bridge.js", () => ({
  callAndroidBridge: async () => undefined,
}));
vi.mock("../../src/deps/clients/android/sqlite.js", () => ({
  createAndroidSqliteConnection: ({ dbPath }) => factories.open(dbPath),
}));
vi.mock("../../src/deps/clients/ios/sqlite.js", () => ({
  createIOSSqliteConnection: ({ dbPath }) => factories.open(dbPath),
}));
import { createPersistedAndroidProjectStore } from "../../src/deps/services/android/collabClientStore.js";
import { createPersistedIOSProjectStore } from "../../src/deps/services/ios/collabClientStore.js";
import { createPersistedTauriProjectStore } from "../../src/deps/services/tauri/collabClientStore.js";

const connections = [];
const directories = [];
const stores = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
  factories.open.mockReset();
});

// The desktop store wraps byte arguments for the SQL plugin.
const toSqliteArg = (value) =>
  value?.__routevn_sql_type === "bytes" ? Buffer.from(value.data) : value;

// A real SQLite database behind the platform connection, so BEGIN, COMMIT
// and ROLLBACK behave as they do on the device. failWhen can make one
// statement fail the way a full disk or a bridge error would.
const openProjectDatabase = ({ filename, failWhen }) => {
  const sqlite = new SqliteDatabase(filename);
  connections.push(sqlite);
  const run = (sql, args) => {
    if (failWhen?.(sql)) {
      throw new Error("disk I/O error");
    }
    const statement = sqlite.prepare(sql.replace(/\$[0-9]+/g, "?"));
    const sqliteArgs = args.map(toSqliteArg);
    return statement.reader
      ? statement.all(...sqliteArgs)
      : statement.run(...sqliteArgs);
  };
  return {
    init: async () => {},
    select: async (sql, args = []) => {
      const rows = run(sql, args);
      return Array.isArray(rows) ? rows : [];
    },
    execute: async (sql, args = []) => {
      const result = run(sql, args);
      return { rowsAffected: result?.changes ?? 0 };
    },
    close: async () => {},
  };
};

const createDraft = (id, clientTs) => ({
  id,
  partition: "m:s:scene-1",
  type: "section.create",
  schemaVersion: 1,
  payload: { sceneId: "scene-1", sectionId: `section-${id}`, data: {} },
  clientTs,
  createdAt: clientTs,
  meta: {},
});

describe.each([
  [
    "desktop",
    ({ directory, projectId }) =>
      createPersistedTauriProjectStore({ projectPath: directory, projectId }),
  ],
  [
    "Android",
    ({ projectId }) => createPersistedAndroidProjectStore({ projectId }),
  ],
  ["iOS", ({ projectId }) => createPersistedIOSProjectStore({ projectId })],
])("%s project store draft batches", (_platform, createStore) => {
  const openStore = async ({ projectId, failWhen }) => {
    const directory = mkdtempSync(join(tmpdir(), "routevn-draft-batches-"));
    directories.push(directory);
    factories.open.mockImplementation(() =>
      openProjectDatabase({
        filename: join(directory, "project.db"),
        failWhen,
      }),
    );
    const store = await createStore({ directory, projectId });
    stores.push(store);
    return store;
  };

  it("stores every draft of a batch in order", async () => {
    const store = await openStore({ projectId: "project-batch-stored" });

    await store.insertDrafts([
      createDraft("draft-1", 1),
      createDraft("draft-2", 2),
      createDraft("draft-3", 3),
    ]);

    const drafts = await store.listDraftsOrdered();
    expect(drafts.map((draft) => draft.id)).toEqual([
      "draft-1",
      "draft-2",
      "draft-3",
    ]);
  });

  it("stores none of a batch when a write fails partway", async () => {
    let draftInserts = 0;
    const store = await openStore({
      projectId: "project-batch-failed",
      failWhen: (sql) =>
        sql.includes("INSERT INTO local_drafts") && ++draftInserts === 2,
    });

    await expect(
      store.insertDrafts([
        createDraft("draft-1", 1),
        createDraft("draft-2", 2),
        createDraft("draft-3", 3),
      ]),
    ).rejects.toThrow("disk I/O error");
    expect(await store.listDraftsOrdered()).toEqual([]);

    await store.insertDrafts([createDraft("draft-4", 4)]);
    const drafts = await store.listDraftsOrdered();
    expect(drafts.map((draft) => draft.id)).toEqual(["draft-4"]);
  });
});
