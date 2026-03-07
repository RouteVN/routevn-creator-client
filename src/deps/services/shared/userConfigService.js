const DEFAULT_USER_CONFIG = {
  groupImagesView: {
    zoomLevel: 1.0,
  },
  scenesMap: {
    zoomLevel: 1.5,
    panX: -120,
    panY: -200,
  },
};

const USER_CONFIG_KEY = "routevn-user-config";

const loadUserConfig = () => {
  const storedConfig = localStorage.getItem(USER_CONFIG_KEY);
  if (!storedConfig) {
    return { ...DEFAULT_USER_CONFIG };
  }

  try {
    return JSON.parse(storedConfig);
  } catch {
    return { ...DEFAULT_USER_CONFIG };
  }
};

export const createUserConfigService = () => {
  let currentUserConfig = loadUserConfig();

  return {
    getUserConfig(key) {
      const keys = key.split(".");
      let current = currentUserConfig;

      for (const itemKey of keys) {
        if (
          current === null ||
          current === undefined ||
          typeof current !== "object"
        ) {
          return undefined;
        }
        current = current[itemKey];
      }

      return current;
    },

    setUserConfig(key, value) {
      const keys = key.split(".");
      let current = currentUserConfig;

      for (let index = 0; index < keys.length - 1; index++) {
        const itemKey = keys[index];
        if (!current[itemKey]) {
          current[itemKey] = {};
        }
        current = current[itemKey];
      }

      const targetKey = keys[keys.length - 1];
      current[targetKey] = value;
      localStorage.setItem(USER_CONFIG_KEY, JSON.stringify(currentUserConfig));
    },

    getAllUserConfig() {
      return currentUserConfig;
    },
  };
};
