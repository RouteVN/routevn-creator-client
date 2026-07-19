import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setFormValuesFromItem,
  setItems,
  setUiConfig,
  updateFormValues,
} from "../../src/pages/textStyles/textStyles.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("textStyles.store", () => {
  it("marks groups that contain child folders", () => {
    const state = createInitialState();

    setItems(
      { state },
      {
        textStylesData: {
          items: {
            parentFolder: {
              id: "parentFolder",
              type: "folder",
              name: "Parent",
            },
            childFolder: {
              id: "childFolder",
              type: "folder",
              name: "Child",
            },
          },
          tree: [
            {
              id: "parentFolder",
              children: [{ id: "childFolder" }],
            },
          ],
        },
      },
    );

    const viewData = selectViewData({ state, i18n: EN_I18N });
    const parentGroup = viewData.flatGroups.find(
      (group) => group.id === "parentFolder",
    );
    const childGroup = viewData.flatGroups.find(
      (group) => group.id === "childFolder",
    );

    expect(parentGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: true,
      }),
    );
    expect(childGroup).toEqual(
      expect.objectContaining({
        hasChildren: false,
        hasChildFolders: false,
      }),
    );
  });

  it("exposes edit actions for text style item surfaces", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.editButton).toBe("Edit");
    expect(viewData.centerItemContextMenuItems[0]).toEqual({
      label: "Edit",
      type: "item",
      value: "edit-item",
    });
  });

  it("hides the text style dialog preview canvas in touch mode", () => {
    const state = createInitialState();

    expect(
      selectViewData({ state, i18n: EN_I18N }).showDialogPreviewCanvas,
    ).toBe(true);

    setUiConfig(
      { state },
      {
        uiConfig: {
          id: "touch",
          inputMode: "touch",
        },
      },
    );

    expect(
      selectViewData({ state, i18n: EN_I18N }).showDialogPreviewCanvas,
    ).toBe(false);
  });

  it("prefills the font and shadow settings", () => {
    const state = createInitialState();
    expect(
      selectViewData({ state, i18n: EN_I18N }).dialogForm.fields.map(
        (field) => field.name,
      ),
    ).not.toContain("shadowAlpha");

    const item = {
      id: "style-1",
      type: "textStyle",
      name: "Dialogue",
      fontId: "font-1",
      colorId: "color-1",
      fontSize: 24,
      lineHeight: 1.5,
      fontWeight: "400",
      shadow: {
        colorId: "shadow-1",
        alpha: 0.75,
        blur: 6,
        offsetX: -2,
        offsetY: 3,
      },
    };

    setFormValuesFromItem({ state }, { item });

    expect(state.currentFormValues).toMatchObject({
      fontId: "font-1",
      shadowColor: "shadow-1",
      shadowAlpha: 0.75,
      shadowBlur: 6,
      shadowOffsetX: -2,
      shadowOffsetY: 3,
    });

    const fieldNames = selectViewData({
      state,
      i18n: EN_I18N,
    }).dialogForm.fields.map((field) => field.name);
    expect(fieldNames).toEqual(
      expect.arrayContaining(["fontId", "shadowColor", "shadowAlpha"]),
    );
    expect(fieldNames).not.toContain("fontStyle");
  });

  it("shows outline thickness only while an outline color is selected", () => {
    const state = createInitialState();
    const selectFieldNames = () =>
      selectViewData({ state, i18n: EN_I18N }).dialogForm.fields.map(
        (field) => field.name,
      );

    expect(selectFieldNames()).not.toContain("strokeWidth");

    updateFormValues({ state }, { formData: { strokeColor: "outline-1" } });
    expect(selectFieldNames()).toContain("strokeWidth");

    updateFormValues({ state }, { formData: { strokeColor: "" } });
    expect(selectFieldNames()).not.toContain("strokeWidth");
  });

  it("exposes a fields-only desktop dialog form with a separate submit action", () => {
    const state = createInitialState();

    const viewData = selectViewData({ state, i18n: EN_I18N });

    expect(viewData.desktopDialogForm.fields).toBe(viewData.dialogForm.fields);
    expect(viewData.desktopDialogForm.actions.buttons).toEqual([]);
    expect(viewData.dialogSubmitButton).toMatchObject({
      id: "submit",
      variant: "pr",
      label: "Add Text Style",
    });
    expect(viewData.dialogForm.actions.buttons).toEqual([
      viewData.dialogSubmitButton,
    ]);
  });
});
