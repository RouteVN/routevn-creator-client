const DEFAULT_USER_CONFIG = {
  groupImagesView: {
    zoomLevel: 1.0
  }
};

function createUserConfig(initState = DEFAULT_USER_CONFIG, localStorageKey = 'routevn-user-config') {
  const storedConfig = localStorage.getItem(localStorageKey);
  let currentConfig = storedConfig ? JSON.parse(storedConfig) : { ...initState };

  return {
    set: (key, val) => {
      const keys = key.split('.');
      let current = currentConfig;
      
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i];
        if (!current[k]) {
          current[k] = {};
        }
        current = current[k];
      }
      
      const targetKey = keys[keys.length - 1];
      current[targetKey] = val;
      
      // Immediate save for config changes
      localStorage.setItem(localStorageKey, JSON.stringify(currentConfig));
    },
    get: (key) => {
      const keys = key.split('.');
      let current = currentConfig;
      
      for (const k of keys) {
        if (current === null || current === undefined || typeof current !== 'object') {
          return undefined;
        }
        current = current[k];
      }
      
      return current;
    },
    getAll: () => currentConfig
  };
}

export { createUserConfig, DEFAULT_USER_CONFIG };