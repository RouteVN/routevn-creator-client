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

const createPanelViewData = ({
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

  return selectViewData({
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
};

const getSectionFields = (viewData, label) => {
  const section = viewData.config.sections.find(
    (candidate) => candidate.label === label,
  );

  return section.items.flatMap((item) => item.fields ?? []);
};

describe("layoutEditPanel rotation", () => {
  it.each(["layouts", "controls"])(
    "places rotation in Transform and opacity in Appearance for %s",
    (resourceType) => {
      const viewData = createPanelViewData({ resourceType });
      const transformFields = getSectionFields(
        viewData,
        EN_I18N.layoutEditPanel.transformSection,
      );
      const appearanceFields = getSectionFields(
        viewData,
        EN_I18N.layoutEditPanel.appearanceSection,
      );
      const configuredSections =
        resourceType === "controls"
          ? LAYOUT_EDIT_PANEL_CONSTANTS.controlSections
          : LAYOUT_EDIT_PANEL_CONSTANTS.layoutSections;
      const transformGroup = configuredSections
        .find((section) => section.label === "Transform")
        .items.find((item) => {
          return item.fields?.some((field) => field.name === "rotation");
        });
      const appearanceGroup = configuredSections
        .find((section) => section.label === "Appearance")
        .items.find((item) => item.type === "group");

      expect(transformGroup.stacked).toBe(true);
      if (resourceType === "layouts") {
        expect(transformGroup.fields.map((field) => field.name)).toEqual([
          "anchor",
          "rotation",
        ]);
      }
      expect(appearanceGroup.stacked).toBe(true);
      expect(appearanceGroup.halfWidth).toBe(true);
      expect(transformFields.map((field) => field.name)).toContain("rotation");
      expect(appearanceFields.map((field) => field.name)).toEqual(["opacity"]);
      const view = readFileSync(
        new URL(
          "../../src/components/layoutEditPanel/layoutEditPanel.view.yaml",
          import.meta.url,
        ),
        "utf8",
      );
      expect(view).toContain("rtgl-view d=h w=f av=c g=sm mb=sm");
      expect(view).toContain("rtgl-view d=v w=1fg g=sm");
      expect(view).toContain("rtgl-text s=xs c=mu: ${field.label}");
    },
  );

  it.each(["layouts", "controls"])(
    "shows unrestricted degree rotation for %s",
    (resourceType) => {
      const viewData = createPanelViewData({
        resourceType,
        rotation: -45,
      });
      const rotationField = getSectionFields(
        viewData,
        EN_I18N.layoutEditPanel.transformSection,
      ).find((field) => field.name === "rotation");

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
    const viewData = createPanelViewData({
      i18n: JA_I18N,
    });
    const rotationField = getSectionFields(
      viewData,
      JA_I18N.layoutEditPanel.transformSection,
    ).find((field) => field.name === "rotation");

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

    const viewData = createPanelViewData({
      rotation: 12.34567,
    });
    const rotationField = getSectionFields(
      viewData,
      EN_I18N.layoutEditPanel.transformSection,
    ).find((field) => field.name === "rotation");

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
