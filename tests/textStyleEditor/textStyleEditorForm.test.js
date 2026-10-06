import { describe, expect, it } from "vitest";
import {
  applyTextStyleColorChange,
  applyTextStyleFontChange,
  applyTextStyleFormChange,
  buildFontWeightOptions,
  toTextStyleUpdateData,
  toTextStyleValues,
} from "../../src/pages/textStyleEditor/support/textStyleEditorForm.js";
import { selectTextStyleEditorPageCopy } from "../../src/pages/textStyleEditor/support/textStyleEditorPageCopy.js";
import { EN_I18N } from "../support/i18n.js";

const copy = selectTextStyleEditorPageCopy(EN_I18N);

const optionValues = (options) => options.map((option) => option.value);

const createItem = (fields = {}) => ({
  id: "text-style-1",
  type: "textStyle",
  name: "Text Style One",
  fontId: "font-1",
  colorId: "color-1",
  fontSize: 24,
  lineHeight: 1.5,
  fontWeight: "400",
  ...fields,
});

describe("text style editor form", () => {
  it("offers only a static font's extracted weight", () => {
    const options = buildFontWeightOptions({
      capabilities: {
        kind: "static",
        defaultWeight: 600,
        minWeight: 600,
        maxWeight: 600,
      },
      copy,
    });

    expect(options).toEqual([{ label: "600 - Semi Bold", value: "600" }]);
  });

  it("offers standard weights inside a variable font's actual range", () => {
    const options = buildFontWeightOptions({
      capabilities: {
        kind: "variable",
        defaultWeight: 400,
        minWeight: 250,
        maxWeight: 725,
      },
      copy,
    });

    expect(optionValues(options)).toEqual(["300", "400", "500", "600", "700"]);
  });

  it("offers all standard weights when a font's weight is unknown", () => {
    for (const capabilities of [undefined, { kind: "unrestricted" }]) {
      expect(
        optionValues(buildFontWeightOptions({ capabilities, copy })),
      ).toEqual([
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
    }
  });

  it("keeps a weight the text style already had available", () => {
    const options = buildFontWeightOptions({
      capabilities: {
        kind: "static",
        defaultWeight: 400,
        minWeight: 400,
        maxWeight: 400,
      },
      grandfatheredWeight: "700",
      copy,
    });

    expect(optionValues(options)).toEqual(["400", "700"]);
  });

  it("reads a single font id, an outline and a shadow into the values", () => {
    expect(
      toTextStyleValues(
        createItem({
          strokeColorId: "color-2",
          strokeWidth: 3,
          shadow: { colorId: "color-3", blur: 6 },
        }),
      ),
    ).toEqual({
      fontId: ["font-1"],
      colorId: "color-1",
      fontSize: 24,
      lineHeight: 1.5,
      fontWeight: "400",
      strokeColorId: "color-2",
      strokeWidth: 3,
      shadow: { colorId: "color-3", alpha: 1, blur: 6, offsetX: 2, offsetY: 2 },
    });

    // A thickness without an outline color draws nothing.
    expect(toTextStyleValues(createItem({ strokeWidth: 4 })).strokeWidth).toBe(
      0,
    );
  });

  it("clears a removed outline and shadow when it saves", () => {
    const values = toTextStyleValues(createItem());

    expect(toTextStyleUpdateData(values)).toEqual({
      fontId: ["font-1"],
      colorId: "color-1",
      fontSize: 24,
      lineHeight: 1.5,
      fontWeight: "400",
      strokeColorId: undefined,
      strokeWidth: 0,
      clearShadow: true,
    });
  });

  it("keeps values the fields cannot keep, and normalizes the ones they can", () => {
    const values = toTextStyleValues(
      createItem({ shadow: { colorId: "color-3" } }),
    );

    expect(
      applyTextStyleFormChange(values, { name: "fontSize", value: 0 }),
    ).toEqual({ values, refreshForm: true });
    expect(
      applyTextStyleFormChange(values, { name: "shadowAlpha", value: 1.5 }),
    ).toEqual({
      values: { ...values, shadow: { ...values.shadow, alpha: 1 } },
      refreshForm: true,
    });
    expect(
      applyTextStyleFormChange(values, { name: "lineHeight", value: 2 }),
    ).toEqual({ values: { ...values, lineHeight: 2 }, refreshForm: false });
    // No outline color, so there is no thickness to change.
    expect(
      applyTextStyleFormChange(values, { name: "strokeWidth", value: 2 }).values
        .strokeWidth,
    ).toBe(0);
  });

  it("replaces the font stack only for another primary font", () => {
    const values = toTextStyleValues(
      createItem({ fontId: ["font-1", "font-2"] }),
    );

    expect(
      applyTextStyleFontChange(values, { fontId: "font-1" }).fontId,
    ).toEqual(["font-1", "font-2"]);
    expect(
      applyTextStyleFontChange(values, { fontId: "font-3", fontWeight: 700 }),
    ).toMatchObject({ fontId: ["font-3"], fontWeight: "700" });
  });

  it("keeps the text color when its select is cleared", () => {
    const values = toTextStyleValues(createItem());

    expect(
      applyTextStyleColorChange(values, {
        field: "colorId",
        colorId: undefined,
      }).colorId,
    ).toBe("color-1");
  });
});
