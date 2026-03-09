import { COLLAB_REMOTE_EVENT_ACTION } from "../../../../collab/remoteEvents.js";

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
  target: event?.payload?.target ?? null,
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
