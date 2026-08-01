import { describe, expect, it, vi } from "vitest";
import {
  handleAddMaskClick,
  handleAddKeyframeFromTimeline,
  handleAddKeyframeFormSubmit,
  handleAddPropertiesClick,
  handleAddPropertyFormChange,
  handleAddPropertyFormSubmit,
  handleBeforeMount,
  handleConfirmMaskImageSelection,
  handleEditMaskClick,
  handleEditorSurfaceClick,
  handleEditorPopoverPositioned,
  handleKeyframeClick,
  handleKeyframeDurationChange,
  handleKeyframeDropdownItemClick,
  handleKeyframeRightClick,
  handleOpenAddMaskClick,
  handlePropertyNameClick,
  handlePropertyNameRightClick,
  handlePreviewImageClick,
  handleReplayAnimation,
  handleRulerTimeScrub,
  handleSavePreviewClick,
  handleSelectedKeyframeDelayClick,
  handleSelectedKeyframeEasingChange,
  handleSelectedKeyframeDurationClick,
  handleSelectedKeyframeNumberConfirmClick,
  handleSelectedKeyframeNumberInputChange,
  handleSelectedKeyframeNumberInputKeyDown,
  handleSelectedKeyframeValueClick,
  handleSelectedKeyframeValueTypeChange,
  handleTimelineZoomChange,
  handleTimelineZoomIn,
  handleTimelineZoomOut,
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
    const store = {
      ...createIdleAutosaveMocks(),
      setUiConfig: vi.fn(),
    };
    const cleanup = handleBeforeMount({
      appService: {
        registerBeforeNavigation: vi.fn((handler) => {
          beforeNavigation = handler;
          return unregisterBeforeNavigation;
        }),
      },
      store,
      uiConfig: { mode: "desktop" },
    });

    await beforeNavigation();
    await cleanup();

    expect(store.setUiConfig).toHaveBeenCalledWith({
      uiConfig: { mode: "desktop" },
    });
    expect(unregisterBeforeNavigation).toHaveBeenCalledOnce();
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

  it("selects a property on click and opens its menu only on right click", () => {
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

    handlePropertyNameRightClick(
      { store, render },
      {
        _event: {
          detail: {
            side: "prev",
            property: "alpha",
            x: 80,
            y: 120,
          },
        },
      },
    );

    expect(store.setSelectedProperty).toHaveBeenLastCalledWith({
      side: "prev",
      property: "alpha",
    });
    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "propertyNameMenu",
      x: 80,
      y: 120,
      payload: { side: "prev", property: "alpha" },
    });
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

  it("opens touch editing surfaces when timeline items are tapped", () => {
    const store = {
      closePopover: vi.fn(),
      selectIsTouchMode: vi.fn(() => true),
      setPopover: vi.fn(),
      setSelectedKeyframe: vi.fn(),
      setSelectedProperty: vi.fn(),
    };
    const render = vi.fn();

    handleKeyframeClick(
      { store, render },
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
    expect(store.closePopover).not.toHaveBeenCalled();
    expect(render).toHaveBeenCalledTimes(2);
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

  it("updates selected keyframe easing and value type from the detail panel", () => {
    const store = {
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      setSelectedKeyframeEasing: vi.fn(),
      setSelectedKeyframeRelative: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleSelectedKeyframeEasingChange(
      { store, render },
      {
        _event: {
          detail: { value: "easeInOutQuad" },
        },
      },
    );
    handleSelectedKeyframeValueTypeChange(
      { store, render },
      {
        _event: {
          detail: { value: "absolute" },
        },
      },
    );

    expect(store.setSelectedKeyframeEasing).toHaveBeenCalledWith({
      easing: "easeInOutQuad",
    });
    expect(store.setSelectedKeyframeRelative).toHaveBeenCalledWith({
      relative: false,
    });
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledTimes(2);
    expect(store.queueAutosave).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("debounces animation changes into one latest snapshot", async () => {
    vi.useFakeTimers();
    try {
      let autosaveVersion = 0;
      let autosavePersistedVersion = 0;
      let autosaveInFlight = false;
      let autosaveTimerId;
      let autosavePendingSinceAt;
      let lastAutosaveFlushStartedAt;
      let autosavePersistedFingerprint;
      let easing = "linear";
      const store = {
        bumpPreviewRenderVersion: vi.fn(),
        clearAutosaveTimer: vi.fn(() => {
          autosaveTimerId = undefined;
        }),
        markAutosavePersisted: vi.fn(({ version, fingerprint }) => {
          autosavePersistedVersion = version;
          autosavePersistedFingerprint = fingerprint;
        }),
        queueAutosave: vi.fn(() => {
          autosaveVersion += 1;
        }),
        selectAnimationDescription: vi.fn(() => "Description"),
        selectAnimationName: vi.fn(() => "Animation"),
        selectAutosaveInFlight: vi.fn(() => autosaveInFlight),
        selectAutosavePendingSinceAt: vi.fn(() => autosavePendingSinceAt),
        selectAutosavePersistedFingerprint: vi.fn(
          () => autosavePersistedFingerprint,
        ),
        selectAutosavePersistedVersion: vi.fn(() => autosavePersistedVersion),
        selectAutosaveTimerId: vi.fn(() => autosaveTimerId),
        selectAutosaveVersion: vi.fn(() => autosaveVersion),
        selectDialogType: vi.fn(() => "update"),
        selectEditItemId: vi.fn(() => "animation-1"),
        selectEditMode: vi.fn(() => true),
        selectLastAutosaveFlushStartedAt: vi.fn(
          () => lastAutosaveFlushStartedAt,
        ),
        selectPreviewPlaybackFrameId: vi.fn(() => undefined),
        selectProperties: vi.fn(() => ({
          x: {
            keyframes: [
              {
                duration: 1000,
                easing,
                relative: false,
                value: 10,
              },
            ],
          },
        })),
        selectTargetGroupId: vi.fn(() => "group-1"),
        setAutosaveInFlight: vi.fn(({ inFlight }) => {
          autosaveInFlight = inFlight;
        }),
        setAutosavePendingSinceAt: vi.fn(({ timestamp }) => {
          autosavePendingSinceAt = timestamp;
        }),
        setAutosaveTimerId: vi.fn(({ timerId }) => {
          autosaveTimerId = timerId;
        }),
        setItems: vi.fn(),
        setLastAutosaveFlushStartedAt: vi.fn(({ timestamp }) => {
          lastAutosaveFlushStartedAt = timestamp;
        }),
        setSelectedItemId: vi.fn(),
        setSelectedKeyframeEasing: vi.fn(({ easing: nextEasing }) => {
          easing = nextEasing;
        }),
        stopPreviewPlayback: vi.fn(),
      };
      const projectService = {
        getRepositoryState: vi.fn(() => ({
          animations: { items: {}, tree: [] },
        })),
        updateAnimation: vi.fn(async () => ({ valid: true })),
      };
      const deps = {
        appService: { showAlert: vi.fn() },
        i18n: EN_I18N,
        projectService,
        render: vi.fn(),
        store,
      };

      handleSelectedKeyframeEasingChange(deps, {
        _event: { detail: { value: "easeInQuad" } },
      });
      await vi.advanceTimersByTimeAsync(400);
      handleSelectedKeyframeEasingChange(deps, {
        _event: { detail: { value: "easeOutQuad" } },
      });

      await vi.advanceTimersByTimeAsync(899);
      expect(projectService.updateAnimation).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1);
      expect(projectService.updateAnimation).toHaveBeenCalledOnce();
      expect(projectService.updateAnimation).toHaveBeenCalledWith({
        animationId: "animation-1",
        data: {
          name: "Animation",
          description: "Description",
          animation: {
            type: "update",
            tween: {
              x: {
                keyframes: [
                  {
                    duration: 1000,
                    easing: "easeOutQuad",
                    relative: false,
                    value: 10,
                  },
                ],
              },
            },
          },
        },
      });

      handleSelectedKeyframeEasingChange(deps, {
        _event: { detail: { value: "easeOutQuad" } },
      });
      await vi.advanceTimersByTimeAsync(1000);

      expect(projectService.updateAnimation).toHaveBeenCalledOnce();
      expect(autosavePersistedVersion).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("opens number popovers for selected keyframe delay, duration, and value", () => {
    const store = {
      selectSelectedKeyframeDelay: vi.fn(() => 250),
      selectSelectedKeyframeDuration: vi.fn(() => 900),
      selectSelectedKeyframeValue: vi.fn(() => 12.5),
      setPopover: vi.fn(),
      updatePopoverFormValues: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedKeyframeDelayClick(
      { store, render },
      { _event: { clientX: 10, clientY: 20 } },
    );
    handleSelectedKeyframeDurationClick(
      { store, render },
      { _event: { clientX: 20, clientY: 40 } },
    );
    handleSelectedKeyframeValueClick(
      { store, render },
      { _event: { clientX: 60, clientY: 80 } },
    );

    expect(store.setPopover).toHaveBeenNthCalledWith(1, {
      mode: "editSelectedKeyframeDelay",
      x: 10,
      y: 20,
      payload: {},
    });
    expect(store.setPopover).toHaveBeenNthCalledWith(2, {
      mode: "editSelectedKeyframeDuration",
      x: 20,
      y: 40,
      payload: {},
    });
    expect(store.setPopover).toHaveBeenNthCalledWith(3, {
      mode: "editSelectedKeyframeValue",
      x: 60,
      y: 80,
      payload: {},
    });
    expect(store.updatePopoverFormValues).toHaveBeenNthCalledWith(1, {
      formValues: { value: 250 },
    });
    expect(store.updatePopoverFormValues).toHaveBeenNthCalledWith(2, {
      formValues: { value: 900 },
    });
    expect(store.updatePopoverFormValues).toHaveBeenNthCalledWith(3, {
      formValues: { value: 12.5 },
    });
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("tracks the selected keyframe number input draft", () => {
    const store = {
      selectPopover: vi.fn(() => ({
        formValues: { value: 10 },
      })),
      updatePopoverFormValues: vi.fn(),
    };

    handleSelectedKeyframeNumberInputChange(
      { store },
      { _event: { detail: { value: 25 } } },
    );

    expect(store.updatePopoverFormValues).toHaveBeenCalledWith({
      formValues: { value: 25 },
    });
  });

  it("confirms selected keyframe number inputs and closes the popover", () => {
    let popover = {
      mode: "editSelectedKeyframeDelay",
      formValues: { value: 300 },
    };
    const store = {
      bumpPreviewRenderVersion: vi.fn(),
      closePopover: vi.fn(),
      queueAutosave: vi.fn(),
      selectPopover: vi.fn(() => popover),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      setSelectedKeyframeDelay: vi.fn(),
      setSelectedKeyframeDuration: vi.fn(),
      setSelectedKeyframeValue: vi.fn(),
      stopPreviewPlayback: vi.fn(),
      ...createIdleAutosaveMocks(),
    };
    const render = vi.fn();

    handleSelectedKeyframeNumberConfirmClick({ store, render });
    popover = {
      mode: "editSelectedKeyframeDuration",
      formValues: { value: 850 },
    };
    handleSelectedKeyframeNumberConfirmClick({ store, render });
    popover = {
      mode: "editSelectedKeyframeValue",
      formValues: { value: -4.5 },
    };
    handleSelectedKeyframeNumberConfirmClick({ store, render });

    expect(store.setSelectedKeyframeDelay).toHaveBeenCalledWith({ delay: 300 });
    expect(store.setSelectedKeyframeDuration).toHaveBeenCalledWith({
      duration: 850,
    });
    expect(store.setSelectedKeyframeValue).toHaveBeenCalledWith({
      value: -4.5,
    });
    expect(store.closePopover).toHaveBeenCalledTimes(3);
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledTimes(3);
    expect(store.queueAutosave).toHaveBeenCalledTimes(3);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("focuses the number input after its popover is positioned", () => {
    const focus = vi.fn();
    handleEditorPopoverPositioned({
      refs: { selectedKeyframeNumberInput: { focus } },
      store: {
        selectPopover: vi.fn(() => ({
          mode: "editSelectedKeyframeDelay",
        })),
      },
    });

    expect(focus).toHaveBeenCalled();
  });

  it("closes a selected keyframe number popover with Escape", () => {
    const store = { closePopover: vi.fn() };
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    handleSelectedKeyframeNumberInputKeyDown(
      { store, render },
      {
        _event: {
          key: "Escape",
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(store.closePopover).toHaveBeenCalled();
    expect(render).toHaveBeenCalled();
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

  it("opens the mask editor dialog from the read-only mask summary", () => {
    const store = {
      setPopover: vi.fn(),
    };
    const render = vi.fn();

    handleEditMaskClick(
      {
        store,
        render,
      },
      {
        _event: {
          clientX: 120,
          clientY: 160,
        },
      },
    );

    expect(store.setPopover).toHaveBeenCalledWith({
      mode: "editMask",
      x: 120,
      y: 160,
      payload: {},
    });
    expect(render).toHaveBeenCalled();
  });

  it("opens the add-property dialog directly for touch transition animations", () => {
    const store = {
      selectDialogType: vi.fn(() => "transition"),
      selectIsTouchMode: vi.fn(() => true),
      selectDefaultAddPropertySide: vi.fn(() => "next"),
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
      mode: "addProperty",
      x: 24,
      y: 48,
      payload: {
        side: "next",
      },
    });
    expect(render).toHaveBeenCalled();
  });

  it("keeps the transition add-property side menu on desktop", () => {
    const store = {
      selectDialogType: vi.fn(() => "transition"),
      selectIsTouchMode: vi.fn(() => false),
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

  it("commits a pending transition mask", () => {
    const store = {
      commitPendingTransitionMask: vi.fn(),
      closePopover: vi.fn(),
      selectPopover: vi.fn(() => ({
        mode: "none",
      })),
      selectPreviewPlaybackFrameId: vi.fn(() => undefined),
      stopPreviewPlayback: vi.fn(),
      bumpPreviewRenderVersion: vi.fn(),
      queueAutosave: vi.fn(),
      selectAutosaveInFlight: vi.fn(() => false),
      selectAutosavePersistedVersion: vi.fn(() => 1),
      selectAutosaveVersion: vi.fn(() => 1),
    };
    const render = vi.fn();

    handleAddMaskClick({
      store,
      render,
    });

    expect(store.commitPendingTransitionMask).toHaveBeenCalledWith({});
    expect(store.closePopover).toHaveBeenCalledWith();
    expect(store.bumpPreviewRenderVersion).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalled();
    expect(store.queueAutosave).toHaveBeenCalled();
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
