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
  collabConfig = {},
}) => {
  const collabDebugEnabled = resolveCollabDebugEnabled({
    enabled: collabConfig.debugEnabled,
  });
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
    endpointUrl: collabConfig.endpointUrl,
    userId: collabConfig.userId,
    clientId: collabConfig.clientId,
    token: collabConfig.token,
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
    .then(() => collabConnectionRuntime.bootCollabAutoConnect())
    .catch((error) => {
      collabDebugLog("warn", "background collab boot failed", {
        error: error?.message || "unknown",
      });
    });

  return projectService;
};
