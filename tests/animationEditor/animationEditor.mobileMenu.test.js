import { describe, expect, it, vi } from "vitest";
import { JSDOM } from "jsdom";
import * as editor from "../../src/pages/animationEditor/animationEditor.store.js";
import {
  handleClosePopover,
  handleMobileEditorMenuClick,
  handleMobileEditorMenuItemClick,
  handleTimelineZoomChange,
  handleTimelineZoomIn,
  handleTimelineZoomOut,
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
      "selectPopover",
      "setSelectedEditorTab",
      "togglePreviewLoop",
      "setTimelineZoom",
      "nudgeTimelineZoom",
    ].map((name) => [name, (payload) => editor[name](ctx, payload)]),
  );
  const deps = {
    store,
    render: vi.fn(),
    refs: {
      mobileEditorMenuButton: {
        getBoundingClientRect: () => ({ right: 278, bottom: 48 }),
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
    "places zoom and loop controls for touch mode %s without duplicate slider refs",
    (touch) => {
      const { view } = createEditor(touch);
      const fragment = view();
      expect(Boolean(fragment.querySelector("#mobileEditorMenuButton"))).toBe(
        touch,
      );
      expect(Boolean(fragment.querySelector("#previewLoopButton"))).toBe(
        !touch,
      );
      expect(
        Boolean(
          fragment.querySelector("#animationEditorToolbar #timelineZoomSlider"),
        ),
      ).toBe(!touch);
      expect(fragment.querySelectorAll("#timelineZoomSlider")).toHaveLength(1);
    },
  );

  it("anchors the menu to its button and toggles loop labels without changing authored animation data", () => {
    const { state, deps, viewData } = createEditor();
    const authored = structuredClone(state.tweenBySection);
    const stopPropagation = vi.fn();
    handleMobileEditorMenuClick(deps, { _event: { stopPropagation } });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(state.popover).toMatchObject({ mode: "editorMenu", x: 278, y: 48 });
    expect(viewData().mobileEditorMenuItems.map((item) => item.label)).toEqual([
      "Loop",
      "Zoom",
    ]);
    const action = { _event: { detail: { item: { value: "loop" } } } };
    handleMobileEditorMenuItemClick(deps, action);
    expect(state.previewLoopEnabled).toBe(true);
    expect(state.popover.mode).toBe("none");
    expect(viewData().mobileEditorMenuItems[0].label).toBe("Don't Loop");
    handleMobileEditorMenuClick(deps, { _event: { stopPropagation } });
    handleMobileEditorMenuItemClick(deps, action);
    expect(state.previewLoopEnabled).toBe(false);
    expect(state.tweenBySection).toEqual(authored);
    expect(state.autosaveVersion).toBe(0);
  });

  it("hands the menu over to timeline zoom and keeps zoom changes after dismissing it", () => {
    const { state, deps, viewData, view } = createEditor();
    state.selectedEditorTab = "preview";
    handleMobileEditorMenuClick(deps, {
      _event: { stopPropagation: vi.fn() },
    });
    handleMobileEditorMenuItemClick(deps, {
      _event: { detail: { item: { value: "zoom" } } },
    });
    expect(state.selectedEditorTab).toBe("tween");
    expect(viewData().popover).toMatchObject({
      editorMenuIsOpen: false,
      timelineZoomIsOpen: true,
      x: 278,
      y: 48,
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
  });
});
