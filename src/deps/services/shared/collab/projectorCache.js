import { createRepositoryCommandEvent } from "../projectRepository.js";
import {
  createProjectionGap,
  evaluateRemoteCommandCompatibility,
  REMOTE_COMMAND_COMPATIBILITY,
} from "./compatibility.js";
import { committedEventToCommand } from "./mappers.js";

export const PROJECTOR_CACHE_VERSION = "1";

const PROJECTOR_CACHE_VERSION_KEY = "projectorCacheVersion";
const PROJECTOR_GAP_KEY = "projectorGap";

const readAppValue = async (store, key) => {
  if (!store?.app || typeof store.app.get !== "function") return undefined;
  return store.app.get(key);
};

const writeAppValue = async (store, key, value) => {
  if (!store?.app || typeof store.app.set !== "function") return;
  await store.app.set(key, value);
};

const removeAppValue = async (store, key) => {
  if (!store?.app || typeof store.app.remove !== "function") return;
  await store.app.remove(key);
};

const getRepositoryEvents = async (repositoryStore) => {
  if (!repositoryStore || typeof repositoryStore.getEvents !== "function") {
    return [];
  }
  const events = await repositoryStore.getEvents();
  return Array.isArray(events) ? events : [];
};

export const listCommittedEvents = async (rawClientStore) => {
  if (typeof rawClientStore?._debug?.getCommitted !== "function") {
    throw new Error("raw client store does not expose committed event access");
  }
  const events = await rawClientStore._debug.getCommitted();
  return Array.isArray(events) ? events : [];
};

const toBootstrappedCommittedEvent = (repositoryEvent, index) => ({
  ...structuredClone(repositoryEvent),
  committedId: index + 1,
  clientTs: Number.isFinite(Number(repositoryEvent?.clientTs))
    ? Number(repositoryEvent.clientTs)
    : Number.isFinite(Number(repositoryEvent?.meta?.clientTs))
      ? Number(repositoryEvent.meta.clientTs)
      : index + 1,
  serverTs: Number.isFinite(Number(repositoryEvent?.clientTs))
    ? Number(repositoryEvent.clientTs)
    : Number.isFinite(Number(repositoryEvent?.meta?.clientTs))
      ? Number(repositoryEvent.meta.clientTs)
      : index + 1,
});

