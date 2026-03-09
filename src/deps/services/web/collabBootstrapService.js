import { createProjectService } from "./projectService.js";
import {
  createCollabDebugLogger,
  createCollabConnectionRuntime,
  resolveCollabDebugEnabled,
} from "./collab/connectionRuntime.js";
import { createRemoteEventBridge } from "./collab/remoteEventBridge.js";

export const createWebProjectServiceWithCollab = async ({
  router,
  filePicker,
  subject,
  db,
}) => {
  const collabDebugEnabled = resolveCollabDebugEnabled();
  const collabDebugLog = createCollabDebugLogger({
    enabled: collabDebugEnabled,
  });

  const onRemoteEvent = createRemoteEventBridge({
    subject,
    collabDebugLog,
  });

  const projectService = createProjectService({
    router,
    filePicker,
    onRemoteEvent,
    db,
  });

  const collabConnectionRuntime = createCollabConnectionRuntime({
    projectService,
    router,
    db,
    collabDebugLog,
  });

  if (typeof window !== "undefined") {
    window.routevnCollab = {
      connect: collabConnectionRuntime.connectCollabDebugSession,
      disconnect: collabConnectionRuntime.disconnectCollabDebugSession,
      status: collabConnectionRuntime.getCollabDebugStatus,
    };
  }

  if (collabDebugEnabled) {
    collabDebugLog("info", "debug helpers ready", {
      helpers: [
        "window.routevnCollab.connect(options)",
        "window.routevnCollab.disconnect()",
        "window.routevnCollab.status()",
      ],
    });
    collabConnectionRuntime.startCollabHeartbeatLogs();
  }

  Promise.resolve()
    .then(() => collabConnectionRuntime.bootCollabFromQuery())
    .catch((error) => {
      collabDebugLog("warn", "background collab boot failed", {
        error: error?.message || "unknown",
      });
    });

  return projectService;
};
