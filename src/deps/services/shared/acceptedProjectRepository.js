import { SCHEMA_VERSION, validatePayload } from "@routevn/creator-model";
import { STRICT_MODEL_SCHEMA_VERSION } from "../../../internal/projectCompatibility.js";
import { generateId as newCommandId } from "../../../internal/id.js";
import { applyCommandToRepositoryStateWithCreatorModel } from "../../../internal/creatorModelAdapter.js";
import { buildSceneOverview } from "../../../internal/project/sceneOverview.js";
import { buildSceneTextStats } from "../../../internal/sceneTextStats.js";
import { normalizeProjectLanguage } from "../../../internal/projectLanguage.js";
import { initialProjectData } from "./projectRepository.js";
import {
  createProjectAuthority,
  projectHistoryPrefix,
  readProjectHistory,
} from "./projectAuthority.js";
import { resolveLegacyProjectAuthority } from "./projectLegacyAuthority.js";
import { createProjectAcceptanceCoordinator } from "./projectAcceptanceCoordinator.js";
import { commandToSyncEvent } from "./collab/mappers.js";
import { decodeCommandEnvelope } from "./collab/commandCodec.js";
import { stripSceneLinesFromState } from "./projectRepositoryViews/shared.js";
import {
  loadAcceptedState,
  saveAcceptedState,
} from "./projectRepositoryViews/acceptedStateView.js";

