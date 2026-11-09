import { describe, expect, it, vi } from "vitest";
import { createProjectRepositoryService } from "../../src/deps/services/shared/projectRepositoryService.js";
import { initialProjectData } from "../../src/deps/services/shared/projectRepository.js";

const createDraftRowsFromRepositoryEvents = (events = []) =>
  events.map((event, index) => ({
    ...structuredClone(event),
    createdAt: Number(event?.clientTs) || index + 1,
  }));

const noopCollabAdapter = {
  beforeCreateRepository: async () => undefined,
  afterCreateRepository: async () => undefined,
};

const createProjectStateWithDirtyVariables = () => {
  const state = structuredClone(initialProjectData);
  state.variables = {
    items: {
      "system-variables-folder": {
        id: "system-variables-folder",
        type: "folder",
        name: "System",
      },
      _textSpeed: {
        id: "_textSpeed",
        type: "number",
        name: "_textSpeed",
        scope: "device",
        default: 50,
        value: 50,
      },
      _muteAll: {
        id: "_muteAll",
        type: "boolean",
        name: "_muteAll",
        scope: "device",
        default: false,
        value: false,
      },
      defaultFolder: {
        id: "defaultFolder",
        type: "folder",
        name: "Default",
      },
    },
    tree: [
      {
        id: "defaultFolder",
        children: [],
      },
      {
        id: "system-variables-folder",
        children: [
          {
            id: "_textSpeed",
          },
          {
            id: "_muteAll",
          },
        ],
      },
    ],
  };
  return state;
};

