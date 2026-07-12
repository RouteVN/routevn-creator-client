import { describe, expect, it } from "vitest";

import {
  ACCOUNT_VIEWED_REGISTRY_KEY,
  GLOBAL_ACCOUNT_VARIABLES_KEY,
  GLOBAL_DEVICE_VARIABLES_KEY,
  GLOBAL_RUNTIME_KEY,
  applyScopedDataUpdates,
  createEmptyPlayerPersistenceState,
  createSaveSlotsBatch,
  persistenceRowsToState,
  saveSlotPersistenceKey,
  snapshotPlayerPersistenceValue,
  snapshotSaveSlots,
  snapshotScopedDataUpdates,
  validatePlayerPersistenceValue,
} from "../../src/internal/playerRuntimePersistence.js";
import {
  cloneFixture,
  createPersistenceState,
  createSaveSlot,
} from "../playerRuntimePersistenceFixtures.js";

const expectInvalidValue = (key, value, message) => {
  expect(() => snapshotPlayerPersistenceValue(key, value)).toThrow(message);
};

describe("player runtime persistence key/value contract", () => {
  it("accepts every physical key family and returns detached JSON snapshots", () => {
    const slot1 = createSaveSlot(1);
    const autoSlot = createSaveSlot("auto");
    const saveSlots = { 1: slot1, auto: autoSlot };
    const variables = {
      score: 12,
      enabled: true,
      label: "route-a",
      profile: { tags: ["reader", null] },
      choices: [1, 2],
    };

    const slotSnapshot = snapshotSaveSlots(saveSlots);
    const variableSnapshot = snapshotPlayerPersistenceValue(
      GLOBAL_DEVICE_VARIABLES_KEY,
      variables,
    );
    expect(() =>
      validatePlayerPersistenceValue(GLOBAL_ACCOUNT_VARIABLES_KEY, variables),
    ).not.toThrow();
    expect(() =>
      validatePlayerPersistenceValue(GLOBAL_RUNTIME_KEY, {
        dialogueTextSpeed: 50,
        autoForwardDelay: 1_000,
        skipUnseenText: false,
        skipTransitionsAndAnimations: false,
        soundVolume: 50,
        musicVolume: 50,
        muteAll: false,
      }),
    ).not.toThrow();
    expect(() =>
      validatePlayerPersistenceValue(ACCOUNT_VIEWED_REGISTRY_KEY, {
        sections: ["prologue", 2, { sectionId: "ending", lastLineId: null }],
        resources: ["cg-opening", 7, { resourceId: "cg-ending" }],
      }),
    ).not.toThrow();

    slot1.savedAt = 0;
    variables.profile.tags.push("mutated");
    expect(slotSnapshot["1"].savedAt).toBe(1_700_000_000_000);
    expect(variableSnapshot.profile.tags).toEqual(["reader", null]);
    expect(saveSlotPersistenceKey("1")).toBe("saveSlots:1");
    expect(saveSlotPersistenceKey("auto")).toBe("saveSlots:auto");
  });

  it("rejects unsupported or empty physical keys", () => {
    expect(() => validatePlayerPersistenceValue("saveSlots", {})).toThrow(
      "Unsupported runtime persistence key: saveSlots",
    );
    expect(() => validatePlayerPersistenceValue("saveSlots:", {})).toThrow(
      "Unsupported runtime persistence key: saveSlots:",
    );
    expect(() =>
      validatePlayerPersistenceValue("game:saveSlots:1", {}),
    ).toThrow("Unsupported runtime persistence key: game:saveSlots:1");
    expect(() => saveSlotPersistenceKey(1)).toThrow(
      "Runtime save slot key must not be empty",
    );
    expect(() => saveSlotPersistenceKey("")).toThrow(
      "Runtime save slot key must not be empty",
    );
  });

  it("rejects values that JSON serialization would discard or coerce", () => {
    const cyclic = {};
    cyclic.self = cyclic;
    const sparse = [];
    sparse[1] = "value";
    const symbolProperty = { valid: true };
    symbolProperty[Symbol("hidden")] = true;
    const hiddenProperty = { valid: true };
    Object.defineProperty(hiddenProperty, "hidden", { value: true });
    const accessorProperty = {};
    Object.defineProperty(accessorProperty, "value", {
      enumerable: true,
      get: () => true,
    });
    const namedArray = ["value"];
    Object.defineProperty(namedArray, "hidden", { value: true });

    const cases = [
      [{ value: undefined }, "must contain only JSON values"],
      [{ value: () => {} }, "must contain only JSON values"],
      [{ value: Symbol("value") }, "must contain only JSON values"],
      [{ value: 1n }, "must contain only JSON values"],
      [{ value: Number.NaN }, "must be a finite JSON number"],
      [{ value: Number.POSITIVE_INFINITY }, "must be a finite JSON number"],
      [{ value: new Date() }, "must contain only JSON objects and arrays"],
      [{ value: sparse }, "must not contain sparse or named array entries"],
      [cyclic, "must not contain cyclic data"],
      [symbolProperty, "must contain only JSON string-keyed properties"],
      [hiddenProperty, "must contain only enumerable JSON properties"],
      [accessorProperty, ".value must be a JSON data property"],
      [namedArray, "must not contain sparse or named array entries"],
    ];

    cases.forEach(([value, message]) => {
      expectInvalidValue(GLOBAL_DEVICE_VARIABLES_KEY, value, message);
    });
  });

  it("enforces fixed-row object and field contracts", () => {
    const cases = [
      [GLOBAL_DEVICE_VARIABLES_KEY, [], "must be a JSON object"],
      [
        GLOBAL_DEVICE_VARIABLES_KEY,
        { "": true },
        "contains an empty variable ID",
      ],
      [
        GLOBAL_ACCOUNT_VARIABLES_KEY,
        { route: null },
        "must be a JSON string, number, boolean, object, or array",
      ],
      [GLOBAL_RUNTIME_KEY, { autoMode: true }, ".autoMode is not supported"],
      [
        GLOBAL_RUNTIME_KEY,
        { dialogueTextSpeed: "fast" },
        ".dialogueTextSpeed must be a finite JSON number",
      ],
      [
        GLOBAL_RUNTIME_KEY,
        { soundVolume: -1 },
        ".soundVolume must be between 0 and 100",
      ],
      [
        GLOBAL_RUNTIME_KEY,
        { musicVolume: 101 },
        ".musicVolume must be between 0 and 100",
      ],
      [GLOBAL_RUNTIME_KEY, { muteAll: 0 }, ".muteAll must be a JSON boolean"],
      [ACCOUNT_VIEWED_REGISTRY_KEY, [], "must be a JSON object"],
      [
        ACCOUNT_VIEWED_REGISTRY_KEY,
        { unknown: [] },
        ".unknown is not supported",
      ],
      [
        ACCOUNT_VIEWED_REGISTRY_KEY,
        { sections: [{ sectionId: "" }] },
        ".sectionId must be a non-empty JSON string",
      ],
      [
        ACCOUNT_VIEWED_REGISTRY_KEY,
        { sections: [Number.MAX_SAFE_INTEGER + 1] },
        "must be a JavaScript-safe JSON integer",
      ],
      [
        ACCOUNT_VIEWED_REGISTRY_KEY,
        { resources: [{ resourceId: "cg", extra: true }] },
        ".extra is not supported",
      ],
    ];

    cases.forEach(([key, value, message]) => {
      expectInvalidValue(key, value, message);
    });
  });

  it("enforces the complete nested save-slot contract", () => {
    const invalidCases = [
      {
        name: "slot root",
        value: [],
        message: "must be a JSON object",
      },
      {
        name: "format version",
        mutate: (slot) => {
          slot.formatVersion = 2;
        },
        message: ".formatVersion must be 1",
      },
      {
        name: "slot identity",
        mutate: (slot) => {
          slot.slotId = 2;
        },
        message: ".slotId must match persistence key saveSlots:1",
      },
      {
        name: "negative save timestamp",
        mutate: (slot) => {
          slot.savedAt = -1;
        },
        message: ".savedAt must not be negative",
      },
      {
        name: "unsafe save timestamp",
        mutate: (slot) => {
          slot.savedAt = Number.MAX_SAFE_INTEGER + 1;
        },
        message: ".savedAt must be a JavaScript-safe JSON integer",
      },
      {
        name: "image",
        mutate: (slot) => {
          slot.image = 42;
        },
        message: ".image must be a JSON string",
      },
      {
        name: "closed state",
        mutate: (slot) => {
          slot.state.transient = true;
        },
        message: ".state.transient is not supported",
      },
      {
        name: "non-empty contexts",
        mutate: (slot) => {
          slot.state.contexts = [];
        },
        message: ".state.contexts must not be empty",
      },
      {
        name: "closed context",
        mutate: (slot) => {
          slot.state.contexts[0].projectData = {};
        },
        message: ".projectData is not supported",
      },
      {
        name: "pointer mode",
        mutate: (slot) => {
          slot.state.contexts[0].currentPointerMode = "write";
        },
        message: '.currentPointerMode must be "read"',
      },
      {
        name: "closed pointers",
        mutate: (slot) => {
          slot.state.contexts[0].pointers.write = {};
        },
        message: ".pointers.write is not supported",
      },
      {
        name: "pointer ids",
        mutate: (slot) => {
          slot.state.contexts[0].pointers.read.lineId = "";
        },
        message: ".lineId must be a non-empty JSON string",
      },
      {
        name: "configuration object",
        mutate: (slot) => {
          slot.state.contexts[0].configuration = [];
        },
        message: ".configuration must be a JSON object",
      },
      {
        name: "view objects",
        mutate: (slot) => {
          slot.state.contexts[0].views = ["dialogue"];
        },
        message: ".views[0] must be a JSON object",
      },
      {
        name: "bgm resource id",
        mutate: (slot) => {
          slot.state.contexts[0].bgm.resourceId = 1;
        },
        message: ".bgm.resourceId must be a JSON string",
      },
      {
        name: "context variable",
        mutate: (slot) => {
          slot.state.contexts[0].variables.score = null;
        },
        message: ".variables.score must be a JSON string",
      },
      {
        name: "context runtime fields",
        mutate: (slot) => {
          delete slot.state.contexts[0].runtime.menuPage;
        },
        message: ".runtime.menuPage is required",
      },
      {
        name: "context runtime pagination",
        mutate: (slot) => {
          slot.state.contexts[0].runtime.saveLoadPagination = 0;
        },
        message: ".saveLoadPagination must be at least 1",
      },
      {
        name: "rollback timeline",
        mutate: (slot) => {
          slot.state.contexts[0].rollback.timeline = [];
        },
        message: ".rollback.timeline must not be empty",
      },
      {
        name: "rollback current index",
        mutate: (slot) => {
          slot.state.contexts[0].rollback.currentIndex = 9;
        },
        message: ".currentIndex must identify an entry",
      },
      {
        name: "rollback restoring flag",
        mutate: (slot) => {
          slot.state.contexts[0].rollback.isRestoring = "false";
        },
        message: ".isRestoring must be a JSON boolean",
      },
      {
        name: "rollback replay index",
        mutate: (slot) => {
          slot.state.contexts[0].rollback.replayStartIndex = -1;
        },
        message: ".replayStartIndex must not be negative",
      },
      {
        name: "rollback pointer consistency",
        mutate: (slot) => {
          slot.state.contexts[0].pointers.read.lineId = "different";
        },
        message: ".timeline[currentIndex] must match the context read pointer",
      },
      {
        name: "closed checkpoint",
        mutate: (slot) => {
          slot.state.contexts[0].rollback.timeline[0].unknown = true;
        },
        message: ".unknown is not supported",
      },
      {
        name: "executed action type",
        mutate: (slot) => {
          slot.state.contexts[0].rollback.timeline[1].executedActions[0].type =
            "";
        },
        message: ".type must be a non-empty JSON string",
      },
      {
        name: "closed executed action",
        mutate: (slot) => {
          slot.state.contexts[0].rollback.timeline[1].executedActions[0].extra = true;
        },
        message: ".extra is not supported",
      },
    ];

    invalidCases.forEach(({ name, value, mutate, message }) => {
      const candidate = value ?? createSaveSlot(1);
      mutate?.(candidate);
      expect(
        () => snapshotPlayerPersistenceValue("saveSlots:1", candidate),
        name,
      ).toThrow(message);
    });

    expect(() =>
      snapshotPlayerPersistenceValue("saveSlots:auto", createSaveSlot("auto")),
    ).not.toThrow();
  });

  it("reconstructs aggregate state and rejects corrupt stored rows", () => {
    const slot1 = createSaveSlot(1);
    expect(
      persistenceRowsToState([
        { key: "saveSlots:1", value: slot1 },
        { key: GLOBAL_DEVICE_VARIABLES_KEY, value: { speed: 42 } },
      ]),
    ).toEqual(
      createPersistenceState({
        saveSlots: { 1: slot1 },
        globalDeviceVariables: { speed: 42 },
      }),
    );
    expect(persistenceRowsToState([])).toEqual(
      createEmptyPlayerPersistenceState(),
    );
    expect(() =>
      persistenceRowsToState([{ key: "unknown", value: {} }]),
    ).toThrow("Unsupported runtime persistence key: unknown");
    expect(() =>
      persistenceRowsToState([
        { key: GLOBAL_RUNTIME_KEY, value: { muteAll: "false" } },
      ]),
    ).toThrow("globalRuntime.muteAll must be a JSON boolean");
  });

  it("stores valid special string IDs as own JSON properties", () => {
    const specialSlot = createSaveSlot("__proto__");
    const state = persistenceRowsToState([
      { key: "saveSlots:__proto__", value: specialSlot },
    ]);
    expect(Object.hasOwn(state.saveSlots, "__proto__")).toBe(true);
    expect(state.saveSlots.__proto__).toEqual(specialSlot);
    expect(Object.getPrototypeOf(state.saveSlots)).toBe(Object.prototype);

    const updates = snapshotScopedDataUpdates([
      {
        scope: "device",
        path: "variables.__proto__",
        op: "set",
        value: { safe: true },
      },
    ]);
    const result = applyScopedDataUpdates(createPersistenceState(), updates);
    expect(
      Object.hasOwn(result.nextState.globalDeviceVariables, "__proto__"),
    ).toBe(true);
    expect(result.nextState.globalDeviceVariables.__proto__).toEqual({
      safe: true,
    });
    expect(Object.getPrototypeOf(result.nextState.globalDeviceVariables)).toBe(
      Object.prototype,
    );
  });

  it("diffs save-slot rows without rewriting unchanged slots", () => {
    const slot1 = createSaveSlot(1);
    const slot2 = createSaveSlot(2);
    const updatedSlot2 = createSaveSlot(2, { lineId: "line-4" });

    expect(
      createSaveSlotsBatch(
        { 1: slot1, 2: slot2 },
        { 2: updatedSlot2, auto: createSaveSlot("auto") },
      ),
    ).toEqual({
      puts: [
        { key: "saveSlots:2", value: updatedSlot2 },
        { key: "saveSlots:auto", value: createSaveSlot("auto") },
      ],
      deletes: ["saveSlots:1"],
    });
    expect(
      createSaveSlotsBatch({ 1: slot1 }, { 1: cloneFixture(slot1) }),
    ).toEqual({ puts: [], deletes: [] });
    const reorderedSlot1 = {
      slotId: slot1.slotId,
      state: slot1.state,
      savedAt: slot1.savedAt,
      formatVersion: slot1.formatVersion,
      engineMetadata: slot1.engineMetadata,
      image: slot1.image,
    };
    expect(createSaveSlotsBatch({ 1: slot1 }, { 1: reorderedSlot1 })).toEqual({
      puts: [],
      deletes: [],
    });
  });

  it("validates the complete scoped-update batch before it can be applied", () => {
    const validUpdate = {
      scope: "device",
      path: "variables.textSpeed",
      op: "set",
      value: 60,
    };
    const invalidCases = [
      [{}, "Malformed scoped persistence path"],
      [
        { scope: "device", path: "variables.", op: "set", value: 1 },
        "Malformed scoped persistence variable path",
      ],
      [
        { scope: "device", path: "variables.x", op: "delete", value: 1 },
        "Unsupported scoped persistence operation delete",
      ],
      [
        { scope: "session", path: "variables.x", op: "set", value: 1 },
        "Unsupported scoped persistence scope session",
      ],
      [
        { scope: "device", path: "variables.x", op: "set", value: null },
        "must be a JSON string, number, boolean, object, or array",
      ],
      [
        {
          scope: "device",
          path: "viewedRegistry",
          op: "markViewed",
          value: { sections: [] },
        },
        "Unsupported viewed-registry scope device",
      ],
      [
        {
          scope: "account",
          path: "viewedRegistry",
          op: "set",
          value: { sections: [] },
        },
        "Unsupported viewed-registry operation set",
      ],
      [
        {
          scope: "account",
          path: "viewedRegistry",
          op: "markViewed",
          value: {},
        },
        "must contain sections, resources, or both",
      ],
      [
        {
          scope: "account",
          path: "viewedRegistry",
          op: "markViewed",
          value: { sections: [{ sectionId: "", lineId: "line" }] },
        },
        ".sectionId must be a non-empty JSON string",
      ],
      [
        { scope: "account", path: "unknown", op: "set", value: true },
        "Unsupported scoped persistence path unknown",
      ],
    ];

    invalidCases.forEach(([invalidUpdate, message]) => {
      expect(() =>
        snapshotScopedDataUpdates([validUpdate, invalidUpdate]),
      ).toThrow(message);
    });
    expect(() => snapshotScopedDataUpdates({})).toThrow(
      "applyScopedDataUpdates requires an updates array",
    );
  });

  it("applies scoped updates in order and writes canonical registry rows", () => {
    const state = createPersistenceState({
      globalDeviceVariables: { textSpeed: 42 },
      globalAccountVariables: { routeUnlocked: true },
      accountViewedRegistry: {
        sections: [
          "whole-section",
          { sectionId: "partial-section", lastLineId: "line-1" },
        ],
        resources: ["cg-existing"],
      },
    });
    const updates = snapshotScopedDataUpdates([
      {
        scope: "device",
        path: "variables.textSpeed",
        op: "set",
        value: 50,
      },
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
          sections: [
            { sectionId: "whole-section", lineId: "ignored" },
            { sectionId: "partial-section", lineId: "line-2" },
            { sectionId: "new-section" },
          ],
          resources: [{ resourceId: "cg-existing" }, { resourceId: "cg-new" }],
        },
      },
    ]);

    const { nextState, puts } = applyScopedDataUpdates(state, updates);
    expect(nextState.globalDeviceVariables).toEqual({ textSpeed: 60 });
    expect(nextState.globalAccountVariables).toEqual({
      routeUnlocked: true,
      endingCount: 2,
    });
    expect(nextState.accountViewedRegistry).toEqual({
      sections: [
        { sectionId: "whole-section" },
        { sectionId: "partial-section", lastLineId: "line-2" },
        { sectionId: "new-section" },
      ],
      resources: [{ resourceId: "cg-existing" }, { resourceId: "cg-new" }],
    });
    expect(puts.map(({ key }) => key)).toEqual([
      GLOBAL_DEVICE_VARIABLES_KEY,
      GLOBAL_ACCOUNT_VARIABLES_KEY,
      ACCOUNT_VIEWED_REGISTRY_KEY,
    ]);
    expect(state.globalDeviceVariables).toEqual({ textSpeed: 42 });
    expect(state.accountViewedRegistry.sections[1].lastLineId).toBe("line-1");
  });
});
