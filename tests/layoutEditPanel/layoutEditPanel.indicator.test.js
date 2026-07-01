import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  closeTextRevealIndicatorDialog,
  closeImageSelectorDialog,
  closeSpritesheetSelectorDialog,
  createInitialState,
  hideContextMenu,
  openTextRevealIndicatorDialog,
  openImageSelectorDialog,
  openSpritesheetSelectorDialog,
  selectImageItemById,
  selectImageSelectorDialog,
  selectSpritesheetItemById,
  selectSpritesheetSelectorDialog,
  selectDropdownMenu,
  selectTempSelectedImageId,
  selectTempSelectedSpritesheetValue,
  selectViewData,
  setImagesData,
  setSpritesheetsData,
  setTempSelectedImageId,
  setTempSelectedSpritesheetValue,
  setTextRevealIndicatorDialogImage,
  setTextRevealIndicatorDialogSpritesheet,
  setTextRevealIndicatorDialogValidationErrors,
  setValues,
  showContextMenu,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleContextMenuClickItem,
  handleImageSelectorImageSelected,
  handleImageSelectorSubmit,
  handleListBarItemClick,
  handleSectionActionClick,
  handleSpritesheetSelectorAnimationSelected,
  handleSpritesheetSelectorSubmit,
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
  selectSpritesheetItemById: (payload) =>
    selectSpritesheetItemById({ state }, payload),
  openImageSelectorDialog: (payload) =>
    openImageSelectorDialog({ state }, payload),
  closeImageSelectorDialog: (payload) =>
    closeImageSelectorDialog({ state }, payload),
  selectImageSelectorDialog: () => selectImageSelectorDialog({ state }),
  openSpritesheetSelectorDialog: (payload) =>
    openSpritesheetSelectorDialog({ state }, payload),
  closeSpritesheetSelectorDialog: (payload) =>
    closeSpritesheetSelectorDialog({ state }, payload),
  selectSpritesheetSelectorDialog: () =>
    selectSpritesheetSelectorDialog({ state }),
  showContextMenu: (payload) => showContextMenu({ state }, payload),
  hideContextMenu: (payload) => hideContextMenu({ state }, payload),
  selectDropdownMenu: () => selectDropdownMenu({ state }),
  setTempSelectedImageId: (payload) =>
    setTempSelectedImageId({ state }, payload),
  selectTempSelectedImageId: () => selectTempSelectedImageId({ state }),
  setTempSelectedSpritesheetValue: (payload) =>
    setTempSelectedSpritesheetValue({ state }, payload),
  selectTempSelectedSpritesheetValue: () =>
    selectTempSelectedSpritesheetValue({ state }),
  setTextRevealIndicatorDialogImage: (payload) =>
    setTextRevealIndicatorDialogImage({ state }, payload),
  setTextRevealIndicatorDialogSpritesheet: (payload) =>
    setTextRevealIndicatorDialogSpritesheet({ state }, payload),
  setTextRevealIndicatorDialogValidationErrors: (payload) =>
    setTextRevealIndicatorDialogValidationErrors({ state }, payload),
});

const createDeps = (state) => ({
  store: createStoreApi(state),
  appService: {
    showDropdownMenu: vi.fn(),
  },
  props: createProps(),
  refs: {
    textRevealIndicatorForm: {
      getValues: vi.fn(),
      setValues: vi.fn(),
    },
  },
  render: vi.fn(),
  dispatchEvent: vi.fn(),
});

const createIndicatorImageFieldClickPayload = () => ({
  _event: {
    currentTarget: {
      getBoundingClientRect: () => ({
        left: 12,
        bottom: 34,
      }),
    },
  },
});

