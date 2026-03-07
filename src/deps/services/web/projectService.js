import { nanoid } from "nanoid";
import { createProjectServiceCore } from "../shared/projectServiceCore.js";
import { createWebProjectServiceAdapters } from "./projectServiceAdapters.js";

export const createProjectService = ({
  router,
  filePicker,
  onRemoteEvent,
  db,
}) => {
  const collabLog = (level, message, meta = {}) => {
    const fn =
      level === "error"
        ? console.error.bind(console)
        : level === "warn"
          ? console.warn.bind(console)
          : console.log.bind(console);
    fn(`[routevn.collab.web] ${message}`, meta);
  };

  const { storageAdapter, fileAdapter, collabAdapter } =
    createWebProjectServiceAdapters({
      onRemoteEvent,
      collabLog,
    });

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
