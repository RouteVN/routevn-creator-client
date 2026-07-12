import { describe, expect, it, vi } from "vitest";

import { createPlayerRuntimePersistenceHost } from "../../src/deps/clients/tauri/playerRuntimePersistenceHost.js";
import {
  cloneFixture,
  createPersistenceState,
  createSaveSlot,
} from "../playerRuntimePersistenceFixtures.js";

const createFakeDatabase = (initialRows = []) => {
  const values = new Map(
    initialRows.map(({ key, value }) => [key, cloneFixture(value)]),
  );
  const db = {
    init: vi.fn(async () => {}),
    list: vi.fn(async () =>
      Array.from(values, ([key, value]) => ({
        key,
        value: cloneFixture(value),
      })),
    ),
    set: vi.fn(async (key, value) => {
      values.set(key, cloneFixture(value));
    }),
    applyBatch: vi.fn(async ({ puts = [], deletes = [] }) => {
      puts.forEach(({ key, value }) => values.set(key, cloneFixture(value)));
      deletes.forEach((key) => values.delete(key));
    }),
    clear: vi.fn(async () => values.clear()),
  };

  return { db, values };
};

const createPersistence = (initialRows = []) => {
  const { db, values } = createFakeDatabase(initialRows);
  const createDatabase = vi.fn(() => db);
  const host = createPlayerRuntimePersistenceHost({ createDatabase });
  const persistence = host.createPersistence();
  return { createDatabase, db, persistence, values };
};

