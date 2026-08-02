import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it, vi } from "vitest";
import {
  handleFormActions,
  handleGroupItemWheel,
  setTransientValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import {
  createInitialState,
  selectViewData,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

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

const getAppearanceFields = ({
  resourceType = "layouts",
  rotation,
  i18n = EN_I18N,
} = {}) => {
  const state = createInitialState();
  setValues(
    { state },
    {
      values: {
        type: "container",
        name: "Container",
        rotation,
      },
    },
  );

  const viewData = selectViewData({
    state,
    props: {
      itemType: "container",
      layoutType: "general",
      resourceType,
      layoutsData: EMPTY_TREE,
      charactersData: EMPTY_TREE,
      isInsideSaveLoadSlot: false,
      isInsideDirectedContainer: false,
    },
    constants: LAYOUT_EDIT_PANEL_CONSTANTS,
    i18n,
  });
  const appearanceLabel = i18n.layoutEditPanel.appearanceSection;
  const appearanceSection = viewData.config.sections.find(
    (section) => section.label === appearanceLabel,
  );

  return appearanceSection.items.flatMap((item) => item.fields ?? []);
};

describe("layoutEditPanel rotation", () => {
  it.each(["layouts", "controls"])(
    "shows unrestricted degree rotation for %s",
    (resourceType) => {
      const rotationField = getAppearanceFields({
        resourceType,
        rotation: -45,
      }).find((field) => field.name === "rotation");

      expect(rotationField).toMatchObject({
        type: "clickable-value",
        label: "Rotation",
        value: -45,
        metaValue: "°",
      });
      expect(rotationField.popoverForm.fields).toEqual([
        {
          name: "value",
          type: "input-number",
        },
      ]);
    },
  );

  it("defaults missing rotation to zero and localizes its label", () => {
    const rotationField = getAppearanceFields({
      i18n: JA_I18N,
    }).find((field) => field.name === "rotation");

    expect(rotationField).toMatchObject({
      label: "回転",
      value: 0,
      metaValue: "°",
    });
  });

  it("rounds existing rotation artifacts to two decimals", () => {
    const state = createInitialState();
    setValues({ state }, { values: { rotation: 0.9999999999999999 } });

    expect(state.values.rotation).toBe(1);

    const rotationField = getAppearanceFields({
      rotation: 12.34567,
    }).find((field) => field.name === "rotation");

    expect(rotationField.value).toBe(12.35);
  });

  it("rounds form edits before emitting them", () => {
    const state = createInitialState();
    setValues({ state }, { values: { rotation: 0 } });
    const dispatchEvent = vi.fn();
    const deps = {
      store: {
        selectPopoverForm: () => ({ name: "rotation" }),
        selectValues: () => state.values,
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
        closePopoverForm: vi.fn(),
      },
      dispatchEvent,
      render: vi.fn(),
    };

    handleFormActions(deps, {
      _event: {
        detail: {
          values: {
            value: 12.34567,
          },
        },
      },
    });

    expect(state.values.rotation).toBe(12.35);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          name: "rotation",
          value: 12.35,
        }),
      }),
    );
  });

  it("renders transient canvas geometry without emitting an edit", () => {
    const state = createInitialState();
    setValues({ state }, { values: { x: 0, width: 100, rotation: 0 } });
    const deps = {
      store: {
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
      },
      render: vi.fn(),
    };

    setTransientValues(deps, {
      values: {
        x: 20,
        width: 120,
        rotation: 12.34567,
      },
    });

    expect(state.values.x).toBe(20);
    expect(state.values.width).toBe(120);
    expect(state.values.rotation).toBe(12.35);
    expect(deps.render).toHaveBeenCalledOnce();
  });

  it("nudges rotation by one degree or fifteen degrees with Shift", () => {
    const state = createInitialState();
    setValues({ state }, { values: { rotation: 30 } });
    const dispatchEvent = vi.fn();
    const deps = {
      store: {
        selectValues: () => state.values,
        updateValueProperty: (payload) =>
          updateValueProperty({ state }, payload),
      },
      dispatchEvent,
      render: vi.fn(),
    };
    const preventDefault = vi.fn();
    const createPayload = ({ deltaY, shiftKey }) => ({
      _event: {
        currentTarget: { dataset: { name: "rotation" } },
        deltaY,
        shiftKey,
        preventDefault,
      },
    });

    handleGroupItemWheel(deps, createPayload({ deltaY: -1, shiftKey: false }));
    handleGroupItemWheel(deps, createPayload({ deltaY: 1, shiftKey: true }));

    expect(state.values.rotation).toBe(16);
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(dispatchEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          name: "rotation",
          value: 16,
        }),
      }),
    );
  });
});
