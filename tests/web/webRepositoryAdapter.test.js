import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  getTemplateFiles: vi.fn(),
  loadTemplate: vi.fn(),
  resolveProjectResolutionForWrite: vi.fn(),
  scaleTemplateProjectStateForResolution: vi.fn(),
}));

vi.mock("../../src/deps/clients/web/templateLoader.js", () => ({
  getTemplateFiles: mocked.getTemplateFiles,
  loadTemplate: mocked.loadTemplate,
}));

vi.mock("../../src/internal/projectResolution.js", () => ({
  DEFAULT_PROJECT_RESOLUTION: {
    width: 1280,
    height: 720,
  },
  requireProjectResolution: vi.fn(),
  resolveProjectResolutionForWrite: mocked.resolveProjectResolutionForWrite,
  scaleTemplateProjectStateForResolution:
    mocked.scaleTemplateProjectStateForResolution,
}));

import {
  createProjectCreateRepositoryEvent,
  initialProjectData,
} from "../../src/deps/services/shared/projectRepository.js";
import { loadRepositoryEventsFromClientStore } from "../../src/deps/services/shared/collab/clientStoreHistory.js";
import { COMMAND_EVENT_MODEL } from "../../src/internal/project/commands.js";
import { expectInitializedProjectStorageContract } from "../support/projectInitializationContract.js";
import {
  createInsiemeWebStoreAdapter,
  initializeProject,
  readProjectAppValue,
} from "../../src/deps/clients/web/webRepositoryAdapter.js";

const createObjectStoreNames = (stores) => ({
  contains(name) {
    return stores.has(name);
  },
  [Symbol.iterator]: function* iterator() {
    yield* stores.keys();
  },
});

const createIndexedDbStub = () => {
  const databases = new Map();

  const makeRequest = (executor) => {
    const request = {
      onsuccess: undefined,
      onerror: undefined,
      onupgradeneeded: undefined,
      onblocked: undefined,
      result: undefined,
      error: undefined,
    };

    queueMicrotask(() => {
      executor(request);
    });

    return request;
  };

  const getStoreKey = (storeState, value) => {
    if (Array.isArray(storeState.keyPath)) {
      return JSON.stringify(storeState.keyPath.map((key) => value?.[key]));
    }
    return value?.[storeState.keyPath];
  };

  const createDbHandle = (dbState) => ({
    get objectStoreNames() {
      return createObjectStoreNames(dbState.stores);
    },
    createObjectStore(name, options = {}) {
      if (!dbState.stores.has(name)) {
        dbState.stores.set(name, {
          keyPath: options.keyPath ?? "id",
          records: new Map(),
        });
      }
    },
    deleteObjectStore(name) {
      dbState.stores.delete(name);
    },
    transaction(storeName) {
      const storeState = dbState.stores.get(storeName);
      if (!storeState) {
        throw new Error(`Unknown object store '${storeName}'`);
      }

      return {
        objectStore() {
          return {
            get(key) {
              return makeRequest((request) => {
                request.result = structuredClone(
                  storeState.records.get(
                    Array.isArray(storeState.keyPath)
                      ? JSON.stringify(key)
                      : key,
                  ),
                );
                request.onsuccess?.({ target: request });
              });
            },
            put(value) {
              return makeRequest((request) => {
                const key = getStoreKey(storeState, value);
                storeState.records.set(key, structuredClone(value));
                request.result = key;
                request.onsuccess?.({ target: request });
              });
            },
            delete(key) {
              return makeRequest((request) => {
                storeState.records.delete(
                  Array.isArray(storeState.keyPath) ? JSON.stringify(key) : key,
                );
                request.result = undefined;
                request.onsuccess?.({ target: request });
              });
            },
            clear() {
              return makeRequest((request) => {
                storeState.records.clear();
                request.result = undefined;
                request.onsuccess?.({ target: request });
              });
            },
          };
        },
      };
    },
    close() {},
  });

  return {
    open(name, version) {
      return makeRequest((request) => {
        const previousState = databases.get(name);
        const previousVersion = previousState?.version ?? 0;
        const resolvedVersion =
          Number.isFinite(Number(version)) && Number(version) > 0
            ? Number(version)
            : previousVersion || 1;

        let dbState = previousState;
        const shouldUpgrade = !dbState || resolvedVersion > previousVersion;
        if (!dbState) {
          dbState = {
            name,
            version: resolvedVersion,
            stores: new Map(),
          };
          databases.set(name, dbState);
        }

        const dbHandle = createDbHandle(dbState);
        request.result = dbHandle;

        if (shouldUpgrade) {
          dbState.version = resolvedVersion;
          request.onupgradeneeded?.({
            oldVersion: previousVersion,
            target: {
              result: dbHandle,
            },
          });
        }

        request.onsuccess?.({
          target: {
            result: dbHandle,
          },
        });
      });
    },
    deleteDatabase(name) {
      return makeRequest((request) => {
        databases.delete(name);
        request.result = undefined;
        request.onsuccess?.({ target: request });
      });
    },
  };
};

