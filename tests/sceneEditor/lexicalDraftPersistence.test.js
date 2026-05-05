import { describe, expect, it, vi } from "vitest";
import {
  createSceneEditorDraftPersistence,
  getSceneEditorDraftSaveDelayMs,
} from "../../src/internal/ui/sceneEditorLexical/draftPersistence.js";

const createLine = (id, text) => ({
  id,
  sectionId: "section-1",
  actions: {
    dialogue: {
      content: [{ text }],
    },
  },
});

const createDirtyDraftSection = (lines = [createLine("line-1", "Hello")]) => ({
  sceneId: "scene-1",
  sectionId: "section-1",
  baseRevision: 1,
  dirty: true,
  lastSource: "editor",
  lines,
});

const createStore = ({
  draftSection = createDirtyDraftSection(),
  revision = 2,
  lastDraftFlushStartedAt = 0,
  draftSavePendingSinceAt = 0,
  draftSaveTimerId,
  draftFlushInFlight = false,
} = {}) => {
  const state = {
    draftSection,
    revision,
    lastDraftFlushStartedAt,
    draftSavePendingSinceAt,
    draftSaveTimerId,
    draftFlushInFlight,
  };

  return {
    state,
    selectDraftSection: () => state.draftSection,
    setDraftSection: ({ draftSection }) => {
      state.draftSection = draftSection;
    },
    selectRepositoryRevision: () => state.revision,
    selectLastDraftFlushStartedAt: () => state.lastDraftFlushStartedAt,
    setLastDraftFlushStartedAt: ({ timestamp }) => {
      state.lastDraftFlushStartedAt = timestamp;
    },
    selectDraftSavePendingSinceAt: () => state.draftSavePendingSinceAt,
    setDraftSavePendingSinceAt: ({ timestamp }) => {
      state.draftSavePendingSinceAt = timestamp;
    },
    selectDraftFlushInFlight: () => state.draftFlushInFlight,
    setDraftFlushInFlight: ({ value }) => {
      state.draftFlushInFlight = value === true;
    },
    selectDraftSaveTimerId: () => state.draftSaveTimerId,
    setDraftSaveTimerId: ({ timerId }) => {
      state.draftSaveTimerId = timerId;
    },
    clearDraftSaveTimer: () => {
      state.draftSaveTimerId = undefined;
    },
  };
};

