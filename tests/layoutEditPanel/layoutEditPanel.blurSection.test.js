import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  closeSpriteBlurDialog,
  createInitialState,
  openSpriteBlurDialog,
  selectViewData,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import {
  handleBlurItemClick,
  handleBlurItemRightClick,
  handleSectionActionClick,
  handleSpriteBlurFormAction,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

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

const createProps = (itemType = "sprite") => ({
  itemType,
  layoutType: "general",
  resourceType: "layouts",
  layoutsData: EMPTY_TREE,
  charactersData: EMPTY_TREE,
  isInsideSaveLoadSlot: false,
  isInsideDirectedContainer: false,
});

const createStoreApi = (state) => ({
  selectValues: () => state.values,
  updateValueProperty: (payload) => updateValueProperty({ state }, payload),
  openSpriteBlurDialog: (payload) => openSpriteBlurDialog({ state }, payload),
  closeSpriteBlurDialog: (payload) => closeSpriteBlurDialog({ state }, payload),
});

const createDeps = (state) => ({
  state,
  store: createStoreApi(state),
  appService: {
    showDropdownMenu: vi.fn(),
  },
  refs: {},
  props: createProps(),
  render: vi.fn(),
  dispatchEvent: vi.fn(),
});

describe("layoutEditPanel sprite blur section", () => {
  it("shows a sprite-only blur section with an add action", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "sprite",
          name: "Sprite",
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps("sprite"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const blurSection = viewData.config.sections.find(
      (section) => section.id === "blur",
    );

    expect(blurSection).toMatchObject({
      id: "blur",
      label: "Blur",
      labelAction: "plus",
      items: [],
    });

    const saveLoadSpriteViewData = selectViewData({
      state,
      props: createProps("sprite-ref-save-load-slot-image"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });

    expect(
      saveLoadSpriteViewData.config.sections.some(
        (section) => section.id === "blur",
      ),
    ).toBe(false);
  });

  it("shows the existing blur item and dialog defaults", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          type: "sprite",
          name: "Sprite",
          blur: {
            x: 8,
            y: 10,
            quality: 4,
            kernelSize: 11,
            repeatEdgePixels: false,
          },
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: createProps("sprite"),
      constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    });
    const blurSection = viewData.config.sections.find(
      (section) => section.id === "blur",
    );

    expect(blurSection?.labelAction).toBeUndefined();
    expect(blurSection?.items).toEqual([
      expect.objectContaining({
        type: "blur-summary",
        name: "blur",
        value: "X 8, Y 10, quality 4, kernel 11, no repeat edge",
      }),
    ]);
    expect(viewData.spriteBlurDialogDefaults).toEqual({
      blurX: 8,
      blurY: 10,
      blurQuality: 4,
      blurKernelSize: 11,
      blurRepeatEdgePixels: false,
    });
    expect(
      viewData.spriteBlurDialogForm.fields.map((field) => field.name),
    ).toEqual([
      "blurX",
      "blurY",
      "blurQuality",
      "blurKernelSize",
      "blurRepeatEdgePixels",
    ]);
    expect(viewData.spriteBlurDialogForm.actions.buttons.at(-1)).toMatchObject({
      id: "submit",
      label: "Save Blur",
    });
  });

  it("opens the blur dialog from the section action and item click", async () => {
    const state = createInitialState();
    const deps = createDeps(state);

    await handleSectionActionClick(deps, {
      _event: {
        clientX: 10,
        clientY: 20,
        currentTarget: {
          dataset: {
            id: "blur",
          },
        },
      },
    });

    expect(state.spriteBlurDialog.open).toBe(true);
    expect(deps.render).toHaveBeenCalledTimes(1);

    closeSpriteBlurDialog({ state });
    handleBlurItemClick(deps);

    expect(state.spriteBlurDialog.open).toBe(true);
    expect(deps.render).toHaveBeenCalledTimes(2);
  });

  it("submits and removes sprite blur", async () => {
    const state = createInitialState();
    const deps = createDeps(state);

    openSpriteBlurDialog({ state });
    handleSpriteBlurFormAction(deps, {
      _event: {
        detail: {
          actionId: "submit",
          values: {
            blurX: "8",
            blurY: "10",
            blurQuality: "4",
            blurKernelSize: 11,
            blurRepeatEdgePixels: false,
          },
        },
      },
    });

    expect(state.spriteBlurDialog.open).toBe(false);
    expect(state.values.blur).toEqual({
      x: 8,
      y: 10,
      quality: 4,
      kernelSize: 11,
      repeatEdgePixels: false,
    });
    expect(deps.dispatchEvent.mock.calls[0][0].detail).toMatchObject({
      name: "blur",
      value: {
        x: 8,
        y: 10,
        quality: 4,
        kernelSize: 11,
        repeatEdgePixels: false,
      },
    });

    deps.appService.showDropdownMenu.mockResolvedValueOnce({
      item: { key: "remove" },
    });
    await handleBlurItemRightClick(deps, {
      _event: {
        preventDefault: vi.fn(),
        clientX: 30,
        clientY: 40,
      },
    });

    expect(state.values.blur).toBeUndefined();
    expect(deps.dispatchEvent.mock.calls[1][0].detail).toMatchObject({
      name: "blur",
      value: undefined,
    });
  });
});
