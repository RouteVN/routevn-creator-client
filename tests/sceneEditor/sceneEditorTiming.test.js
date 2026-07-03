import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSceneEditorTimingTraceId,
  emitSceneEditorTiming,
  getSceneEditorTimingDurationMs,
  getSceneEditorTimingNow,
  shouldMeasureSceneEditorTiming,
} from "../../src/internal/ui/sceneEditor/sceneEditorTiming.js";

const originalWindow = globalThis.window;

describe("scene editor timing", () => {
  afterEach(() => {
    globalThis.window = originalWindow;
    vi.restoreAllMocks();
  });

  it("does not emit timing logs by default", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    emitSceneEditorTiming("test.event", {
      durationMs: 1,
    });

    expect(shouldMeasureSceneEditorTiming()).toBe(false);
    expect(getSceneEditorTimingNow()).toBe(0);
    expect(getSceneEditorTimingDurationMs(0)).toBe(0);
    expect(createSceneEditorTimingTraceId()).toBeUndefined();
    expect(info).not.toHaveBeenCalled();
  });

  it("emits timing logs when scene editor perf debugging is enabled", () => {
    globalThis.window = {
      __RVN_DEBUG_SCENE_EDITOR_PERF__: true,
    };
    const info = vi.spyOn(console, "info").mockImplementation(() => {});

    emitSceneEditorTiming("test.event", {
      durationMs: 1,
    });

    expect(shouldMeasureSceneEditorTiming()).toBe(true);
    expect(createSceneEditorTimingTraceId("test")).toMatch(/^test-/);
    expect(info).toHaveBeenCalledTimes(1);
    expect(info.mock.calls[0][0]).toContain("[rvn.scene-editor-timing]");
    expect(info.mock.calls[0][0]).toContain('"event":"test.event"');
  });
});
