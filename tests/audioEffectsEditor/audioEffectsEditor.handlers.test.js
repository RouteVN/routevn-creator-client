import { describe, expect, it, vi } from "vitest";
import {
  handleAddKeyframeFromTimeline,
  handleBackClick,
  handleEditorTabClick,
  handleKeyframeClick,
  handleKeyframeDropdownItemClick,
  handleKeyframeDurationChange,
  handleKeyframeFormAction,
  handleKeyframeMenuClose,
  handleKeyframeRightClick,
  handlePlayButtonTooltipHide,
  handlePlayButtonTooltipShow,
  handlePreviewSoundClick,
  handleConfirmSoundSelection,
  handlePreviewSoundSelected,
  handlePropertyNameClick,
  handleSavePreviewClick,
  handleSelectedKeyframeAddClick,
  handleSelectedKeyframeAddMenuClose,
  handleSelectedKeyframeAddMenuItemClick,
  handleSelectedKeyframeDelayChange,
  handleSelectedKeyframeEditClick,
  handleSelectedKeyframeRemoveStartValueClick,
  handleSelectedKeyframeStartValueChange,
  handleSelectedPropertyInitialValueChange,
  handleSelectedPropertyValueSourceChange,
  handleTimelineZoomChange,
  handleTimelineZoomIn,
  handleTimelineZoomOut,
  handleTogglePreviewLoop,
} from "../../src/pages/audioEffectsEditor/audioEffectsEditor.handlers.js";
import { EN_I18N } from "../support/i18n.js";