const deleteDatabase = async (name) =>
  new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });

const openDatabase = async (name, version) =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });

const createLegacyEventsDatabase = async (name) =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("events")) {
        db.createObjectStore("events", {
          keyPath: "id",
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = (event) => {
      event.target.result.close();
      resolve();
    };
    request.onerror = (event) => reject(event.target.error);
  });

const createRawClientStoreStub = ({
  committed = [],
  drafts = [],
  cursor = 0,
} = {}) => {
  const state = {
    committed: committed.map((event) => structuredClone(event)),
    drafts: drafts.map((event) => structuredClone(event)),
    cursor,
    submitResults: [],
  };

  return {
    async listCommittedAfter({ sinceCommittedId = 0, limit } = {}) {
      const startIndex = Math.max(0, Number(sinceCommittedId) || 0);
      const normalizedLimit =
        Number.isInteger(limit) && limit > 0 ? limit : state.committed.length;
      return state.committed
        .slice(startIndex, startIndex + normalizedLimit)
        .map((event) => structuredClone(event));
    },
    async listDraftsOrdered() {
      return state.drafts.map((event) => structuredClone(event));
    },
    async getCursor() {
      return state.cursor;
    },
    async insertDraft(draft) {
      state.drafts.push({
        draftClock: state.drafts.length + 1,
        ...structuredClone(draft),
      });
    },
    async applyCommittedBatch({ events, nextCursor }) {
      state.committed = (events || []).map((event) => structuredClone(event));
      state.cursor = Number(nextCursor) || 0;
    },
    async applySubmitResult({ result }) {
      state.submitResults.push(structuredClone(result));
    },
    getState() {
      return structuredClone(state);
    },
  };
};

describe("webRepositoryAdapter", () => {
  beforeEach(async () => {
    globalThis.indexedDB = createIndexedDbStub();
    mocked.getTemplateFiles.mockReset();
    mocked.loadTemplate.mockReset();
    mocked.resolveProjectResolutionForWrite.mockReset();
    mocked.scaleTemplateProjectStateForResolution.mockReset();

    await deleteDatabase("web-adapter-project");
    await deleteDatabase("web-init-project");
  });

  it("reads repository events from the browser client store and removes the legacy events store", async () => {
    const projectId = "web-adapter-project";
    const committedEvent = {
      ...createProjectCreateRepositoryEvent({
        projectId,
        state: initialProjectData,
      }),
      committedId: 1,
      clientTs: 100,
      serverTs: 100,
    };
    const rawClientStore = createRawClientStoreStub({
      committed: [committedEvent],
      cursor: 1,
    });

    const adapter = await createInsiemeWebStoreAdapter(projectId, {
      rawClientStore,
    });

    await expect(
      loadRepositoryEventsFromClientStore({
        store: adapter,
        projectId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        projectId,
        type: "project.create",
      }),
    ]);

    const db = await openDatabase(projectId, 4);
    expect([...db.objectStoreNames]).not.toContain("events");
    db.close();
  });

  it("rejects legacy browser projects that still store repository history in the events store", async () => {
    const projectId = "web-legacy-events-project";
    await createLegacyEventsDatabase(projectId);

    await expect(
      createInsiemeWebStoreAdapter(projectId, {
        rawClientStore: createRawClientStoreStub(),
      }),
    ).rejects.toMatchObject({
      code: "project_store_format_unsupported",
      details: expect.objectContaining({
        projectId,
        reason: "legacy_web_events_store_unsupported",
      }),
    });

    const db = await openDatabase(projectId);
    expect([...db.objectStoreNames]).toContain("events");
    db.close();
  });

  it("initializes project history by seeding bootstrap state into local drafts for offline projects", async () => {
    const projectId = "web-init-project";
    const rawClientStore = createRawClientStoreStub();

    mocked.getTemplateFiles.mockResolvedValue([]);
    mocked.loadTemplate.mockResolvedValue(structuredClone(initialProjectData));
    mocked.resolveProjectResolutionForWrite.mockReturnValue(
      structuredClone(initialProjectData.project.resolution),
    );
    mocked.scaleTemplateProjectStateForResolution.mockImplementation(
      (templateData) => templateData,
    );

    await initializeProject({
      projectId,
      template: "blank",
      projectInfo: {
        id: projectId,
        name: "Browser Project",
      },
      projectResolution: initialProjectData.project.resolution,
      creatorVersion: 21,
      rawClientStore,
    });

    expect(rawClientStore.getState().committed).toEqual([]);
    expect(rawClientStore.getState().drafts).toEqual([
      expect.objectContaining({
        projectId,
        type: "project.create",
      }),
    ]);

    const adapter = await createInsiemeWebStoreAdapter(projectId, {
      rawClientStore,
    });
    await expect(
      loadRepositoryEventsFromClientStore({
        store: adapter,
        projectId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        projectId,
        type: "project.create",
      }),
    ]);
    const historyStats = await adapter.getRepositoryHistoryStats();
    expect(historyStats).toEqual({
      committedCount: 0,
      latestCommittedId: 0,
      draftCount: 1,
      latestDraftClock: 1,
    });
    const checkpoint = await adapter.loadMaterializedViewCheckpoint({
      viewName: "project_repository_main_state",
      partition: "m",
    });
    const storedCreatorVersion = await adapter.app.get("creatorVersion");
    const storedProjectInfo = await adapter.app.get("projectInfo");

    expectInitializedProjectStorageContract({
      projectId,
      creatorVersion: 21,
      templateState: initialProjectData,
      expectedProjectInfo: {
        id: projectId,
        namespace: "",
        name: "Browser Project",
        description: "",
        iconFileId: null,
      },
      draftEvents: rawClientStore.getState().drafts,
      committedEvents: rawClientStore.getState().committed,
      checkpoint,
      storedCreatorVersion,
      storedProjectInfo,
      expectedHistoryStats: historyStats,
    });
    await expect(
      readProjectAppValue({
        projectId,
        key: "creatorVersion",
      }),
    ).resolves.toBe(21);
  });

  it("rejects and discards invalid local drafts during project load", async () => {
    const projectId = "web-invalid-draft-project";
    const committedEvent = {
      ...createProjectCreateRepositoryEvent({
        projectId,
        state: initialProjectData,
      }),
      committedId: 1,
      clientTs: 100,
      serverTs: 100,
    };
    const committedTagCreate = {
      id: "tag-committed-1",
      partition: "r:images",
      projectId,
      type: "tag.create",
      schemaVersion: COMMAND_EVENT_MODEL.schemaVersion,
      payload: {
        scopeKey: "images",
        tagId: "image-tag-1",
        data: {
          type: "tag",
          name: "Background",
        },
      },
      clientTs: 110,
      serverTs: 110,
      committedId: 2,
    };
    const duplicateDraft = {
      id: "tag-draft-duplicate",
      partition: "r:images",
      projectId,
      type: "tag.create",
      schemaVersion: COMMAND_EVENT_MODEL.schemaVersion,
      payload: {
        scopeKey: "images",
        tagId: "image-tag-2",
        data: {
          type: "tag",
          name: "Background",
        },
      },
      clientTs: 120,
      createdAt: 120,
    };
    const rawClientStore = createRawClientStoreStub({
      committed: [committedEvent, committedTagCreate],
      drafts: [duplicateDraft],
      cursor: 2,
    });
    const adapter = await createInsiemeWebStoreAdapter(projectId, {
      rawClientStore,
    });

    await expect(
      loadRepositoryEventsFromClientStore({
        store: adapter,
        projectId,
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        type: "project.create",
      }),
      expect.objectContaining({
        type: "tag.create",
        id: "tag-committed-1",
      }),
    ]);

    expect(rawClientStore.getState().submitResults).toEqual([
      {
        id: "tag-draft-duplicate",
        status: "rejected",
      },
    ]);
  });
});
