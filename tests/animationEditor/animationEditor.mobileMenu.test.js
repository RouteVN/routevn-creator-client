import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import * as editor from "../../src/pages/animationEditor/animationEditor.store.js";
import {
  handleClosePopover,
  handleTimelineZoomButtonClick,
  handleTimelineZoomChange,
  handleTimelineZoomIn,
  handleTimelineZoomOut,
  handleTogglePreviewLoop,
} from "../../src/pages/animationEditor/animationEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";
import { renderViewYaml } from "../support/renderView.js";

const createEditor = (isTouchMode = true) => {
  const state = editor.createInitialState();
  state.isTouchMode = isTouchMode;
  const ctx = { state, i18n: EN_I18N };
  const store = Object.fromEntries(
    [
      "closePopover",
      "setPopover",
      "togglePreviewLoop",
      "setTimelineZoom",
      "nudgeTimelineZoom",
    ].map((name) => [name, (payload) => editor[name](ctx, payload)]),
  );
  const deps = {
    store,
    render: vi.fn(),
    refs: {
      timelineZoomButton: {
        getBoundingClientRect: () => ({ right: 240, bottom: 136 }),
      },
    },
  };
  const viewData = () => editor.selectViewData(ctx);
  const view = () =>
    JSDOM.fragment(
      renderViewYaml(
        "src/pages/animationEditor/animationEditor.view.yaml",
        viewData(),
      ),
    );
  return { state, deps, viewData, view };
};

describe("animation editor mobile controls", () => {
  it.each([false, true])(
    "places zoom and loop buttons for touch mode %s without duplicate slider refs",
    (touch) => {
      const { view } = createEditor(touch);
      const fragment = view();
      expect(fragment.querySelector("#mobileEditorMenuButton")).toBeNull();
      expect(fragment.querySelector("#previewLoopButton[sq]")).not.toBeNull();
      expect(
        fragment.querySelector(
          "#animationEditorToolbar #timelineZoomButton[sq]",
        ),
      ).not.toBeNull();
      expect(
        fragment.querySelector("#animationEditorToolbar #timelineZoomSlider"),
      ).toBeNull();
      expect(fragment.querySelectorAll("#timelineZoomSlider")).toHaveLength(1);
    },
  );

  it("toggles loop on and off from its button without changing authored animation data", () => {
    const { state, deps, view } = createEditor();
    const authored = structuredClone(state.tweenBySection);
    const loopButton = () => view().querySelector("#previewLoopButton");
    expect(loopButton().getAttribute("aria-pressed")).toBe("false");
    handleTogglePreviewLoop(deps);
    expect(state.previewLoopEnabled).toBe(true);
    expect(loopButton().getAttribute("aria-pressed")).toBe("true");
    expect(loopButton().getAttribute("v")).toBe("pr");
    handleTogglePreviewLoop(deps);
    expect(state.previewLoopEnabled).toBe(false);
    expect(loopButton().getAttribute("v")).toBe("ol");
    expect(state.tweenBySection).toEqual(authored);
    expect(state.autosaveVersion).toBe(0);
  });

  it.each([false, true])(
    "opens timeline zoom from its button in touch mode %s and keeps zoom changes after dismissing it",
    (touch) => {
      const { state, deps, viewData, view } = createEditor(touch);
      const stopPropagation = vi.fn();
      handleTimelineZoomButtonClick(deps, { _event: { stopPropagation } });
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(viewData().popover).toMatchObject({
        timelineZoomIsOpen: true,
        x: 240,
        y: 136,
      });
      expect(view().querySelector("#timelineZoomPopover[open]")).not.toBeNull();
      handleTimelineZoomChange(deps, { _event: { detail: { value: 2.5 } } });
      handleTimelineZoomIn(deps);
      expect(state.timelineZoom).toBe(2.625);
      handleTimelineZoomOut(deps);
      handleClosePopover(deps);
      expect(state.timelineZoom).toBe(2.5);
      expect(state.popover.mode).toBe("none");
      expect(state.autosaveVersion).toBe(0);
    },
  );
});
