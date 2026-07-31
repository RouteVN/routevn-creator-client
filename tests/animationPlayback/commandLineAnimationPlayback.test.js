import { describe, expect, it, vi } from "vitest";
import {
  canLoopAnimationById,
  createAnimationReference,
} from "../../src/internal/animationPlayback.js";
import {
  createInitialState as createVisualState,
  selectViewData as selectVisualViewData,
  setAnimations as setVisualAnimations,
  setExistingVisuals,
  updateVisualAnimation,
  updateVisualAnimationPlaybackContinuity,
  updateVisualAnimationPlaybackLoop,
  updateVisualAnimationPlaybackSpeed,
} from "../../src/components/commandLineVisual/commandLineVisual.store.js";
import { handleSubmitClick as handleVisualSubmit } from "../../src/components/commandLineVisual/commandLineVisual.handlers.js";
import {
  createInitialState as createCharacterState,
  selectViewData as selectCharacterViewData,
  setAnimations as setCharacterAnimations,
  setExistingCharacters,
  setItems as setCharacterItems,
  updateCharacterAnimation,
  updateCharacterAnimationPlaybackContinuity,
  updateCharacterAnimationPlaybackLoop,
  updateCharacterAnimationPlaybackSpeed,
} from "../../src/components/commandLineCharacters/commandLineCharacters.store.js";
import { handleSubmitClick as handleCharacterSubmit } from "../../src/components/commandLineCharacters/commandLineCharacters.handlers.js";
import {
  createInitialState as createDialogueState,
  selectDialogueBuildState,
  selectViewData as selectDialogueViewData,
  setCharacterSpriteEnabled,
  setSelectedResource,
  setSelectedSpriteIds,
  setSpriteAnimationId,
  setSpriteAnimationMode,
  setSpriteAnimationPlaybackContinuity,
  setSpriteAnimationPlaybackLoop,
  setSpriteAnimationPlaybackSpeed,
  setSpriteCharacterId,
  setSpriteTransformId,
} from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.store.js";
import { handleSubmitClick as handleDialogueSubmit } from "../../src/components/commandLineDialogueBox/commandLineDialogueBox.handlers.js";
import {
  createInitialState as createScreenState,
  selectViewData as selectScreenViewData,
  setFormValues as setScreenFormValues,
} from "../../src/components/commandLineScreen/commandLineScreen.store.js";
import {
  createInitialState as createChoiceState,
  selectViewData as selectChoiceViewData,
  updateEditForm,
} from "../../src/components/commandLineChoices/commandLineChoices.store.js";
import {
  createInitialState as createSectionTransitionState,
  selectViewData as selectSectionTransitionViewData,
  setFormValues as setSectionTransitionFormValues,
} from "../../src/components/commandLineSectionTransition/commandLineSectionTransition.store.js";
import {
  createInitialState as createResetStoryState,
  selectViewData as selectResetStoryViewData,
  setFormValues as setResetStoryFormValues,
} from "../../src/components/commandLineResetStoryAtSection/commandLineResetStoryAtSection.store.js";
import { EN_I18N } from "../support/i18n.js";

const animations = {
  tree: [
    { id: "looping-update" },
    { id: "automatic-update" },
    { id: "fade-transition" },
  ],
  items: {
    "looping-update": {
      id: "looping-update",
      type: "animation",
      name: "Looping Update",
      animation: {
        type: "update",
        tween: {
          x: {
            keyframes: [{ duration: 500, value: 10 }],
          },
        },
      },
    },
    "automatic-update": {
      id: "automatic-update",
      type: "animation",
      name: "Automatic Update",
      animation: {
        type: "update",
        tween: {
          x: {
            auto: { duration: 300 },
          },
        },
      },
    },
    "fade-transition": {
      id: "fade-transition",
      type: "animation",
      name: "Fade Transition",
      animation: {
        type: "transition",
        next: {
          tween: {
            alpha: {
              keyframes: [{ duration: 300, value: 1 }],
            },
          },
        },
      },
    },
  },
};