describe("projectRepositoryService main checkpoint reuse", () => {
  it.each([
    [false, false],
    [true, false],
    [false, true],
  ])(
    "recovers all events with non-sequential storage ids and reuses the result (draft: %s, invalid replay: %s)",
    async (withDraft, invalidReplay) => {
      const state = structuredClone(initialProjectData);
      state.files.items.orphan = {
        id: "orphan",
        type: "folder",
        name: "Folder",
      };
      const committed = Array.from({ length: 300 }, (_, index) => {
        const eventState = structuredClone(initialProjectData);
        eventState.project.resolution.width = 1000 + index;
        if (invalidReplay && index === 299) {
          eventState.files.items.orphan = {
            id: "orphan",
            type: "folder",
            name: "Folder",
          };
        }
        return {
          id: `event-${index}`,
          committedId: 1001 + index,
          partition: "m",
          projectId: "project-1",
          type: "project.create",
          schemaVersion: 1,
          payload: { state: eventState },
          clientTs: index + 1,
          meta: {},
        };
      });
      const drafts = withDraft
        ? [
            {
              ...structuredClone(committed.at(-1)),
              id: "draft-1",
              createdAt: 301,
            },
          ]
        : [];
      const historyStats = {
        committedCount: 300,
        latestCommittedId: 1300,
        draftCount: drafts.length,
        latestDraftClock: drafts.length ? 301 : 0,
      };
      let checkpoint = {
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 300 + drafts.length,
        value: state,
        meta: { historyStats },
        updatedAt: 1,
      };
      const originalCheckpoint = JSON.stringify(checkpoint);
      const store = {
        listCommittedAfter: vi.fn(async ({ sinceCommittedId, limit }) =>
          structuredClone(
            committed
              .filter((event) => event.committedId > sinceCommittedId)
              .slice(0, limit),
          ),
        ),
        listDraftsOrdered: vi.fn(async () => structuredClone(drafts)),
        getCursor: async () => 0,
        getRepositoryHistoryStats: async () => historyStats,
        isRepositoryHistoryStatsEqual: (left, right) =>
          JSON.stringify(left) === JSON.stringify(right),
        loadMaterializedViewCheckpoint: async ({ viewName }) =>
          viewName === "project_repository_main_state"
            ? structuredClone(checkpoint)
            : undefined,
        loadMaterializedViewCheckpoints: async () => [],
        saveMaterializedViewCheckpoint: vi.fn(async (value) => {
          if (value.viewName === "project_repository_main_state") {
            checkpoint = structuredClone(value);
            checkpoint.meta = { historyStats };
          }
        }),
        deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
        app: {
          get: async (key) => (key === "creatorVersion" ? 1 : undefined),
          set: async () => {},
        },
      };
      const createService = () =>
        createProjectRepositoryService({
          router: { getPayload: () => ({ p: "project-1" }) },
          db: {},
          creatorVersion: 1,
          storageAdapter: {
            readCreatorVersionByReference: async () => 1,
            resolveProjectReferenceByProjectId: async ({ projectId }) => ({
              cacheKey: projectId,
              repositoryProjectId: projectId,
            }),
            createStore: async () => store,
          },
          collabAdapter: noopCollabAdapter,
        });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        if (invalidReplay) {
          await expect(createService().ensureRepository()).rejects.toThrow(
            "missing item 'orphan'",
          );
          expect(JSON.stringify(checkpoint)).toBe(originalCheckpoint);
          expect(store.saveMaterializedViewCheckpoint).not.toHaveBeenCalled();
          expect(warn).toHaveBeenCalledTimes(1);
          return;
        }
        const repository = await createService().ensureRepository();
        expect(repository.getState().project.resolution.width).toBe(1299);
        expect(repository.getRevision()).toBe(300 + drafts.length);
        expect(checkpoint.lastCommittedId).toBe(300 + drafts.length);
        expect(checkpoint.value.project.resolution.width).toBe(1299);
        expect(warn).toHaveBeenCalledTimes(1);
        store.listCommittedAfter.mockClear();
        store.listDraftsOrdered.mockClear();
        const reopened = await createService().ensureRepository();
        expect(reopened.getState().project.resolution.width).toBe(1299);
        expect(store.listCommittedAfter).not.toHaveBeenCalled();
        expect(store.listDraftsOrdered).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    },
  );

  it.each([
    [true, false, false, false, false],
    [false, false, false, false, false],
    [false, true, false, false, false],
    [true, false, true, false, false],
    [false, false, false, true, false],
    [true, false, false, true, false],
    [false, false, false, false, true],
  ])(
    "replays an invalid checkpoint without writing on failure (valid history: %s, legacy: %s, later event: %s, past history: %s, no bootstrap: %s)",
    async (validHistory, legacy, laterEvent, pastHistory, noBootstrap) => {
      const badState = structuredClone(initialProjectData);
      badState.files.items.orphan = {
        id: "orphan",
        type: "folder",
        name: "Folder",
      };
      const historyStats = {
        committedCount: laterEvent ? 2 : 1,
        latestCommittedId: laterEvent ? 2 : 1,
        draftCount: 0,
        latestDraftClock: 0,
      };
      let checkpoint = {
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: pastHistory ? 2 : 1,
        value: badState,
        meta: { historyStats },
        updatedAt: 1,
      };
      if (legacy) delete checkpoint.meta;
      const originalCheckpoint = structuredClone(checkpoint);
      const event = {
        id: "event-1",
        committedId: 1,
        partition: "m",
        projectId: "project-1",
        type: noBootstrap ? "scene.create" : "project.create",
        schemaVersion: 1,
        payload: {
          state: validHistory ? structuredClone(initialProjectData) : badState,
        },
        clientTs: 1,
        meta: { clientTs: 1 },
      };
      const expectedState = structuredClone(initialProjectData);
      const events = [event];
      if (laterEvent) {
        expectedState.project.resolution.width = 1920;
        const nextEvent = structuredClone(event);
        nextEvent.id = "event-2";
        nextEvent.committedId = 2;
        nextEvent.payload.state = expectedState;
        events.push(nextEvent);
      }
      const store = {
        listCommittedAfter: vi.fn(async ({ sinceCommittedId }) =>
          structuredClone(
            events.filter(({ committedId }) => committedId > sinceCommittedId),
          ),
        ),
        listDraftsOrdered: vi.fn(async () => []),
        getCursor: vi.fn(async () => 0),
        getRepositoryHistoryStats: async () => historyStats,
        isRepositoryHistoryStatsEqual: (left, right) =>
          JSON.stringify(left) === JSON.stringify(right),
        loadMaterializedViewCheckpoint: async ({ viewName }) =>
          viewName === "project_repository_main_state"
            ? structuredClone(checkpoint)
            : undefined,
        saveMaterializedViewCheckpoint: vi.fn(async (value) => {
          checkpoint = structuredClone(value);
        }),
        deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
        app: {
          get: vi.fn(async (key) => (key === "creatorVersion" ? 1 : undefined)),
          set: vi.fn(async () => {}),
        },
      };
      const service = createProjectRepositoryService({
        router: { getPayload: () => ({ p: "project-1" }) },
        db: {},
        creatorVersion: 1,
        storageAdapter: {
          readCreatorVersionByReference: async () => 1,
          resolveProjectReferenceByProjectId: async ({ projectId }) => ({
            projectPath: `/tmp/${projectId}`,
            cacheKey: `/tmp/${projectId}`,
            repositoryProjectId: projectId,
          }),
          createStore: async () => store,
        },
        collabAdapter: noopCollabAdapter,
      });

      if (validHistory) {
        const repository = await service.ensureRepository();
        expect(repository.getState()).toEqual(expectedState);
        expect(checkpoint.value).toEqual(expectedState);
        expect(checkpoint.lastCommittedId).toBe(historyStats.committedCount);
        expect(store.saveMaterializedViewCheckpoint).toHaveBeenCalled();
      } else {
        await expect(service.ensureRepository()).rejects.toThrow(
          "missing item 'orphan'",
        );
        expect(JSON.stringify(checkpoint)).toBe(
          JSON.stringify(originalCheckpoint),
        );
        expect(store.saveMaterializedViewCheckpoint).not.toHaveBeenCalled();
        expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
        expect(store.app.set).not.toHaveBeenCalled();
      }
      expect(store.listCommittedAfter).toHaveBeenCalledTimes(
        noBootstrap ? 1 : 2,
      );
    },
  );

  it("skips full event loading when the persisted main checkpoint is current", async () => {
    const repositoryEvents = [
      {
        id: "project-create:project-1",
        partition: "m",
        projectId: "project-1",
        type: "project.create",
        schemaVersion: 1,
        payload: {
          state: structuredClone(initialProjectData),
        },
        clientTs: 1,
        meta: {
          clientTs: 1,
        },
      },
    ];
    const listDraftsOrdered = vi.fn(async () =>
      createDraftRowsFromRepositoryEvents(repositoryEvents),
    );
    const appGet = vi.fn(async (key) => {
      if (key === "creatorVersion") {
        return 1;
      }

      if (key === "projectInfo") {
        return {
          id: "project-1",
          namespace: "namespace-1",
          name: "Project 1",
          description: "",
          iconFileId: null,
        };
      }

      return undefined;
    });
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered,
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 1,
        value: structuredClone(initialProjectData),
        meta: {
          historyStats: {
            committedCount: 0,
            latestCommittedId: 0,
            draftCount: 1,
            latestDraftClock: 1,
          },
        },
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint: async () => {},
      deleteMaterializedViewCheckpoint: async () => {},
      app: {
        get: appGet,
        set: vi.fn(async () => {}),
      },
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const db = {
      get: vi.fn(async () => [
        {
          id: "project-1",
          name: "Project 1",
        },
      ]),
      set: vi.fn(async () => {}),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db,
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();

    expect(store.listCommittedAfter).not.toHaveBeenCalled();
    expect(listDraftsOrdered).not.toHaveBeenCalled();
    expect(repository.getState()).toEqual(initialProjectData);

    const events = await repository.loadEvents();

    expect(listDraftsOrdered).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
  });

  it("materializes creator-model normalized state from a reused main checkpoint", async () => {
    const dirtyState = createProjectStateWithDirtyVariables();
    const repositoryEvents = [
      {
        id: "project-create:project-1",
        partition: "m",
        projectId: "project-1",
        type: "project.create",
        schemaVersion: 1,
        payload: {
          state: dirtyState,
        },
        clientTs: 1,
        meta: {
          clientTs: 1,
        },
      },
    ];
    const listDraftsOrdered = vi.fn(async () =>
      createDraftRowsFromRepositoryEvents(repositoryEvents),
    );
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered,
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 1,
        value: dirtyState,
        meta: {
          historyStats: {
            committedCount: 0,
            latestCommittedId: 0,
            draftCount: 1,
            latestDraftClock: 1,
          },
        },
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint: vi.fn(async () => {}),
      deleteMaterializedViewCheckpoint: async () => {},
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "project-1",
              namespace: "namespace-1",
              name: "Project 1",
              description: "",
              iconFileId: null,
            };
          }

          return undefined;
        },
        set: vi.fn(async () => {}),
      },
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();
    const variables = repository.getState().variables;

    expect(listDraftsOrdered).not.toHaveBeenCalled();
    expect(variables.items._textSpeed).toBeUndefined();
    expect(variables.items._muteAll).toBeUndefined();
    expect(variables).toEqual({
      items: {
        defaultFolder: {
          id: "defaultFolder",
          type: "folder",
          name: "Default",
        },
        "system-variables-folder": {
          id: "system-variables-folder",
          type: "folder",
          name: "System",
        },
      },
      tree: [
        {
          id: "defaultFolder",
          children: [],
        },
        {
          id: "system-variables-folder",
          children: [],
        },
      ],
    });
  });

  it("backfills legacy checkpoint metadata and still skips full event loading", async () => {
    const saveMaterializedViewCheckpoint = vi.fn(async () => {});
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 1,
        latestCommittedId: 1,
        draftCount: 3087,
        latestDraftClock: 3088,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 3088,
        value: structuredClone(initialProjectData),
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint,
      deleteMaterializedViewCheckpoint: async () => {},
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "project-1",
              namespace: "namespace-1",
              name: "Project 1",
              description: "",
              iconFileId: null,
            };
          }

          return undefined;
        },
        set: vi.fn(async () => {}),
      },
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();

    expect(store.listDraftsOrdered).not.toHaveBeenCalled();
    expect(saveMaterializedViewCheckpoint).toHaveBeenCalledTimes(2);
    expect(saveMaterializedViewCheckpoint).toHaveBeenNthCalledWith(1, {
      viewName: "project_repository_main_state",
      partition: "m",
      viewVersion: "1",
      lastCommittedId: 3088,
      value: initialProjectData,
      updatedAt: 1,
    });
    expect(saveMaterializedViewCheckpoint).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        viewName: "project_repository_main_state",
        partition: "m",
        viewVersion: "1",
        lastCommittedId: 3088,
        value: initialProjectData,
      }),
    );
    expect(repository.getState()).toEqual(initialProjectData);
  });

  it("corrects a checkpoint revision past its history and still skips full event loading", async () => {
    const historyStats = {
      committedCount: 0,
      latestCommittedId: 0,
      draftCount: 3,
      latestDraftClock: 3,
    };
    const saveMaterializedViewCheckpoint = vi.fn(async () => {});
    const store = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => structuredClone(historyStats),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 5,
        value: structuredClone(initialProjectData),
        meta: {
          historyStats: structuredClone(historyStats),
        },
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint,
      deleteMaterializedViewCheckpoint: vi.fn(async () => {}),
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "project-1",
              namespace: "namespace-1",
              name: "Project 1",
              description: "",
              iconFileId: null,
            };
          }

          return undefined;
        },
        set: vi.fn(async () => {}),
      },
    };
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => store),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const repository = await service.ensureRepository();

      expect(store.listDraftsOrdered).not.toHaveBeenCalled();
      expect(store.deleteMaterializedViewCheckpoint).not.toHaveBeenCalled();
      expect(saveMaterializedViewCheckpoint).toHaveBeenNthCalledWith(1, {
        viewName: "project_repository_main_state",
        partition: "m",
        viewVersion: "1",
        lastCommittedId: 3,
        value: initialProjectData,
        updatedAt: 1,
      });
      expect(repository.getRevision()).toBe(3);
      expect(repository.getState()).toEqual(initialProjectData);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // The stale checkpoint is discarded before its state is cloned or validated.
  it.each([
    ["stale history stats", 1, true],
    ["no history stats and another revision", 2, false],
    ["stale history stats and a revision past the history", 2, true],
  ])(
    "flushes a fresh main checkpoint after replaying events for a checkpoint with %s",
    async (_label, staleRevision, withHistoryStats) => {
      const repositoryEvents = [
        {
          id: "project-create:project-1",
          partition: "m",
          projectId: "project-1",
          type: "project.create",
          schemaVersion: 1,
          payload: {
            state: structuredClone(initialProjectData),
          },
          clientTs: 1,
          meta: {
            clientTs: 1,
          },
        },
      ];
      const listDraftsOrdered = vi.fn(async () =>
        createDraftRowsFromRepositoryEvents(repositoryEvents),
      );
      const saveMaterializedViewCheckpoint = vi.fn(async () => {});
      // Copying the state for validation reads this nested value; the
      // discard warning's summary does not.
      let stateReads = 0;
      const staleValue = structuredClone(initialProjectData);
      staleValue.readProbe = {};
      Object.defineProperty(staleValue.readProbe, "value", {
        enumerable: true,
        get: () => {
          stateReads += 1;
          return 1;
        },
      });
      let checkpointDeleted = false;
      const deleteMaterializedViewCheckpoint = vi.fn(async () => {
        checkpointDeleted = true;
      });
      const store = {
        listCommittedAfter: vi.fn(async () => []),
        listDraftsOrdered,
        getCursor: vi.fn(async () => 0),
        getRepositoryHistoryStats: async () => ({
          committedCount: 0,
          latestCommittedId: 0,
          draftCount: 1,
          latestDraftClock: 2,
        }),
        isRepositoryHistoryStatsEqual: (left, right) =>
          JSON.stringify(left) === JSON.stringify(right),
        loadMaterializedViewCheckpoint: async () =>
          checkpointDeleted
            ? undefined
            : {
                viewName: "project_repository_main_state",
                viewVersion: "1",
                partition: "m",
                lastCommittedId: staleRevision,
                value: staleValue,
                meta: withHistoryStats
                  ? {
                      historyStats: {
                        committedCount: 0,
                        latestCommittedId: 0,
                        draftCount: 0,
                        latestDraftClock: 0,
                      },
                    }
                  : undefined,
                updatedAt: 1,
              },
        saveMaterializedViewCheckpoint,
        deleteMaterializedViewCheckpoint,
        app: {
          get: async (key) => {
            if (key === "creatorVersion") {
              return 1;
            }

            if (key === "projectInfo") {
              return {
                id: "project-1",
                namespace: "namespace-1",
                name: "Project 1",
                description: "",
                iconFileId: null,
              };
            }

            return undefined;
          },
          set: vi.fn(async () => {}),
        },
      };
      const storageAdapter = {
        readCreatorVersionByReference: vi.fn(async () => 1),
        resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
          projectPath: `/tmp/${projectId}`,
          cacheKey: `/tmp/${projectId}`,
          repositoryProjectId: projectId,
        })),
        createStore: vi.fn(async () => store),
      };
      const service = createProjectRepositoryService({
        router: {
          getPayload: () => ({
            p: "project-1",
          }),
        },
        db: {},
        creatorVersion: 1,
        storageAdapter,
        collabAdapter: noopCollabAdapter,
      });

      const repository = await service.ensureRepository();

      expect(stateReads).toBe(0);
      expect(listDraftsOrdered).toHaveBeenCalledTimes(1);
      expect(deleteMaterializedViewCheckpoint).toHaveBeenCalledWith({
        viewName: "project_repository_main_state",
        partition: "m",
      });
      expect(saveMaterializedViewCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          viewName: "project_repository_main_state",
          partition: "m",
          viewVersion: "1",
          lastCommittedId: 1,
        }),
      );
      expect(repository.getState()).toEqual(initialProjectData);
    },
  );

  it("recovers from a stale closed-pool store by evicting and recreating it", async () => {
    const staleStore = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => {
        throw new Error("attempted to acquire a connection on a closed pool");
      },
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          return undefined;
        },
      },
    };
    const freshStore = {
      listCommittedAfter: vi.fn(async () => []),
      listDraftsOrdered: vi.fn(async () => []),
      getCursor: vi.fn(async () => 0),
      getRepositoryHistoryStats: async () => ({
        committedCount: 0,
        latestCommittedId: 0,
        draftCount: 1,
        latestDraftClock: 1,
      }),
      isRepositoryHistoryStatsEqual: (left, right) =>
        JSON.stringify(left) === JSON.stringify(right),
      loadMaterializedViewCheckpoint: async () => ({
        viewName: "project_repository_main_state",
        viewVersion: "1",
        partition: "m",
        lastCommittedId: 1,
        value: structuredClone(initialProjectData),
        meta: {
          historyStats: {
            committedCount: 0,
            latestCommittedId: 0,
            draftCount: 1,
            latestDraftClock: 1,
          },
        },
        updatedAt: 1,
      }),
      saveMaterializedViewCheckpoint: async () => {},
      deleteMaterializedViewCheckpoint: async () => {},
      app: {
        get: async (key) => {
          if (key === "creatorVersion") {
            return 1;
          }

          if (key === "projectInfo") {
            return {
              id: "project-1",
              namespace: "namespace-1",
              name: "Project 1",
              description: "",
              iconFileId: null,
            };
          }

          return undefined;
        },
        set: vi.fn(async () => {}),
      },
    };
    let createStoreCallCount = 0;
    const evictStoreByReference = vi.fn(async () => {});
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => {
        createStoreCallCount += 1;
        return createStoreCallCount === 1 ? staleStore : freshStore;
      }),
      evictStoreByReference,
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({
          p: "project-1",
        }),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const repository = await service.ensureRepository();

    expect(evictStoreByReference).toHaveBeenCalledTimes(1);
    expect(storageAdapter.createStore.mock.calls.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(repository.getState()).toEqual(initialProjectData);
  });

  it("reads project info by path without creating a cached live store", async () => {
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      readProjectInfoByReference: vi.fn(async () => ({
        id: "project-1",
        namespace: "namespace-1",
        nativeApplicationIdentifier: "vn.routevn.player.native-1",
        name: "Project 1",
        description: "Description",
        iconFileId: "icon-1",
      })),
      resolveProjectReferenceByPath: vi.fn(async ({ projectPath }) => ({
        projectPath,
        cacheKey: projectPath,
        repositoryProjectId: projectPath,
      })),
      resolveProjectReferenceByProjectId: vi.fn(async ({ projectId }) => ({
        projectPath: `/tmp/${projectId}`,
        cacheKey: `/tmp/${projectId}`,
        repositoryProjectId: projectId,
      })),
      createStore: vi.fn(async () => {
        throw new Error("createStore should not be called");
      }),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({}),
      },
      db: {},
      creatorVersion: 1,
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const projectInfo = await service.getProjectInfoByPath("/tmp/project-1");

    expect(storageAdapter.readProjectInfoByReference).toHaveBeenCalledTimes(1);
    expect(storageAdapter.createStore).not.toHaveBeenCalled();
    expect(projectInfo).toEqual({
      id: "project-1",
      namespace: "namespace-1",
      nativeApplicationIdentifier: "vn.routevn.player.native-1",
      name: "Project 1",
      description: "Description",
      language: "en",
      iconFileId: "icon-1",
    });
  });

  it("persists a native application identifier when reading a legacy project by path", async () => {
    const writeProjectInfoByReference = vi.fn(async () => {});
    const storageAdapter = {
      readCreatorVersionByReference: vi.fn(async () => 1),
      readProjectInfoByReference: vi.fn(async () => ({
        id: "project-1",
        namespace: "namespace-1",
        name: "Project 1",
      })),
      writeProjectInfoByReference,
      resolveProjectReferenceByPath: vi.fn(async ({ projectPath }) => ({
        projectPath,
        cacheKey: projectPath,
        repositoryProjectId: projectPath,
      })),
    };
    const service = createProjectRepositoryService({
      router: {
        getPayload: () => ({}),
      },
      db: {},
      creatorVersion: 1,
      idGenerator: () => "native-legacy",
      storageAdapter,
      collabAdapter: noopCollabAdapter,
    });

    const projectInfo = await service.getProjectInfoByPath("/tmp/project-1");

    expect(projectInfo.nativeApplicationIdentifier).toBe(
      "vn.routevn.player.native-legacy",
    );
    expect(writeProjectInfoByReference).toHaveBeenCalledWith({
      reference: {
        projectPath: "/tmp/project-1",
        cacheKey: "/tmp/project-1",
        projectId: "/tmp/project-1",
        repositoryProjectId: "/tmp/project-1",
      },
      db: {},
      projectInfo,
    });
  });
});
