import { createProjectServiceCore } from "../shared/projectServiceCore.js";
import { createIOSProjectServiceAdapters } from "./projectServiceAdapters.js";
import { callIOSBridge } from "../../clients/ios/bridge.js";
import { generateId } from "../../../internal/id.js";

const ENABLE_VERBOSE_COLLAB_LOGS = false;

const requestNativeIOSProjectExport = ({ projectId, destinationUri }) => {
  return callIOSBridge("exportProjectFolder", {
    projectId,
    destinationUri,
  });
};

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
          : console.debug.bind(console);
    fn(`[routevn.collab.ios] ${message}`, meta);
  };

  const { storageAdapter, fileAdapter, collabAdapter } =
    createIOSProjectServiceAdapters({ collabLog, creatorVersion });

  const projectService = createProjectServiceCore({
    router,
    db,
    filePicker,
    idGenerator: generateId,
    now: () => Date.now(),
    collabLog,
    creatorVersion,
    storageAdapter,
    fileAdapter,
    collabAdapter,
  });

  return {
    ...projectService,

    async exportProjectFolder({ projectId, destinationUri } = {}) {
      const targetProjectId = projectId || projectService.getEnsuredProjectId();
      if (!targetProjectId) {
        throw new Error("No project selected.");
      }

      await projectService.releaseProjectRuntime(targetProjectId);
      try {
        return await requestNativeIOSProjectExport({
          projectId: targetProjectId,
          destinationUri,
        });
      } finally {
        try {
          await projectService.ensureRepository();
        } catch {
          // The page can recover on the next project operation.
        }
      }
    },
  };
};
