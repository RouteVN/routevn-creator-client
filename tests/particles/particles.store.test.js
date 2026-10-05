import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setItems,
  setSelectedItemId,
  setTagsData,
} from "../../src/pages/particles/particles.store.js";
import { EN_I18N } from "../support/i18n.js";

const createState = () => {
  const state = createInitialState();
  setTagsData(
    { state },
    {
      tagsData: {
        items: { "tag-1": { id: "tag-1", type: "tag", name: "Weather" } },
        tree: [{ id: "tag-1" }],
      },
    },
  );
  setItems(
    { state },
    {
      data: {
        items: {
          "particle-1": {
            id: "particle-1",
            type: "particle",
            name: "Particle One",
            width: 640,
            height: 360,
            tagIds: ["tag-1"],
            modules: { emission: {}, appearance: {} },
          },
        },
        tree: [{ id: "particle-1" }],
      },
    },
  );
  return state;
};

const menuValues = (items) => items.map((item) => item.value);

describe("particles store", () => {
  it("opens and duplicates particles from the explorer and center menus", () => {
    const viewData = selectViewData({ state: createState(), i18n: EN_I18N });

    expect(menuValues(viewData.itemContextMenuItems)).toEqual([
      "edit-item",
      "rename-item",
      "duplicate-item",
      "delete-item",
    ]);
    expect(viewData.itemContextMenuItems[0].label).toBe("Open");
    expect(menuValues(viewData.centerItemContextMenuItems)).toEqual([
      "edit-item",
      "duplicate-item",
      "delete-item",
    ]);
  });

  it("adds a particle from its name, description, tags and preset", () => {
    const { addForm, editForm } = selectViewData({
      state: createState(),
      i18n: EN_I18N,
    });
    const field = (form, name) =>
      form.fields.find((item) => item.name === name);

    expect(addForm.title).toBe("Add Particle");
    expect(addForm.fields.map((item) => item.name)).toEqual([
      "name",
      "description",
      "tagIds",
      "presetId",
    ]);
    expect(field(addForm, "presetId")).toMatchObject({
      type: "select",
      required: true,
      clearable: false,
      options: [
        { value: "snow", label: "Snow" },
        { value: "rain", label: "Rain" },
        { value: "sparkle", label: "Sparkle" },
      ],
    });
    expect(field(addForm, "tagIds").options).toEqual([
      expect.objectContaining({ value: "tag-1", label: "Weather" }),
    ]);
    expect(editForm.title).toBe("Edit Particle");
    expect(editForm.fields.map((item) => item.name)).toEqual([
      "name",
      "description",
      "tagIds",
    ]);
  });

  it("shows the selected particle's tags in the detail panel", () => {
    const state = createState();
    setSelectedItemId({ state }, { itemId: "particle-1" });

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.selectedItemTagIds).toEqual(["tag-1"]);
    expect(viewData.selectedPreviewAspectRatio).toBe("640 / 360");
    expect(
      viewData.detailFields.map((field) => field.slot ?? field.label),
    ).toEqual([
      "particle-preview",
      undefined,
      "particle-tags",
      "Canvas Size",
      "Emission",
      "Source",
      "Texture Image",
      "Seed",
    ]);
  });
});
