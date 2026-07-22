import { describe, expect, it } from "vitest";
import {
  createInitialState,
  setFontsData,
  setEditMode,
  setFontCapabilities,
  selectViewData,
  setFormValuesFromItem,
  setItems,
  setUiConfig,
  updateFormValues,
} from "../../src/pages/textStyles/textStyles.store.js";
import { EN_I18N } from "../support/i18n.js";

describe("textStyles.store", () => {
  it("invalidates cached capabilities when a font file or metadata changes", () => {
    const state = createInitialState();
    setFontsData(
      { state },
      {
        fontsData: {
          tree: [{ id: "font-1" }],
          items: {
            "font-1": {
              id: "font-1",
              type: "font",
              fileId: "file-1",
              minWeight: 400,
              defaultWeight: 400,
              maxWeight: 400,
            },
          },
        },
      },
    );
    setFontCapabilities(
      { state },
      {
        fontId: "font-1",
        capabilities: {
          kind: "static",
          minWeight: 400,
          defaultWeight: 400,
          maxWeight: 400,
        },
      },
    );

    setFontsData(
      { state },
      {
        fontsData: {
          tree: [{ id: "font-1" }],
          items: {
            "font-1": {
              id: "font-1",
              type: "font",
              fileId: "file-2",
              minWeight: 600,
              defaultWeight: 600,
              maxWeight: 600,
            },
          },
        },
      },
    );

    expect(state.fontCapabilitiesById["font-1"]).toBeUndefined();

    setFontCapabilities(
      { state },
      {
        fontId: "font-1",
        capabilities: {
          kind: "static",
          minWeight: 600,
          defaultWeight: 600,
          maxWeight: 600,
        },
      },
    );
    setFontsData(
      { state },
      {
        fontsData: {
          tree: [{ id: "font-1" }],
          items: {
            "font-1": {
              id: "font-1",
              type: "font",
              fileId: "file-2",
              minWeight: 100,
              defaultWeight: 400,
              maxWeight: 900,
            },
          },
        },
      },
    );

    expect(state.fontCapabilitiesById["font-1"]).toBeUndefined();
  });

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

  it("prefills the single font selector from a font id array", () => {
    const state = createInitialState();
    const item = {
      id: "style-1",
      type: "textStyle",
      name: "Dialogue",
      fontId: ["font-1"],
      colorId: "color-1",
      fontSize: 24,
      lineHeight: 1.5,
      fontWeight: "400",
    };

    setFormValuesFromItem({ state }, { item });

    expect(state.currentFormValues.fontId).toBe("font-1");
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

  it("offers only a static font's extracted weight", () => {
    const state = createInitialState();
    updateFormValues({ state }, { formData: { fontId: "font-1" } });
    setFontCapabilities(
      { state },
      {
        fontId: "font-1",
        capabilities: {
          kind: "static",
          defaultWeight: 600,
          minWeight: 600,
          maxWeight: 600,
        },
      },
    );

    const fontWeightField = selectViewData({
      state,
      i18n: EN_I18N,
    }).dialogForm.fields.find((field) => field.name === "fontWeight");

    expect(fontWeightField.options.map((option) => option.value)).toEqual([
      "600",
    ]);
  });

  it("offers standard weights inside a variable font's actual range", () => {
    const state = createInitialState();
    updateFormValues({ state }, { formData: { fontId: "font-1" } });
    setFontCapabilities(
      { state },
      {
        fontId: "font-1",
        capabilities: {
          kind: "variable",
          defaultWeight: 400,
          minWeight: 250,
          maxWeight: 725,
        },
      },
    );

    const fontWeightField = selectViewData({
      state,
      i18n: EN_I18N,
    }).dialogForm.fields.find((field) => field.name === "fontWeight");

    expect(fontWeightField.options.map((option) => option.value)).toEqual([
      "300",
      "400",
      "500",
      "600",
      "700",
    ]);
  });

  it("offers all standard weights when a font's weight is unknown", () => {
    const state = createInitialState();
    updateFormValues({ state }, { formData: { fontId: "font-1" } });
    setFontCapabilities(
      { state },
      {
        fontId: "font-1",
        capabilities: { kind: "unrestricted" },
      },
    );

    const fontWeightField = selectViewData({
      state,
      i18n: EN_I18N,
    }).dialogForm.fields.find((field) => field.name === "fontWeight");

    expect(fontWeightField.options.map((option) => option.value)).toEqual([
      "100",
      "200",
      "300",
      "400",
      "500",
      "600",
      "700",
      "800",
      "900",
    ]);
  });

  it("keeps an existing unsupported weight available while editing", () => {
    const state = createInitialState();
    const item = {
      id: "style-1",
      type: "textStyle",
      name: "Legacy Bold",
      fontId: ["font-1"],
      colorId: "color-1",
      fontSize: 24,
      lineHeight: 1.5,
      fontWeight: "700",
    };
    setItems(
      { state },
      {
        textStylesData: {
          items: { "style-1": item },
          tree: [{ id: "style-1" }],
        },
      },
    );
    setFormValuesFromItem({ state }, { item });
    setEditMode({ state }, { itemId: "style-1" });
    setFontCapabilities(
      { state },
      {
        fontId: "font-1",
        capabilities: {
          kind: "static",
          defaultWeight: 400,
          minWeight: 400,
          maxWeight: 400,
        },
      },
    );

    const fontWeightField = selectViewData({
      state,
      i18n: EN_I18N,
    }).dialogForm.fields.find((field) => field.name === "fontWeight");

    expect(fontWeightField.options.map((option) => option.value)).toEqual([
      "400",
      "700",
    ]);
  });
});
