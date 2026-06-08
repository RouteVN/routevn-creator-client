import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  closeTextRevealIndicatorDialog,
  closeImageSelectorDialog,
  createInitialState,
  openTextRevealIndicatorDialog,
  openImageSelectorDialog,
  selectImageItemById,
  selectImageSelectorDialog,
  selectTempSelectedImageId,
  selectViewData,
  setImagesData,
  setTempSelectedImageId,
  setTextRevealIndicatorDialogImage,
  setTextRevealIndicatorDialogValidationErrors,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleImageSelectorImageSelected,
  handleImageSelectorSubmit,
  handleListBarItemClick,
  handleSectionActionClick,
  handleTextRevealIndicatorFormAction,
  handleTextRevealIndicatorImageFieldClick,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import { toInspectorValues } from "../../src/components/layoutEditPanel/support/layoutEditPanelViewData.js";

const EMPTY_TREE = { items: {}, tree: [] };
const LAYOUT_EDIT_PANEL_CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

const createProps = () => ({
  itemType: "text-revealing-ref-dialogue-content",
  layoutType: "dialogue-adv",
  resourceType: "layouts",
  layoutsData: EMPTY_TREE,
  charactersData: EMPTY_TREE,
  isInsideSaveLoadSlot: false,
  isInsideDirectedContainer: false,
});

const createStoreApi = (state) => ({
  selectValues: () => state.values,
  updateValueProperty: (payload) => updateValueProperty({ state }, payload),
  openTextRevealIndicatorDialog: (payload) =>
    openTextRevealIndicatorDialog({ state }, payload),
  closeTextRevealIndicatorDialog: (payload) =>
    closeTextRevealIndicatorDialog({ state }, payload),
  selectTextRevealIndicatorDialog: () => state.textRevealIndicatorDialog,
  selectImageItemById: (payload) => selectImageItemById({ state }, payload),
  openImageSelectorDialog: (payload) =>
    openImageSelectorDialog({ state }, payload),
  closeImageSelectorDialog: (payload) =>
    closeImageSelectorDialog({ state }, payload),
  selectImageSelectorDialog: () => selectImageSelectorDialog({ state }),
  setTempSelectedImageId: (payload) =>
    setTempSelectedImageId({ state }, payload),
  selectTempSelectedImageId: () => selectTempSelectedImageId({ state }),
  setTextRevealIndicatorDialogImage: (payload) =>
    setTextRevealIndicatorDialogImage({ state }, payload),
  setTextRevealIndicatorDialogValidationErrors: (payload) =>
    setTextRevealIndicatorDialogValidationErrors({ state }, payload),
});

