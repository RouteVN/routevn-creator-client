import { describe, expect, it } from "vitest";
import {
  addKeyframe,
  addAudioEffectProperty,
  applyKeyframe,
  closePreviewSoundSelector,
  confirmPreviewSoundSelection,
  createInitialState,
  hidePlayButtonTooltip,
  loadAudioEffect,
  markSaved,
  openKeyframeMenu,
  openPreviewSoundSelector,
  openKeyframeDialog,
  removeKeyframe,
  removeAudioEffectProperty,
  selectAudioEffectDefinition,
  selectAudioEffectDuration,
  selectAudioEffectPreview,
  selectAudioEffectPreviewData,
  selectDefaultSelectedKeyframeStartValue,
  selectKeyframeDialogIsFinal,
  selectViewData,
  setSelectedKeyframe,
  setSelectedKeyframeDelay,
  setSelectedKeyframeDuration,
  setSelectedKeyframeEasing,
  setSelectedKeyframeRelative,
  setSelectedKeyframeStartValue,
  setSelectedKeyframeValue,
  setSelectedProperty,
  setSelectedPropertyInitialValue,
  setSelectedPropertyValueSource,
  setPreviewSoundSelectorSelectedSoundId,
  setPreviewPlayhead,
  setSelectedEditorTab,
  setSoundsData,
  setTimelineViewportWidth,
  setTimelineZoom,
  showPlayButtonTooltip,
  startPreviewPlayback,
  togglePreviewLoop,
  updateKeyframeTiming,
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
            next: {
              volume: {
                initialValue: 0,
                keyframes: [{ value: 100, duration: 900, easing: "linear" }],
              },
            },
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
            prev: {
              volume: {
                keyframes: [{ value: 0, duration: 600, easing: "linear" }],
              },
            },
            next: {
              volume: {
                initialValue: 0,
                keyframes: [{ value: 100, duration: 900, easing: "linear" }],
              },
            },
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
      playButtonDisabledReason:
        "Select different outgoing and incoming sounds in Preview to enable playback.",
      playButtonTooltip: { open: false, x: 0, y: 0 },
      loopPreviewLabel: "Loop preview",
      previewLoopButtonVariant: "ol",
      previewLoopEnabled: false,
      previewSoundItems: [
        { target: "outgoing", label: "Outgoing Sound" },
        { target: "incoming", label: "Incoming Sound" },
      ],
    });

    showPlayButtonTooltip({ state }, { x: 120, y: 56 });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      playButtonTooltip: { open: true, x: 120, y: 56 },
    });
    hidePlayButtonTooltip({ state });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      playButtonTooltip: { open: false },
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
      playButtonDisabledReason: undefined,
      playButtonTooltip: { open: false },
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
      playButtonDisabledReason:
        "Select a preview sound in Preview to enable playback.",
    });
  });

  it("edits an update property initial value independently from keyframe starts", () => {
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
        {
          type: "slot",
          label: "Value source",
          slot: "property-value-source",
        },
      ],
      selectedPropertyEditor: {
        hasInitialValue: false,
        initialValue: 100,
        valueSource: "default",
        valueSourceOptions: [
          { label: "Default", value: "default" },
          { label: "Fixed", value: "fixed" },
        ],
      },
    });

    setSelectedKeyframe(
      { state },
      { side: "update", property: "volume", index: 0 },
    );
    setSelectedKeyframeStartValue({ state }, { startValue: 65 });
    expect(state.definition.tween.volume.keyframes[0].startValue).toBe(65);
    setSelectedProperty({ state }, { side: "update", property: "volume" });
    expect(
      selectViewData({ state, i18n: EN_I18N }).updateTimelineProperties.volume
        .initialValue,
    ).toBeUndefined();
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedPropertyDetailFields: [
        { label: "Timeline", value: "Update" },
        { label: "Property", value: "Volume" },
        {
          type: "slot",
          label: "Value source",
          slot: "property-value-source",
        },
      ],
      selectedPropertyEditor: {
        hasInitialValue: false,
        initialValue: 100,
        valueSource: "default",
      },
    });

    setSelectedPropertyValueSource({ state }, { valueSource: "fixed" });
    expect(state.definition.tween.volume.initialValue).toBe(100);
    expect(state.definition.tween.volume.keyframes[0].startValue).toBe(65);
    setSelectedPropertyInitialValue({ state }, { initialValue: 90 });
    expect(state.definition.tween.volume.initialValue).toBe(90);
    expect(state.definition.tween.volume.keyframes[0].startValue).toBe(65);
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedPropertyDetailFields: expect.arrayContaining([
        {
          type: "slot",
          label: "Initial value",
          slot: "property-initial-value",
        },
      ]),
      selectedPropertyEditor: {
        hasInitialValue: true,
        initialValue: 90,
        initialValueSlider: { min: 0, max: 100, step: 1 },
        valueSource: "fixed",
      },
      updateTimelineProperties: {
        volume: { initialValue: 90 },
      },
    });
    setSelectedPropertyValueSource({ state }, { valueSource: "default" });
    expect(state.definition.tween.volume.initialValue).toBeUndefined();
    expect(state.definition.tween.volume.keyframes[0].startValue).toBe(65);
    expect(state.dirty).toBe(true);
  });

  it("edits transition initial values independently from keyframe starts", () => {
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
              volume: {
                keyframes: [{ value: 0, duration: 500, easing: "linear" }],
              },
            },
            next: {
              volume: {
                keyframes: [{ value: 100, duration: 500, easing: "linear" }],
              },
            },
          },
        },
      },
    );

    setSelectedProperty({ state }, { side: "prev", property: "volume" });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      detailsPanelTitle: "Property",
      selectedPropertyDetailId: "prev:volume",
      selectedPropertyDetailFields: expect.arrayContaining([
        {
          type: "slot",
          label: "Value source",
          slot: "property-value-source",
        },
      ]),
      selectedPropertyEditor: {
        hasInitialValue: false,
        initialValue: 100,
        valueSource: "default",
      },
      canRemoveSelectedProperty: true,
    });

    setSelectedKeyframe(
      { state },
      { side: "prev", property: "volume", index: 0 },
    );
    setSelectedKeyframeStartValue({ state }, { startValue: 90 });
    expect(state.definition.prev.volume.keyframes[0].startValue).toBe(90);
    setSelectedProperty({ state }, { side: "prev", property: "volume" });
    expect(
      selectViewData({ state, i18n: EN_I18N }).previousTimelineProperties.volume
        .initialValue,
    ).toBeUndefined();
    setSelectedPropertyValueSource({ state }, { valueSource: "fixed" });
    expect(state.definition.prev.volume.initialValue).toBe(100);
    setSelectedPropertyInitialValue({ state }, { initialValue: 80 });
    expect(state.definition.prev.volume.initialValue).toBe(80);
    expect(state.definition.prev.volume.keyframes[0].startValue).toBe(90);
    expect(
      selectViewData({ state, i18n: EN_I18N }).previousTimelineProperties.volume
        .initialValue,
    ).toBe(80);

    setSelectedProperty({ state }, { side: "next", property: "volume" });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedPropertyDetailId: "next:volume",
      selectedPropertyDetailFields: expect.arrayContaining([
        {
          type: "slot",
          label: "Value source",
          slot: "property-value-source",
        },
      ]),
      selectedPropertyEditor: {
        hasInitialValue: false,
        initialValue: 100,
        valueSource: "default",
      },
    });
    setSelectedPropertyValueSource({ state }, { valueSource: "fixed" });
    expect(state.definition.next.volume.initialValue).toBe(100);
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
            next: {
              volume: {
                initialValue: 0,
                keyframes: [{ value: 100, duration: 900, easing: "linear" }],
              },
            },
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

    addAudioEffectProperty({ state }, { property: "pan" });
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

    removeAudioEffectProperty({ state }, { property: "volume" });
    removeAudioEffectProperty({ state }, { property: "pan" });
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
      ]),
      selectedKeyframeEditor: {
        delay: 0,
        duration: 100,
        easing: "linear",
        hasStartValue: false,
        value: 1.25,
        valueEditable: true,
      },
      selectedKeyframeAddMenuItems: [
        { label: "Start value", type: "item", value: "start-value" },
      ],
      selectedKeyframeCanOpenEditDialog: true,
    });
    expect(
      selectViewData({ state, i18n: EN_I18N }).selectedKeyframeDetailFields,
    ).not.toContainEqual(expect.objectContaining({ label: "Start value" }));
    expect(selectDefaultSelectedKeyframeStartValue({ state })).toBe(1);
    expect(
      selectViewData({ state, i18n: EN_I18N }).updateTimelineProperties
        .playbackRate.initialValue,
    ).toBeUndefined();

    setSelectedKeyframeStartValue({ state }, { startValue: 0.8 });
    const viewDataWithStartValue = selectViewData({ state, i18n: EN_I18N });
    expect(viewDataWithStartValue).toMatchObject({
      selectedKeyframeDetailFields: expect.arrayContaining([
        { type: "slot", slot: "keyframe-start-value" },
      ]),
      selectedKeyframeEditor: {
        hasStartValue: true,
        startValue: 0.8,
        startValueLabel: "Start value",
      },
      selectedKeyframeAddMenuItems: [],
    });
    expect(
      viewDataWithStartValue.updateTimelineProperties.playbackRate.initialValue,
    ).toBeUndefined();
    setSelectedKeyframeStartValue({ state }, { startValue: undefined });
    expect(
      state.definition.tween.playbackRate.keyframes[0].startValue,
    ).toBeUndefined();

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

  it("adds and removes all supported properties on either transition side", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "transition-properties",
          name: "Transition Properties",
          audioEffect: {
            type: "transition",
            prev: {
              volume: {
                keyframes: [{ value: 0, duration: 300, easing: "linear" }],
              },
            },
          },
        },
      },
    );

    addAudioEffectProperty({ state }, { side: "prev", property: "pan" });
    addAudioEffectProperty(
      { state },
      { side: "next", property: "playbackRate" },
    );

    expect(state.definition.prev.pan).toEqual({
      keyframes: [{ value: 0, duration: 300, easing: "easeInOutSine" }],
    });
    expect(state.definition.next.playbackRate).toEqual({
      keyframes: [{ value: 1, duration: 300, easing: "easeInOutSine" }],
    });

    removeAudioEffectProperty({ state }, { side: "prev", property: "volume" });
    removeAudioEffectProperty({ state }, { side: "prev", property: "pan" });
    expect(state.definition.prev).toBeUndefined();
    expect(Object.keys(state.definition.next)).toEqual(["playbackRate"]);
  });

  it("offers transition sides from one add-property menu", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "transition-properties",
          name: "Transition Properties",
          audioEffect: {
            type: "transition",
            prev: {
              volume: {
                keyframes: [{ value: 0, duration: 300, easing: "linear" }],
              },
            },
          },
        },
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      canAddTransitionProperty: true,
      addPropertySideMenuItems: [
        { label: "Outgoing", type: "item", value: "prev" },
        { label: "Incoming", type: "item", value: "next" },
      ],
    });

    addAudioEffectProperty({ state }, { side: "prev", property: "pan" });
    addAudioEffectProperty(
      { state },
      { side: "prev", property: "playbackRate" },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      canAddTransitionProperty: true,
      addPropertySideMenuItems: [
        { label: "Incoming", type: "item", value: "next" },
      ],
    });
  });

  it("keeps relative start-value deltas outside absolute slider bounds", () => {
    const state = createInitialState();
    loadAudioEffect(
      { state },
      {
        item: {
          id: "relative-volume",
          name: "Relative Volume",
          audioEffect: {
            type: "update",
            tween: {
              volume: {
                keyframes: [
                  {
                    startValue: -25,
                    value: 20,
                    relative: true,
                    duration: 100,
                    easing: "linear",
                  },
                  { value: 100, duration: 100, easing: "linear" },
                ],
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

    const editor = selectViewData({
      state,
      i18n: EN_I18N,
    }).selectedKeyframeEditor;

    expect(editor).toMatchObject({
      relative: true,
      startValue: -25,
      valueSlider: { min: 0, max: 100, step: 1 },
    });
    expect(editor).toHaveProperty("startValueSlider", undefined);

    setSelectedKeyframeStartValue({ state }, { startValue: -40 });
    expect(state.definition.tween.volume.keyframes[0].startValue).toBe(-40);
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
            prev: {
              volume: {
                initialValue: 80,
                keyframes: [
                  { delay: 10, duration: 600, easing: "linear", value: 0 },
                ],
              },
            },
            next: {
              volume: {
                initialValue: 20,
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
          },
        },
      },
    );

    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      isTransition: true,
      timelineDuration: 1000,
      timelineUsedDuration: 920,
      previousTimelineProperties: {
        volume: {
          initialValue: 80,
          keyframes: [{ delay: 10, duration: 600, easing: "linear", value: 0 }],
        },
      },
      nextTimelineProperties: {
        volume: {
          initialValue: 20,
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
      { side: "next", property: "volume", index: 0 },
    );
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeDetailId: "next:volume:0",
      selectedKeyframeDetailFields: expect.arrayContaining([
        expect.objectContaining({ label: "Timeline", value: "Incoming" }),
        expect.objectContaining({
          label: "Property",
          value: "Volume",
        }),
      ]),
      selectedKeyframeEditor: {
        delay: 20,
        duration: 900,
        easing: "easeInOutSine",
        valueDisabled: false,
        valueEditable: true,
      },
      selectedKeyframeCanOpenEditDialog: true,
    });
    setSelectedKeyframeDuration({ state }, { duration: 950 });
    expect(state.definition.next.volume.keyframes[0].duration).toBe(950);
    markSaved({ state });

    updateKeyframeTiming(
      { state },
      {
        side: "prev",
        property: "volume",
        index: 0,
        delay: 25,
        duration: 700,
      },
    );
    expect(state.definition.prev.volume).toEqual({
      initialValue: 80,
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

  it("inserts and edits every transition volume keyframe", () => {
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
              volume: {
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
        property: "volume",
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

    expect(state.definition.next.volume.keyframes).toEqual([
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
      property: "volume",
      index: 0,
    });
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeEditor: {
        value: 50,
        valueEditable: true,
      },
    });

    setSelectedKeyframeValue({ state }, { value: 75 });
    expect(state.definition.next.volume.keyframes[0].value).toBe(75);

    setSelectedKeyframe(
      { state },
      { side: "next", property: "volume", index: 1 },
    );
    setSelectedKeyframeValue({ state }, { value: 90 });
    expect(state.definition.next.volume.keyframes[1].value).toBe(90);
    expect(selectViewData({ state, i18n: EN_I18N })).toMatchObject({
      selectedKeyframeEditor: {
        value: 90,
        valueDisabled: false,
        valueEditable: true,
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
              volume: {
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
        property: "volume",
        index: 1,
        keyframe: {
          value: 50,
          delay: 25,
          duration: 300,
          easing: "linear",
        },
      },
    );

    expect(state.definition.prev.volume.keyframes).toEqual([
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
      property: "volume",
      index: 1,
    });
  });

  it("protects the final incoming volume endpoint while allowing its value to change", () => {
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
              volume: {
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
      { side: "next", property: "volume", index: 1 },
    );
    setSelectedKeyframeValue({ state }, { value: 75 });
    removeKeyframe({ state }, { side: "next", property: "volume", index: 1 });
    openKeyframeDialog(
      { state },
      { side: "next", property: "volume", index: 1 },
    );
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

    expect(state.definition.next.volume.keyframes).toEqual([
      { value: 50, duration: 300, easing: "linear" },
      { value: 75, duration: 500, easing: "linear" },
    ]);
  });

  it("appends incoming volume keyframes like other property tracks", () => {
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
              volume: {
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
        property: "volume",
        index: 2,
        keyframe: { value: 75, duration: 200, easing: "linear" },
      },
    );

    expect(state.definition.next.volume.keyframes).toEqual([
      { value: 50, duration: 300, easing: "linear" },
      { value: 100, duration: 600, easing: "easeInOutSine" },
      { value: 75, duration: 200, easing: "linear" },
    ]);
    expect(state.selectedKeyframe).toEqual({
      side: "next",
      property: "volume",
      index: 2,
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
