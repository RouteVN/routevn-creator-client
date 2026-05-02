const DEFAULT_USER_CONFIG = {
  appearance: {
    theme: "dark",
  },
  groupImagesView: {
    itemsPerRow: 6,
  },
  groupSoundsView: {
    itemsPerRow: 6,
  },
  groupVideosView: {
    itemsPerRow: 6,
  },
  groupTransformsView: {
    itemsPerRow: 6,
  },
  groupParticlesView: {
    itemsPerRow: 6,
  },
  groupSpritesheetsView: {
    itemsPerRow: 6,
  },
  groupColorsView: {
    itemsPerRow: 6,
  },
  groupFontsView: {
    itemsPerRow: 6,
  },
  groupTextStylesView: {
    itemsPerRow: 2,
  },
  groupLayoutsView: {
    itemsPerRow: 6,
  },
  groupControlsView: {
    itemsPerRow: 6,
  },
};

export const USER_CONFIG_DB_KEY = "userConfig";

const DEFAULT_WRITE_DELAY_MS = 150;

const cloneConfig = (value = {}) => {
  if (value === undefined) {
    return undefined;
  }

  return structuredClone(value);
};

const isConfigObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const mergeConfigObjects = (base = {}, patch = {}) => {
  const nextConfig = cloneConfig(base);

  for (const [key, value] of Object.entries(patch)) {
    if (isConfigObject(value) && isConfigObject(nextConfig[key])) {
      nextConfig[key] = mergeConfigObjects(nextConfig[key], value);
      continue;
    }

    nextConfig[key] = cloneConfig(value);
  }

  return nextConfig;
};

const normalizeUserConfig = (userConfig) => {
  if (!isConfigObject(userConfig)) {
    return cloneConfig(DEFAULT_USER_CONFIG);
  }

  return mergeConfigObjects(DEFAULT_USER_CONFIG, userConfig);
};

const getConfigValueByPath = (config, key) => {
  const path = String(key || "")
    .split(".")
    .filter(Boolean);
  let current = config;

  for (const segment of path) {
    if (!isConfigObject(current)) {
      return undefined;
    }
    current = current[segment];
  }

  return current;
};

const pruneEmptyObjectBranch = (root, path = []) => {
  for (let index = path.length - 1; index >= 0; index--) {
    const branchPath = path.slice(0, index + 1);
    let current = root;

    for (const segment of branchPath) {
      if (!isConfigObject(current)) {
        return;
      }
      current = current[segment];
    }

    if (!isConfigObject(current) || Object.keys(current).length > 0) {
      return;
    }

    let parent = root;
    for (let parentIndex = 0; parentIndex < index; parentIndex++) {
      parent = parent[branchPath[parentIndex]];
      if (!isConfigObject(parent)) {
        return;
      }
    }

    delete parent[branchPath[index]];
  }
};

const setConfigValueByPath = (config, key, value) => {
  const path = String(key || "")
    .split(".")
    .filter(Boolean);
  if (path.length === 0) {
    return;
  }

  let current = config;
  for (let index = 0; index < path.length - 1; index++) {
    const segment = path[index];
    if (!isConfigObject(current[segment])) {
      current[segment] = {};
    }
    current = current[segment];
  }

  const leafKey = path[path.length - 1];

  if (value === undefined) {
    delete current[leafKey];
    pruneEmptyObjectBranch(config, path.slice(0, -1));
    return;
  }

  current[leafKey] = value;
};

export const createUserConfigService = ({
  db,
  onLoadError,
  onPersistError,
  writeDelayMs = DEFAULT_WRITE_DELAY_MS,
} = {}) => {
  let currentUserConfig = cloneConfig(DEFAULT_USER_CONFIG);
  let persistTimer;
  let persistChain = Promise.resolve();
  let didReportPersistError = false;

  const persistUserConfig = () => {
    if (!db || typeof db.set !== "function") {
      return Promise.resolve();
    }

    const snapshot = cloneConfig(currentUserConfig);
    const nextPersist = persistChain
      .catch(() => {})
      .then(async () => {
        await db.set(USER_CONFIG_DB_KEY, snapshot);
        didReportPersistError = false;
      })
      .catch((error) => {
        if (!didReportPersistError) {
          didReportPersistError = true;
          onPersistError?.(error);
        }
      });

    persistChain = nextPersist;
    return nextPersist;
  };

  const schedulePersist = () => {
    if (persistTimer !== undefined) {
      clearTimeout(persistTimer);
    }

    persistTimer = setTimeout(() => {
      persistTimer = undefined;
      void persistUserConfig();
    }, writeDelayMs);
  };

  return {
    async initUserConfig() {
      if (!db || typeof db.get !== "function") {
        return cloneConfig(currentUserConfig);
      }

      try {
        const storedUserConfig = await db.get(USER_CONFIG_DB_KEY);
        currentUserConfig = normalizeUserConfig(storedUserConfig);
      } catch (error) {
        currentUserConfig = cloneConfig(DEFAULT_USER_CONFIG);
        onLoadError?.(error);
      }

      return cloneConfig(currentUserConfig);
    },

    getUserConfig(key) {
      return getConfigValueByPath(currentUserConfig, key);
    },

    setUserConfig(key, value) {
      setConfigValueByPath(currentUserConfig, key, value);
      schedulePersist();
    },

    getAllUserConfig() {
      return cloneConfig(currentUserConfig);
    },

    async flushUserConfig() {
      if (persistTimer !== undefined) {
        clearTimeout(persistTimer);
        persistTimer = undefined;
      }

      await persistUserConfig();
      return cloneConfig(currentUserConfig);
    },
  };
};
