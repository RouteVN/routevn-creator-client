import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Subject } from "rxjs";
import { mountSceneEditorSubscriptions } from "../../src/internal/ui/sceneEditor/runtime.js";

const inputEvent = (type, properties = {}) => {
  const event = new Event(type);
  Object.assign(event, properties);
  return event;
};

describe("scene editor canvas line selection", () => {
  let cleanup;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("PointerEvent", class extends Event {});
  });

  afterEach(() => {
    cleanup?.();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const mount = ({ screenTransition = false } = {}) => {
    const subject = new Subject();
    const canvasRoot = new EventTarget();
    const lines = ["line-1", "line-2", "line-3"];
    let selectedLineId = lines[0];
    const scrollLineIntoView = vi.fn();
    const render = vi.fn();
    cleanup = mountSceneEditorSubscriptions({
      subject,
      render,
      refs: { linesEditor: { scrollLineIntoView } },
      graphicsService: {
        initRouteEngine: vi.fn(),
        engineSelectPresentationState: () => ({}),
        engineSelectRenderState: () => undefined,
      },
      store: {
        selectSceneId: () => "scene-1",
        selectIsMuted: () => true,
        setPresentationState: vi.fn(),
        selectSelectedSectionId: () => "section-1",
        selectSelectedLineId: () => selectedLineId,
        selectSelectedLine: () => ({
          actions: screenTransition
            ? { screen: { animations: { resourceId: "transition-1" } } }
            : {},
        }),
        selectNextLineId: ({ lineId }) => lines[lines.indexOf(lineId) + 1],
        selectPreviousLineId: ({ lineId }) => lines[lines.indexOf(lineId) - 1],
        setSelectedLineId: ({ selectedLineId: lineId }) => {
          selectedLineId = lineId;
        },
        selectScene: () => ({
          sections: [{ id: "section-1", lines: lines.map((id) => ({ id })) }],
        }),
        selectProjectData: () => ({}),
      },
    });
    subject.next({
      action: "sceneEditor.canvasMounted",
      payload: { canvasRoot },
    });
    return {
      subject,
      canvasRoot,
      render,
      scrollLineIntoView,
      selectedLine: () => selectedLineId,
      runtimeLine: (lineId) =>
        subject.next({
          action: "sceneEditor.runtimeCurrentLineChanged",
          payload: { sectionId: "section-1", lineId },
        }),
    };
  };

  it("does not advance a screen-transition line on a release without a canvas press", async () => {
    const fixture = mount({ screenTransition: true });
    fixture.canvasRoot.dispatchEvent(
      inputEvent("pointerup", {
        pointerType: "mouse",
        pointerId: 1,
        isPrimary: true,
        button: 0,
      }),
    );
    await vi.advanceTimersByTimeAsync(200);
    expect(fixture.selectedLine()).toBe("line-1");
    expect(fixture.render).not.toHaveBeenCalled();
    fixture.runtimeLine("line-2");
    expect(fixture.selectedLine()).toBe("line-1");
  });

  it.each(["touch", "pen", "mouse"])(
    "follows a %s release before the browser click without arming a second advance",
    async (pointerType) => {
      const fixture = mount();
      fixture.canvasRoot.dispatchEvent(
        inputEvent("pointerdown", {
          pointerType,
          pointerId: 1,
          isPrimary: true,
          button: 0,
        }),
      );
      fixture.canvasRoot.dispatchEvent(
        inputEvent("pointerup", {
          pointerType,
          pointerId: 1,
          isPrimary: true,
          button: 0,
        }),
      );
      fixture.runtimeLine("line-2");
      expect(fixture.selectedLine()).toBe("line-2");
      expect(fixture.scrollLineIntoView).toHaveBeenCalledWith({
        lineId: "line-2",
      });

      await vi.advanceTimersByTimeAsync(60);
      fixture.canvasRoot.dispatchEvent(inputEvent("click", { detail: 1 }));
      fixture.runtimeLine("line-3");
      expect(fixture.selectedLine()).toBe("line-2");
      expect(fixture.render).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(60);
      fixture.canvasRoot.dispatchEvent(
        inputEvent("pointerdown", {
          pointerType,
          pointerId: 1,
          isPrimary: true,
          button: 0,
        }),
      );
      fixture.canvasRoot.dispatchEvent(
        inputEvent("pointerup", {
          pointerType,
          pointerId: 1,
          isPrimary: true,
          button: 0,
        }),
      );
      fixture.runtimeLine("line-3");
      expect(fixture.selectedLine()).toBe("line-3");
    },
  );

  it.each([
    ["pointerup", { pointerType: "touch", isPrimary: false, button: 0 }],
    ["pointerup", { pointerType: "mouse", isPrimary: true, button: 2 }],
    ["pointercancel", { pointerType: "touch", isPrimary: true, button: 0 }],
  ])("ignores %s without a primary activation (%j)", (type, properties) => {
    const fixture = mount();
    fixture.canvasRoot.dispatchEvent(inputEvent(type, properties));
    fixture.runtimeLine("line-2");
    expect(fixture.selectedLine()).toBe("line-1");
    expect(fixture.render).not.toHaveBeenCalled();
  });

  it("preserves non-pointer click activation", () => {
    const fixture = mount();
    fixture.canvasRoot.dispatchEvent(inputEvent("click", { detail: 0 }));
    fixture.runtimeLine("line-2");
    expect(fixture.selectedLine()).toBe("line-2");
  });

  it.each(["touch", "pen", "mouse"])(
    "keeps the screen-transition fallback for a matching %s press and release",
    async (pointerType) => {
      const fixture = mount({ screenTransition: true });
      const pointer = { pointerType, pointerId: 1, isPrimary: true, button: 0 };
      fixture.canvasRoot.dispatchEvent(inputEvent("pointerdown", pointer));
      fixture.canvasRoot.dispatchEvent(inputEvent("pointerup", pointer));
      await vi.advanceTimersByTimeAsync(200);
      expect(fixture.selectedLine()).toBe("line-2");
      expect(fixture.render).toHaveBeenCalledOnce();
      fixture.canvasRoot.dispatchEvent(inputEvent("click", { detail: 1 }));
      fixture.canvasRoot.dispatchEvent(inputEvent("pointerup", pointer));
      await vi.advanceTimersByTimeAsync(200);
      expect(fixture.selectedLine()).toBe("line-2");
    },
  );

  it.each(["pointercancel", "remount", "different pointer"])(
    "does not reuse the press after %s",
    async (reason) => {
      const fixture = mount({ screenTransition: true });
      const pointer = {
        pointerType: "touch",
        pointerId: 1,
        isPrimary: true,
        button: 0,
      };
      fixture.canvasRoot.dispatchEvent(inputEvent("pointerdown", pointer));
      if (reason === "pointercancel") {
        fixture.canvasRoot.dispatchEvent(inputEvent("pointercancel", pointer));
      } else if (reason === "remount") {
        fixture.subject.next({
          action: "sceneEditor.canvasMounted",
          payload: { canvasRoot: fixture.canvasRoot },
        });
      } else {
        pointer.pointerId = 2;
      }
      fixture.canvasRoot.dispatchEvent(inputEvent("pointerup", pointer));
      await vi.advanceTimersByTimeAsync(200);
      fixture.runtimeLine("line-2");
      expect(fixture.selectedLine()).toBe("line-1");
    },
  );

  it("preserves click navigation without Pointer Events", () => {
    vi.stubGlobal("PointerEvent", undefined);
    const fixture = mount();
    fixture.canvasRoot.dispatchEvent(inputEvent("click", { detail: 1 }));
    fixture.runtimeLine("line-2");
    expect(fixture.selectedLine()).toBe("line-2");
  });

  it("removes canvas listeners when the page unmounts", () => {
    const fixture = mount();
    cleanup();
    fixture.canvasRoot.dispatchEvent(
      inputEvent("pointerup", {
        pointerType: "touch",
        isPrimary: true,
        button: 0,
      }),
    );
    fixture.runtimeLine("line-2");
    expect(fixture.selectedLine()).toBe("line-1");
    expect(fixture.render).not.toHaveBeenCalled();
  });
});
