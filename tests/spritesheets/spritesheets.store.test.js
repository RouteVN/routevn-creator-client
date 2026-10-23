import { describe, expect, it } from "vitest";
import { EN_I18N, RU_I18N } from "../support/i18n.js";
import {
  createInitialState,
  openPreviewDialog,
  selectViewData,
  setItems,
} from "../../src/pages/spritesheets/spritesheets.store.js";

describe("spritesheets store", () => {
  it("marks media groups that contain child folders", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        data: {
          tree: [
            {
              id: "parent-folder",
              children: [{ id: "child-folder" }],
            },
          ],
          items: {
            "parent-folder": {
              id: "parent-folder",
              type: "folder",
              name: "Parent",
            },
            "child-folder": {
              id: "child-folder",
              type: "folder",
              name: "Child",
            },
          },
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.mediaGroups[0]).toEqual(
      expect.objectContaining({
        id: "parent-folder",
        hasChildren: false,
        hasChildFolders: true,
      }),
    );
  });

  it("pauses the detail preview while the preview dialog is open", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N }).detailPreviewPaused).toBe(
      false,
    );

    openPreviewDialog({ state });

    expect(selectViewData({ state, i18n: EN_I18N }).detailPreviewPaused).toBe(
      true,
    );
  });

  it("picks the plural form of each clip's frame count", () => {
    const state = createInitialState();
    const frames = (count) =>
      Array.from({ length: count }, (_, index) => `frame-${index}`);
    state.dialogDraftAnimations = {
      idle: { frames: frames(1), fps: 12 },
      walk: { frames: frames(3), fps: 12 },
      run: { frames: frames(5), fps: 12 },
    };
    const summaries = (i18n) =>
      selectViewData({ state, i18n }).dialogClipOptions.map(
        (clip) => clip.summaryLabel,
      );

    expect(summaries(EN_I18N)).toEqual([
      "1 frame • 12 fps",
      "3 frames • 12 fps",
      "5 frames • 12 fps",
    ]);
    expect(summaries(RU_I18N)).toEqual([
      "1 кадр • 12 FPS",
      "3 кадра • 12 FPS",
      "5 кадров • 12 FPS",
    ]);
  });
});
