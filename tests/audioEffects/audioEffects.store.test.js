import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
  setSelectedItemId,
} from "../../src/pages/audioEffects/audioEffects.store.js";
import { EN_I18N, JA_I18N, ZH_HANS_I18N } from "../support/i18n.js";

describe("audioEffects.store", () => {
  it("summarizes transition and update definitions in the catalog", () => {
    const state = createInitialState();
    setItems(
      { state },
      {
        data: {
          items: {
            crossfade: {
              id: "crossfade",
              type: "audioEffect",
              name: "Crossfade",
              audioEffect: {
                type: "transition",
                prev: { fade: { duration: 600 } },
                next: { fade: { duration: 900 } },
              },
            },
            smooth: {
              id: "smooth",
              type: "audioEffect",
              name: "Smooth",
              audioEffect: {
                type: "update",
                tween: {
                  volume: { keyframes: [] },
                  playbackRate: { keyframes: [] },
                },
              },
            },
          },
          tree: [{ id: "crossfade" }, { id: "smooth" }],
        },
      },
    );
    setSelectedItemId({ state }, { itemId: "crossfade" });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const catalogItems = viewData.catalogGroups.flatMap(
      (group) => group.children,
    );
    expect(catalogItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "crossfade",
          cardKind: "animation",
          animationType: "transition",
          audioEffectTypeLabel: "Transition",
          transitionTimelineDuration: 900,
          transitionPreviousLabel: "Previous",
          transitionNextLabel: "Next",
          prevProperties: {
            fade: {
              label: "Fade",
              initialValue: 100,
              keyframes: [expect.objectContaining({ duration: 600, value: 0 })],
            },
          },
          nextProperties: {
            fade: {
              label: "Fade",
              initialValue: 0,
              keyframes: [
                expect.objectContaining({ duration: 900, value: 100 }),
              ],
            },
          },
          summary: "Previous: 600ms · Next: 900ms",
        }),
        expect.objectContaining({
          id: "smooth",
          cardKind: "animation",
          animationType: "update",
          audioEffectTypeLabel: "Update",
          updateProperties: {
            volume: expect.objectContaining({ label: "Volume" }),
            playbackRate: expect.objectContaining({ label: "Playback Rate" }),
          },
          summary: "Volume, Playback Rate",
        }),
      ]),
    );
    expect(viewData).toMatchObject({
      selectedAudioEffectTypeLabel: "Transition",
      selectedAudioEffectSummary: "Previous: 600ms · Next: 900ms",
      selectedResourceId: "audioEffects",
      resourceCategory: "animatedAssets",
      openButton: "Open",
    });
    expect(viewData.itemContextMenuItems[0]).toMatchObject({
      label: "Open",
      value: "edit-item",
    });
    expect(viewData.addForm.sticky).toBe(true);
    expect(viewData.addForm.actions).toEqual({
      buttons: [
        {
          id: "submit",
          variant: "pr",
          validate: true,
          label: "Create",
        },
      ],
    });
    expect(viewData.editForm.sticky).toBe(true);
    expect(viewData.editForm.actions).toEqual({
      buttons: [
        {
          id: "submit",
          variant: "pr",
          validate: true,
          label: "Update",
        },
      ],
    });
    expect(viewData).toMatchObject({
      isEditDialogOpen: false,
      editDefaultValues: { name: "", description: "", tagIds: [] },
    });
  });

  it.each([
    [EN_I18N, "Continue", "Create"],
    [JA_I18N, "続ける", "作成"],
    [ZH_HANS_I18N, "继续", "创建"],
  ])(
    "provides the page-specific create labels in every catalog",
    (i18n, animationLabel, audioEffectLabel) => {
      expect(i18n.animationsPage.continueButton).toBe(animationLabel);
      expect(i18n.audioEffectsPage.createButton).toBe(audioEffectLabel);
    },
  );
});
