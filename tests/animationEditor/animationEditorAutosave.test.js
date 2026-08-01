import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAnimationEditorAutosaveDelayMs,
  scheduleAnimationEditorAutosave,
} from "../../src/pages/animationEditor/support/animationEditorAutosave.js";

const createSchedulingStore = () => {
  let timerId;
  let pendingSinceAt;
  let autosaveVersion = 1;
  let autosavePersistedVersion = 0;

  return {
    clearAutosaveTimer: vi.fn(() => {
      timerId = undefined;
    }),
    selectAutosavePendingSinceAt: vi.fn(() => pendingSinceAt),
    selectAutosavePersistedVersion: vi.fn(() => autosavePersistedVersion),
    selectAutosaveTimerId: vi.fn(() => timerId),
    selectAutosaveVersion: vi.fn(() => autosaveVersion),
    selectLastAutosaveFlushStartedAt: vi.fn(() => undefined),
    setAutosavePendingSinceAt: vi.fn(({ timestamp }) => {
      pendingSinceAt = timestamp;
    }),
    setAutosaveTimerId: vi.fn(({ timerId: nextTimerId }) => {
      timerId = nextTimerId;
    }),
    setVersions({ persisted, version }) {
      autosavePersistedVersion = persisted;
      autosaveVersion = version;
    },
  };
};

describe("animationEditorAutosave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses debounce while bounding continuous edits by maximum wait", () => {
    const store = {
      selectAutosavePendingSinceAt: vi.fn(() => 0),
      selectLastAutosaveFlushStartedAt: vi.fn(() => undefined),
    };

    expect(
      getAnimationEditorAutosaveDelayMs(store, {
        nowMs: () => 100,
      }),
    ).toBe(900);
    expect(
      getAnimationEditorAutosaveDelayMs(store, {
        nowMs: () => 2500,
      }),
    ).toBe(500);
  });

  it("throttles a new save relative to the previous flush", () => {
    const store = {
      selectAutosavePendingSinceAt: vi.fn(() => 150),
      selectLastAutosaveFlushStartedAt: vi.fn(() => 100),
    };

    expect(
      getAnimationEditorAutosaveDelayMs(store, {
        nowMs: () => 200,
        timing: {
          debounceMs: 100,
          minIntervalMs: 1000,
          maxIntervalMs: 3000,
        },
      }),
    ).toBe(900);
  });

  it("resets the trailing timer so rapid changes flush only once", async () => {
    vi.useFakeTimers();
    const store = createSchedulingStore();
    const flush = vi.fn(async () => {});
    let now = 0;

    scheduleAnimationEditorAutosave(store, flush, { nowMs: () => now });
    await vi.advanceTimersByTimeAsync(400);
    now = 400;
    scheduleAnimationEditorAutosave(store, flush, { nowMs: () => now });

    await vi.advanceTimersByTimeAsync(899);
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("does not schedule a timer when the latest version is persisted", () => {
    vi.useFakeTimers();
    const store = createSchedulingStore();
    store.setVersions({ persisted: 2, version: 2 });
    const flush = vi.fn(async () => {});

    expect(scheduleAnimationEditorAutosave(store, flush)).toBeUndefined();
    expect(store.setAutosaveTimerId).not.toHaveBeenCalled();
    expect(store.setAutosavePendingSinceAt).toHaveBeenCalledWith({
      timestamp: undefined,
    });
  });
});
