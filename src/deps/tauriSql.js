import Database from "@tauri-apps/plugin-sql";

export const createTauriDatabase = () => {
  return {
    load: async (path) => {
      return await Database.load(path);
    },
  };
};

export default createTauriDatabase;
