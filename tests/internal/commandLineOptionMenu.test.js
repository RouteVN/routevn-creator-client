import { describe, expect, it } from "vitest";
import {
  COMMAND_LINE_OPTION_GROUPS,
  createCommandLineOptionMenuItems,
  getCommandLineOptionLabel,
  COMMAND_LINE_ITEM_FLIP_OPTIONS,
} from "../../src/internal/commandLineItemEffects.js";
import { COMMAND_LINE_SHADER_ADJUSTMENTS } from "../../src/internal/commandLineShaderAdjustments.js";

const getLabel = (optionId) => `label:${optionId}`;

const toItem = (optionId) => ({
  type: "item",
  label: `label:${optionId}`,
  key: optionId,
});

describe("createCommandLineOptionMenuItems", () => {
  it("orders every known option by the shared groups", () => {
    const optionIds = COMMAND_LINE_OPTION_GROUPS.flat().slice().reverse();

    expect(createCommandLineOptionMenuItems({ optionIds, getLabel })).toEqual([
      toItem("background-color"),
      toItem("opacity"),
      toItem("blur"),
      { type: "separator" },
      toItem("flip-x"),
      toItem("flip-y"),
      { type: "separator" },
      toItem("brightness"),
      toItem("contrast"),
      toItem("saturation"),
      toItem("hue"),
      toItem("grayscale"),
      toItem("sepia"),
      toItem("invert"),
    ]);
  });

  it("adds separators only between non-empty groups", () => {
    const items = createCommandLineOptionMenuItems({
      optionIds: ["blur", "flip-x", "sepia"],
      getLabel,
    });

    expect(items).toEqual([
      toItem("blur"),
      { type: "separator" },
      toItem("flip-x"),
      { type: "separator" },
      toItem("sepia"),
    ]);
  });

  it("omits separators when a whole group is missing", () => {
    const items = createCommandLineOptionMenuItems({
      optionIds: ["opacity", "blur", "flip-y", "hue"],
      getLabel,
    });

    expect(items).toEqual([
      toItem("opacity"),
      toItem("blur"),
      { type: "separator" },
      toItem("flip-y"),
      { type: "separator" },
      toItem("hue"),
    ]);
  });

  it("never emits leading, trailing, or doubled separators", () => {
    const items = createCommandLineOptionMenuItems({
      optionIds: ["flip-x", "flip-y"],
      getLabel,
    });

    expect(items).toEqual([toItem("flip-x"), toItem("flip-y")]);
    expect(items[0].type).not.toBe("separator");
    expect(items.at(-1).type).not.toBe("separator");
  });

  it("skips ids outside the shared groups", () => {
    const items = createCommandLineOptionMenuItems({
      optionIds: ["opacity", "unknown-option"],
      getLabel,
    });

    expect(items).toEqual([toItem("opacity")]);
  });

  it("returns an empty array for empty input", () => {
    expect(
      createCommandLineOptionMenuItems({ optionIds: [], getLabel }),
    ).toEqual([]);
  });
});

describe("COMMAND_LINE_OPTION_GROUPS", () => {
  it("includes every flip option and shader adjustment exactly once", () => {
    const groupedIds = COMMAND_LINE_OPTION_GROUPS.flat();

    expect(new Set(groupedIds).size).toBe(groupedIds.length);
    for (const option of [
      ...COMMAND_LINE_ITEM_FLIP_OPTIONS,
      ...COMMAND_LINE_SHADER_ADJUSTMENTS,
    ]) {
      expect(groupedIds).toContain(option.id);
    }
  });
});

describe("getCommandLineOptionLabel", () => {
  it("maps every shared option id to an English base label", () => {
    const labels = COMMAND_LINE_OPTION_GROUPS.flat().map((optionId) =>
      getCommandLineOptionLabel(optionId),
    );

    expect(labels).toEqual([
      "Background Color",
      "Opacity",
      "Blur",
      "Flip X",
      "Flip Y",
      "Brightness",
      "Contrast",
      "Saturation",
      "Hue",
      "Grayscale",
      "Sepia",
      "Invert",
    ]);
  });
});
