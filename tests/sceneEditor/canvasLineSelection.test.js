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

  const mount = () => {
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
      store: {
        selectSelectedSectionId: () => "section-1",
        selectSelectedLineId: () => selectedLineId,
        selectNextLineId: ({ lineId }) => lines[lines.indexOf(lineId) + 1],
        selectPreviousLineId: ({ lineId }) => lines[lines.indexOf(lineId) - 1],
        setSelectedLineId: ({ selectedLineId: lineId }) => {
          selectedLineId = lineId;
        },
        selectScene: () => ({
          sections: [{ id: "section-1", lines: lines.map((id) => ({ id })) }],
        }),
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

  it.each(["touch", "pen", "mouse"])(
    "follows a %s release before the browser click without arming a second advance",
    async (pointerType) => {
      const fixture = mount();
      fixture.canvasRoot.dispatchEvent(
        inputEvent("pointerup", { pointerType, isPrimary: true, button: 0 }),
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
        inputEvent("pointerup", { pointerType, isPrimary: true, button: 0 }),
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
