import { COLLAB_REMOTE_EVENT_ACTION } from "../../../../collab/remoteEvents.js";

const resolveRemoteTarget = ({ command, event } = {}) => {
  const eventTarget = event?.payload?.target;
  if (typeof eventTarget === "string" && eventTarget.length > 0) {
    return eventTarget;
  }

  const commandTarget = command?.payload?.target;
  if (typeof commandTarget === "string" && commandTarget.length > 0) {
    return commandTarget;
  }

  const resourceType = command?.payload?.resourceType;
  if (typeof resourceType === "string" && resourceType.length > 0) {
    return resourceType;
  }

  const commandType = command?.type ?? "";
  if (commandType.startsWith("variable.")) {
    return "variables";
  }

  if (commandType.startsWith("layout.")) {
    return "layouts";
  }

  if (
    commandType.startsWith("scene.") ||
    commandType.startsWith("section.") ||
    commandType.startsWith("line.")
  ) {
    return "story";
  }

  const scope = command?.scope;
  return typeof scope === "string" && scope.length > 0 ? scope : null;
};

const normalizeRemoteEvent = ({
  projectId,
  sourceType,
  command,
  committedEvent,
  event,
} = {}) => ({
  projectId: projectId ?? null,
  sourceType: sourceType ?? null,
  commandType: command?.type ?? null,
  eventType: event?.type ?? null,
  target: resolveRemoteTarget({ command, event }),
  committedId: committedEvent?.committed_id ?? null,
  command,
  event,
  committedEvent,
});

export const createRemoteEventBridge = ({ subject, collabDebugLog }) => {
  let remoteEventQueue = Promise.resolve();

  return (payload) => {
    const normalized = normalizeRemoteEvent(payload);

    collabDebugLog("info", "remote event received", normalized);

    remoteEventQueue = remoteEventQueue
      .catch(() => {})
      .then(() => {
        subject.dispatch(COLLAB_REMOTE_EVENT_ACTION, normalized);
        collabDebugLog("info", "remote event dispatched", normalized);
      })
      .catch((error) => {
        collabDebugLog("error", "remote event dispatch failed", {
          error: error?.message || "unknown",
        });
      });

    return remoteEventQueue;
  };
};
