import { describe, expect, it, vi } from "vitest";
import {
  handleAddMaskClick,
  handleAddKeyframeFromTimeline,
  handleAddKeyframeFormSubmit,
  handleAddPropertiesClick,
  handleAddPropertySideMenuItemClick,
  handleAddPropertyFormChange,
  handleAddPropertyFormSubmit,
  handleBeforeMount,
  handleConfirmMaskImageSelection,
  handleEditKeyframeFormSubmit,
  handleEditorPopoverPositioned,
  handleEditorSurfaceClick,
  handleEditorTabClick,
  handleEditorTabKeyDown,
  handleKeyframeClick,
  handleKeyframeSelect,
  handleKeyframeDurationChange,
  handleKeyframeDropdownItemClick,
  handleKeyframeRightClick,
  handleMaskTimelineRowClick,
  handleMaskTimelineRowKeyDown,
  handleMaskRemoveRequestClick,
  handleOpenAddMaskClick,
  handlePropertyNameClick,
  handlePreviewImageClick,
  handleReplayAnimation,
  handleRulerTimeScrub,
  handleSavePreviewClick,
  handleSelectedKeyframeDelayChange,
  handleSelectedKeyframeDurationChange,
  handleSelectedKeyframeEasingChange,
  handleSelectedKeyframeEditClick,
  handleSelectedKeyframeRelativeChange,
  handleSelectedKeyframeValueChange,
  handleSelectedMaskNumberConfirmClick,
  handleSelectedMaskNumberFieldKeyDown,
  handleSelectedMaskNumberInputChange,
  handleSelectedMaskNumberInputKeyDown,
  handleSelectedMaskInitialValueClick,
  handleSelectedMaskSoftnessClick,
  handleSelectedPropertyDeleteClick,
  handleSingleMaskImageKeyDown,
  handleTimelineZoomChange,
  handleTimelineZoomIn,
  handleTimelineZoomOut,
  handleTimelinePanClick,
  handleTimelinePanEnd,
  handleTimelinePanKeyDown,
  handleTimelinePanKeyUp,
  handleTimelinePanMove,
  handleTimelinePanPointerEnter,
  handleTimelinePanStart,
  handleTimelineScroll,
  handleTogglePreviewLoop,
} from "../../src/pages/animationEditor/animationEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("animationEditor.handlers", () => {
  const createIdleAutosaveMocks = () => ({
    selectAutosaveInFlight: vi.fn(() => false),
    selectAutosavePersistedVersion: vi.fn(() => 1),
    selectAutosaveTimerId: vi.fn(() => undefined),
    selectAutosaveVersion: vi.fn(() => 1),
  });

  it("registers the animation autosave navigation guard and cleanup", async () => {
    let beforeNavigation;
    const unregisterBeforeNavigation = vi.fn();
    const cleanupWindowEvent = vi.fn();
    const browserEventsClient = {
      subscribeWindowEvent: vi.fn(() => cleanupWindowEvent),
    };
    const store = {
      ...createIdleAutosaveMocks(),
      selectPreviewPlaybackFrameId: vi.fn(() => 42),
      setPreviewPlaybackRequestId: vi.fn(),
      setUiConfig: vi.fn(),
      stopPreviewPlayback: vi.fn(),
    };
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);

    try {
      const cleanup = handleBeforeMount({
        appService: {
          registerBeforeNavigation: vi.fn((handler) => {
            beforeNavigation = handler;
            return unregisterBeforeNavigation;
          }),
        },
        browserEventsClient,
        store,
        uiConfig: { mode: "desktop" },
      });

      await beforeNavigation();
      await cleanup();

      expect(store.setUiConfig).toHaveBeenCalledWith({
        uiConfig: { mode: "desktop" },
      });
      expect(unregisterBeforeNavigation).toHaveBeenCalledOnce();
      expect(browserEventsClient.subscribeWindowEvent).toHaveBeenCalledTimes(3);
      expect(cleanupWindowEvent).toHaveBeenCalledTimes(3);
      expect(store.setPreviewPlaybackRequestId).toHaveBeenCalledWith({
        requestId: undefined,
      });
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      expect(store.stopPreviewPlayback).toHaveBeenCalledWith({});
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("updates timeline zoom from the slider and zoom buttons", () => {
    const store = {
      nudgeTimelineZoom: vi.fn(),
      setTimelineZoom: vi.fn(),
    };
    const render = vi.fn();

    handleTimelineZoomChange(
      { store, render },
      { _event: { detail: { value: 2.25 } } },
    );
    handleTimelineZoomIn({ store, render });
    handleTimelineZoomOut({ store, render });

    expect(store.setTimelineZoom).toHaveBeenCalledWith({ zoom: 2.25 });
    expect(store.nudgeTimelineZoom).toHaveBeenNthCalledWith(1, {
      delta: 0.125,
    });
    expect(store.nudgeTimelineZoom).toHaveBeenNthCalledWith(2, {
      delta: -0.125,
    });
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("switches the lower animation editor tab", () => {
    const store = {
      selectSelectedEditorTab: vi.fn(() => "tween"),
      setSelectedEditorTab: vi.fn(),
    };
    const render = vi.fn();

    handleEditorTabClick(
      { store, render },
      { _event: { currentTarget: { dataset: { tabId: "preview" } } } },
    );

    expect(store.setSelectedEditorTab).toHaveBeenCalledWith({ tab: "preview" });
    expect(render).toHaveBeenCalledOnce();

    store.selectSelectedEditorTab.mockReturnValue("preview");
    handleEditorTabClick(
      { store, render },
      { _event: { currentTarget: { dataset: { tabId: "preview" } } } },
    );

    expect(store.setSelectedEditorTab).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("switches and focuses animation editor tabs from the keyboard", () => {
    const focus = vi.fn();
    const querySelector = vi.fn(() => ({ focus }));
    const store = {
      selectSelectedEditorTab: vi.fn(() => "tween"),
      setSelectedEditorTab: vi.fn(),
    };
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleEditorTabKeyDown(
      { refs: { animationEditorTabs: { querySelector } }, store, render },
      {
        _event: {
          currentTarget: { dataset: { tabId: "tween" } },
          key: "ArrowRight",
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(querySelector).toHaveBeenCalledWith('[data-tab-id="preview"]');
    expect(focus).toHaveBeenCalledOnce();
    expect(store.setSelectedEditorTab).toHaveBeenCalledWith({ tab: "preview" });
    expect(render).toHaveBeenCalledOnce();
  });

  it("renders on timeline scroll only when playhead visibility changes", () => {
    const store = {
      selectTimelinePlayheadVisible: vi
        .fn()
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false),
      setTimelineScrollMetrics: vi.fn(),
    };
    const render = vi.fn();

    handleTimelineScroll(
      { store, render },
      { _event: { currentTarget: { scrollLeft: 125, clientWidth: 300 } } },
    );

    expect(store.setTimelineScrollMetrics).toHaveBeenCalledWith({
      scrollLeft: 125,
      viewportWidth: 300,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("pans the timeline horizontally while Space is held", () => {
    let timelinePan;
    let timelinePanClickSuppressed = false;
    let timelinePanHovered = false;
    let timelinePanMode = false;
    const store = {
      selectTimelinePan: vi.fn(() => timelinePan),
      selectTimelinePanClickSuppressed: vi.fn(() => timelinePanClickSuppressed),
      selectTimelinePanHovered: vi.fn(() => timelinePanHovered),
      selectTimelinePanMode: vi.fn(() => timelinePanMode),
      setTimelinePanHovered: vi.fn(({ hovered }) => {
        timelinePanHovered = hovered;
      }),
      setTimelinePanMode: vi.fn(({ enabled }) => {
        timelinePanMode = enabled;
      }),
      startTimelinePan: vi.fn((nextTimelinePan) => {
        timelinePanClickSuppressed = true;
        timelinePan = nextTimelinePan;
      }),
      clearTimelinePanClickSuppression: vi.fn(() => {
        timelinePanClickSuppressed = false;
      }),
      stopTimelinePan: vi.fn(() => {
        timelinePan = undefined;
      }),
    };
    const render = vi.fn();
    const releasePointerCapture = vi.fn();
    const timelineViewport = {
      releasePointerCapture,
      scrollLeft: 400,
      setPointerCapture: vi.fn(),
    };
    const deps = {
      refs: { timelineScrollContainer: timelineViewport },
      render,
      store,
    };
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleTimelinePanPointerEnter(deps);
    handleTimelinePanKeyDown(deps, {
      _event: {
        code: "Space",
        composedPath: () => [{ tagName: "DIV" }],
        preventDefault,
      },
    });
    handleTimelinePanStart(deps, {
      _event: {
        button: 0,
        clientX: 100,
        currentTarget: timelineViewport,
        pointerId: 7,
        preventDefault,
        stopPropagation,
      },
    });
    handleTimelinePanMove(deps, {
      _event: {
        clientX: 50,
        currentTarget: timelineViewport,
        pointerId: 7,
        preventDefault,
        stopPropagation,
      },
    });

    expect(timelineViewport.scrollLeft).toBe(450);
    expect(store.startTimelinePan).toHaveBeenCalledWith({
      pointerId: 7,
      startX: 100,
      startScrollLeft: 400,
    });

    handleTimelinePanEnd(deps, {
      _event: {
        currentTarget: timelineViewport,
        pointerId: 7,
        preventDefault,
        stopPropagation,
      },
    });
    handleTimelinePanClick(deps, {
      _event: { preventDefault, stopPropagation },
    });
    handleTimelinePanKeyUp(deps, {
      _event: { code: "Space", preventDefault },
    });

    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(store.stopTimelinePan).toHaveBeenCalledWith({});
    expect(store.clearTimelinePanClickSuppression).toHaveBeenCalledWith({});
    expect(store.setTimelinePanMode).toHaveBeenLastCalledWith({
      enabled: false,
    });
    expect(render).toHaveBeenCalledTimes(4);
  });

  it("does not enter timeline pan mode while typing", () => {
    const store = {
      selectTimelinePanHovered: vi.fn(() => true),
      selectTimelinePanMode: vi.fn(() => false),
      setTimelinePanMode: vi.fn(),
    };
    const render = vi.fn();
    const preventDefault = vi.fn();

    handleTimelinePanKeyDown(
      { render, store },
      {
        _event: {
          code: "Space",
          composedPath: () => [{ tagName: "INPUT" }],
          preventDefault,
        },
      },
    );

    expect(preventDefault).not.toHaveBeenCalled();
    expect(store.setTimelinePanMode).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
  });

  it("toggles preview looping", () => {
    const store = { togglePreviewLoop: vi.fn() };
    const render = vi.fn();

    handleTogglePreviewLoop({ store, render });

    expect(store.togglePreviewLoop).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalledOnce();
  });

  it("clears the timeline selection when the editor background is clicked", () => {
    const store = {
      clearTimelineSelection: vi.fn(),
      selectTimelineSelection: vi.fn(() => ({
        side: "update",
        property: "x",
      })),
    };
    const render = vi.fn();

    handleEditorSurfaceClick(
      { store, render },
      { _event: { composedPath: () => [{ dataset: {} }] } },
    );

    expect(store.clearTimelineSelection).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalled();
  });

  it.each(["keyframe", "timelineSelectionSurface"])(
    "keeps the timeline selection inside the %s surface",
    (datasetField) => {
      const store = {
        clearTimelineSelection: vi.fn(),
        selectTimelineSelection: vi.fn(() => ({
          side: "update",
          property: "x",
        })),
      };
      const render = vi.fn();

      handleEditorSurfaceClick(
        { store, render },
        {
          _event: {
            composedPath: () => [{ dataset: { [datasetField]: "true" } }],
          },
        },
      );

      expect(store.clearTimelineSelection).not.toHaveBeenCalled();
      expect(render).not.toHaveBeenCalled();
    },
  );

  it("selects a property on click without opening a desktop menu", () => {
    const store = {
      closePopover: vi.fn(),
      selectIsTouchMode: vi.fn(() => false),
      setPopover: vi.fn(),
      setSelectedProperty: vi.fn(),
    };
    const render = vi.fn();

    handlePropertyNameClick(
      { store, render },
      {
        _event: {
          detail: { side: "prev", property: "alpha" },
        },
      },
    );

    expect(store.setSelectedProperty).toHaveBeenLastCalledWith({
      side: "prev",
      property: "alpha",
    });
    expect(store.closePopover).toHaveBeenCalledWith();
    expect(store.setPopover).not.toHaveBeenCalled();
  });

  it("deletes the selected property from the detail header", () => {
    const selectedProperty = { side: "prev", property: "alpha" };
    const store = {
      ...createIdleAutosaveMocks(),
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      deleteProperty: vi.fn(),
      queueAutosave: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      selectSelectedProperty: vi.fn(() => selectedProperty),
      stopPreviewPlayback: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedPropertyDeleteClick({ store, render });

    expect(store.deleteProperty).toHaveBeenCalledWith(selectedProperty);
    expect(store.closePopover).toHaveBeenCalledOnce();
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledOnce();
    expect(store.queueAutosave).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("adds and selects a default keyframe from the timeline hover action", () => {
    const store = {
      addKeyframe: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      setSelectedKeyframe: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleAddKeyframeFromTimeline(
      { store, render },
      {
        _event: {
          detail: {
            side: "next",
            property: "alpha",
            index: 2,
            x: 40,
            y: 80,
          },
        },
      },
    );

    expect(store.addKeyframe).toHaveBeenCalledWith({
      side: "next",
      property: "alpha",
      index: 2,
      duration: 1000,
      easing: "linear",
      relative: false,
      value: 0,
    });
    expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
      side: "next",
      property: "alpha",
      index: 2,
    });
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(store.queueAutosave).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it("adds a keyframe using timing provided by a timeline gap", () => {
    const store = {
      addKeyframe: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      setSelectedKeyframe: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      ...createIdleAutosaveMocks(),
    };

    handleAddKeyframeFromTimeline(
      { store, render: vi.fn() },
      {
        _event: {
          detail: {
            side: "update",
            property: "x",
            index: 1,
            delay: 250,
            duration: 1000,
            followingDelay: 250,
          },
        },
      },
    );

    expect(store.addKeyframe).toHaveBeenCalledWith({
      side: "update",
      property: "x",
      index: 1,
      delay: 250,
      duration: 1000,
      followingDelay: 250,
      easing: "linear",
      relative: false,
      value: 0,
    });
    expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
      side: "update",
      property: "x",
      index: 1,
    });
  });

  it("selects a keyframe on click without opening the edit form", () => {
    const store = {
      closePopover: vi.fn(),
      selectIsTouchMode: vi.fn(() => false),
      setSelectedKeyframe: vi.fn(),
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleKeyframeClick(
      { store, render },
      {
        _event: {
          detail: {
            side: "prev",
            property: "alpha",
            index: "2",
            x: 40,
            y: 80,
          },
        },
      },
    );

    expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
      side: "prev",
      property: "alpha",
      index: "2",
    });
    expect(store.closePopover).toHaveBeenCalled();
    expect(store.setPopover).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it("opens and prefills the selected keyframe edit dialog", () => {
    const selectedKeyframe = {
      side: "update",
      property: "x",
      index: 1,
    };
    const values = {
      delay: 100,
      duration: 800,
      easing: "linear",
      relative: false,
      value: 20,
    };
    const editKeyframeForm = {
      reset: vi.fn(),
      setValues: vi.fn(),
    };
    const store = {
      selectSelectedKeyframe: vi.fn(() => selectedKeyframe),
      selectSelectedKeyframeFormValues: vi.fn(() => values),
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedKeyframeEditClick(
      { refs: { editKeyframeForm }, store, render },
      { _event: { clientX: 40, clientY: 80 } },
    );

    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "editKeyframe",
      x: 40,
      y: 80,
      payload: selectedKeyframe,
    });
    expect(render).toHaveBeenCalledOnce();
    expect(editKeyframeForm.reset).toHaveBeenCalledOnce();
    expect(editKeyframeForm.setValues).toHaveBeenCalledWith({ values });
  });

  it("opens touch editing surfaces when timeline items are tapped", () => {
    const selectedKeyframe = {
      side: "prev",
      property: "alpha",
      index: 2,
    };
    const formValues = {
      delay: 200,
      duration: 600,
      easing: "linear",
      relative: false,
      value: 1,
    };
    const store = {
      closePopover: vi.fn(),
      selectIsTouchMode: vi.fn(() => true),
      selectSelectedKeyframe: vi.fn(() => selectedKeyframe),
      selectSelectedKeyframeFormValues: vi.fn(() => formValues),
      setPopover: vi.fn(),
      setSelectedKeyframe: vi.fn(),
      setSelectedProperty: vi.fn(),
    };
    const editKeyframeForm = {
      reset: vi.fn(),
      setValues: vi.fn(),
    };
    const render = vi.fn();

    handleKeyframeSelect(
      { store, render },
      {
        _event: {
          detail: {
            side: "prev",
            property: "alpha",
            index: 2,
          },
        },
      },
    );

    expect(store.setSelectedKeyframe).toHaveBeenLastCalledWith({
      side: "prev",
      property: "alpha",
      index: 2,
    });
    expect(store.setPopover).not.toHaveBeenCalled();
    expect(store.closePopover).toHaveBeenCalledOnce();

    handleKeyframeClick(
      { refs: { editKeyframeForm }, store, render },
      {
        _event: {
          detail: {
            side: "prev",
            property: "alpha",
            index: 2,
            x: 40,
            y: 80,
          },
        },
      },
    );

    expect(store.setPopover).toHaveBeenLastCalledWith({
      mode: "editKeyframe",
      x: 40,
      y: 80,
      payload: { side: "prev", property: "alpha", index: 2 },
    });
    expect(editKeyframeForm.reset).toHaveBeenCalledOnce();
    expect(editKeyframeForm.setValues).toHaveBeenCalledWith({
      values: formValues,
    });

    handlePropertyNameClick(
      { store, render },
      {
        _event: {
          detail: {
            side: "next",
            property: "x",
            x: 60,
            y: 100,
          },
        },
      },
    );

    expect(store.setPopover).toHaveBeenLastCalledWith({
      mode: "propertyNameMenu",
      x: 60,
      y: 100,
      payload: { side: "next", property: "x" },
    });
    expect(store.closePopover).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("selects a keyframe before opening its context menu", () => {
    const store = {
      setSelectedKeyframe: vi.fn(),
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleKeyframeRightClick(
      { store, render },
      {
        _event: {
          detail: {
            side: "next",
            property: "x",
            index: "1",
            x: 120,
            y: 160,
          },
        },
      },
    );

    expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
      side: "next",
      property: "x",
      index: "1",
    });
    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "keyframeMenu",
      x: 120,
      y: 160,
      payload: {
        side: "next",
        property: "x",
        index: "1",
      },
    });
    expect(render).toHaveBeenCalled();
  });

  it("commits a duration dragged from the timeline", () => {
    const store = {
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      setSelectedKeyframe: vi.fn(),
      setSelectedKeyframeTiming: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleKeyframeDurationChange(
      { store, render },
      {
        _event: {
          detail: {
            delay: 250,
            duration: 1250,
            followingDelay: 300,
            index: 1,
            property: "x",
            side: "next",
          },
        },
      },
    );

    expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
      side: "next",
      property: "x",
      index: 1,
    });
    expect(store.setSelectedKeyframeTiming).toHaveBeenCalledWith({
      delay: 250,
      duration: 1250,
      followingDelay: 300,
    });
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(store.queueAutosave).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
  });

  it("commits inline selected-keyframe field changes", () => {
    const store = {
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      setSelectedKeyframeDelay: vi.fn(),
      setSelectedKeyframeDuration: vi.fn(),
      setSelectedKeyframeEasing: vi.fn(),
      setSelectedKeyframeRelative: vi.fn(),
      setSelectedKeyframeValue: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();
    const deps = { store, render };

    handleSelectedKeyframeDelayChange(deps, {
      _event: { detail: { value: 125 } },
    });
    handleSelectedKeyframeDurationChange(deps, {
      _event: { detail: { value: 750 } },
    });
    handleSelectedKeyframeEasingChange(deps, {
      _event: { detail: { value: "easeInQuad" } },
    });
    handleSelectedKeyframeValueChange(deps, {
      _event: { detail: { value: -12.5 } },
    });
    handleSelectedKeyframeRelativeChange(deps, {
      _event: { detail: { value: true } },
    });

    expect(store.setSelectedKeyframeDelay).toHaveBeenCalledWith({
      delay: 125,
    });
    expect(store.setSelectedKeyframeDuration).toHaveBeenCalledWith({
      duration: 750,
    });
    expect(store.setSelectedKeyframeEasing).toHaveBeenCalledWith({
      easing: "easeInQuad",
    });
    expect(store.setSelectedKeyframeValue).toHaveBeenCalledWith({
      value: -12.5,
    });
    expect(store.setSelectedKeyframeRelative).toHaveBeenCalledWith({
      relative: true,
    });
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledTimes(5);
    expect(store.queueAutosave).toHaveBeenCalledTimes(5);
    expect(render).toHaveBeenCalledTimes(5);
  });

  it.each([
    ["add-left", 2],
    ["add-right", 3],
  ])(
    "adds and selects a default keyframe for the %s context-menu action",
    (value, expectedIndex) => {
      const store = {
        addKeyframe: vi.fn(),
        bumpPreviewRenderVersion: vi.fn(),
        closePopover: vi.fn(),
        queueAutosave: vi.fn(),
        selectPopover: vi.fn(() => ({
          x: 120,
          y: 160,
          payload: {
            side: "next",
            property: "x",
            index: "2",
          },
        })),
        selectPreviewPlaybackFrameId: vi.fn(() => undefined),
        setSelectedKeyframe: vi.fn(),
        stopPreviewPlayback: vi.fn(),
        ...createIdleAutosaveMocks(),
      };
      const render = vi.fn();

      handleKeyframeDropdownItemClick(
        { store, render },
        {
          _event: {
            detail: {
              item: { value },
            },
          },
        },
      );

      expect(store.addKeyframe).toHaveBeenCalledWith({
        side: "next",
        property: "x",
        index: expectedIndex,
        duration: 1000,
        easing: "linear",
        relative: false,
        value: 0,
      });
      expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
        side: "next",
        property: "x",
        index: expectedIndex,
      });
      expect(store.closePopover).toHaveBeenCalled();
      expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
      expect(store.queueAutosave).toHaveBeenCalled();
      expect(render).toHaveBeenCalled();
    },
  );

  it("opens the number popover for selected mask softness", () => {
    const store = {
      selectMaskEditorTransitionMask: vi.fn(() => ({
        softness: 0.08,
      })),
      setPopover: vi.fn(),
      updatePopoverFormValues: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedMaskSoftnessClick(
      { store, render },
      { _event: { clientX: 10, clientY: 20 } },
    );

    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "editSelectedMaskSoftness",
      x: 10,
      y: 20,
      payload: {},
    });
    expect(store.updatePopoverFormValues).toHaveBeenCalledWith({
      formValues: { value: 0.08 },
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the numeric initial-value popover from the mask timeline event", () => {
    const store = {
      selectMaskEditorTransitionMask: vi.fn(() => ({
        progress: { initialValue: 0.2 },
      })),
      setPopover: vi.fn(),
      updatePopoverFormValues: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedMaskInitialValueClick(
      { store, render },
      { _event: { detail: { x: 10, y: 20 } } },
    );

    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "editSelectedMaskInitialValue",
      x: 10,
      y: 20,
      payload: {},
    });
    expect(store.updatePopoverFormValues).toHaveBeenCalledWith({
      formValues: { value: 0.2 },
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the confirmation dialog before removing the selected mask", () => {
    const store = {
      openMaskRemoveConfirmDialog: vi.fn(),
    };
    const render = vi.fn();

    handleMaskRemoveRequestClick({ store, render });

    expect(store.openMaskRemoveConfirmDialog).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens mask number fields from the keyboard", () => {
    const store = {
      selectMaskEditorTransitionMask: vi.fn(() => ({ softness: 0.08 })),
      setPopover: vi.fn(),
      updatePopoverFormValues: vi.fn(),
    };
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleSelectedMaskNumberFieldKeyDown(
      { store, render: vi.fn() },
      {
        _event: {
          clientX: 10,
          clientY: 20,
          currentTarget: {
            dataset: { maskNumberField: "softness" },
          },
          key: "Enter",
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "editSelectedMaskSoftness",
      x: 10,
      y: 20,
      payload: {},
    });
  });

  it("tracks and confirms selected mask number input values", () => {
    const popover = {
      mode: "editSelectedMaskSoftness",
      formValues: { value: 0.25 },
    };
    const store = {
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      selectPopover: vi.fn(() => popover),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      setTransitionMaskSoftness: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      updatePopoverFormValues: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleSelectedMaskNumberInputChange(
      { store },
      { _event: { detail: { value: 325 } } },
    );
    expect(store.updatePopoverFormValues).toHaveBeenCalledWith({
      formValues: { value: 325 },
    });

    handleSelectedMaskNumberConfirmClick({ store, render });

    expect(store.setTransitionMaskSoftness).toHaveBeenCalledWith({
      softness: 0.25,
    });
    expect(store.closePopover).toHaveBeenCalledOnce();
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledOnce();
    expect(store.queueAutosave).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("confirms the selected mask initial value", () => {
    const store = {
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      selectPopover: vi.fn(() => ({
        mode: "editSelectedMaskInitialValue",
        formValues: { value: "0.25" },
      })),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      updateInitialValue: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleSelectedMaskNumberConfirmClick({ store, render });

    expect(store.updateInitialValue).toHaveBeenCalledWith({
      side: "mask",
      property: "progress",
      initialValue: 0.25,
    });
    expect(store.closePopover).toHaveBeenCalledOnce();
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledOnce();
    expect(store.queueAutosave).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("focuses the selected mask number input when its popover opens", () => {
    const focus = vi.fn();

    handleEditorPopoverPositioned({
      refs: { selectedMaskNumberInput: { focus } },
      store: {
        selectPopover: vi.fn(() => ({
          mode: "editSelectedMaskSoftness",
        })),
      },
    });

    expect(focus).toHaveBeenCalledOnce();
  });

  it("closes a selected mask number popover with Escape", () => {
    const store = { closePopover: vi.fn() };
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleSelectedMaskNumberInputKeyDown(
      { store, render },
      {
        _event: {
          key: "Escape",
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(store.closePopover).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("updates delay and keyframe values through the edit dialog", () => {
    const store = {
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      selectPopover: vi.fn(() => ({
        payload: { side: "update", property: "x", index: 1 },
      })),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      updateKeyframe: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleEditKeyframeFormSubmit(
      { store, render },
      {
        _event: {
          detail: {
            values: {
              delay: 250,
              duration: 750,
              easing: "easeOutQuad",
              relative: false,
              value: 80,
            },
          },
        },
      },
    );

    expect(store.updateKeyframe).toHaveBeenCalledWith({
      side: "update",
      property: "x",
      index: 1,
      keyframe: {
        delay: 250,
        duration: 750,
        easing: "easeOutQuad",
        relative: false,
        value: 80,
      },
    });
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(store.closePopover).toHaveBeenCalledOnce();
    expect(store.queueAutosave).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens a pending transition mask from the right panel", () => {
    const store = {
      startPendingTransitionMask: vi.fn(),
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleOpenAddMaskClick(
      {
        store,
        render,
      },
      {
        _event: {
          clientX: 40,
          clientY: 80,
        },
      },
    );

    expect(store.startPendingTransitionMask).toHaveBeenCalledWith({});
    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "addMask",
      x: 40,
      y: 80,
      payload: {},
    });
    expect(render).toHaveBeenCalled();
  });

  it("opens the transition Add menu on touch so Mask remains available", () => {
    const store = {
      selectDialogType: vi.fn(() => "transition"),
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleAddPropertiesClick(
      {
        store,
        render,
      },
      {
        _event: {
          clientX: 24,
          clientY: 48,
          currentTarget: {
            dataset: {},
          },
        },
      },
    );

    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "addPropertySideMenu",
      x: 24,
      y: 48,
      payload: {},
    });
    expect(render).toHaveBeenCalled();
  });

  it("keeps the transition add-property side menu on desktop", () => {
    const store = {
      selectDialogType: vi.fn(() => "transition"),
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleAddPropertiesClick(
      {
        store,
        render,
      },
      {
        _event: {
          clientX: 24,
          clientY: 48,
          currentTarget: {
            dataset: {},
          },
        },
      },
    );

    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "addPropertySideMenu",
      x: 24,
      y: 48,
      payload: {},
    });
    expect(render).toHaveBeenCalled();
  });

  it("opens Add Mask from the transition Add menu", () => {
    const store = {
      selectPopover: vi.fn(() => ({ x: 24, y: 48 })),
      setPopover: vi.fn(),
      startPendingTransitionMask: vi.fn(),
    };
    const render = vi.fn();

    handleAddPropertySideMenuItemClick(
      { store, render },
      {
        _event: {
          detail: {
            item: { value: "mask" },
          },
        },
      },
    );

    expect(store.startPendingTransitionMask).toHaveBeenCalledWith({});
    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "addMask",
      x: 24,
      y: 48,
      payload: {},
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("selects the Mask row and opens touch editing only on touch", () => {
    const desktopStore = {
      closePopover: vi.fn(),
      selectIsTouchMode: vi.fn(() => false),
      setSelectedMask: vi.fn(),
    };
    const desktopRender = vi.fn();
    handleMaskTimelineRowClick(
      { store: desktopStore, render: desktopRender },
      { _event: { clientX: 30, clientY: 60 } },
    );
    expect(desktopStore.setSelectedMask).toHaveBeenCalledWith({});
    expect(desktopStore.closePopover).toHaveBeenCalledWith();

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    handleMaskTimelineRowKeyDown(
      { store: desktopStore, render: desktopRender },
      {
        _event: {
          clientX: 30,
          clientY: 60,
          key: "Enter",
          preventDefault,
          stopPropagation,
        },
      },
    );
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(desktopStore.setSelectedMask).toHaveBeenCalledTimes(2);

    const touchStore = {
      selectIsTouchMode: vi.fn(() => true),
      setPopover: vi.fn(),
      setSelectedMask: vi.fn(),
    };
    handleMaskTimelineRowClick(
      { store: touchStore, render: vi.fn() },
      { _event: { clientX: 30, clientY: 60 } },
    );
    expect(touchStore.setPopover).toHaveBeenCalledWith({
      mode: "editMask",
      x: 30,
      y: 60,
      payload: {},
    });
  });

  it("selects mask settings when the mask timeline thumbnail is clicked", () => {
    const store = {
      closePopover: vi.fn(),
      selectIsTouchMode: vi.fn(() => false),
      setPopover: vi.fn(),
      setSelectedMask: vi.fn(),
      setSelectedProperty: vi.fn(),
    };
    const render = vi.fn();
    const payload = {
      _event: {
        detail: {
          side: "mask",
          property: "progress",
          x: 30,
          y: 60,
        },
      },
    };

    handlePropertyNameClick({ store, render }, payload);

    expect(store.setSelectedMask).toHaveBeenCalledOnce();
    expect(store.setSelectedProperty).not.toHaveBeenCalled();
    expect(store.setPopover).not.toHaveBeenCalled();
    expect(store.closePopover).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("commits a pending transition mask", () => {
    const store = {
      commitPendingTransitionMask: vi.fn(),
      closePopover: vi.fn(),
      setSelectedMask: vi.fn(),
      selectPopover: vi.fn(() => ({
        mode: "none",
      })),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectMaskEditorTransitionMask: vi.fn(() => ({
        kind: "single",
        imageId: "image-mask",
      })),
      selectAutosaveInFlight: vi.fn(() => false),
      selectAutosavePersistedVersion: vi.fn(() => 1),
      selectAutosaveVersion: vi.fn(() => 1),
    };
    const render = vi.fn();

    handleAddMaskClick({
      appService: { showToast: vi.fn() },
      store,
      render,
    });

    expect(store.commitPendingTransitionMask).toHaveBeenCalledWith({});
    expect(store.setSelectedMask).toHaveBeenCalledWith({});
    expect(store.closePopover).toHaveBeenCalledWith();
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalled();
    expect(store.queueAutosave).toHaveBeenCalled();
  });

  it("keeps an incomplete pending mask open", () => {
    const appService = { showToast: vi.fn() };
    const store = {
      commitPendingTransitionMask: vi.fn(),
      selectMaskEditorTransitionMask: vi.fn(() => ({
        kind: "single",
        imageId: undefined,
      })),
      setSelectedMask: vi.fn(),
      closePopover: vi.fn(),
    };

    handleAddMaskClick({ appService, i18n: EN_I18N, store, render: vi.fn() });

    expect(appService.showToast).toHaveBeenCalledWith({
      message: "Select an image for the mask.",
    });
    expect(store.commitPendingTransitionMask).not.toHaveBeenCalled();
    expect(store.setSelectedMask).not.toHaveBeenCalled();
    expect(store.closePopover).not.toHaveBeenCalled();
  });

  it("opens the shared image selector for preview slots", () => {
    const store = {
      selectPreviewImageId: vi.fn(() => "image-current"),
      showImageSelectorDialog: vi.fn(),
    };
    const render = vi.fn();

    handlePreviewImageClick(
      {
        store,
        render,
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              target: "preview-target",
            },
          },
        },
      },
    );

    expect(store.selectPreviewImageId).toHaveBeenCalledWith({
      target: "preview-target",
    });
    expect(store.showImageSelectorDialog).toHaveBeenCalledWith({
      target: "preview-target",
      index: undefined,
      selectedImageId: "image-current",
    });
    expect(render).toHaveBeenCalled();
  });

  it("opens the single mask image selector from the keyboard", () => {
    const store = {
      selectMaskEditorTransitionMask: vi.fn(() => ({
        imageId: "image-mask",
      })),
      showImageSelectorDialog: vi.fn(),
    };
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const render = vi.fn();

    handleSingleMaskImageKeyDown(
      { store, render },
      { _event: { key: " ", preventDefault, stopPropagation } },
    );

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(store.showImageSelectorDialog).toHaveBeenCalledWith({
      target: "single",
      index: undefined,
      selectedImageId: "image-mask",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("requires a selected image before confirming a single mask image", async () => {
    const appService = { showToast: vi.fn() };
    const store = {
      hideImageSelectorDialog: vi.fn(),
      selectImageSelectorDialog: vi.fn(() => ({
        target: "single",
        selectedImageId: undefined,
      })),
      setTransitionMaskImage: vi.fn(),
    };

    await handleConfirmMaskImageSelection({
      appService,
      i18n: EN_I18N,
      store,
      render: vi.fn(),
    });

    expect(appService.showToast).toHaveBeenCalledWith({
      message: "Select an image for the mask.",
    });
    expect(store.setTransitionMaskImage).not.toHaveBeenCalled();
    expect(store.hideImageSelectorDialog).not.toHaveBeenCalled();
  });

  it("preserves zero initial values when adding a property", () => {
    const store = {
      selectPopover: vi.fn(() => ({
        payload: {
          side: "update",
        },
        formValues: {
          property: "alpha",
          useInitialValue: true,
          initialValue: 0,
          tweenMode: "keyframes",
        },
      })),
      selectDefaultInitialValue: vi.fn(() => 1),
      addProperty: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleAddPropertyFormSubmit(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            values: {
              property: "alpha",
              useInitialValue: true,
              initialValue: 1,
              tweenMode: "keyframes",
            },
          },
        },
      },
    );

    expect(store.addProperty).toHaveBeenCalledWith({
      side: "update",
      property: "alpha",
      initialValue: 0,
      tweenMode: "keyframes",
      autoDuration: undefined,
      autoEasing: undefined,
    });
  });

  it("uses the selected property default when the add-property initial value is not edited", () => {
    const store = {
      selectPopover: vi.fn(() => ({
        payload: {
          side: "update",
        },
        formValues: {
          property: "alpha",
          useInitialValue: true,
          tweenMode: "keyframes",
        },
      })),
      selectDefaultInitialValue: vi.fn(() => 1),
      addProperty: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleAddPropertyFormSubmit(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            values: {
              property: "alpha",
              useInitialValue: true,
              tweenMode: "keyframes",
            },
          },
        },
      },
    );

    expect(store.addProperty).toHaveBeenCalledWith({
      side: "update",
      property: "alpha",
      initialValue: 1,
      tweenMode: "keyframes",
      autoDuration: undefined,
      autoEasing: undefined,
    });
  });

  it("resets stale initial values when the add-property property changes", () => {
    const store = {
      selectPopover: vi.fn(() => ({
        formValues: {
          property: "alpha",
          useInitialValue: true,
          initialValue: 0,
        },
      })),
      selectDefaultInitialValue: vi.fn(() => 1),
      updatePopoverFormValues: vi.fn(),
    };
    const render = vi.fn();

    handleAddPropertyFormChange(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            name: "property",
            value: "scaleX",
          },
        },
      },
    );

    expect(store.updatePopoverFormValues).toHaveBeenCalledWith({
      formValues: {
        initialValue: 1,
        property: "scaleX",
        useInitialValue: true,
      },
    });
    expect(render).toHaveBeenCalled();
  });

  it("resets add-property choices when the mobile transition side changes", () => {
    const store = {
      selectPopover: vi.fn(() => ({
        formValues: {
          side: "prev",
          property: "x",
          useInitialValue: true,
          initialValue: 12,
        },
      })),
      updatePopoverFormValues: vi.fn(),
    };
    const render = vi.fn();

    handleAddPropertyFormChange(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            name: "side",
            value: "next",
          },
        },
      },
    );

    expect(store.updatePopoverFormValues).toHaveBeenCalledWith({
      formValues: {
        side: "next",
        property: undefined,
        useInitialValue: true,
        initialValue: undefined,
      },
    });
    expect(render).toHaveBeenCalled();
  });

  it("preserves zero values when adding a keyframe", () => {
    const store = {
      selectPopover: vi.fn(() => ({
        payload: {
          side: "update",
          property: "alpha",
          index: 0,
        },
        formValues: {
          duration: 1000,
          value: 0,
          easing: "linear",
          relative: false,
        },
      })),
      addKeyframe: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleAddKeyframeFormSubmit(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            values: {
              duration: 1000,
              easing: "linear",
              relative: false,
            },
          },
        },
      },
    );

    expect(store.addKeyframe).toHaveBeenCalledWith({
      side: "update",
      property: "alpha",
      index: 0,
      duration: 1000,
      value: 0,
      easing: "linear",
      relative: false,
    });
  });

  it("uses the keyframe value default when the value field is not edited", () => {
    const store = {
      selectPopover: vi.fn(() => ({
        payload: {
          side: "update",
          property: "translateX",
          index: 0,
        },
        formValues: {
          duration: 1000,
          easing: "linear",
          relative: false,
        },
      })),
      addKeyframe: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleAddKeyframeFormSubmit(
      {
        store,
        render,
      },
      {
        _event: {
          detail: {
            values: {
              duration: 1000,
              value: 1,
              easing: "linear",
              relative: false,
            },
          },
        },
      },
    );

    expect(store.addKeyframe).toHaveBeenCalledWith({
      side: "update",
      property: "translateX",
      index: 0,
      duration: 1000,
      value: 0,
      easing: "linear",
      relative: false,
    });
  });

  it("commits preview image selections and updates the preview canvas", async () => {
    const resetState = {
      elements: [{ id: "bg" }],
      animations: [],
    };
    const renderState = {
      elements: [{ id: "next" }],
      animations: [],
    };
    const store = {
      selectImageSelectorDialog: vi.fn(() => ({
        target: "preview-background",
        selectedImageId: "image-bg",
      })),
      setPreviewImage: vi.fn(),
      hideImageSelectorDialog: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      selectPopover: vi.fn(() => ({
        mode: "none",
      })),
      queueAutosave: vi.fn(),
      selectPreviewPlayheadVisible: vi.fn(() => false),
      selectPreviewPlaybackMode: vi.fn(() => "auto"),
      selectPreviewPreparedVersion: vi.fn(() => undefined),
      selectPreviewRenderVersion: vi.fn(() => 1),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectAnimationResetState: vi.fn(() => resetState),
      selectAnimationRenderStateWithAnimations: vi.fn(() => renderState),
    };
    const graphicsService = {
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    await handleConfirmMaskImageSelection({
      graphicsService,
      store,
      render,
    });

    expect(store.setPreviewImage).toHaveBeenCalledWith({
      target: "preview-background",
      imageId: "image-bg",
    });
    expect(store.hideImageSelectorDialog).toHaveBeenCalledWith({});
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalled();
    expect(store.queueAutosave).not.toHaveBeenCalled();
    expect(graphicsService.setAnimationPlaybackMode).toHaveBeenCalledWith(
      "manual",
    );
    expect(graphicsService.render).toHaveBeenNthCalledWith(1, {
      elements: [],
      animations: [],
    });
    expect(graphicsService.render).toHaveBeenNthCalledWith(2, resetState);
    expect(graphicsService.render).toHaveBeenNthCalledWith(3, renderState);
    expect(graphicsService.setAnimationTime).toHaveBeenCalledWith(0);
  });

  it("replays animation from the current preview position", async () => {
    let requestAnimationFrameCallCount = 0;
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      requestAnimationFrameCallCount += 1;
      if (requestAnimationFrameCallCount === 1) {
        callback(0);
      }
      return requestAnimationFrameCallCount;
    });

    const resetState = {
      elements: [{ id: "reset" }],
      animations: [],
    };
    const renderState = {
      elements: [{ id: "preview" }],
      animations: [
        {
          id: "preview-animation-alpha",
          targetId: "preview",
          type: "update",
          tween: {
            alpha: {
              keyframes: [
                {
                  duration: 1000,
                  value: 0,
                  easing: "linear",
                },
              ],
            },
          },
        },
      ],
    };
    let activePlaybackRequestId;
    const store = {
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      selectAnimationResetState: vi.fn(() => resetState),
      selectAnimationRenderStateWithAnimations: vi.fn(() => renderState),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectPreviewDurationMs: vi.fn(() => 1000),
      selectPreviewPlayheadTimeMs: vi.fn(() => 400),
      selectPreviewPlaying: vi.fn(() => false),
      startPreviewPlayback: vi.fn(),
      setPreviewPlaybackFrameId: vi.fn(),
      selectPreviewPlaybackStartedAtMs: vi.fn(() => 0),
      selectPreviewPlaybackDurationMs: vi.fn(() => 1000),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        activePlaybackRequestId = requestId;
      }),
      selectPreviewPlaybackRequestId: vi.fn(() => activePlaybackRequestId),
    };
    const graphicsService = {
      loadAssets: vi.fn(),
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    try {
      await handleReplayAnimation({
        graphicsService,
        projectService: {},
        render,
        store,
      });

      expect(graphicsService.setAnimationPlaybackMode).toHaveBeenNthCalledWith(
        1,
        "manual",
      );
      expect(graphicsService.setAnimationTime).toHaveBeenNthCalledWith(1, 400);
      expect(
        graphicsService.setAnimationTime.mock.invocationCallOrder[0],
      ).toBeLessThan(graphicsService.render.mock.invocationCallOrder[0]);
      expect(graphicsService.render).toHaveBeenNthCalledWith(1, resetState);
      expect(graphicsService.render).toHaveBeenNthCalledWith(2, renderState);
      expect(graphicsService.setAnimationPlaybackMode).toHaveBeenNthCalledWith(
        2,
        "manual",
      );
      expect(store.startPreviewPlayback).toHaveBeenCalledWith({
        startedAtMs: expect.any(Number),
        durationMs: 1000,
        timeMs: 400,
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("pauses active preview playback when the Play button is clicked", async () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const store = {
      selectPreviewPlaying: vi.fn(() => true),
      selectPreviewPlaybackFrameId: vi.fn(() => 42),
      setPreviewPlaybackRequestId: vi.fn(),
      stopPreviewPlayback: vi.fn(),
    };
    const graphicsService = {
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    try {
      await handleReplayAnimation({ graphicsService, render, store });

      expect(store.setPreviewPlaybackRequestId).toHaveBeenCalledWith({
        requestId: undefined,
      });
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      expect(store.stopPreviewPlayback).toHaveBeenCalledWith({
        preservePlayhead: true,
      });
      expect(graphicsService.setAnimationPlaybackMode).not.toHaveBeenCalled();
      expect(graphicsService.setAnimationTime).not.toHaveBeenCalled();
      expect(render).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("restarts preview time while loop is enabled and stops after it is disabled", async () => {
    const flushAsyncWork = async () => {
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    };
    const rafCallbacks = [];
    const timeoutCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal("setTimeout", (callback) => {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    });

    let activePlaybackRequestId;
    let playbackStartedAtMs;
    let playbackDurationMs;
    let loopEnabled = true;
    const store = {
      markPreviewPrepared: vi.fn(),
      selectAnimationRenderStateWithAnimations: vi.fn(() => ({
        elements: [],
        animations: [],
      })),
      selectAnimationResetState: vi.fn(() => ({
        elements: [],
        animations: [],
      })),
      selectPreviewDurationMs: vi.fn(() => 1000),
      selectPreviewPlayheadTimeMs: vi.fn(() => undefined),
      selectPreviewPlaying: vi.fn(() => false),
      selectPreviewLoopEnabled: vi.fn(() => loopEnabled),
      selectPreviewPlaybackDurationMs: vi.fn(() => playbackDurationMs),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      selectPreviewPlaybackRequestId: vi.fn(() => activePlaybackRequestId),
      selectPreviewPlaybackStartedAtMs: vi.fn(() => playbackStartedAtMs),
      setPreviewPlaybackFrameId: vi.fn(),
      setPreviewPlaybackMode: vi.fn(),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        activePlaybackRequestId = requestId;
      }),
      setPreviewPlayhead: vi.fn(),
      startPreviewPlayback: vi.fn(({ startedAtMs, durationMs }) => {
        playbackStartedAtMs = startedAtMs;
        playbackDurationMs = durationMs;
      }),
      stopPreviewPlayback: vi.fn(),
    };
    const graphicsService = {
      loadAssets: vi.fn(),
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };

    try {
      const replay = handleReplayAnimation({
        graphicsService,
        projectService: {},
        render: vi.fn(),
        store,
      });
      await flushAsyncWork();
      rafCallbacks[0](0);
      timeoutCallbacks[0]();
      await replay;

      store.startPreviewPlayback.mockClear();
      store.stopPreviewPlayback.mockClear();
      rafCallbacks[1](playbackStartedAtMs + 1000.1);

      expect(graphicsService.setAnimationTime).toHaveBeenLastCalledWith(0);
      expect(store.setPreviewPlayhead).toHaveBeenLastCalledWith({
        timeMs: 0,
        visible: true,
      });
      expect(store.startPreviewPlayback).toHaveBeenCalledOnce();
      expect(store.stopPreviewPlayback).not.toHaveBeenCalled();

      loopEnabled = false;
      rafCallbacks[2](playbackStartedAtMs + 1000.1);

      expect(graphicsService.setAnimationTime).toHaveBeenLastCalledWith(1000);
      expect(store.stopPreviewPlayback).toHaveBeenCalledWith({});
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ignores stale replay continuations when Play is clicked again before finishing", async () => {
    const flushAsyncWork = async () => {
      for (let index = 0; index < 8; index += 1) {
        await Promise.resolve();
      }
    };
    const rafCallbacks = [];
    const timeoutCallbacks = [];
    vi.stubGlobal("requestAnimationFrame", (callback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    vi.stubGlobal("setTimeout", (callback) => {
      timeoutCallbacks.push(callback);
      return timeoutCallbacks.length;
    });

    const resetState = {
      elements: [{ id: "reset" }],
      animations: [],
    };
    const renderState = {
      elements: [{ id: "preview" }],
      animations: [
        {
          id: "preview-animation-alpha",
          targetId: "preview",
          type: "update",
          tween: {
            alpha: {
              keyframes: [
                {
                  duration: 1000,
                  value: 0,
                  easing: "linear",
                },
              ],
            },
          },
        },
      ],
    };
    let activePlaybackRequestId;
    let playbackStartedAtMs;
    let playbackDurationMs;
    const store = {
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      selectAnimationResetState: vi.fn(() => resetState),
      selectAnimationRenderStateWithAnimations: vi.fn(() => renderState),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectPreviewDurationMs: vi.fn(() => 1000),
      selectPreviewPlayheadTimeMs: vi.fn(() => undefined),
      selectPreviewPlaying: vi.fn(() => false),
      startPreviewPlayback: vi.fn(({ startedAtMs, durationMs }) => {
        playbackStartedAtMs = startedAtMs;
        playbackDurationMs = durationMs;
      }),
      setPreviewPlaybackFrameId: vi.fn(),
      selectPreviewPlaybackStartedAtMs: vi.fn(() => playbackStartedAtMs),
      selectPreviewPlaybackDurationMs: vi.fn(() => playbackDurationMs),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        activePlaybackRequestId = requestId;
      }),
      selectPreviewPlaybackRequestId: vi.fn(() => activePlaybackRequestId),
      setPreviewPlayhead: vi.fn(),
    };
    const graphicsService = {
      loadAssets: vi.fn(),
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();
    const deps = {
      graphicsService,
      projectService: {},
      render,
      store,
    };

    try {
      let firstReplayDone = false;
      let firstReplayError;
      const firstReplay = handleReplayAnimation(deps)
        .catch((error) => {
          firstReplayError = error;
        })
        .finally(() => {
          firstReplayDone = true;
        });
      await flushAsyncWork();
      expect(rafCallbacks).toHaveLength(1);

      let secondReplayDone = false;
      let secondReplayError;
      const secondReplay = handleReplayAnimation(deps)
        .catch((error) => {
          secondReplayError = error;
        })
        .finally(() => {
          secondReplayDone = true;
        });
      await flushAsyncWork();
      expect(rafCallbacks).toHaveLength(2);

      rafCallbacks[0]?.(0);
      timeoutCallbacks[0]?.();
      await flushAsyncWork();
      expect(firstReplayDone).toBe(true);
      expect(firstReplayError).toBeUndefined();

      expect(graphicsService.setAnimationPlaybackMode).not.toHaveBeenCalledWith(
        "auto",
      );
      expect(store.startPreviewPlayback).not.toHaveBeenCalled();

      rafCallbacks[1]?.(16);
      timeoutCallbacks[1]?.();
      await flushAsyncWork();
      expect(secondReplayDone).toBe(true);
      expect(secondReplayError).toBeUndefined();

      expect(graphicsService.setAnimationPlaybackMode).not.toHaveBeenCalledWith(
        "auto",
      );
      expect(store.startPreviewPlayback).toHaveBeenCalledTimes(1);
      await firstReplay;
      await secondReplay;
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("updates preview time while scrubbing the timeline ruler", async () => {
    const store = {
      setPreviewPlaybackRequestId: vi.fn(),
      setPreviewPlayhead: vi.fn(),
      selectPreviewPlaying: vi.fn(() => false),
      selectPreviewPlaybackMode: vi.fn(() => "manual"),
      selectPreviewPreparedVersion: vi.fn(() => 1),
      selectPreviewRenderVersion: vi.fn(() => 1),
    };
    const graphicsService = {
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    await handleRulerTimeScrub(
      {
        graphicsService,
        render,
        store,
      },
      {
        _event: {
          detail: {
            timeMs: 420,
          },
        },
      },
    );

    expect(store.setPreviewPlayhead).toHaveBeenCalledWith({
      timeMs: 420,
      visible: true,
    });
    expect(store.setPreviewPlaybackRequestId).toHaveBeenCalledWith({
      requestId: undefined,
    });
    expect(graphicsService.setAnimationTime).toHaveBeenCalledWith(420);
    expect(render).toHaveBeenCalledOnce();
  });

  it("cancels pending preview playback when timeline scrubbing begins", async () => {
    let resolveResetRender;
    const resetRender = new Promise((resolve) => {
      resolveResetRender = resolve;
    });
    const resetState = {
      elements: [{ id: "reset" }],
      animations: [],
    };
    const renderState = {
      elements: [{ id: "preview" }],
      animations: [],
    };
    let activePlaybackRequestId;
    const store = {
      markPreviewPrepared: vi.fn(),
      selectAnimationRenderStateWithAnimations: vi.fn(() => renderState),
      selectAnimationResetState: vi.fn(() => resetState),
      selectPreviewDurationMs: vi.fn(() => 1000),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      selectPreviewPlaybackMode: vi.fn(() => "manual"),
      selectPreviewPlaybackRequestId: vi.fn(() => activePlaybackRequestId),
      selectPreviewPlayheadTimeMs: vi.fn(() => undefined),
      selectPreviewPlaying: vi.fn(() => false),
      selectPreviewPreparedVersion: vi.fn(() => 1),
      selectPreviewRenderVersion: vi.fn(() => 1),
      setPreviewPlaybackMode: vi.fn(),
      setPreviewPlaybackRequestId: vi.fn(({ requestId }) => {
        activePlaybackRequestId = requestId;
      }),
      setPreviewPlayhead: vi.fn(),
      startPreviewPlayback: vi.fn(),
      stopPreviewPlayback: vi.fn(),
    };
    const graphicsService = {
      loadAssets: vi.fn(),
      render: vi.fn((state) => {
        return state === resetState ? resetRender : Promise.resolve();
      }),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();
    const deps = {
      graphicsService,
      projectService: {},
      render,
      store,
    };

    const replay = handleReplayAnimation(deps);
    await Promise.resolve();
    await Promise.resolve();
    expect(graphicsService.render).toHaveBeenCalledWith(resetState);

    await handleRulerTimeScrub(deps, {
      _event: { detail: { timeMs: 420 } },
    });
    resolveResetRender();
    await replay;

    expect(activePlaybackRequestId).toBeUndefined();
    expect(store.startPreviewPlayback).not.toHaveBeenCalled();
    expect(graphicsService.render).not.toHaveBeenCalledWith(renderState);
    expect(graphicsService.setAnimationTime).toHaveBeenLastCalledWith(420);
  });

  it("pauses playback and follows timeline ruler dragging", async () => {
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    const store = {
      selectPreviewPlaying: vi.fn(() => true),
      selectPreviewPlaybackFrameId: vi.fn(() => 42),
      setPreviewPlaybackRequestId: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      setPreviewPlayhead: vi.fn(),
      selectPreviewPlaybackMode: vi.fn(() => "manual"),
      selectPreviewPreparedVersion: vi.fn(() => 1),
      selectPreviewRenderVersion: vi.fn(() => 1),
    };
    const graphicsService = {
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    try {
      await handleRulerTimeScrub(
        { graphicsService, render, store },
        { _event: { detail: { timeMs: 420 } } },
      );

      expect(store.setPreviewPlaybackRequestId).toHaveBeenCalledWith({
        requestId: undefined,
      });
      expect(cancelAnimationFrame).toHaveBeenCalledWith(42);
      expect(store.stopPreviewPlayback).toHaveBeenCalledWith({
        preservePlayhead: true,
      });
      expect(store.setPreviewPlayhead).toHaveBeenCalledWith({
        timeMs: 420,
        visible: true,
      });
      expect(graphicsService.setAnimationTime).toHaveBeenCalledWith(420);
      expect(render).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("saves preview data without capturing a thumbnail", async () => {
    const previewData = {
      background: {
        imageId: "image-bg",
      },
      outgoing: {
        imageId: "image-out",
        transformId: "transform-out",
      },
      incoming: {
        imageId: "image-in",
      },
    };
    const store = {
      ...createIdleAutosaveMocks(),
      selectEditItemId: vi.fn(() => "animation-1"),
      selectPreviewPlayheadVisible: vi.fn(() => false),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      selectPreviewPlaybackMode: vi.fn(() => "auto"),
      selectPreviewPreparedVersion: vi.fn(() => undefined),
      selectPreviewRenderVersion: vi.fn(() => 1),
      setPreviewPlaybackMode: vi.fn(),
      markPreviewPrepared: vi.fn(),
      selectAnimationResetState: vi.fn(() => ({
        elements: [],
        animations: [],
      })),
      selectAnimationRenderStateWithAnimations: vi.fn(() => ({
        elements: [],
        animations: [],
      })),
      selectPreviewData: vi.fn(() => previewData),
      selectIsTouchMode: vi.fn(() => false),
      setItems: vi.fn(),
    };
    const projectService = {
      storeFile: vi.fn(),
      updateAnimation: vi.fn(async () => ({ valid: true })),
      getRepositoryState: vi.fn(() => ({
        animations: {
          items: {},
          tree: [],
        },
      })),
    };
    const appService = {
      showAlert: vi.fn(),
      showToast: vi.fn(),
    };
    const graphicsService = {
      extractBase64: vi.fn(async () => "data:image/jpeg;base64,SGVsbG8="),
      render: vi.fn(),
      setAnimationPlaybackMode: vi.fn(),
      setAnimationTime: vi.fn(),
    };
    const render = vi.fn();

    await handleSavePreviewClick({
      appService,
      i18n: EN_I18N,
      projectService,
      render,
      store,
    });

    expect(projectService.storeFile).not.toHaveBeenCalled();
    expect(graphicsService.render).not.toHaveBeenCalled();
    expect(graphicsService.extractBase64).not.toHaveBeenCalled();
    expect(graphicsService.setAnimationPlaybackMode).not.toHaveBeenCalled();
    expect(graphicsService.setAnimationTime).not.toHaveBeenCalled();
    expect(projectService.updateAnimation).toHaveBeenCalledWith({
      animationId: "animation-1",
      data: {
        preview: previewData,
      },
    });
    expect(appService.showToast).toHaveBeenCalledWith({
      message: "Animation preview saved.",
    });
    expect(render).toHaveBeenCalled();
  });
});
