import { nanoid } from "nanoid";
import { createProjectServiceCore } from "./shared/projectServiceCore.js";
import { createTauriProjectServiceAdapters } from "./tauri/projectServiceAdapters.js";

const ENABLE_VERBOSE_COLLAB_LOGS = false;

export const createProjectService = ({
  router,
  db,
  filePicker,
  creatorVersion,
}) => {
  const collabLog = (level, message, meta = {}) => {
    if (!ENABLE_VERBOSE_COLLAB_LOGS && level !== "warn" && level !== "error") {
      return;
    }

    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.log.bind(console);
    fn(`[routevn.collab.tauri] ${message}`, meta);
  };

  const { storageAdapter, fileAdapter, collabAdapter } =
    createTauriProjectServiceAdapters({ collabLog, creatorVersion });

  return createProjectServiceCore({
    router,
    db,
    filePicker,
    idGenerator: nanoid,
    now: () => Date.now(),
    collabLog,
    creatorVersion,
    storageAdapter,
    fileAdapter,
    collabAdapter,
  });
};
