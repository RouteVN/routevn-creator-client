import SqliteDatabase from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getDeviceId,
  isDeviceId,
} from "../../src/deps/clients/deviceIdentity.js";

const factories = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts) => parts.join("/"),
}));
vi.mock("../../src/deps/clients/tauri/sqliteConnectionManager.js", () => ({
  getManagedSqliteConnection: ({ dbPath, onConnect }) => {
    const connection = factories.open(dbPath.replace(/^sqlite:/, ""));
    return { ...connection, init: async () => onConnect(connection) };
  },
}));
vi.mock("../../src/deps/clients/ios/sqlite.js", () => ({
  createIOSSqliteConnection: ({ dbPath }) => factories.open(dbPath),
}));
import { createDb as createDesktopDb } from "../../src/deps/clients/tauri/db.js";
import { createDb as createIOSDb } from "../../src/deps/clients/ios/db.js";

const connections = [];
const directories = [];
afterEach(() => {
  for (const connection of connections.splice(0)) connection.close();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe.each([
  ["desktop", createDesktopDb],
  ["iOS", createIOSDb],
])(
  "%s installation identity with independent SQLite connections",
  (_platform, createDb) => {
    it("returns the same persisted ID when first checks race, and reuses it after reopening", async () => {
      const directory = mkdtempSync(join(tmpdir(), "routevn-device-identity-"));
      directories.push(directory);
      const path = join(directory, "app.db");
      factories.open.mockImplementation((filename) => {
        const sqlite = new SqliteDatabase(filename);
        connections.push(sqlite);
        return {
          init: async () => {},
          execute: async (sql, args = []) =>
            sqlite.prepare(sql.replace(/\$[0-9]+/g, "?")).run(...args),
          select: async (sql, args = []) =>
            sqlite.prepare(sql.replace(/\$[0-9]+/g, "?")).all(...args),
        };
      });
      const first = createDb({ path });
      const second = createDb({ path });
      await Promise.all([first.init(), second.init()]);
      const firstInsert = vi.spyOn(first, "getOrSet");
      const secondInsert = vi.spyOn(second, "getOrSet");
      const [a, b] = await Promise.all([
        getDeviceId(first),
        getDeviceId(second),
      ]);
      expect(firstInsert).toHaveBeenCalledTimes(1);
      expect(secondInsert).toHaveBeenCalledTimes(1);
      expect(isDeviceId(a)).toBe(true);
      expect(b).toBe(a);
      expect(await first.get("deviceId")).toBe(a);
      const reopened = createDb({ path });
      await reopened.init();
      expect(await getDeviceId(reopened)).toBe(a);
      expect(await reopened.getOrSet("deviceId", "123456789ABC")).toBe(a);
    });
  },
);