describe("Windows player runtime persistence host", () => {
  it("uses the shared SQLite client and reconstructs Route Engine state", async () => {
    const slot = createSaveSlot(1);
    const { createDatabase, db, persistence } = createPersistence([
      { key: "saveSlots:1", value: slot },
      { key: "globalDeviceVariables", value: { textSpeed: 42 } },
      { key: "globalAccountVariables", value: { routeUnlocked: true } },
      { key: "globalRuntime", value: { muteAll: false } },
      {
        key: "accountViewedRegistry",
        value: { sections: ["prologue"], resources: [] },
      },
    ]);

    await expect(persistence.load()).resolves.toEqual(
      createPersistenceState({
        saveSlots: { 1: slot },
        globalDeviceVariables: { textSpeed: 42 },
        globalAccountVariables: { routeUnlocked: true },
        globalRuntime: { muteAll: false },
        accountViewedRegistry: { sections: ["prologue"], resources: [] },
      }),
    );
    expect(createDatabase).toHaveBeenCalledWith({
      path: "sqlite:runtime.db",
      durability: "full",
      schemaVersion: 1,
    });
    expect(db.init).toHaveBeenCalledOnce();
    expect(db.list).toHaveBeenCalledOnce();
  });

  it("synchronizes save slots as independent physical rows", async () => {
    const slot1 = createSaveSlot(1);
    const slot2 = createSaveSlot(2);
    const updatedSlot2 = createSaveSlot(2, { lineId: "line-4" });
    const { db, persistence, values } = createPersistence([
      { key: "saveSlots:1", value: slot1 },
    ]);

    await persistence.saveSlots({ 1: slot1, 2: slot2 });
    await persistence.saveSlots({ 2: updatedSlot2 });

    expect(db.applyBatch.mock.calls).toEqual([
      [{ puts: [{ key: "saveSlots:2", value: slot2 }], deletes: [] }],
      [
        {
          puts: [{ key: "saveSlots:2", value: updatedSlot2 }],
          deletes: ["saveSlots:1"],
        },
      ],
    ]);
    expect(values.has("saveSlots:1")).toBe(false);
    expect(values.get("saveSlots:2")).toEqual(updatedSlot2);
  });

  it("maps full snapshots and ordered scoped updates in JavaScript", async () => {
    const { db, persistence, values } = createPersistence();
    await persistence.load();

    await persistence.saveGlobalDeviceVariables({ textSpeed: 42 });
    await persistence.saveGlobalAccountVariables({ routeUnlocked: true });
    await persistence.saveGlobalRuntime({ skipUnseenText: false });
    await persistence.applyScopedDataUpdates([
      {
        scope: "device",
        path: "variables.textSpeed",
        op: "set",
        value: 60,
      },
      {
        scope: "account",
        path: "variables.endingCount",
        op: "set",
        value: 2,
      },
      {
        scope: "account",
        path: "viewedRegistry",
        op: "markViewed",
        value: {
          sections: [{ sectionId: "prologue", lineId: "line-5" }],
          resources: [{ resourceId: "cg-opening" }],
        },
      },
    ]);

    expect(db.set.mock.calls).toEqual([
      ["globalDeviceVariables", { textSpeed: 42 }],
      ["globalAccountVariables", { routeUnlocked: true }],
      ["globalRuntime", { skipUnseenText: false }],
    ]);
    expect(db.applyBatch).toHaveBeenLastCalledWith({
      puts: [
        { key: "globalDeviceVariables", value: { textSpeed: 60 } },
        {
          key: "globalAccountVariables",
          value: { routeUnlocked: true, endingCount: 2 },
        },
        {
          key: "accountViewedRegistry",
          value: {
            sections: [{ sectionId: "prologue", lastLineId: "line-5" }],
            resources: [{ resourceId: "cg-opening" }],
          },
        },
      ],
    });
    expect(values.get("globalDeviceVariables")).toEqual({ textSpeed: 60 });
  });

  it("validates complete JSON and semantic payloads before touching SQLite", () => {
    const { db, persistence } = createPersistence();
    const cyclic = {};
    cyclic.self = cyclic;

    expect(() => persistence.saveSlots([])).toThrow(
      "Player persistence saveSlots must be a JSON object",
    );
    expect(() =>
      persistence.saveGlobalDeviceVariables({ invalid: null }),
    ).toThrow("must be a JSON string, number, boolean, object, or array");
    expect(() => persistence.saveGlobalRuntime({ unknown: true })).toThrow(
      ".unknown is not supported",
    );
    expect(() => persistence.saveGlobalAccountVariables(cyclic)).toThrow(
      "must not contain cyclic data",
    );
    expect(() => persistence.applyScopedDataUpdates({})).toThrow(
      "applyScopedDataUpdates requires an updates array",
    );
    expect(db.init).not.toHaveBeenCalled();
    expect(db.set).not.toHaveBeenCalled();
    expect(db.applyBatch).not.toHaveBeenCalled();
  });

  it("does not advance its cached state when a database write fails", async () => {
    const slot1 = createSaveSlot(1);
    const updatedSlot1 = createSaveSlot(1, { lineId: "line-4" });
    const { db, persistence } = createPersistence([
      { key: "saveSlots:1", value: slot1 },
    ]);
    db.applyBatch.mockRejectedValueOnce(new Error("disk full"));

    await expect(persistence.saveSlots({ 1: updatedSlot1 })).rejects.toThrow(
      "disk full",
    );
    await persistence.saveSlots({ 1: updatedSlot1 });

    expect(db.applyBatch).toHaveBeenCalledTimes(2);
    expect(db.applyBatch.mock.calls[0]).toEqual(db.applyBatch.mock.calls[1]);
  });

  it("rejects malformed stored rows and leaves them untouched", async () => {
    const { db, persistence, values } = createPersistence([
      { key: "globalRuntime", value: { muteAll: "no" } },
    ]);

    await expect(persistence.load()).rejects.toThrow(
      "globalRuntime.muteAll must be a JSON boolean",
    );
    await expect(
      persistence.saveGlobalDeviceVariables({ textSpeed: 42 }),
    ).rejects.toThrow("globalRuntime.muteAll must be a JSON boolean");
    expect(db.clear).not.toHaveBeenCalled();
    expect(db.set).not.toHaveBeenCalled();
    expect(db.list).toHaveBeenCalledTimes(2);
    expect(values.get("globalRuntime")).toEqual({ muteAll: "no" });
  });

  it("clears all rows and resets the in-memory state", async () => {
    const { db, persistence, values } = createPersistence([
      { key: "globalDeviceVariables", value: { textSpeed: 42 } },
    ]);

    await persistence.clear();
    expect(values.size).toBe(0);
    expect(db.list).not.toHaveBeenCalled();
    await expect(persistence.load()).resolves.toEqual(createPersistenceState());
  });
});
