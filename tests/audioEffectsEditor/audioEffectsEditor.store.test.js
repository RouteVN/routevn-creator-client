import { describe, expect, it } from "vitest";
import {
  addKeyframe,
  addTweenProperty,
  applyKeyframe,
  closePreviewSoundSelector,
  confirmPreviewSoundSelection,
  createInitialState,
  loadAudioEffect,
  markSaved,
  openKeyframeMenu,
  openPreviewSoundSelector,
  openKeyframeDialog,
  removeKeyframe,
  removeTweenProperty,
  selectAudioEffectDefinition,
  selectAudioEffectDuration,
  selectAudioEffectPreview,
  selectAudioEffectPreviewData,
  selectKeyframeDialogIsFinal,
  selectViewData,
  setSelectedKeyframe,
  setSelectedKeyframeDelay,
  setSelectedKeyframeDuration,
  setSelectedKeyframeEasing,
  setSelectedKeyframeRelative,
  setSelectedKeyframeValue,
  setSelectedProperty,
  setSelectedPropertyStartValue,
  setSelectedPropertyValueSource,
  setPreviewSoundSelectorSelectedSoundId,
  setPreviewPlayhead,
  setSelectedEditorTab,
  setSoundsData,
  setTimelineViewportWidth,
  setTimelineZoom,
  startPreviewPlayback,
  togglePreviewLoop,
  updateTransitionTiming,
} from "../../src/pages/audioEffectsEditor/audioEffectsEditor.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("audioEffectsEditor.store", () => {
  it("keeps the playback indicator aligned with timeline zoom", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            next: { fade: { duration: 900, easing: "linear" } },
          },
        },
      },
    );
    setTimelineViewportWidth({ state }, { viewportWidth: 900 });
    setTimelineZoom({ state }, { zoom: 4 });
    startPreviewPlayback({ state }, { startedAtMs: 100, durationMs: 900 });
    setPreviewPlayhead({ state }, { timeMs: 450 });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData).toMatchObject({
      timelineDuration: 1000,
      timelinePlayheadVisible: true,
      previewPlayheadTimeMs: 450,
      timelineZoom: 4,
      timelineZoomMin: 0.25,
      timelineZoomMax: 4,
      timelineZoomStep: 0.125,
      outgoingTimelineLabel: "Outgoing",
      incomingTimelineLabel: "Incoming",
    });
    expect(viewData.timelineCanvasStyle).toContain("width: 904px");
    expect(viewData.timelinePlayheadStyle).toContain("* 0.45");
    expect(viewData.timelineUsedAreaStyle).toContain("* 0.9");
  });

  it("uses the longest active keyframe sequence as preview duration", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "smooth-update",
          name: "Smooth Update",
          audioEffect: {
            type: "update",
            tween: {
              volume: {
                keyframes: [
                  { delay: 50, value: 50, duration: 150, easing: "linear" },
                  { value: 30, duration: 350, easing: "linear" },
                ],
              },
              pan: {
                keyframes: [
                  { delay: 100, value: 0.5, duration: 200, easing: "linear" },
                ],
              },
            },
          },
        },
      },
    );

    expect(selectAudioEffectDuration({ state })).toBe(550);
  });

  it("exposes Timeline and Preview tabs with transition sound slots", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            prev: { fade: { duration: 600, easing: "linear" } },
            next: { fade: { duration: 900, easing: "linear" } },
          },
        },
      },
    );
    setSoundsData(
      { state },
      {
        soundsData: {
          items: {
            outgoing: {
              id: "outgoing",
              type: "sound",
              name: "Outgoing",
              fileId: "outgoing.mp3",
            },
            incoming: {
              id: "incoming",
              type: "sound",
              name: "Incoming",
              fileId: "incoming.mp3",
            },
          },
          tree: [{ id: "outgoing" }, { id: "incoming" }],
        },
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedEditorTab: "timeline",
      editorTabs: [
        { id: "timeline", label: "Timeline", selected: true },
        { id: "preview", label: "Preview", selected: false },
      ],
      playButton: "Play",
      playButtonDisabled: true,
      loopPreviewLabel: "Loop preview",
      previewLoopButtonVariant: "ol",
      previewLoopEnabled: false,
      previewSoundItems: [
        { target: "outgoing", label: "Outgoing Sound" },
        { target: "incoming", label: "Incoming Sound" },
      ],
    });

    openPreviewSoundSelector({ state }, { target: "outgoing" });
    setPreviewSoundSelectorSelectedSoundId({ state }, { soundId: "outgoing" });
    expect(selectAudioEffectPreview({ state }).outgoingSound).toBeUndefined();
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      previewSoundSelectorOpen: true,
      selectedPreviewSoundId: "outgoing",
      soundSelectionConfirmDisabled: false,
      confirmSoundSelectionButton: "Select",
    });
    closePreviewSoundSelector({ state });
    expect(selectAudioEffectPreview({ state }).outgoingSound).toBeUndefined();
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      previewSoundSelectorOpen: false,
      selectedPreviewSoundId: undefined,
      soundSelectionConfirmDisabled: true,
    });
    openPreviewSoundSelector({ state }, { target: "outgoing" });
    setPreviewSoundSelectorSelectedSoundId({ state }, { soundId: "outgoing" });
    confirmPreviewSoundSelection({ state });
    openPreviewSoundSelector({ state }, { target: "incoming" });
    setPreviewSoundSelectorSelectedSoundId({ state }, { soundId: "incoming" });
    confirmPreviewSoundSelection({ state });
    setSelectedEditorTab({ state }, { tab: "preview" });

    expect(selectAudioEffectPreview({ state })).toMatchObject({
      outgoingSound: { id: "outgoing" },
      incomingSound: { id: "incoming" },
    });
    expect(selectAudioEffectPreviewData({ state })).toEqual({
      outgoing: { soundId: "outgoing" },
      incoming: { soundId: "incoming" },
    });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedEditorTab: "preview",
      playButtonDisabled: false,
      showRightPanel: true,
      noSelectionLabel: "No selection",
    });

    togglePreviewLoop({ state });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      previewLoopButtonVariant: "pr",
      previewLoopEnabled: true,
    });
  });

  it("shows no selection in the right panel while Preview is active", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "smooth-update",
          name: "Smooth Update",
          audioEffect: {
            type: "update",
            tween: {
              volume: {
                keyframes: [{ value: 50, duration: 250, easing: "linear" }],
              },
            },
          },
        },
      },
    );
    setSelectedKeyframe(
      { state },
      { side: "update", property: "volume", index: 0 },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeDetailId: "update:volume:0",
    });

    setSelectedEditorTab({ state }, { tab: "preview" });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      showRightPanel: true,
      detailsPanelTitle: undefined,
      selectedKeyframeDetailId: undefined,
      noSelectionLabel: "No selection",
    });
  });

  it("selects update properties and edits their start value in the detail panel", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "smooth-update",
          name: "Smooth Update",
          audioEffect: {
            type: "update",
            tween: {
              volume: {
                keyframes: [
                  {
                    startValue: 80,
                    value: 50,
                    duration: 250,
                    easing: "linear",
                  },
                ],
              },
            },
          },
        },
      },
    );

    setSelectedProperty({ state }, { side: "update", property: "volume" });

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      detailsPanelTitle: "Property",
      selectedProperty: { side: "update", property: "volume" },
      selectedPropertyDetailId: "update:volume",
      selectedPropertyDetailFields: [
        { label: "Timeline", value: "Update" },
        { label: "Property", value: "Volume" },
        { label: "Value source", slot: "property-value-source" },
        { label: "Start value", slot: "property-start-value" },
      ],
      selectedPropertyEditor: {
        valueSource: "fixed",
        valueSourceOptions: [
          { label: "Default", value: "default" },
          { label: "Fixed", value: "fixed" },
        ],
        startValue: 80,
        startValueSlider: { min: 0, max: 100, step: 1 },
      },
    });

    setSelectedPropertyStartValue({ state }, { value: 65 });
    expect(state.definition.tween.volume.keyframes[0].startValue).toBe(65);
    expect(
      selectViewData({ state, i18n: EN_I18N }).updateTimelineProperties.volume
        .initialValue,
    ).toBe(65);
    setSelectedPropertyValueSource({ state }, { valueSource: "default" });
    expect(
      state.definition.tween.volume.keyframes[0].startValue,
    ).toBeUndefined();
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedPropertyDetailFields: [
        { label: "Timeline", value: "Update" },
        { label: "Property", value: "Volume" },
        { label: "Value source", slot: "property-value-source" },
      ],
      selectedPropertyEditor: {
        valueSource: "default",
        startValue: 100,
      },
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).updateTimelineProperties.volume
        .initialValue,
    ).toBeUndefined();
    setSelectedPropertyValueSource({ state }, { valueSource: "fixed" });
    expect(state.definition.tween.volume.keyframes[0].startValue).toBe(100);
    expect(state.dirty).toBe(true);
  });

  it("selects transition fade properties and edits their boundary start value", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            prev: {
              fade: {
                keyframes: [{ value: 0, duration: 500, easing: "linear" }],
              },
            },
            next: {
              fade: {
                keyframes: [{ value: 100, duration: 500, easing: "linear" }],
              },
            },
          },
        },
      },
    );

    setSelectedProperty({ state }, { side: "prev", property: "fade" });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      detailsPanelTitle: "Property",
      selectedPropertyDetailId: "prev:fade",
      selectedPropertyEditor: {
        valueSource: "default",
        startValue: 100,
      },
      canRemoveSelectedProperty: false,
    });

    setSelectedPropertyValueSource({ state }, { valueSource: "fixed" });
    expect(state.definition.prev.fade.keyframes[0].startValue).toBe(100);
    setSelectedPropertyStartValue({ state }, { value: 90 });
    expect(state.definition.prev.fade.keyframes[0].startValue).toBe(90);
    expect(
      selectViewData({ state, i18n: EN_I18N }).previousTimelineProperties.fade
        .initialValue,
    ).toBe(90);

    setSelectedProperty({ state }, { side: "next", property: "fade" });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedPropertyDetailId: "next:fade",
      selectedPropertyEditor: { valueSource: "default", startValue: 0 },
    });
    setSelectedPropertyValueSource({ state }, { valueSource: "fixed" });
    expect(state.definition.next.fade.keyframes[0].startValue).toBe(0);
  });

  it("loads saved preview sounds from the audio effect item", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          preview: {
            outgoing: { soundId: "sound-a" },
            incoming: { soundId: "sound-b" },
          },
          audioEffect: {
            type: "transition",
            next: { fade: { duration: 900, easing: "linear" } },
          },
        },
      },
    );

    expect(selectAudioEffectPreviewData({ state })).toEqual({
      outgoing: { soundId: "sound-a" },
      incoming: { soundId: "sound-b" },
    });
  });

  it("appends an absolute timeline keyframe after the final numeric update endpoint", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "volume-update",
          name: "Volume Update",
          audioEffect: {
            type: "update",
            tween: {
              volume: {
                keyframes: [{ value: 30, duration: 300, easing: "linear" }],
              },
            },
          },
        },
      },
    );

    addKeyframe(
      { state },
      {
        property: "volume",
        index: 1,
        keyframe: { value: 100, duration: 1000, easing: "linear" },
      },
    );

    expect(state.definition.tween.volume.keyframes).toEqual([
      { value: 30, duration: 300, easing: "linear" },
      { value: 100, duration: 1000, easing: "linear" },
    ]);
    expect(state.selectedKeyframe).toEqual({
      side: "update",
      property: "volume",
      index: 1,
    });
    expect(state.keyframeDialog.open).toBe(false);
  });

  it("protects the final update endpoint while allowing earlier keyframes to be deleted", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "smooth-volume",
          name: "Smooth Volume",
          audioEffect: {
            type: "update",
            tween: {
              volume: {
                keyframes: [
                  { value: 50, duration: 150, easing: "easeOutQuad" },
                  {
                    value: 30,
                    duration: 350,
                    easing: "easeInOutSine",
                  },
                ],
              },
            },
          },
        },
      },
    );

    removeKeyframe({ state }, { property: "volume", index: 1 });
    expect(state.definition.tween.volume.keyframes).toHaveLength(2);
    removeKeyframe({ state }, { property: "volume", index: 0 });
    expect(state.definition.tween.volume.keyframes).toEqual([
      { value: 30, duration: 350, easing: "easeInOutSine" },
    ]);
    openKeyframeDialog(
      { state },
      { side: "update", property: "volume", index: 0 },
    );
    applyKeyframe(
      { state },
      {
        keyframe: {
          value: 10,
          relative: true,
          duration: 200,
          easing: "linear",
        },
      },
    );
    expect(state.definition.tween.volume.keyframes[0]).toEqual({
      value: 10,
      duration: 200,
      easing: "linear",
    });

    addTweenProperty({ state }, { property: "pan" });
    expect(state.definition.tween.pan.keyframes).toEqual([
      {
        value: 0,
        duration: 300,
        easing: "easeInOutSine",
      },
    ]);

    openKeyframeDialog({ state }, { add: true, property: "pan" });
    applyKeyframe(
      { state },
      {
        keyframe: {
          value: -0.5,
          duration: 100,
          easing: "linear",
        },
      },
    );
    expect(state.definition.tween.pan.keyframes).toEqual([
      {
        value: 0,
        duration: 300,
        easing: "easeInOutSine",
      },
      { value: -0.5, duration: 100, easing: "linear" },
    ]);

    removeTweenProperty({ state }, { property: "volume" });
    removeTweenProperty({ state }, { property: "pan" });
    expect(Object.keys(state.definition.tween)).toEqual(["pan"]);
    expect(state.dirty).toBe(true);
  });

  it("identifies final keyframes and exposes localized editor data", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "update-1",
          name: "Update One",
          audioEffect: {
            type: "update",
            tween: {
              playbackRate: {
                keyframes: [
                  { value: 1.25, duration: 100 },
                  { value: 1, duration: 200 },
                ],
              },
            },
          },
        },
      },
    );

    openKeyframeDialog(
      { state },
      { add: false, property: "playbackRate", index: 1 },
    );
    expect(selectKeyframeDialogIsFinal({ state })).toBe(true);
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      audioEffectName: "Update One",
      effectTypeLabel: "Update",
      isUpdate: true,
      timelineDuration: 1000,
      timelineUsedDuration: 300,
      updateTimelineProperties: {
        playbackRate: {
          label: "Playback Rate",
          keyframes: [
            { value: 1.25, duration: 100 },
            { value: 1, duration: 200 },
          ],
        },
      },
      properties: [
        {
          id: "playbackRate",
          label: "Playback Rate",
          keyframes: [
            { valueLabel: "1.25", canDelete: true },
            { valueLabel: "1", canDelete: false },
          ],
        },
      ],
    });
    expect(selectAudioEffectDefinition({ state })).toEqual(state.definition);
    expect(selectAudioEffectDefinition({ state })).not.toBe(state.definition);

    setSelectedKeyframe(
      { state },
      { side: "update", property: "playbackRate", index: 0 },
    );
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      detailsPanelTitle: "Keyframe Details",
      selectedKeyframeDetailId: "update:playbackRate:0",
      selectedKeyframeDetailFields: expect.arrayContaining([
        expect.objectContaining({ label: "Timeline", value: "Update" }),
        expect.objectContaining({
          label: "Property",
          value: "Playback Rate",
        }),
        expect.objectContaining({
          label: "Start value",
          value: "Current value",
        }),
      ]),
      selectedKeyframeEditor: {
        delay: 0,
        duration: 100,
        easing: "linear",
        value: 1.25,
        valueEditable: true,
      },
      selectedKeyframeCanOpenEditDialog: true,
    });

    setSelectedKeyframeDelay({ state }, { delay: 25 });
    setSelectedKeyframeDuration({ state }, { duration: 175 });
    setSelectedKeyframeEasing({ state }, { easing: "easeOutQuad" });
    setSelectedKeyframeValue({ state }, { value: 1.5 });
    setSelectedKeyframeRelative({ state }, { relative: true });
    expect(state.definition.tween.playbackRate.keyframes[0]).toMatchObject({
      delay: 25,
      duration: 175,
      easing: "easeOutQuad",
      value: 1.5,
      relative: true,
    });

    setSelectedKeyframe(
      { state },
      { side: "update", property: "playbackRate", index: 1 },
    );
    setSelectedKeyframeValue({ state }, { value: 0.75 });
    setSelectedKeyframeRelative({ state }, { relative: true });
    expect(state.definition.tween.playbackRate.keyframes[1]).toEqual({
      value: 0.75,
      duration: 200,
    });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeEditor: {
        value: 0.75,
        valueEditable: true,
        relative: false,
      },
    });
  });

  it("maps transition definitions into timeline tracks", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            prev: { fade: { delay: 10, duration: 600, easing: "linear" } },
            next: {
              fade: { delay: 20, duration: 900, easing: "easeInOutSine" },
            },
          },
        },
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isTransition: true,
      timelineDuration: 1000,
      timelineUsedDuration: 920,
      previousTimelineProperties: {
        fade: {
          initialValue: 100,
          keyframes: [{ delay: 10, duration: 600, easing: "linear", value: 0 }],
        },
      },
      nextTimelineProperties: {
        fade: {
          initialValue: 0,
          keyframes: [
            {
              delay: 20,
              duration: 900,
              easing: "easeInOutSine",
              value: 100,
            },
          ],
        },
      },
    });

    setSelectedKeyframe(
      { state },
      { side: "next", property: "fade", index: 0 },
    );
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeDetailId: "next:fade:0",
      selectedKeyframeDetailFields: expect.arrayContaining([
        expect.objectContaining({ label: "Timeline", value: "Incoming" }),
        expect.objectContaining({
          label: "Property",
          value: "Fade",
        }),
      ]),
      selectedKeyframeEditor: {
        delay: 20,
        duration: 900,
        easing: "easeInOutSine",
        valueDisabled: true,
        valueEditable: false,
      },
      selectedKeyframeCanOpenEditDialog: false,
    });
    setSelectedKeyframeDuration({ state }, { duration: 950 });
    expect(state.definition.next.fade.keyframes[0].duration).toBe(950);
    markSaved({ state });

    updateTransitionTiming(
      { state },
      { side: "prev", delay: 25, duration: 700 },
    );
    expect(state.definition.prev.fade).toEqual({
      keyframes: [
        {
          delay: 25,
          duration: 700,
          easing: "linear",
          value: 0,
        },
      ],
    });
    expect(state.dirty).toBe(true);
  });

  it("inserts and edits every transition fade keyframe", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            next: {
              fade: {
                keyframes: [
                  { value: 100, duration: 900, easing: "easeInOutSine" },
                ],
              },
            },
          },
        },
      },
    );

    addKeyframe(
      { state },
      {
        side: "next",
        property: "fade",
        index: 0,
        followingDelay: 25,
        keyframe: {
          value: 50,
          delay: 50,
          duration: 300,
          easing: "linear",
        },
      },
    );

    expect(state.definition.next.fade.keyframes).toEqual([
      {
        value: 50,
        delay: 50,
        duration: 300,
        easing: "linear",
      },
      {
        value: 100,
        delay: 25,
        duration: 900,
        easing: "easeInOutSine",
      },
    ]);
    expect(state.selectedKeyframe).toEqual({
      side: "next",
      property: "fade",
      index: 0,
    });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeEditor: {
        value: 50,
        valueEditable: true,
      },
    });

    setSelectedKeyframeValue({ state }, { value: 75 });
    expect(state.definition.next.fade.keyframes[0].value).toBe(75);

    setSelectedKeyframe(
      { state },
      { side: "next", property: "fade", index: 1 },
    );
    setSelectedKeyframeValue({ state }, { value: 90 });
    expect(state.definition.next.fade.keyframes[1].value).toBe(100);
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeEditor: {
        value: 100,
        valueDisabled: true,
        valueEditable: false,
      },
    });
  });

  it("appends a transition keyframe without changing the previous keyframe", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            prev: {
              fade: {
                keyframes: [
                  {
                    value: 0,
                    delay: 75,
                    duration: 600,
                    easing: "easeInOutSine",
                  },
                ],
              },
            },
          },
        },
      },
    );

    addKeyframe(
      { state },
      {
        side: "prev",
        property: "fade",
        index: 1,
        keyframe: {
          value: 50,
          delay: 25,
          duration: 300,
          easing: "linear",
        },
      },
    );

    expect(state.definition.prev.fade.keyframes).toEqual([
      {
        value: 0,
        delay: 75,
        duration: 600,
        easing: "easeInOutSine",
      },
      {
        value: 50,
        delay: 25,
        duration: 300,
        easing: "linear",
      },
    ]);
    expect(state.selectedKeyframe).toEqual({
      side: "prev",
      property: "fade",
      index: 1,
    });
  });

  it("protects the final incoming fade endpoint and keeps it fixed at 100", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            next: {
              fade: {
                keyframes: [
                  { value: 50, duration: 300, easing: "linear" },
                  { value: 100, duration: 600, easing: "easeInOutSine" },
                ],
              },
            },
          },
        },
      },
    );

    setSelectedKeyframe(
      { state },
      { side: "next", property: "fade", index: 1 },
    );
    setSelectedKeyframeValue({ state }, { value: 75 });
    removeKeyframe({ state }, { side: "next", property: "fade", index: 1 });
    openKeyframeDialog({ state }, { side: "next", property: "fade", index: 1 });
    applyKeyframe(
      { state },
      {
        keyframe: {
          value: 75,
          relative: true,
          duration: 500,
          easing: "linear",
        },
      },
    );

    expect(state.definition.next.fade.keyframes).toEqual([
      { value: 50, duration: 300, easing: "linear" },
      { value: 100, duration: 500, easing: "linear" },
    ]);
  });

  it("inserts incoming fade keyframes before the mandatory endpoint", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "crossfade",
          name: "Crossfade",
          audioEffect: {
            type: "transition",
            next: {
              fade: {
                keyframes: [
                  { value: 50, duration: 300, easing: "linear" },
                  { value: 100, duration: 600, easing: "easeInOutSine" },
                ],
              },
            },
          },
        },
      },
    );

    addKeyframe(
      { state },
      {
        side: "next",
        property: "fade",
        index: 2,
        keyframe: { value: 75, duration: 200, easing: "linear" },
      },
    );

    expect(state.definition.next.fade.keyframes).toEqual([
      { value: 50, duration: 300, easing: "linear" },
      { value: 75, duration: 200, easing: "linear" },
      { value: 100, duration: 600, easing: "easeInOutSine" },
    ]);
    expect(state.selectedKeyframe).toEqual({
      side: "next",
      property: "fade",
      index: 1,
    });
  });

  it("exposes localized keyframe menu items and protects a sole keyframe", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "volume-update",
          name: "Volume Update",
          audioEffect: {
            type: "update",
            tween: {
              volume: {
                keyframes: [{ value: 100, duration: 300, easing: "linear" }],
              },
            },
          },
        },
      },
    );
    openKeyframeMenu(
      { state },
      { side: "update", property: "volume", index: 0, x: 10, y: 20 },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      keyframeMenu: {
        open: true,
        x: 10,
        y: 20,
      },
      keyframeMenuItems: [
        { label: "Edit keyframe", value: "edit" },
        { label: "Add keyframe to right", value: "add-right" },
        { label: "Add keyframe to left", value: "add-left" },
      ],
    });
  });
});
