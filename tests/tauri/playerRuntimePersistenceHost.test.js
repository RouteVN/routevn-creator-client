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

const createSaveSlot = (slotId, lineId = "line-1") => ({
  formatVersion: 1,
  slotId,
  savedAt: 1_700_000_000_000,
  state: {
    contexts: [
      {
        currentPointerMode: "read",
        pointers: {
          read: { sectionId: "section-1", lineId },
        },
        configuration: {},
        views: [],
        bgm: {},
        variables: {},
        rollback: {
          currentIndex: 0,
          isRestoring: false,
          replayStartIndex: 0,
          timeline: [
            {
              sectionId: "section-1",
              lineId,
              rollbackPolicy: "free",
            },
          ],
        },
      },
    ],
  },
});

describe("Windows player runtime persistence host", () => {
  it("loads native SQLite state directly", async () => {
    const nativeState = createPersistenceState({
      saveSlots: { 1: createSaveSlot(1) },
    });
    const invoke = vi.fn(async () => nativeState);
    const persistence = createHost(invoke).createPersistence();

    await expect(persistence.load()).resolves.toEqual(nativeState);
    expect(invoke).toHaveBeenCalledOnce();
    expect(invoke).toHaveBeenCalledWith("load_player_persistence", undefined);
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
    await persistence.saveSlots({ 1: createSaveSlot(1) });
    await persistence.saveGlobalDeviceVariables({ textSpeed: 42 });
    await persistence.saveGlobalAccountVariables({ routeUnlocked: true });
    await persistence.saveGlobalRuntime({ skipUnseenText: false });
    await persistence.applyScopedDataUpdates(updates);

    expect(invoke.mock.calls).toEqual([
      ["clear_player_persistence", undefined],
      ["save_player_save_slots", { saveSlots: { 1: createSaveSlot(1) } }],
      [
        "save_player_persistence_value",
        { key: "globalDeviceVariables", value: { textSpeed: 42 } },
      ],
      [
        "save_player_persistence_value",
        { key: "globalAccountVariables", value: { routeUnlocked: true } },
      ],
      [
        "save_player_persistence_value",
        { key: "globalRuntime", value: { skipUnseenText: false } },
      ],
      ["apply_player_scoped_data_updates", { updates }],
    ]);
    expect(() => persistence.applyScopedDataUpdates({})).toThrow(
      "applyScopedDataUpdates requires an updates array.",
    );
  });

  it("rejects non-object write values instead of silently saving empty objects", () => {
    const invoke = vi.fn(async () => undefined);
    const persistence = createHost(invoke).createPersistence();

    expect(() => persistence.saveSlots([])).toThrow(
      "Player persistence saveSlots must be a JSON object.",
    );
    expect(() => persistence.saveGlobalDeviceVariables(null)).toThrow(
      "Player persistence globalDeviceVariables must be a JSON object.",
    );
    expect(() => persistence.saveGlobalRuntime("invalid")).toThrow(
      "Player persistence globalRuntime must be a JSON object.",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects malformed loaded state instead of coercing it", async () => {
    const invoke = vi.fn(async () =>
      createPersistenceState({ globalRuntime: [] }),
    );
    const persistence = createHost(invoke).createPersistence();

    await expect(persistence.load()).rejects.toThrow(
      "Player persistence globalRuntime must be a JSON object.",
    );
    expect(invoke).toHaveBeenCalledOnce();
  });
});