const createSpritesheetsData = () => ({
  items: {
    "folder-spritesheets": {
      id: "folder-spritesheets",
      type: "folder",
      name: "Spritesheets",
    },
    "sheet-indicator": {
      id: "sheet-indicator",
      type: "spritesheet",
      name: "Indicator Sheet",
      fileId: "file-sheet",
      thumbnailFileId: "thumb-sheet",
      jsonData: {
        frames: {
          "blink-0": {
            frame: {
              x: 0,
              y: 0,
              w: 18,
              h: 20,
            },
            sourceSize: {
              w: 18,
              h: 20,
            },
          },
        },
      },
      animations: {
        blink: {
          frames: [0],
          fps: 12,
          loop: true,
        },
      },
    },
  },
  tree: [
    {
      id: "folder-spritesheets",
      children: [{ id: "sheet-indicator", children: [] }],
    },
  ],
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
        kind: "image",
        imageId: "",
        resourceId: "",
        animationName: "",
        width: 12,
        height: 12,
        offsetX: 16,
        offsetY: 0,
      },
      complete: {
        kind: "image",
        imageId: "",
        resourceId: "",
        animationName: "",
        width: 12,
        height: 12,
        offsetX: 16,
        offsetY: 0,
      },
    });
  });

  it("renders the indicator panel section for text revealing elements", () => {
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

    expect(indicatorSection?.label).toBe("Indicator");
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
          revealSoundId: "sound-reveal",
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
      kind: "image",
      imageId: "image-revealing",
      resourceId: "",
      animationName: "",
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
      label: "Visual",
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
        items: [
          { type: "item", label: "Complete", key: "complete" },
          { type: "item", label: "Sound", key: "revealSoundId" },
        ],
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
          revealSoundId: "sound-reveal",
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

  it("opens a visual source dropdown from the indicator image field", () => {
    const state = createInitialState();
    const deps = createDeps(state);
    openTextRevealIndicatorDialog(
      { state },
      {
        stateName: "revealing",
      },
    );

    handleTextRevealIndicatorImageFieldClick(
      deps,
      createIndicatorImageFieldClickPayload(),
    );

    expect(state.imageSelectorDialog.open).toBe(false);
    expect(state.dropdownMenu).toMatchObject({
      isOpen: true,
      targetName: "textRevealIndicatorVisualSource",
      x: 12,
      y: 34,
      items: [
        { label: "Image", type: "item", value: "image" },
        {
          label: "Spritesheet",
          type: "item",
          value: "spritesheet",
        },
      ],
    });
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

    handleTextRevealIndicatorImageFieldClick(
      deps,
      createIndicatorImageFieldClickPayload(),
    );
    handleContextMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "image",
          },
        },
      },
    });
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

  it("opens a spritesheet selector and saves a spritesheet indicator visual", () => {
    const state = createInitialState();
    const deps = createDeps(state);
    deps.refs.textRevealIndicatorForm.getValues.mockReturnValue({
      width: 12,
      height: 12,
      offsetX: 16,
      offsetY: 0,
    });
    setSpritesheetsData(
      { state },
      {
        spritesheetsData: createSpritesheetsData(),
      },
    );
    openTextRevealIndicatorDialog(
      { state },
      {
        stateName: "revealing",
      },
    );

    handleTextRevealIndicatorImageFieldClick(
      deps,
      createIndicatorImageFieldClickPayload(),
    );
    handleContextMenuClickItem(deps, {
      _event: {
        detail: {
          item: {
            value: "spritesheet",
          },
        },
      },
    });

    expect(state.spritesheetSelectorDialog).toMatchObject({
      open: true,
      source: "textRevealIndicator",
    });

    handleSpritesheetSelectorAnimationSelected(deps, {
      _event: {
        detail: {
          value: "sheet-indicator::blink",
          resourceId: "sheet-indicator",
          animationName: "blink",
        },
      },
    });
    handleSpritesheetSelectorSubmit(deps);

    expect(state.spritesheetSelectorDialog.open).toBe(false);
    expect(state.textRevealIndicatorDialog).toMatchObject({
      kind: "spritesheet",
      imageId: undefined,
      resourceId: "sheet-indicator",
      animationName: "blink",
    });
    expect(deps.refs.textRevealIndicatorForm.setValues).toHaveBeenCalledWith({
      values: {
        kind: "spritesheet",
        imageId: undefined,
        resourceId: "sheet-indicator",
        animationName: "blink",
        width: 18,
        height: 20,
        offsetX: 16,
        offsetY: 0,
      },
    });

    handleTextRevealIndicatorFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            width: "18",
            height: "20",
            offsetX: "16",
            offsetY: "0",
          },
        },
      },
    });

    expect(state.values.indicator.revealing).toEqual({
      kind: "spritesheet",
      resourceId: "sheet-indicator",
      animationName: "blink",
      width: 18,
      height: 20,
      offsetX: 16,
      offsetY: 0,
    });
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "indicator",
      value: {
        revealing: {
          kind: "spritesheet",
          resourceId: "sheet-indicator",
          animationName: "blink",
          width: 18,
          height: 20,
          offsetX: 16,
          offsetY: 0,
        },
      },
    });
  });

  it("hydrates spritesheet indicator rows with preview data", () => {
    const state = createInitialState();
    setSpritesheetsData(
      { state },
      {
        spritesheetsData: createSpritesheetsData(),
      },
    );
    setValues(
      { state },
      {
        values: {
          type: "text-revealing-ref-dialogue-content",
          indicator: {
            revealing: {
              kind: "spritesheet",
              resourceId: "sheet-indicator",
              animationName: "blink",
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

    expect(indicatorSection?.items[0]?.items[0]).toMatchObject({
      kind: "spritesheet",
      resourceId: "sheet-indicator",
      animationName: "blink",
      spritesheetFileId: "file-sheet",
      spritesheetAtlas:
        createSpritesheetsData().items["sheet-indicator"].jsonData,
      spritesheetAnimation:
        createSpritesheetsData().items["sheet-indicator"].animations.blink,
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
      kind: "image",
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
          kind: "image",
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
        kind: "image",
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
      imageId: "Visual is required.",
    });
    expect(deps.dispatchEvent).not.toHaveBeenCalled();
  });
});
