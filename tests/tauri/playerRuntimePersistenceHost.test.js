import { readFile } from "node:fs/promises";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const hostSource = await readFile(
  new URL(
    "../../src/deps/clients/tauri/playerRuntimePersistenceHost.js",
    import.meta.url,
  ),
  "utf8",
);

const createHost = (invoke) => {
  const context = {
    __TAURI__: {
      core: { invoke },
    },
  };
  vm.runInNewContext(hostSource, context);
  return context.__ROUTEVN_PLAYER_HOST__;
};

const createPersistenceState = (overrides = {}) => ({
  saveSlots: {},
  globalDeviceVariables: {},
  globalAccountVariables: {},
  globalRuntime: {},
  accountViewedRegistry: {},
  ...overrides,
});

describe("Windows player runtime persistence host", () => {
  it("loads native SQLite state without opening legacy IndexedDB after migration", async () => {
    const nativeState = createPersistenceState({
      saveSlots: { slot1: { lineId: "line-1" } },
    });
    const invoke = vi.fn(async () => ({
      persistence: nativeState,
      legacyMigrationCompleted: true,
    }));
    const createLegacyPersistence = vi.fn();
    const persistence = createHost(invoke).createPersistence({
      createLegacyPersistence,
    });

    await expect(persistence.load()).resolves.toEqual(nativeState);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("load_player_persistence", undefined);
    expect(createLegacyPersistence).not.toHaveBeenCalled();
  });

  it("imports legacy IndexedDB state once when native migration is incomplete", async () => {
    const legacyState = createPersistenceState({
      globalDeviceVariables: { textSpeed: 42 },
      accountViewedRegistry: {
        sections: [{ sectionId: "intro", lastLineId: "line-2" }],
        resources: [],
      },
    });
    const invoke = vi.fn(async (command) => {
      if (command === "load_player_persistence") {
        return {
          persistence: createPersistenceState(),
          legacyMigrationCompleted: false,
          hasNativeValues: false,
        };
      }

      return {
        persistence: legacyState,
        legacyMigrationCompleted: true,
      };
    });
    const legacyLoad = vi.fn(async () => legacyState);
    const createLegacyPersistence = vi.fn(() => ({ load: legacyLoad }));
    const persistence = createHost(invoke).createPersistence({
      createLegacyPersistence,
    });

    await expect(persistence.load()).resolves.toEqual(legacyState);
    expect(createLegacyPersistence).toHaveBeenCalledOnce();
    expect(legacyLoad).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "complete_legacy_player_persistence_migration",
      { legacyState },
    );
  });

  it("marks migration complete without opening IndexedDB when native rows exist", async () => {
    const nativeState = createPersistenceState({
      globalRuntime: { skipUnseenText: true },
    });
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({
        persistence: nativeState,
        legacyMigrationCompleted: false,
        hasNativeValues: true,
      })
      .mockResolvedValueOnce({
        persistence: nativeState,
        legacyMigrationCompleted: true,
        hasNativeValues: true,
      });
    const createLegacyPersistence = vi.fn();
    const persistence = createHost(invoke).createPersistence({
      createLegacyPersistence,
    });

    await expect(persistence.load()).resolves.toEqual(nativeState);
    expect(createLegacyPersistence).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      "complete_legacy_player_persistence_migration",
      { legacyState: createPersistenceState() },
    );
  });

  it("maps the Route Engine adapter contract to narrow native commands", async () => {
    const invoke = vi.fn(async () => undefined);
    const persistence = createHost(invoke).createPersistence();
    const updates = [
      {
        scope: "account",
        path: "variables.routeUnlocked",
        op: "set",
        value: true,
      },
    ];

    await persistence.clear();
    await persistence.saveSlots({ slot1: {} });
    await persistence.saveGlobalDeviceVariables({ textSpeed: 42 });
    await persistence.saveGlobalAccountVariables({ routeUnlocked: true });
    await persistence.saveGlobalRuntime([]);
    await persistence.applyScopedDataUpdates(updates);

    expect(invoke.mock.calls).toEqual([
      ["clear_player_persistence", undefined],
      ["save_player_save_slots", { saveSlots: { slot1: {} } }],
      [
        "save_player_persistence_value",
        { key: "globalDeviceVariables", value: { textSpeed: 42 } },
      ],
      [
        "save_player_persistence_value",
        { key: "globalAccountVariables", value: { routeUnlocked: true } },
      ],
      ["save_player_persistence_value", { key: "globalRuntime", value: {} }],
      ["apply_player_scoped_data_updates", { updates }],
    ]);
    expect(() => persistence.applyScopedDataUpdates({})).toThrow(
      "applyScopedDataUpdates requires an updates array.",
    );
  });
});
