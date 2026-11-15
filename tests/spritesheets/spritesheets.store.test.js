import { describe, expect, it } from "vitest";
import { EN_I18N, RU_I18N } from "../support/i18n.js";
import {
  createInitialState,
  openCreateDialog,
  openEditDialog,
  selectViewData,
  setDialogValues,
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

  it("pauses the detail preview while the edit dialog is open", () => {
    const state = createInitialState();

    expect(selectViewData({ state, i18n: EN_I18N }).detailPreviewPaused).toBe(
      false,
    );

    openEditDialog({ state }, { itemId: "spritesheet-1" });

    const viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.detailPreviewPaused).toBe(true);
    expect(viewData.isEditDialogOpen).toBe(true);
    expect(viewData.isAddDialogOpen).toBe(false);
  });

  it("adds a spritesheet empty by default, or from its PNG and JSON files", () => {
    const state = createInitialState();

    openCreateDialog({ state }, { values: { name: "" } });

    let viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.isAddDialogOpen).toBe(true);
    expect(viewData.isEditDialogOpen).toBe(false);
    expect(viewData.dialogValues.source).toBe("empty");
    expect(viewData.addForm.title).toBe("Add Spritesheet");
    expect(
      viewData.addForm.fields.map((field) => field.name ?? field.slot),
    ).toEqual(["name", "description", "tagIds", "source", "spritesheet-files"]);
    expect(viewData.addForm.fields[3].options).toEqual([
      { value: "empty", label: "Empty" },
      { value: "file", label: "From Spritesheet Files" },
    ]);
    // The file pickers show only for a spritesheet made from its files.
    expect(viewData.addForm.fields[4].$when).toBeUndefined();
    expect(viewData.createFileLabels).toMatchObject({
      show: false,
      pngFileName: "",
      jsonFileName: "",
      noFileSelected: "No file selected",
    });

    setDialogValues({ state }, { values: { source: "file" } });
    state.dialogSourceFiles = {
      // A sheet split over two images shows both picked files.
      pngFiles: [{ name: "walk-0.png" }, { name: "walk-1.png" }],
      pngFile: { name: "walk.png" },
      atlasFile: { name: "walk.json" },
    };

    viewData = selectViewData({ state, i18n: EN_I18N });
    expect(viewData.createFileLabels).toMatchObject({
      show: true,
      pngFileLabel: "PNG File",
      jsonFileLabel: "JSON File",
      pngFileName: "walk-0.png, walk-1.png",
      jsonFileName: "walk.json",
    });
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
