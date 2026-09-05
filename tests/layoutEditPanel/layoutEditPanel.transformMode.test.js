import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  openPopoverForm,
  selectViewData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { EN_I18N, JA_I18N } from "../support/i18n.js";

const EMPTY_TREE = { items: {}, tree: [] };
const CONSTANTS = yaml.load(
  readFileSync(
    new URL(
      "../../src/components/layoutEditPanel/layoutEditPanel.constants.yaml",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("layoutEditPanel transform mode", () => {
  it.each([
    [1.23456789, 0.98765432, 1.23, 0.99],
    [0.1 + 0.2, 1.2 + 0.01, 0.3, 1.21],
    [-1.236, -0.994, -1.24, -0.99],
    [0, 1, 0, 1],
  ])(
    "rounds scale readouts and popovers without changing the transform (%s, %s)",
    (scaleX, scaleY, expectedX, expectedY) => {
      const state = createInitialState();
      setValues({ state }, { values: { scaleX, scaleY } });
      const viewData = selectViewData({
        state,
        props: {
          mode: "transform",
          projectResolution: { width: 1920, height: 1080 },
          layoutsData: EMPTY_TREE,
          charactersData: EMPTY_TREE,
        },
        constants: CONSTANTS,
        i18n: EN_I18N,
      });
      const fields = viewData.config.sections[0].items[1].fields;

      expect(fields.map(({ value }) => value)).toEqual([expectedX, expectedY]);
      for (const field of fields) {
        openPopoverForm(
          { state },
          { name: field.name, form: field.popoverForm },
        );
        expect(state.popover.defaultValues.value).toBe(field.value);
      }
      expect(state.values).toMatchObject({ scaleX, scaleY });
      expect(viewData.values).toMatchObject({ scaleX, scaleY });
    },
  );

  it("exposes only action-transform controls", () => {
    const state = createInitialState();
    setValues(
      { state },
      {
        values: {
          x: 100,
          y: 120,
          scaleX: 1.2,
          scaleY: 0.8,
          anchor: { x: 0.5, y: 1 },
          rotation: 15,
        },
      },
    );

    const viewData = selectViewData({
      state,
      props: {
        mode: "transform",
        projectResolution: { width: 1920, height: 1080 },
        layoutsData: EMPTY_TREE,
        charactersData: EMPTY_TREE,
      },
      constants: CONSTANTS,
      i18n: EN_I18N,
    });
    const fields = viewData.config.sections
      .flatMap((section) => section.items)
      .flatMap((item) => item.fields ?? [item]);

    expect(viewData.config.sections).toHaveLength(1);
    expect(viewData.config.sections[0].label).toBe("Transform");
    const [positionGroup, scaleGroup, anchorRotationGroup] =
      viewData.config.sections[0].items;
    expect(positionGroup.fields.map((field) => field.name)).toEqual(["x", "y"]);
    expect(positionGroup.fields.map((field) => field.label)).toEqual([
      EN_I18N.layoutEditPanel.positionXLabel,
      EN_I18N.layoutEditPanel.positionYLabel,
    ]);
    expect(scaleGroup.stacked).toBe(true);
    expect(anchorRotationGroup.stacked).toBe(true);
    expect(anchorRotationGroup.fields.map((field) => field.name)).toEqual([
      "anchor",
      "rotation",
    ]);
    expect(fields.map((field) => field.name)).toEqual([
      "x",
      "y",
      "scaleX",
      "scaleY",
      "anchor",
      "rotation",
    ]);
  });

  it("localizes position labels and center anchor options", () => {
    const state = createInitialState();
    const viewData = selectViewData({
      state,
      props: {
        mode: "transform",
        projectResolution: { width: 1920, height: 1080 },
        layoutsData: EMPTY_TREE,
        charactersData: EMPTY_TREE,
      },
      constants: CONSTANTS,
      i18n: JA_I18N,
    });
    const [positionGroup, _scaleGroup, anchorRotationGroup] =
      viewData.config.sections[0].items;
    const anchorField = anchorRotationGroup.fields.find(
      ({ name }) => name === "anchor",
    );

    expect(positionGroup.fields.map(({ label }) => label)).toEqual([
      JA_I18N.layoutEditPanel.positionXLabel,
      JA_I18N.layoutEditPanel.positionYLabel,
    ]);
    expect(
      anchorField.options
        .filter(({ value }) => value.y === 0.5 && value.x !== 0.5)
        .map(({ label }) => label),
    ).toEqual([
      JA_I18N.layoutEditPanel.anchorCenterLeft,
      JA_I18N.layoutEditPanel.anchorCenterRight,
    ]);
  });
});
