import { afterEach, describe, expect, it, vi } from "vitest";
import { listIndexedDbDatabaseNames } from "../../src/deps/clients/web/indexedDb.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("web IndexedDB storage inspection", () => {
  it("lists existing database names without opening or deleting them", async () => {
    const databases = vi.fn(async () => [
      { name: "project-1", version: 4 },
      { name: "routevn-collab-client:2:project-1", version: 1 },
      { name: undefined, version: 1 },
    ]);
    vi.stubGlobal("indexedDB", {
      databases,
      open: vi.fn(),
      deleteDatabase: vi.fn(),
    });

    await expect(listIndexedDbDatabaseNames()).resolves.toEqual(
      new Set(["project-1", "routevn-collab-client:2:project-1"]),
    );
    expect(databases).toHaveBeenCalledTimes(1);
    expect(indexedDB.open).not.toHaveBeenCalled();
    expect(indexedDB.deleteDatabase).not.toHaveBeenCalled();
  });

  it("fails closed when browser storage cannot be inspected", async () => {
    vi.stubGlobal("indexedDB", {
      open: vi.fn(),
      deleteDatabase: vi.fn(),
    });

    await expect(listIndexedDbDatabaseNames()).rejects.toThrow(
      "cannot verify that browser project storage is empty",
    );
    expect(indexedDB.open).not.toHaveBeenCalled();
    expect(indexedDB.deleteDatabase).not.toHaveBeenCalled();
  });

  it("returns a stable error when browser storage inspection fails", async () => {
    vi.stubGlobal("indexedDB", {
      databases: vi.fn(async () => {
        throw new Error("Browser storage unavailable");
      }),
      open: vi.fn(),
      deleteDatabase: vi.fn(),
    });

    await expect(listIndexedDbDatabaseNames()).rejects.toThrow(
      "cannot verify that browser project storage is empty",
    );
    expect(indexedDB.open).not.toHaveBeenCalled();
    expect(indexedDB.deleteDatabase).not.toHaveBeenCalled();
  });
});
