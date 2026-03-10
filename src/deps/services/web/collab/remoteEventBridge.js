import { COLLAB_REMOTE_EVENT_ACTION } from "../../../../collab/remoteEvents.js";
import {
  getCommandDefinition,
  isLayoutCommandType,
  isStoryCommandType,
} from "../../../../domain/commandCatalog.js";

const resolveRemoteTarget = ({ command, event } = {}) => {
  const eventTarget = event?.payload?.target;
  if (eventTarget) {
    return eventTarget;
  }

  const commandTarget = command?.payload?.target;
  if (commandTarget) {
    return commandTarget;
  }

  const resourceType = command?.payload?.resourceType;
  if (resourceType) {
    return resourceType;
  }

  const commandType = command?.type ?? "";
  if (isLayoutCommandType(commandType)) {
    return "layouts";
  }

  if (isStoryCommandType(commandType)) {
    return "story";
  }

  const commandScope = getCommandDefinition(commandType)?.scope;
  if (commandScope) {
    return commandScope;
  }

  const scope = command?.scope;
  return scope || undefined;
};

const normalizeRemoteEvent = ({
  projectId,
  sourceType,
  command,
  committedEvent,
  event,
} = {}) => ({
  projectId: projectId ?? undefined,
  sourceType: sourceType ?? undefined,
  commandType: command?.type ?? undefined,
  eventType: event?.type ?? undefined,
  target: resolveRemoteTarget({ command, event }),
  committedId: committedEvent?.committedId ?? undefined,
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