describe("command line animation playback", () => {
  it("only enables looping for authored update keyframes", () => {
    expect(canLoopAnimationById(animations, "looping-update")).toBe(true);
    expect(canLoopAnimationById(animations, "automatic-update")).toBe(false);
    expect(canLoopAnimationById(animations, "fade-transition")).toBe(false);

    expect(
      createAnimationReference({
        animationId: "fade-transition",
        animations,
        playback: { speed: 2, loop: true, continuity: "persistent" },
      }),
    ).toEqual({
      resourceId: "fade-transition",
      playback: {
        continuity: "persistent",
        speed: 2,
      },
    });
  });

  it("exposes and normalizes playback controls for every visual item", () => {
    const state = createVisualState();
    setVisualAnimations({ state }, { animations });
    setExistingVisuals(
      { state },
      {
        visuals: [
          {
            id: "visual-1",
            animations: { resourceId: "looping-update" },
          },
        ],
      },
    );

    updateVisualAnimationPlaybackSpeed({ state }, { index: 0, speed: "1.5" });
    updateVisualAnimationPlaybackLoop({ state }, { index: 0, loop: true });
    updateVisualAnimationPlaybackContinuity(
      { state },
      { index: 0, continuity: "persistent" },
    );

    let visual = selectVisualViewData({ state, i18n: EN_I18N }).defaultValues
      .visuals[0];
    expect(visual).toMatchObject({
      animationPlaybackSpeed: 1.5,
      animationPlaybackLoop: true,
      animationPlaybackContinuity: "persistent",
      animationCanLoop: true,
      animationLoopDisabled: false,
    });

    updateVisualAnimation(
      { state },
      { index: 0, animationId: "automatic-update" },
    );
    visual = selectVisualViewData({ state, i18n: EN_I18N }).defaultValues
      .visuals[0];
    expect(visual.animationPlaybackLoop).toBe(false);
    expect(visual.animationCanLoop).toBe(false);
    expect(visual.animationLoopDisabled).toBe(true);

    updateVisualAnimation(
      { state },
      { index: 0, animationId: "looping-update" },
    );
    updateVisualAnimationPlaybackLoop({ state }, { index: 0, loop: true });
    const dispatchEvent = vi.fn();
    handleVisualSubmit({
      dispatchEvent,
      store: {
        selectSelectedVisuals: () => state.selectedVisuals,
      },
    });
    expect(
      dispatchEvent.mock.calls[0][0].detail.visual.items[0].animations.playback,
    ).toEqual({ continuity: "persistent", loop: true, speed: 1.5 });
  });

  it("exposes and normalizes playback controls for every character item", () => {
    const state = createCharacterState();
    setCharacterItems(
      { state },
      {
        items: {
          tree: [{ id: "character-1" }],
          items: {
            "character-1": {
              id: "character-1",
              type: "character",
              name: "Character One",
            },
          },
        },
      },
    );
    setCharacterAnimations({ state }, { animations });
    setExistingCharacters(
      { state },
      {
        characters: [
          {
            id: "character-1",
            animations: { resourceId: "looping-update" },
          },
        ],
      },
    );

    updateCharacterAnimationPlaybackSpeed({ state }, { index: 0, speed: 0.5 });
    updateCharacterAnimationPlaybackLoop({ state }, { index: 0, loop: "true" });
    updateCharacterAnimationPlaybackContinuity(
      { state },
      { index: 0, continuity: "persistent" },
    );

    let character = selectCharacterViewData({ state, i18n: EN_I18N })
      .defaultValues.characters[0];
    expect(character).toMatchObject({
      animationPlaybackSpeed: 0.5,
      animationPlaybackLoop: true,
      animationPlaybackContinuity: "persistent",
      animationCanLoop: true,
      animationLoopDisabled: false,
    });

    updateCharacterAnimation(
      { state },
      { index: 0, animationId: "fade-transition" },
    );
    character = selectCharacterViewData({ state, i18n: EN_I18N }).defaultValues
      .characters[0];
    expect(character.animationMode).toBe("transition");
    expect(character.animations.playback).not.toHaveProperty("loop");

    updateCharacterAnimation(
      { state },
      { index: 0, animationId: "looping-update" },
    );
    updateCharacterAnimationPlaybackLoop({ state }, { index: 0, loop: true });
    const dispatchEvent = vi.fn();
    handleCharacterSubmit({
      dispatchEvent,
      store: {
        selectSelectedCharacters: () => state.selectedCharacters,
      },
    });
    expect(
      dispatchEvent.mock.calls[0][0].detail.character.items[0].animations
        .playback,
    ).toEqual({ continuity: "persistent", loop: true, speed: 0.5 });
  });

  it("applies the same controls to dialogue sprites and transition-only screens", () => {
    const dialogueState = createDialogueState();
    const dialogueDeps = {
      state: dialogueState,
      props: { animations },
    };
    setSpriteAnimationMode(dialogueDeps, { mode: "update" });
    setSpriteAnimationId(dialogueDeps, { animationId: "looping-update" });
    setSpriteAnimationPlaybackSpeed(dialogueDeps, { speed: 2 });
    setSpriteAnimationPlaybackLoop(dialogueDeps, { loop: true });
    setSpriteAnimationPlaybackContinuity(dialogueDeps, {
      continuity: "persistent",
    });

    expect(selectDialogueBuildState({ state: dialogueState })).toMatchObject({
      spriteAnimationPlaybackSpeed: 2,
      spriteAnimationPlaybackLoop: true,
      spriteAnimationPlaybackContinuity: "persistent",
    });
    expect(
      selectDialogueViewData({
        state: dialogueState,
        props: { animations, layouts: [], characters: [] },
        i18n: EN_I18N,
      }),
    ).toMatchObject({
      spriteAnimationCanLoop: true,
      spriteAnimationLoopDisabled: false,
      animationPlaybackSpeedLabel: "Playback Speed",
      animationPlaybackLoopLabel: "Loop",
      animationPlaybackContinuityLabel: "Continuity",
    });

    setSelectedResource(dialogueDeps, { resourceId: "dialogue-layout" });
    setSpriteCharacterId(dialogueDeps, { characterId: "character-1" });
    setCharacterSpriteEnabled(dialogueDeps, {
      characterSpriteEnabled: true,
    });
    setSpriteTransformId(dialogueDeps, { transformId: "portrait-left" });
    setSelectedSpriteIds(dialogueDeps, {
      spriteIdsByGroupId: { base: "portrait-image" },
    });
    const dispatchEvent = vi.fn();
    handleDialogueSubmit({
      dispatchEvent,
      props: {
        layouts: [
          {
            id: "dialogue-layout",
            layoutType: "dialogue-adv",
          },
        ],
        characters: [
          {
            id: "character-1",
            type: "character",
            spriteGroups: [{ id: "base", name: "Sprite" }],
          },
        ],
        transforms: {
          tree: [{ id: "portrait-left" }],
          items: {
            "portrait-left": {
              id: "portrait-left",
              type: "transform",
            },
          },
        },
        animations,
        dialogue: {},
      },
      store: {
        selectDialogueBuildState: () =>
          selectDialogueBuildState({ state: dialogueState }),
      },
    });
    expect(
      dispatchEvent.mock.calls[0][0].detail.dialogue.character.sprite.animations
        .playback,
    ).toEqual({ continuity: "persistent", loop: true, speed: 2 });

    const screenState = createScreenState();
    setScreenFormValues(
      { state: screenState },
      {
        values: {
          transitionAnimationId: "fade-transition",
          playbackSpeed: 1.25,
          playbackContinuity: "persistent",
        },
      },
    );
    const screenView = selectScreenViewData({
      state: screenState,
      props: {},
      i18n: EN_I18N,
    });
    expect(screenView.defaultValues).toMatchObject({
      playbackSpeed: 1.25,
      playbackContinuity: "persistent",
    });
    expect(screenView.form.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(["playbackSpeed", "playbackContinuity"]),
    );
    expect(screenView.form.fields.map((field) => field.name)).not.toContain(
      "playbackLoop",
    );
  });

  it("remounts conditional transition forms with initialized playback values", () => {
    const choiceState = createChoiceState();
    const initialChoiceView = selectChoiceViewData({
      state: choiceState,
      props: { layouts: [] },
      i18n: EN_I18N,
    });
    updateEditForm(
      { state: choiceState },
      { field: "actionType", value: "sectionTransition" },
    );
    updateEditForm(
      { state: choiceState },
      { field: "transitionAnimationId", value: "fade-transition" },
    );
    const selectedChoiceView = selectChoiceViewData({
      state: choiceState,
      props: { layouts: [] },
      i18n: EN_I18N,
    });
    expect(selectedChoiceView.choiceFormKey).not.toBe(
      initialChoiceView.choiceFormKey,
    );
    expect(selectedChoiceView.editForm).toMatchObject({
      playbackSpeed: 1,
      playbackContinuity: "render",
    });

    const sectionTransitionState = createSectionTransitionState();
    const initialSectionTransitionView = selectSectionTransitionViewData({
      state: sectionTransitionState,
      props: {},
      i18n: EN_I18N,
    });
    setSectionTransitionFormValues(
      { state: sectionTransitionState },
      { transitionAnimationId: "fade-transition" },
    );
    const selectedSectionTransitionView = selectSectionTransitionViewData({
      state: sectionTransitionState,
      props: {},
      i18n: EN_I18N,
    });
    expect(selectedSectionTransitionView.formKey).not.toBe(
      initialSectionTransitionView.formKey,
    );
    expect(selectedSectionTransitionView.defaultValues).toMatchObject({
      playbackSpeed: 1,
      playbackContinuity: "render",
    });

    const resetStoryState = createResetStoryState();
    const initialResetStoryView = selectResetStoryViewData({
      state: resetStoryState,
      props: {},
      i18n: EN_I18N,
    });
    setResetStoryFormValues(
      { state: resetStoryState },
      { values: { transitionAnimationId: "fade-transition" } },
    );
    const selectedResetStoryView = selectResetStoryViewData({
      state: resetStoryState,
      props: {},
      i18n: EN_I18N,
    });
    expect(selectedResetStoryView.formKey).not.toBe(
      initialResetStoryView.formKey,
    );
    expect(selectedResetStoryView.defaultValues).toMatchObject({
      playbackSpeed: 1,
      playbackContinuity: "render",
    });
  });
});