export const loadProjectorCacheVersion = async (repositoryStore) => {
  const value = await readAppValue(
    repositoryStore,
    PROJECTOR_CACHE_VERSION_KEY,
  );
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

export const saveProjectorCacheVersion = async (
  repositoryStore,
  version = PROJECTOR_CACHE_VERSION,
) => {
  await writeAppValue(repositoryStore, PROJECTOR_CACHE_VERSION_KEY, version);
};

export const loadProjectionGap = async (repositoryStore) => {
  const value = await readAppValue(repositoryStore, PROJECTOR_GAP_KEY);
  return value && typeof value === "object"
    ? structuredClone(value)
    : undefined;
};

export const saveProjectionGap = async (repositoryStore, gap) => {
  if (!gap || typeof gap !== "object") return;
  await writeAppValue(repositoryStore, PROJECTOR_GAP_KEY, structuredClone(gap));
};

export const clearProjectionGap = async (repositoryStore) => {
  await removeAppValue(repositoryStore, PROJECTOR_GAP_KEY);
};

export const ensureRawCommittedLogBootstrapped = async ({
  repositoryStore,
  rawClientStore,
}) => {
  const existingCommittedEvents = await listCommittedEvents(rawClientStore);
  if (existingCommittedEvents.length > 0) {
    return {
      committedEvents: existingCommittedEvents,
      bootstrapped: false,
    };
  }

  const repositoryEvents = await getRepositoryEvents(repositoryStore);
  if (repositoryEvents.length === 0) {
    return {
      committedEvents: [],
      bootstrapped: false,
    };
  }

  await rawClientStore.applyCommittedBatch({
    events: repositoryEvents.map(toBootstrappedCommittedEvent),
    nextCursor: repositoryEvents.length,
  });

  return {
    committedEvents: await listCommittedEvents(rawClientStore),
    bootstrapped: true,
  };
};

export const buildRepositoryProjectionFromCommittedEvents = ({
  committedEvents,
  supportedSchemaVersion,
}) => {
  const repositoryEvents = [];
  let projectionGap;

  for (const committedEvent of committedEvents || []) {
    if (projectionGap) break;

    const command = committedEventToCommand(committedEvent);
    if (!command) {
      projectionGap = createProjectionGap({
        command: undefined,
        committedEvent,
        compatibility: {
          status: REMOTE_COMMAND_COMPATIBILITY.INVALID,
          reason: "committed_event_unmappable",
          message: "Failed to map committed event to command",
        },
        sourceType: "rebuild",
      });
      break;
    }

    const compatibility = evaluateRemoteCommandCompatibility(command, {
      supportedSchemaVersion,
    });
    if (compatibility.status !== REMOTE_COMMAND_COMPATIBILITY.COMPATIBLE) {
      projectionGap = createProjectionGap({
        command,
        committedEvent,
        compatibility,
        sourceType: "rebuild",
      });
      break;
    }

    repositoryEvents.push(
      createRepositoryCommandEvent({
        command,
      }),
    );
  }

  return {
    repositoryEvents,
    projectionGap,
  };
};

export const clearDerivedRepositoryState = async (repositoryStore) => {
  if (typeof repositoryStore?.clearEvents !== "function") {
    throw new Error("repository store does not support clearEvents()");
  }
  if (typeof repositoryStore?.clearMaterializedViewCheckpoints !== "function") {
    throw new Error(
      "repository store does not support clearMaterializedViewCheckpoints()",
    );
  }

  await repositoryStore.clearEvents();
  await repositoryStore.clearMaterializedViewCheckpoints();
};

export const rebuildRepositoryProjectionCache = async ({
  repositoryStore,
  rawClientStore,
}) => {
  const committedEvents = await listCommittedEvents(rawClientStore);
  const { repositoryEvents, projectionGap } =
    buildRepositoryProjectionFromCommittedEvents({
      committedEvents,
    });

  await clearDerivedRepositoryState(repositoryStore);
  for (const event of repositoryEvents) {
    await repositoryStore.appendEvent(event);
  }

  await saveProjectorCacheVersion(repositoryStore);
  if (projectionGap) {
    await saveProjectionGap(repositoryStore, projectionGap);
  } else {
    await clearProjectionGap(repositoryStore);
  }

  return {
    rebuilt: true,
    repositoryEventCount: repositoryEvents.length,
    committedEventCount: committedEvents.length,
    projectionGap,
  };
};

export const ensureRepositoryProjectionCache = async ({
  repositoryStore,
  rawClientStore,
}) => {
  const storedVersion = await loadProjectorCacheVersion(repositoryStore);
  const { committedEvents, bootstrapped } =
    await ensureRawCommittedLogBootstrapped({
      repositoryStore,
      rawClientStore,
    });
  const repositoryEvents = await getRepositoryEvents(repositoryStore);

  if (bootstrapped) {
    if (storedVersion !== PROJECTOR_CACHE_VERSION) {
      return rebuildRepositoryProjectionCache({
        repositoryStore,
        rawClientStore,
      });
    }

    await saveProjectorCacheVersion(repositoryStore);
    return {
      rebuilt: false,
      bootstrapped: true,
      committedEventCount: committedEvents.length,
      repositoryEventCount: repositoryEvents.length,
      projectionGap: await loadProjectionGap(repositoryStore),
    };
  }

  const needsRebuild =
    storedVersion !== PROJECTOR_CACHE_VERSION ||
    (committedEvents.length > 0 && repositoryEvents.length === 0);

  if (!needsRebuild) {
    return {
      rebuilt: false,
      bootstrapped: false,
      committedEventCount: committedEvents.length,
      repositoryEventCount: repositoryEvents.length,
      projectionGap: await loadProjectionGap(repositoryStore),
    };
  }

  return rebuildRepositoryProjectionCache({
    repositoryStore,
    rawClientStore,
  });
};
