import {
  ACCOUNT_VIEWED_REGISTRY_KEY,
  GLOBAL_ACCOUNT_VARIABLES_KEY,
  GLOBAL_DEVICE_VARIABLES_KEY,
  GLOBAL_RUNTIME_KEY,
  applyScopedDataUpdates as applyPlayerScopedDataUpdates,
  cloneJsonValue,
  createEmptyPlayerPersistenceState,
  createSaveSlotsBatch,
  persistenceRowsToState,
  snapshotPlayerPersistenceValue,
  snapshotSaveSlots,
  snapshotScopedDataUpdates,
} from "../../../internal/playerRuntimePersistence.js";
import { createDb } from "./db.js";

const PLAYER_RUNTIME_DATABASE_PATH = "sqlite:runtime.db";
const PLAYER_RUNTIME_SCHEMA_VERSION = 1;

const FIELD_BY_PERSISTENCE_KEY = Object.freeze({
  [GLOBAL_DEVICE_VARIABLES_KEY]: "globalDeviceVariables",
  [GLOBAL_ACCOUNT_VARIABLES_KEY]: "globalAccountVariables",
  [GLOBAL_RUNTIME_KEY]: "globalRuntime",
  [ACCOUNT_VIEWED_REGISTRY_KEY]: "accountViewedRegistry",
});

export const createPlayerRuntimePersistenceHost = ({
  createDatabase = createDb,
} = {}) => ({
  createPersistence() {
    const db = createDatabase({
      path: PLAYER_RUNTIME_DATABASE_PATH,
      durability: "full",
      schemaVersion: PLAYER_RUNTIME_SCHEMA_VERSION,
    });
    let state = createEmptyPlayerPersistenceState();
    let stateLoaded = false;
    let initializationPromise;
    let operationQueue = Promise.resolve();

    const enqueue = (operation) => {
      const nextOperation = operationQueue.then(operation);
      operationQueue = nextOperation.catch(() => {});
      return nextOperation;
    };

    const ensureInitialized = async () => {
      initializationPromise ??= db.init();
      await initializationPromise;
    };

    const reloadState = async () => {
      await ensureInitialized();
      stateLoaded = false;
      const nextState = persistenceRowsToState(await db.list());
      state = nextState;
      stateLoaded = true;
    };

    const ensureStateLoaded = async () => {
      if (!stateLoaded) {
        await reloadState();
      }
    };

    const saveFixedValue = (key, value) => {
      const snapshot = snapshotPlayerPersistenceValue(key, value);
      return enqueue(async () => {
        await ensureStateLoaded();
        await db.set(key, snapshot);
        state[FIELD_BY_PERSISTENCE_KEY[key]] = snapshot;
      });
    };

    return {
      kind: "native-sqlite",

      load() {
        return enqueue(async () => {
          await reloadState();
          return cloneJsonValue(state, "Loaded player persistence");
        });
      },

      clear() {
        return enqueue(async () => {
          await ensureInitialized();
          await db.clear();
          state = createEmptyPlayerPersistenceState();
          stateLoaded = true;
        });
      },

      saveSlots(value) {
        const snapshot = snapshotSaveSlots(value);
        return enqueue(async () => {
          await ensureStateLoaded();
          const batch = createSaveSlotsBatch(state.saveSlots, snapshot);
          await db.applyBatch(batch);
          state.saveSlots = snapshot;
        });
      },

      saveGlobalDeviceVariables(value) {
        return saveFixedValue(GLOBAL_DEVICE_VARIABLES_KEY, value);
      },

      saveGlobalAccountVariables(value) {
        return saveFixedValue(GLOBAL_ACCOUNT_VARIABLES_KEY, value);
      },

      saveGlobalRuntime(value) {
        return saveFixedValue(GLOBAL_RUNTIME_KEY, value);
      },

      applyScopedDataUpdates(updates = []) {
        const snapshot = snapshotScopedDataUpdates(updates);
        return enqueue(async () => {
          await ensureStateLoaded();
          const result = applyPlayerScopedDataUpdates(state, snapshot);
          await db.applyBatch({ puts: result.puts });
          state = result.nextState;
        });
      },
    };
  },
});

globalThis.__ROUTEVN_PLAYER_HOST__ = Object.freeze(
  createPlayerRuntimePersistenceHost(),
);
