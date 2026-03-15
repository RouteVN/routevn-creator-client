import {
  assertRepositoryCommandEvent,
  repositoryEventToCommand,
} from "../shared/projectRepository.js";
import { COMMAND_TYPES } from "../../../internal/project/commands.js";
import { commandToSyncEvent } from "../shared/collab/mappers.js";

const normalizeCommittedCursor = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 0) return 0;
  return Math.floor(parsed);
};

export const toSyncSubmissionEvents = (repositoryEvents = []) =>
  repositoryEvents.map((repositoryEvent) => {
    assertRepositoryCommandEvent(repositoryEvent);
    return structuredClone(repositoryEvent);
  });

export const toUncommittedSyncSubmissionEvents = ({
  repositoryEvents = [],
  committedCursor = 0,
}) => {
  const normalizedEvents = Array.isArray(repositoryEvents)
    ? repositoryEvents
    : [];
  const cursor = normalizeCommittedCursor(committedCursor);
  const startIndex = Math.min(cursor, normalizedEvents.length);
  return toSyncSubmissionEvents(normalizedEvents.slice(startIndex));
};

export const toReplaySubmissionEvent = ({ repositoryEvent, actor }) => {
  assertRepositoryCommandEvent(repositoryEvent);
  const command = repositoryEventToCommand(repositoryEvent);
  const replayCommand = {
    ...command,
    actor: {
      userId: actor?.userId,
      clientId: actor?.clientId,
    },
  };

  return {
    id: replayCommand.id,
    partitions: Array.isArray(repositoryEvent?.partitions)
      ? [...repositoryEvent.partitions]
      : [],
    ...commandToSyncEvent(replayCommand),
  };
};

export const summarizeRepositoryEventsForSync = (events = []) => {
  const normalizedEvents = Array.isArray(events) ? events : [];
  const commands = normalizedEvents.map((event) =>
    repositoryEventToCommand(event),
  );
  const firstCommand = commands[0] || null;
  const commandTypes = commands
    .slice(0, 8)
    .map((command) => command?.type || "unknown");
  const hasProjectCreate = commands.some(
    (command) => command?.type === COMMAND_TYPES.PROJECT_CREATE,
  );

  return {
    repositoryEventCount: normalizedEvents.length,
    commandEventCount: commands.length,
    hasProjectCreate,
    commandTypesSample: commandTypes,
    firstCommandType: firstCommand?.type || null,
    firstCommandId: firstCommand?.id || null,
    firstCommandProjectId: firstCommand?.projectId || null,
    firstCommandPartition:
      firstCommand?.partitions?.find(
        (partition) => typeof partition === "string" && partition.length > 0,
      ) || null,
  };
};

export const ensureCachedCommittedCursor = async ({
  key,
  cache,
  loadCursor,
  onWarn = () => {},
}) => {
  if (cache.has(key)) {
    return cache.get(key);
  }

  let loaded = 0;
  try {
    loaded = normalizeCommittedCursor(await loadCursor());
  } catch (error) {
    onWarn({
      key,
      error,
    });
  }

  cache.set(key, loaded);
  return loaded;
};

export const persistCachedCommittedCursor = async ({
  key,
  cursor,
  cache,
  loadCursor,
  saveCursor,
  onWarn = () => {},
}) => {
  const normalized = normalizeCommittedCursor(cursor);
  const current = await ensureCachedCommittedCursor({
    key,
    cache,
    loadCursor,
    onWarn,
  });
  if (normalized <= current) {
    return current;
  }

  cache.set(key, normalized);

  try {
    await saveCursor(normalized);
  } catch (error) {
    onWarn({
      key,
      cursor: normalized,
      error,
    });
  }

  return normalized;
};

export const enqueueSerialTask = ({
  key,
  queueByKey,
  task,
  onError = () => {},
}) => {
  const previous = queueByKey.get(key) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task)
    .catch((error) => {
      onError({
        key,
        error,
      });
    });
  queueByKey.set(key, next);
  return next;
};