const createDeps = (state) => ({
  store: createStoreApi(state),
  appService: {
    showDropdownMenu: vi.fn(),
  },
  refs: {
    textRevealIndicatorForm: {
      getValues: vi.fn(),
      setValues: vi.fn(),
    },
  },
  render: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe("layoutEditPanel text reveal indicators", () => {
  it("defaults indicator inspector controls for text revealing elements", () => {
    const values = toInspectorValues({
      values: {
        type: "text-revealing-ref-dialogue-content",
      },
      firstTextStyleId: "",
      hiddenActionModes: new Set(),
    });

    expect(values.indicator).toEqual({
      revealing: {
        imageId: "",
        width: 12,
        height: 12,
        offsetX: 16,
        offsetY: 0,
      },
      complete: {
        imageId: "",
        width: 12,
        height: 12,
        offsetX: 16,
        offsetY: 0,
      },
    });
  });

  it("renders the indication panel section for text revealing elements", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              imageId: "image-revealing",
              width: 18,
              offsetX: 20,
              offsetY: -2,
            },
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps(),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const indicatorSection = viewData.config.sections.find(
      (section) => section.id === "textRevealIndicator",
    );

    expect(indicatorSection?.label).toBe("Indication");
    expect(indicatorSection?.labelAction).toBe("plus");
    expect(indicatorSection?.items[0]?.items).toMatchObject([
      {
        name: "indicator.revealing",
        label: "Revealing",
        imageId: "image-revealing",
      },
    ]);
    expect(indicatorSection?.items[0]?.items).toHaveLength(1);
    expect(indicatorSection?.items).toHaveLength(1);
  });

  it("does not render unset indicator rows", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps(),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const indicatorSection = viewData.config.sections.find(
      (section) => section.id === "textRevealIndicator",
    );

    expect(indicatorSection?.items[0]?.items).toEqual([]);
    expect(indicatorSection?.labelAction).toBe("plus");
  });

  it("hides the indicator add action once both states are set", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              imageId: "image-revealing",
            },
            complete: {
              imageId: "image-complete",
            },
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps(),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const indicatorSection = viewData.config.sections.find(
      (section) => section.id === "textRevealIndicator",
    );

    expect(indicatorSection?.labelAction).toBeUndefined();
  });

  it("opens the indicator dialog with visual defaults and image picker slot", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              imageId: "image-revealing",
              width: 18,
              height: 20,
              offsetX: 24,
              offsetY: -5,
            },
          },
        },
      },
    );
    setImagesData(
      { state },
      {
        imagesData: {
          items: {
            "folder-images": {
              id: "folder-images",
              type: "folder",
              name: "Images",
            },
            "image-revealing": {
              id: "image-revealing",
              type: "image",
              name: "Revealing",
              fileId: "file-revealing",
            },
          },
          tree: [
            {
              id: "folder-images",
              children: [{ id: "image-revealing", children: [] }],
            },
          ],
        },
      },
    );

    openTextRevealIndicatorDialog(
      { state },
      {
        stateName: "revealing",
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps(),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });

    expect(viewData.textRevealIndicatorDialogDefaults).toEqual({
      imageId: "image-revealing",
      width: 18,
      height: 20,
      offsetX: 24,
      offsetY: -5,
    });
    expect(viewData.textRevealIndicatorDialog.imageId).toBe("image-revealing");
    expect(viewData.textRevealIndicatorDialogForm.title).toBe(
      "Revealing Indicator",
    );
    expect(viewData.textRevealIndicatorDialogForm.fields[0]).toMatchObject({
      type: "slot",
      slot: "text-reveal-indicator-image",
      label: "Image",
    });
    expect(
      viewData.textRevealIndicatorDialogForm.fields
        .slice(1)
        .map((field) => field.name),
    ).toEqual(["width", "height", "offsetX", "offsetY"]);
  });

  it("opens the indicator dialog from the section action and list item", async () => {
    const state = createInitialState();
    const deps = createDeps(state);
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              imageId: "image-revealing",
            },
          },
        },
      },
    );

    deps.appService.showDropdownMenu.mockResolvedValueOnce({
      item: { key: "complete" },
    });

    await handleSectionActionClick(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            id: "textRevealIndicator",
          },
        },
      },
    });

    expect(deps.appService.showDropdownMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [{ type: "item", label: "Complete", key: "complete" }],
      }),
    );
    expect(state.textRevealIndicatorDialog).toMatchObject({
      open: true,
      stateName: "complete",
    });

    closeTextRevealIndicatorDialog({ state });
    handleListBarItemClick(deps, {
      _event: {
        currentTarget: {
          dataset: {
            name: "indicator.revealing",
          },
        },
      },
    });

    expect(state.textRevealIndicatorDialog).toMatchObject({
      open: true,
      stateName: "revealing",
    });
  });

  it("does not open the indicator add dropdown when both states are set", async () => {
    const state = createInitialState();
    const deps = createDeps(state);
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              imageId: "image-revealing",
            },
            complete: {
              imageId: "image-complete",
            },
          },
        },
      },
    );

    await handleSectionActionClick(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            id: "textRevealIndicator",
          },
        },
      },
    });

    expect(deps.appService.showDropdownMenu).not.toHaveBeenCalled();
    expect(state.textRevealIndicatorDialog.open).toBe(false);
  });

  it("autofills dimensions from the selected indicator image", () => {
    const state = createInitialState();
    const deps = createDeps(state);
    deps.refs.textRevealIndicatorForm.getValues.mockReturnValue({
      width: 12,
      height: 12,
      offsetX: 16,
      offsetY: 0,
    });
    setImagesData(
      { state },
      {
        imagesData: {
          items: {
            "image-revealing": {
              id: "image-revealing",
              type: "image",
              name: "Revealing",
              fileId: "file-revealing",
              width: 48,
              height: 32,
            },
          },
          tree: [{ id: "image-revealing", children: [] }],
        },
      },
    );
    openTextRevealIndicatorDialog(
      { state },
      {
        stateName: "revealing",
      },
    );

    handleTextRevealIndicatorImageFieldClick(deps);
    expect(state.imageSelectorDialog).toMatchObject({
      open: true,
      source: "textRevealIndicator",
    });

    handleImageSelectorImageSelected(deps, {
      _event: {
        detail: {
          imageId: "image-revealing",
        },
      },
    });
    handleImageSelectorSubmit(deps);

    expect(state.imageSelectorDialog.open).toBe(false);
    expect(state.textRevealIndicatorDialog.imageId).toBe("image-revealing");
    expect(deps.refs.textRevealIndicatorForm.setValues).toHaveBeenCalledWith({
      values: {
        imageId: "image-revealing",
        width: 48,
        height: 32,
        offsetX: 16,
        offsetY: 0,
      },
    });
  });

  it("submits a complete indicator visual block", () => {
    const state = createInitialState();
    const deps = createDeps(state);
    openTextRevealIndicatorDialog(
      { state },
      {
        stateName: "complete",
      },
    );
    setTextRevealIndicatorDialogImage(
      { state },
      {
        imageId: "image-complete",
      },
    );

    handleTextRevealIndicatorFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            width: "24",
            height: "28",
            offsetX: "31",
            offsetY: "-8",
          },
        },
      },
    });

    expect(state.textRevealIndicatorDialog.open).toBe(false);
    expect(state.values.indicator.complete).toEqual({
      imageId: "image-complete",
      width: 24,
      height: 28,
      offsetX: 31,
      offsetY: -8,
    });
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "indicator",
      value: {
        complete: {
          imageId: "image-complete",
          width: 24,
          height: 28,
          offsetX: 31,
          offsetY: -8,
        },
      },
    });
  });

  it("preserves the other indicator visual when saving one state", () => {
    const state = createInitialState();
    const deps = createDeps(state);
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              imageId: "image-revealing",
              width: 16,
              height: 16,
              offsetX: 8,
              offsetY: 1,
            },
          },
        },
      },
    );
    openTextRevealIndicatorDialog(
      { state },
      {
        stateName: "complete",
      },
    );
    setTextRevealIndicatorDialogImage(
      { state },
      {
        imageId: "image-complete",
      },
    );

    handleTextRevealIndicatorFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            width: "24",
            height: "28",
            offsetX: "31",
            offsetY: "-8",
          },
        },
      },
    });

    expect(state.values.indicator).toEqual({
      revealing: {
        imageId: "image-revealing",
        width: 16,
        height: 16,
        offsetX: 8,
        offsetY: 1,
      },
      complete: {
        imageId: "image-complete",
        width: 24,
        height: 28,
        offsetX: 31,
        offsetY: -8,
      },
    });
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "indicator",
      value: state.values.indicator,
    });
  });

  it("requires an image before saving an indicator visual", () => {
    const state = createInitialState();
    const deps = createDeps(state);
    openTextRevealIndicatorDialog(
      { state },
      {
        stateName: "revealing",
      },
    );

    handleTextRevealIndicatorFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            width: "24",
            height: "28",
            offsetX: "31",
            offsetY: "-8",
          },
        },
      },
    });

    expect(state.textRevealIndicatorDialog.open).toBe(true);
    expect(state.textRevealIndicatorDialog.validationErrors).toEqual({
      imageId: "Image is required.",
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });
});
