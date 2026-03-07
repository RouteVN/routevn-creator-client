import { nanoid } from "nanoid";
import { createProjectServiceCore } from "./shared/projectServiceCore.js";
import { createTauriProjectServiceAdapters } from "./tauri/projectServiceAdapters.js";

export const createProjectService = ({ router, db, filePicker }) => {
  const collabLog = (level, message, meta = {}) => {
    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.log.bind(console);
    fn(`[routevn.collab.tauri] ${message}`, meta);
  };

  const { storageAdapter, fileAdapter, collabAdapter } =
    createTauriProjectServiceAdapters({ collabLog });

  return createProjectServiceCore({
    router,
    db,
    filePicker,
    idGenerator: nanoid,
    collabLog,
    storageAdapter,
    fileAdapter,
    collabAdapter,
  });
};
