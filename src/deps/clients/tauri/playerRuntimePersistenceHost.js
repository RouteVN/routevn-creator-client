(() => {
  const emptyObject = () => ({});

  const isPlainObject = (value) =>
    Object.prototype.toString.call(value) === "[object Object]";

  const normalizeObject = (value) =>
    isPlainObject(value) ? value : emptyObject();

  const normalizePersistence = (value = {}) => ({
    saveSlots: normalizeObject(value.saveSlots),
    globalDeviceVariables: normalizeObject(value.globalDeviceVariables),
    globalAccountVariables: normalizeObject(value.globalAccountVariables),
    globalRuntime: normalizeObject(value.globalRuntime),
    accountViewedRegistry: normalizeObject(value.accountViewedRegistry),
  });

  const invoke = (command, args) => {
    const tauriInvoke = globalThis.__TAURI__?.core?.invoke;
    if (typeof tauriInvoke !== "function") {
      throw new Error("The native RouteVN player bridge is unavailable.");
    }

    return tauriInvoke(command, args);
  };

  const saveValue = (key, value) =>
    invoke("save_player_persistence_value", {
      key,
      value: normalizeObject(value),
    });

  const createPersistence = ({ createLegacyPersistence } = {}) => ({
    kind: "native-sqlite",

    async load() {
      let loaded = await invoke("load_player_persistence");
      if (!loaded?.legacyMigrationCompleted) {
        let legacyState = normalizePersistence();

        if (!loaded?.hasNativeValues) {
          if (typeof createLegacyPersistence !== "function") {
            throw new Error(
              "The legacy player persistence reader is unavailable.",
            );
          }

          const legacyPersistence = createLegacyPersistence();
          legacyState = normalizePersistence(await legacyPersistence.load());
        }

        loaded = await invoke("complete_legacy_player_persistence_migration", {
          legacyState,
        });
      }

      return normalizePersistence(loaded?.persistence);
    },

    clear() {
      return invoke("clear_player_persistence");
    },

    saveSlots(value) {
      return saveValue("saveSlots", value);
    },

    saveGlobalDeviceVariables(value) {
      return saveValue("globalDeviceVariables", value);
    },

    saveGlobalAccountVariables(value) {
      return saveValue("globalAccountVariables", value);
    },

    saveGlobalRuntime(value) {
      return saveValue("globalRuntime", value);
    },

    applyScopedDataUpdates(updates = []) {
      if (!Array.isArray(updates)) {
        throw new Error("applyScopedDataUpdates requires an updates array.");
      }

      return invoke("apply_player_scoped_data_updates", { updates });
    },
  });

  globalThis.__ROUTEVN_PLAYER_HOST__ = Object.freeze({
    createPersistence,
  });
})();
