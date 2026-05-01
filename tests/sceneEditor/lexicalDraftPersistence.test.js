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
} = {}) => {
  const state = {
    draftSection,
    revision,
    lastDraftFlushStartedAt,
    draftSavePendingSinceAt,
    draftSaveTimerId,
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
    ).toBe(2500);
    expect(
      getSceneEditorDraftSaveDelayMs(maxWaitStore, {
        reason: "text",
        nowMs: () => 9500,
      }),
    ).toBe(1500);
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

    expect(syncSectionLinesSnapshot).toHaveBeenCalledWith({
      sectionId: "section-1",
      lines: [createLine("line-1", "Hello")],
    });
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
});