describe("scene editor lexical draft persistence", () => {
  it("throttles text save delay while respecting the max wait cap", () => {
    const throttledStore = createStore({
      lastDraftFlushStartedAt: 1000,
      draftSavePendingSinceAt: 0,
    });
    const maxWaitStore = createStore({
      lastDraftFlushStartedAt: 0,
      draftSavePendingSinceAt: 1000,
    });

    expect(
      getSceneEditorDraftSaveDelayMs(throttledStore, {
        reason: "text",
        nowMs: () => 2500,
      }),
    ).toBe(3500);
    expect(
      getSceneEditorDraftSaveDelayMs(maxWaitStore, {
        reason: "text",
        nowMs: () => 9500,
      }),
    ).toBe(1500);
  });

  it("does not let max wait bypass the text throttle after a flush", () => {
    const store = createStore({
      lastDraftFlushStartedAt: 9000,
      draftSavePendingSinceAt: 1000,
    });

    expect(
      getSceneEditorDraftSaveDelayMs(store, {
        reason: "text",
        nowMs: () => 9500,
      }),
    ).toBe(4500);
  });

  it("guards direct non-forced flushes with the text throttle", async () => {
    vi.useFakeTimers();
    let now = 1200;
    const store = createStore({
      lastDraftFlushStartedAt: 1000,
      draftSavePendingSinceAt: 1100,
    });
    const syncSectionLinesSnapshot = vi.fn(async () => {});
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession: vi.fn(),
      nowMs: () => now,
    });

    try {
      await controller.flushSceneEditorDrafts(
        {
          store,
          projectService: {
            syncSectionLinesSnapshot,
          },
          render: vi.fn(),
          appService: {
            showAlert: vi.fn(),
          },
        },
        { rescheduleReason: "text" },
      );

      expect(syncSectionLinesSnapshot).not.toHaveBeenCalled();
      expect(store.state.draftSaveTimerId).toBeDefined();

      now = 6000;
      await vi.advanceTimersByTimeAsync(4800);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps throttling non-forced flushes if store timing is reset", async () => {
    vi.useFakeTimers();
    let now = 1000;
    const store = createStore();
    const syncSectionLinesSnapshot = vi.fn(async () => {});
    const projectService = {
      syncSectionLinesSnapshot,
    };
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession: vi.fn(),
      nowMs: () => now,
    });
    const deps = {
      store,
      projectService,
      render: vi.fn(),
      appService: {
        showAlert: vi.fn(),
      },
    };

    try {
      await controller.flushSceneEditorDrafts(deps);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();

      store.setLastDraftFlushStartedAt({ timestamp: 0 });
      store.setDraftSection({
        draftSection: createDirtyDraftSection([createLine("line-1", "After")]),
      });
      now = 1200;
      await controller.flushSceneEditorDrafts(deps);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();
      expect(store.state.draftSaveTimerId).toBeDefined();

      now = 6000;
      await vi.advanceTimersByTimeAsync(4800);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not force a draft write from action persistence inside the throttle window", async () => {
    vi.useFakeTimers();
    let now = 1000;
    const store = createStore();
    const syncSectionLinesSnapshot = vi.fn(async () => {});
    const actionTask = vi.fn(async () => {});
    const projectService = {
      syncSectionLinesSnapshot,
    };
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession: vi.fn(),
      nowMs: () => now,
    });
    const deps = {
      store,
      projectService,
      render: vi.fn(),
      appService: {
        showAlert: vi.fn(),
      },
    };

    try {
      await controller.flushSceneEditorDrafts(deps);

      store.setDraftSection({
        draftSection: createDirtyDraftSection([createLine("line-1", "After")]),
      });
      now = 1200;

      await controller.runSceneEditorPersistence(deps, actionTask);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();
      expect(actionTask).toHaveBeenCalledOnce();
      expect(store.state.draftSaveTimerId).toBeDefined();

      now = 6000;
      await vi.advanceTimersByTimeAsync(4800);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("guards a queued draft task before it writes inside the throttle window", async () => {
    vi.useFakeTimers();
    let now = 1000;
    let releaseFirstFlush;
    const initialLine = createLine("line-1", "Before");
    const advancedLine = createLine("line-1", "After");
    const store = createStore({
      draftSection: createDirtyDraftSection([initialLine]),
    });
    const syncSectionLinesSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseFirstFlush = resolve;
        }),
    );
    const projectService = {
      syncSectionLinesSnapshot,
    };
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession: vi.fn(),
      nowMs: () => now,
    });
    const deps = {
      store,
      projectService,
      render: vi.fn(),
      appService: {
        showAlert: vi.fn(),
      },
    };

    try {
      const firstFlush = controller.flushSceneEditorDrafts(deps, {
        force: true,
        enforceMinInterval: true,
      });
      while (syncSectionLinesSnapshot.mock.calls.length === 0) {
        await Promise.resolve();
      }

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();

      store.setDraftSection({
        draftSection: createDirtyDraftSection([advancedLine]),
      });
      void controller.flushSceneEditorDrafts(deps, {
        deferIfInFlight: false,
        enforceMinInterval: true,
        force: true,
      });

      releaseFirstFlush();
      await firstFlush;

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();
      expect(store.state.draftSaveTimerId).toBeDefined();

      syncSectionLinesSnapshot.mockImplementation(async () => {});
      now = 6000;
      await vi.advanceTimersByTimeAsync(5000);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(2);
      expect(syncSectionLinesSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sectionId: "section-1",
          lines: [advancedLine],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("flushes a dirty draft section through syncSectionLinesSnapshot and marks it clean", async () => {
    const store = createStore();
    const syncSectionLinesSnapshot = vi.fn(async () => {});
    const render = vi.fn();
    const reconcileCurrentEditorSession = vi.fn();
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession,
      nowMs: () => 1234,
    });

    await controller.flushSceneEditorDrafts({
      store,
      projectService: {
        syncSectionLinesSnapshot,
      },
      render,
      appService: {
        showAlert: vi.fn(),
      },
    });

    expect(syncSectionLinesSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        sectionId: "section-1",
        lines: [createLine("line-1", "Hello")],
      }),
    );
    expect(store.state.lastDraftFlushStartedAt).toBe(1234);
    expect(store.state.draftSavePendingSinceAt).toBe(0);
    expect(store.state.draftSection).toMatchObject({
      dirty: false,
      baseRevision: 2,
      lastSource: "repository",
    });
    expect(reconcileCurrentEditorSession).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("reschedules an advanced draft through debounce instead of immediately flushing another row", async () => {
    vi.useFakeTimers();
    let now = 5000;
    const initialLine = createLine("line-1", "Before");
    const advancedLine = createLine("line-1", "After");
    const store = createStore({
      draftSection: createDirtyDraftSection([initialLine]),
      revision: 2,
    });
    const render = vi.fn();
    const reconcileCurrentEditorSession = vi.fn();
    const syncSectionLinesSnapshot = vi.fn(async () => {
      store.setDraftSection({
        draftSection: createDirtyDraftSection([advancedLine]),
      });
    });
    const projectService = {
      syncSectionLinesSnapshot,
    };
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession,
      nowMs: () => now,
    });

    try {
      await controller.flushSceneEditorDrafts({
        store,
        projectService,
        render,
        appService: {
          showAlert: vi.fn(),
        },
      });

      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(1);
      expect(syncSectionLinesSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: "section-1",
          lines: [initialLine],
        }),
      );
      expect(store.state.draftSection).toMatchObject({
        dirty: true,
        baseRevision: 2,
        lines: [advancedLine],
      });
      expect(store.state.draftSaveTimerId).toBeDefined();
      expect(render).not.toHaveBeenCalled();
      expect(reconcileCurrentEditorSession).not.toHaveBeenCalled();

      now = 10000;
      await vi.advanceTimersByTimeAsync(5000);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(2);
      expect(syncSectionLinesSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sectionId: "section-1",
          lines: [advancedLine],
        }),
      );
      expect(store.state.draftSection).toMatchObject({
        dirty: false,
        baseRevision: 2,
        lastSource: "repository",
      });
      expect(render).toHaveBeenCalledOnce();
      expect(reconcileCurrentEditorSession).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });

  it("defers scheduled autosaves while a draft flush is already in flight", async () => {
    vi.useFakeTimers();
    let now = 1000;
    const store = createStore({
      draftFlushInFlight: true,
    });
    const syncSectionLinesSnapshot = vi.fn(async () => {});
    const render = vi.fn();
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession: vi.fn(),
      nowMs: () => now,
    });

    try {
      controller.scheduleSceneEditorDraftFlush(
        {
          store,
          projectService: {
            syncSectionLinesSnapshot,
          },
          render,
          appService: {
            showAlert: vi.fn(),
          },
        },
        { reason: "text" },
      );

      now = 3000;
      await vi.advanceTimersByTimeAsync(2000);

      expect(syncSectionLinesSnapshot).not.toHaveBeenCalled();
      expect(store.state.draftFlushInFlight).toBe(true);
      expect(store.state.draftSaveTimerId).toBeDefined();

      store.setDraftFlushInFlight({ value: false });
      now = 5000;
      await vi.advanceTimersByTimeAsync(2000);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();
      expect(syncSectionLinesSnapshot).toHaveBeenCalledWith(
        expect.objectContaining({
          sectionId: "section-1",
          lines: [createLine("line-1", "Hello")],
        }),
      );
      expect(store.state.draftFlushInFlight).toBe(false);
      expect(store.state.draftSection).toMatchObject({
        dirty: false,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not queue an immediate follow-up autosave behind an active flush", async () => {
    vi.useFakeTimers();
    let now = 1000;
    let releaseFirstFlush;
    const initialLine = createLine("line-1", "Before");
    const advancedLine = createLine("line-1", "After");
    const store = createStore({
      draftSection: createDirtyDraftSection([initialLine]),
    });
    const syncSectionLinesSnapshot = vi.fn(
      () =>
        new Promise((resolve) => {
          releaseFirstFlush = resolve;
        }),
    );
    const render = vi.fn();
    const controller = createSceneEditorDraftPersistence({
      syncDraftSectionFromLiveEditor: (deps) => deps.store.selectDraftSection(),
      syncStoreProjectState: () => {},
      reconcileCurrentEditorSession: vi.fn(),
      nowMs: () => now,
    });
    const deps = {
      store,
      projectService: {
        syncSectionLinesSnapshot,
      },
      render,
      appService: {
        showAlert: vi.fn(),
      },
    };

    try {
      const firstFlush = controller.flushSceneEditorDrafts(deps);
      while (syncSectionLinesSnapshot.mock.calls.length === 0) {
        await Promise.resolve();
      }

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();
      expect(store.state.draftFlushInFlight).toBe(true);

      store.setDraftSection({
        draftSection: createDirtyDraftSection([advancedLine]),
      });
      controller.flushSceneEditorDrafts(deps);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();
      expect(store.state.draftSaveTimerId).toBeDefined();

      releaseFirstFlush();
      await firstFlush;

      expect(syncSectionLinesSnapshot).toHaveBeenCalledOnce();

      now = 6000;
      await vi.advanceTimersByTimeAsync(5000);

      expect(syncSectionLinesSnapshot).toHaveBeenCalledTimes(2);
      expect(syncSectionLinesSnapshot).toHaveBeenLastCalledWith(
        expect.objectContaining({
          sectionId: "section-1",
          lines: [advancedLine],
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