describe("audioEffectsEditor.handlers", () => {
  it("toggles preview looping", () => {
    const store = { togglePreviewLoop: vi.fn() };
    const render = vi.fn();

    handleTogglePreviewLoop({ store, render });

    expect(store.togglePreviewLoop).toHaveBeenCalledWith({});
    expect(render).toHaveBeenCalledOnce();
  });

  it("shows the disabled Play explanation below its focusable wrapper", () => {
    const store = {
      showPlayButtonTooltip: vi.fn(),
      hidePlayButtonTooltip: vi.fn(),
    };
    const render = vi.fn();

    handlePlayButtonTooltipShow(
      { store, render },
      {
        _event: {
          currentTarget: {
            getBoundingClientRect: () => ({
              left: 20,
              bottom: 48,
              width: 80,
            }),
          },
        },
      },
    );
    handlePlayButtonTooltipHide({ store, render });

    expect(store.showPlayButtonTooltip).toHaveBeenCalledWith({
      x: 60,
      y: 56,
    });
    expect(store.hidePlayButtonTooltip).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("changes timeline zoom from the slider and step buttons", () => {
    const store = {
      setTimelineZoom: vi.fn(),
      nudgeTimelineZoom: vi.fn(),
    };
    const render = vi.fn();

    handleTimelineZoomChange(
      { store, render },
      { _event: { detail: { value: 1.5 } } },
    );
    handleTimelineZoomIn({ store, render });
    handleTimelineZoomOut({ store, render });

    expect(store.setTimelineZoom).toHaveBeenCalledWith({ zoom: 1.5 });
    expect(store.nudgeTimelineZoom.mock.calls).toEqual([
      [{ delta: 0.125 }],
      [{ delta: -0.125 }],
    ]);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("switches between Timeline and Preview tabs", async () => {
    let selectedEditorTab = "timeline";
    const store = {
      selectSelectedEditorTab: vi.fn(() => selectedEditorTab),
      selectPreviewPlaying: vi.fn(() => false),
      setSelectedEditorTab: vi.fn(({ tab }) => {
        selectedEditorTab = tab;
      }),
    };
    const render = vi.fn();

    await handleEditorTabClick(
      { store, render },
      {
        _event: {
          currentTarget: { dataset: { tabId: "preview" } },
        },
      },
    );

    expect(store.setSelectedEditorTab).toHaveBeenCalledWith({
      tab: "preview",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("selects an outgoing preview sound from the sound picker", async () => {
    const store = {
      selectPreviewPlaying: vi.fn(() => false),
      openPreviewSoundSelector: vi.fn(),
      setPreviewSoundSelectorSelectedSoundId: vi.fn(),
      confirmPreviewSoundSelection: vi.fn(),
    };
    const render = vi.fn();

    await handlePreviewSoundClick(
      { store, render },
      {
        _event: {
          currentTarget: { dataset: { target: "outgoing" } },
        },
      },
    );
    handlePreviewSoundSelected(
      { store, render },
      { _event: { detail: { soundId: "sound-1" } } },
    );
    expect(store.confirmPreviewSoundSelection).not.toHaveBeenCalled();
    handleConfirmSoundSelection({ store, render });

    expect(store.openPreviewSoundSelector).toHaveBeenCalledWith({
      target: "outgoing",
    });
    expect(store.setPreviewSoundSelectorSelectedSoundId).toHaveBeenCalledWith({
      soundId: "sound-1",
    });
    expect(store.confirmPreviewSoundSelection).toHaveBeenCalledOnce();
  });

  it("saves outgoing and incoming preview sounds", async () => {
    const deps = {
      i18n: EN_I18N,
      appService: {
        showToast: vi.fn(),
      },
      projectService: {
        updateAudioEffect: vi.fn(async () => ({ valid: true })),
      },
      store: {
        selectAudioEffectId: vi.fn(() => "crossfade"),
        selectDirty: vi.fn(() => false),
        selectAudioEffectPreviewData: vi.fn(() => ({
          outgoing: { soundId: "sound-a" },
          incoming: { soundId: "sound-b" },
        })),
        setSaving: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleSavePreviewClick(deps);

    expect(deps.projectService.updateAudioEffect).toHaveBeenCalledWith({
      audioEffectId: "crossfade",
      data: {
        preview: {
          outgoing: { soundId: "sound-a" },
          incoming: { soundId: "sound-b" },
        },
      },
    });
    expect(deps.appService.showToast).toHaveBeenCalledWith({
      message: "Audio effect preview saved.",
    });
  });

  it("adds and selects a default audio keyframe without opening a dialog", () => {
    const store = { addKeyframe: vi.fn() };
    const render = vi.fn();

    handleAddKeyframeFromTimeline(
      { store, render },
      {
        _event: {
          detail: {
            side: "update",
            property: "volume",
            index: 1,
            delay: 100,
            duration: 400,
            followingDelay: 50,
          },
        },
      },
    );

    expect(store.addKeyframe).toHaveBeenCalledWith({
      property: "volume",
      index: 1,
      followingDelay: 50,
      keyframe: {
        value: 100,
        delay: 100,
        duration: 400,
        easing: "linear",
      },
      side: "update",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("adds and selects an intermediate transition fade keyframe", () => {
    const store = { addKeyframe: vi.fn() };
    const render = vi.fn();

    handleAddKeyframeFromTimeline(
      { store, render },
      {
        _event: {
          detail: {
            side: "prev",
            property: "fade",
            index: 1,
            delay: 50,
            duration: 300,
            followingDelay: 25,
          },
        },
      },
    );

    expect(store.addKeyframe).toHaveBeenCalledWith({
      property: "fade",
      side: "prev",
      index: 1,
      followingDelay: 25,
      keyframe: {
        value: 50,
        delay: 50,
        duration: 300,
        easing: "linear",
      },
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("selects a clicked keyframe without opening its edit dialog", () => {
    const store = { setSelectedKeyframe: vi.fn() };
    const render = vi.fn();

    handleKeyframeClick(
      { store, render },
      {
        _event: {
          detail: { side: "update", property: "volume", index: "1" },
        },
      },
    );

    expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
      side: "update",
      property: "volume",
      index: "1",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("selects a property without opening a dialog", () => {
    const store = { setSelectedProperty: vi.fn() };
    const render = vi.fn();

    handlePropertyNameClick(
      { store, render },
      {
        _event: {
          detail: { side: "prev", property: "fade" },
        },
      },
    );

    expect(store.setSelectedProperty).toHaveBeenCalledWith({
      side: "prev",
      property: "fade",
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("edits the selected property value source and initial value", () => {
    const store = {
      setSelectedPropertyInitialValue: vi.fn(),
      setSelectedPropertyValueSource: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedPropertyInitialValueChange(
      { store, render },
      { _event: { detail: { value: 75 } } },
    );
    handleSelectedPropertyValueSourceChange(
      { store, render },
      { _event: { detail: { value: "default" } } },
    );

    expect(store.setSelectedPropertyInitialValue).toHaveBeenCalledWith({
      initialValue: 75,
    });
    expect(store.setSelectedPropertyValueSource).toHaveBeenCalledWith({
      valueSource: "default",
    });
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("selects a right-clicked keyframe and opens its positioned menu", () => {
    const store = {
      openKeyframeMenu: vi.fn(),
      setSelectedKeyframe: vi.fn(),
    };
    const render = vi.fn();

    handleKeyframeRightClick(
      { store, render },
      {
        _event: {
          detail: {
            side: "next",
            property: "fade",
            index: "1",
            x: 120,
            y: 160,
          },
        },
      },
    );

    expect(store.setSelectedKeyframe).toHaveBeenCalledWith({
      side: "next",
      property: "fade",
      index: "1",
    });
    expect(store.openKeyframeMenu).toHaveBeenCalledWith({
      side: "next",
      property: "fade",
      index: "1",
      x: 120,
      y: 160,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it.each([
    ["add-left", 1],
    ["add-right", 2],
  ])("adds a default transition keyframe for %s", (value, expectedIndex) => {
    const store = {
      addKeyframe: vi.fn(),
      closeKeyframeMenu: vi.fn(),
      selectKeyframeMenu: vi.fn(() => ({
        side: "prev",
        property: "fade",
        index: 1,
      })),
    };
    const render = vi.fn();

    handleKeyframeDropdownItemClick(
      { store, render },
      { _event: { detail: { item: { value } } } },
    );

    expect(store.addKeyframe).toHaveBeenCalledWith({
      side: "prev",
      property: "fade",
      index: expectedIndex,
      keyframe: {
        value: 50,
        duration: 1000,
        easing: "linear",
      },
    });
    expect(store.closeKeyframeMenu).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the keyframe form from the context menu and deletes through menu actions", () => {
    const keyframeForm = { reset: vi.fn(), setValues: vi.fn() };
    const store = {
      closeKeyframeMenu: vi.fn(),
      removeKeyframe: vi.fn(),
      selectKeyframeMenu: vi.fn(() => ({
        side: "update",
        property: "volume",
        index: 1,
      })),
      openKeyframeDialog: vi.fn(),
      selectIsTouchMode: vi.fn(() => true),
      selectKeyframeDialogValues: vi.fn(() => ({ duration: 200 })),
    };
    const render = vi.fn();

    handleKeyframeDropdownItemClick(
      { refs: { keyframeForm }, store, render },
      { _event: { detail: { item: { value: "edit" } } } },
    );
    expect(store.removeKeyframe).not.toHaveBeenCalled();
    expect(store.openKeyframeDialog).toHaveBeenCalledWith({
      add: false,
      side: "update",
      property: "volume",
      index: 1,
      delay: undefined,
      duration: undefined,
      followingDelay: undefined,
    });
    expect(keyframeForm.reset).toHaveBeenCalledOnce();
    expect(keyframeForm.setValues).toHaveBeenCalledWith({
      values: { duration: 200 },
    });

    handleKeyframeDropdownItemClick(
      { refs: { keyframeForm }, store, render },
      { _event: { detail: { item: { value: "delete-keyframe" } } } },
    );
    expect(store.removeKeyframe).toHaveBeenCalledWith({
      side: "update",
      property: "volume",
      index: 1,
    });

    handleKeyframeMenuClose({ store, render });
    expect(store.closeKeyframeMenu).toHaveBeenCalledTimes(3);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("opens editing only from the selected-keyframe panel action", () => {
    const keyframeForm = { reset: vi.fn(), setValues: vi.fn() };
    const store = {
      selectSelectedKeyframe: vi.fn(() => ({
        side: "update",
        property: "volume",
        index: 1,
      })),
      openKeyframeDialog: vi.fn(),
      selectKeyframeDialogValues: vi.fn(() => ({ duration: 200 })),
    };
    const render = vi.fn();

    handleSelectedKeyframeEditClick({
      refs: { keyframeForm },
      store,
      render,
    });

    expect(store.openKeyframeDialog).toHaveBeenCalledWith({
      add: false,
      side: "update",
      property: "volume",
      index: 1,
      delay: undefined,
      duration: undefined,
      followingDelay: undefined,
    });
    expect(keyframeForm.reset).toHaveBeenCalledOnce();
    expect(keyframeForm.setValues).toHaveBeenCalledWith({
      values: { duration: 200 },
    });
  });

  it("commits right-panel timing changes without opening a dialog", () => {
    const store = {
      setSelectedKeyframeDelay: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedKeyframeDelayChange(
      { refs: {}, store, render },
      { _event: { detail: { value: 125 } } },
    );

    expect(store.setSelectedKeyframeDelay).toHaveBeenCalledWith({ delay: 125 });
    expect(render).toHaveBeenCalledOnce();
  });

  it("adds, edits, and removes a selected keyframe start value", () => {
    const store = {
      closeSelectedKeyframeAddMenu: vi.fn(),
      openSelectedKeyframeAddMenu: vi.fn(),
      selectDefaultSelectedKeyframeStartValue: vi.fn(() => 75),
      selectSelectedKeyframe: vi.fn(() => ({
        side: "update",
        property: "volume",
        index: 1,
      })),
      setSelectedKeyframeStartValue: vi.fn(),
    };
    const render = vi.fn();

    handleSelectedKeyframeAddClick(
      { render, store },
      {
        _event: {
          currentTarget: {
            getBoundingClientRect: () => ({ left: 120, bottom: 180 }),
          },
        },
      },
    );
    expect(store.openSelectedKeyframeAddMenu).toHaveBeenCalledWith({
      x: 120,
      y: 180,
    });

    handleSelectedKeyframeAddMenuItemClick(
      { render, store },
      { _event: { detail: { item: { value: "start-value" } } } },
    );
    expect(store.setSelectedKeyframeStartValue).toHaveBeenCalledWith({
      startValue: 75,
    });

    handleSelectedKeyframeStartValueChange(
      { render, store },
      { _event: { detail: { value: 65 } } },
    );
    expect(store.setSelectedKeyframeStartValue).toHaveBeenCalledWith({
      startValue: 65,
    });

    handleSelectedKeyframeRemoveStartValueClick({ render, store });
    expect(store.setSelectedKeyframeStartValue).toHaveBeenCalledWith({
      startValue: undefined,
    });

    handleSelectedKeyframeAddMenuClose({ render, store });
    expect(store.closeSelectedKeyframeAddMenu).toHaveBeenCalledTimes(2);
    expect(render).toHaveBeenCalledTimes(5);
  });

  it("saves transition timeline state when navigating back", async () => {
    const definition = {
      type: "transition",
      next: {
        fade: {
          delay: 25,
          duration: 500,
          easing: "easeOutQuad",
        },
      },
    };
    const deps = {
      i18n: EN_I18N,
      appService: {
        getPayload: vi.fn(() => ({ audioEffectId: "crossfade" })),
        navigate: vi.fn(),
        showAlert: vi.fn(),
        showToast: vi.fn(),
      },
      projectService: {
        updateAudioEffect: vi.fn(async () => ({ valid: true })),
      },
      store: {
        selectAudioEffectId: vi.fn(() => "crossfade"),
        selectDirty: vi.fn(() => true),
        setSaving: vi.fn(),
        selectAudioEffectDefinition: vi.fn(() => definition),
        markSaved: vi.fn(),
      },
      render: vi.fn(),
    };

    await handleBackClick(deps);

    expect(deps.projectService.updateAudioEffect).toHaveBeenCalledWith({
      audioEffectId: "crossfade",
      data: {
        audioEffect: {
          type: "transition",
          next: {
            fade: {
              delay: 25,
              duration: 500,
              easing: "easeOutQuad",
            },
          },
        },
      },
    });
    expect(deps.store.markSaved).toHaveBeenCalledOnce();
    expect(deps.appService.navigate).toHaveBeenCalledOnce();
  });

  it("updates transition timing directly from its timeline", () => {
    const store = { updateKeyframeTiming: vi.fn() };
    const render = vi.fn();

    handleKeyframeDurationChange(
      { store, render },
      {
        _event: {
          detail: {
            side: "next",
            property: "fade",
            index: 0,
            delay: 25,
            duration: 500,
          },
        },
      },
    );

    expect(store.updateKeyframeTiming).toHaveBeenCalledWith({
      side: "next",
      property: "fade",
      index: 0,
      delay: 25,
      duration: 500,
      followingDelay: undefined,
    });
    expect(render).toHaveBeenCalledOnce();
  });

  it("applies a validated keyframe and reports invalid absolute values", () => {
    const deps = {
      i18n: EN_I18N,
      appService: { showAlert: vi.fn() },
      store: {
        selectKeyframeDialogIsFinal: vi.fn(() => false),
        selectKeyframeDialogProperty: vi.fn(() => "pan"),
        selectKeyframeDialogSide: vi.fn(() => "update"),
        applyKeyframe: vi.fn(),
      },
      render: vi.fn(),
    };
    const payload = {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            useStartValue: false,
            relative: false,
            value: 0.5,
            delay: 0,
            duration: 200,
            easing: "linear",
          },
        },
      },
    };

    handleKeyframeFormAction(deps, payload);
    expect(deps.store.applyKeyframe).toHaveBeenCalledWith({
      keyframe: { value: 0.5, duration: 200, easing: "linear" },
    });

    payload._event.detail.values.value = 2;
    handleKeyframeFormAction(deps, payload);
    expect(deps.store.applyKeyframe).toHaveBeenCalledTimes(1);
    expect(deps.appService.showAlert).toHaveBeenCalledWith({
      title: "Warning",
      message: "Enter a valid keyframe value, timing, and easing.",
    });
  });
});