export const createAcceptedProjectRepository = async ({
  reference,
  store,
  lease,
  isCurrent,
  generateId,
  now = Date.now,
  bootstrap = false,
  readCacheTrust = async () => undefined,
  writeCacheTrust = async () => {},
  onCacheError = () => {},
  onWriteError = () => {},
}) => {
  const projectId = reference.repositoryProjectId;
  const processCommand = ({ state, command }) => {
    const result = applyCommandToRepositoryStateWithCreatorModel({
      repositoryState: state,
      command,
      projectId,
    });
    if (!result.valid) return result;
    return {
      valid: true,
      state: result.repositoryState,
      validationWork: result.validationWork,
    };
  };
  const authority = createProjectAuthority({
    projectId,
    storageKey: reference.cacheKey,
    createInitialState: () => structuredClone(initialProjectData),
    validatePayload,
    processCommand,
    resolveLegacy: (history, { completeHistory }) =>
      resolveLegacyProjectAuthority({
        store,
        projectId,
        history,
        historyOnly:
          !completeHistory &&
          [...history.committed, ...history.drafts].some(
            (row) => row.type === "project.create",
          ),
        // Before strict authoring begins, complete old projects retain their
        // previous reader's cold/warm cache behavior. Checkpoint recovery and
        // prefixes of mixed histories always use an isolated cache overlay.
        persistDerivedCaches:
          completeHistory &&
          lease.writable &&
          [...history.committed, ...history.drafts].some(
            (row) => row.type === "project.create",
          ),
      }),
    loadCache: async (options) =>
      loadAcceptedState({
        store,
        ...options,
        trustedDigest: await readCacheTrust(),
      }),
  });
  // Insieme 2.1.2 validates driver values and returns exact numeric versions.
  const readHistory = () => readProjectHistory(store);
  const open = async () => {
    const history = await readHistory();
    return { history, accepted: await authority.resolve(history) };
  };
  const opened = lease.writable ? await lease.withLock(open) : await open();
  let { history, accepted } = opened;
  let activeSceneId;
  let cacheError;
  const listeners = new Set();
  const textStats = new Map();
  const revision = () =>
    accepted.frontier.committedCount + accepted.frontier.draftCount;
  const projection = () =>
    stripSceneLinesFromState(
      accepted.state,
      new Set(activeSceneId ? [activeSceneId] : []),
    );
  const notify = () => {
    for (const listener of listeners) {
      try {
        listener({ repositoryState: projection(), revision: revision() });
      } catch (error) {
        console.warn("Project state subscriber failed", error);
      }
    }
  };
  const saveCache = async () => {
    if (readOnly()) return;
    try {
      const digest = await saveAcceptedState({ store, accepted, now });
      await writeCacheTrust(digest);
      cacheError = undefined;
    } catch (error) {
      const shouldNotify = !cacheError;
      cacheError = error;
      if (shouldNotify) onCacheError();
    }
  };
  const coordinator = createProjectAcceptanceCoordinator({
    bootstrap,
    storageKey: reference.cacheKey,
    projectId,
    generateId,
    now,
    isCurrent,
    withLock: (_key, operation) => lease.withLock(operation),
    readHistory,
    readCursor: () => store.loadCursor(),
    onRefresh: async (actual) => {
      const next = await authority.resolve(actual.history);
      if (next.frontier.digest === accepted.frontier.digest) return;
      history = actual.history;
      accepted = next;
      textStats.clear();
      notify();
    },
    resolveState: async (source, limits) =>
      (await authority.resolve(source, limits)).state,
    validateCommand: processCommand,
    validatePayload,
    validateHistory: (source) => authority.resolve(source),
    persistDrafts: (records) =>
      store.insertDrafts(
        records.map((record) => ({
          id: record.id,
          ...commandToSyncEvent(decodeCommandEnvelope(record)),
          createdAt: record.createdAt,
        })),
      ),
    persistCommittedBatch: (input) => store.applyCommittedBatch(input),
    persistSubmitResult: (input) => store.applySubmitResult(input),
    publish: async (actual) => {
      history = actual.history;
      accepted = await authority.resolve(history);
      if (!accepted.state.scenes.items[activeSceneId])
        activeSceneId = undefined;
      textStats.clear();
      notify();
      await saveCache();
    },
  });
  const readOnly = () => lease.writable !== true;
  const submitCommands = async (requests, actor) => {
    if (readOnly())
      return {
        valid: false,
        error: {
          code: "project_read_only",
          message:
            "This project is open read-only because another window owns editing",
        },
      };
    const result = await coordinator.submit(requests, { actor });
    if (result.valid && cacheError) result.cacheStale = true;
    if (
      !result.valid &&
      [
        "partial_write",
        "write_outcome_unknown",
        "write_reconciliation_failed",
      ].includes(result.error.code)
    )
      onWriteError(result.error.code);
    return result;
  };
  const overview = (sceneId) =>
    buildSceneOverview({ repositoryState: accepted.state, sceneId });
  const computeTextStats = ({ sceneIds = [], language } = {}) => {
    const normalized = normalizeProjectLanguage(language);
    const values = {};
    for (const sceneId of sceneIds) {
      const scene = accepted.state.scenes.items[sceneId];
      if (!scene || scene.type === "folder") continue;
      const value = {
        ...buildSceneTextStats(scene, { language: normalized }),
        language: normalized,
      };
      textStats.set(sceneId, value);
      values[sceneId] = structuredClone(value);
    }
    return values;
  };
  const repository = {
    acceptedAuthority: true,
    submitCommands,
    applyCommittedBatch: (input) => coordinator.applyCommittedBatch(input),
    applySubmitResult: (input) => coordinator.applySubmitResult(input),
    reconcile: () => coordinator.reconcile(),
    isReadOnly: readOnly,
    getState(untilEventIndex) {
      if (untilEventIndex !== undefined)
        throw new Error("Use loadState for historical project snapshots");
      return projection();
    },
    getRevision: (index = revision()) =>
      Math.max(0, Math.min(index, revision())),
    getFileRecord: (fileId) =>
      structuredClone(accepted.state.files.items[fileId]),
    getContextState: async () => structuredClone(accepted.state),
    loadEvents: async () =>
      structuredClone([...history.committed, ...history.drafts]),
    loadState: async (untilEventIndex) =>
      untilEventIndex === undefined
        ? structuredClone(accepted.state)
        : (
            await authority.resolve(
              projectHistoryPrefix(
                history,
                Math.max(0, Math.min(untilEventIndex, revision())),
              ),
            )
          ).state,
    // Compatibility diagnostics distinguish chronological history replay from
    // the opened projection, which may have a retained recovery source.
    loadHistoryState: async () =>
      (
        await resolveLegacyProjectAuthority({
          store,
          projectId,
          history,
          historyOnly: true,
        })
      ).state,
    subscribe(listener, { emitCurrent = true } = {}) {
      listeners.add(listener);
      if (emitCurrent)
        listener({ repositoryState: projection(), revision: revision() });
      return () => listeners.delete(listener);
    },
    async setActiveSceneId(sceneId) {
      activeSceneId = sceneId;
      notify();
    },
    async clearActiveSceneId() {
      activeSceneId = undefined;
      notify();
    },
    getSceneOverview: async (sceneId) => overview(sceneId),
    loadSceneOverviews: async ({ sceneIds = [] } = {}) =>
      Object.fromEntries(
        sceneIds
          .map((sceneId) => [sceneId, overview(sceneId)])
          .filter(([, value]) => value),
      ),
    ensureSceneTextStats: async (options) => computeTextStats(options),
    loadSceneTextStats: async ({ sceneIds = [] } = {}) =>
      Object.fromEntries(
        sceneIds
          .filter((id) => textStats.has(id))
          .map((id) => [id, structuredClone(textStats.get(id))]),
      ),
    cacheSceneTextStats: async ({
      sceneId,
      textStats: value,
      expectedRevision,
    }) => {
      if (expectedRevision === revision())
        textStats.set(sceneId, structuredClone(value));
    },
    addEvent: async () => {
      throw new Error("Repository writes must pass through command acceptance");
    },
    addEvents: async () => {
      throw new Error("Repository writes must pass through command acceptance");
    },
    flushMainCheckpoint: saveCache,
    flushMaterializedViews: saveCache,
    async close() {
      await coordinator.close();
      await lease.close();
    },
  };
  return repository;
};

export const strictProjectValidationEnabled =
  SCHEMA_VERSION >= STRICT_MODEL_SCHEMA_VERSION;

// Platform initializers supply an already-open empty store and its canonical
// lease. Initialization uses the same locked validation and persistence path as
// subsequent authoring, including the full project.create schema contract.
export const initializeAcceptedProject = async ({
  reference,
  store,
  lease,
  state,
}) => {
  let repository;
  try {
    repository = await createAcceptedProjectRepository({
      reference,
      store,
      lease,
      isCurrent: () => true,
      generateId: newCommandId,
      bootstrap: true,
    });
    const result = await repository.submitCommands(
      [
        {
          type: "project.create",
          partition: "main",
          payload: { state },
        },
      ],
      { userId: "local", clientId: "project-initialization" },
    );
    if (!result.valid) {
      const error = new Error(result.error.message);
      Object.assign(error, result.error);
      throw error;
    }
  } finally {
    if (repository) await repository.close();
    else await lease.close();
  }
};
