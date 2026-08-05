import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectViewData,
  setValues,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { EN_I18N } from "../support/i18n.js";

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
      undefined,
      undefined,
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
});
