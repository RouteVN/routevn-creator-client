import { describe, expect, it } from "vitest";
import {
  createConditionalOverrideAttributeForm,
  createConditionalOverrideConditionForm,
} from "../../src/components/layoutEditPanel/support/layoutEditPanelConditionalOverrides.js";
import { createVisibilityConditionForm } from "../../src/components/layoutEditPanel/support/layoutEditPanelVisibility.js";

describe("layoutEditPanel condition forms", () => {
  it("uses segmented controls for override condition operation and boolean value", () => {
    const form = createConditionalOverrideConditionForm({
      targetOptions: [{ label: "Visible", value: "visible" }],
    });

    expect(form.fields.find((field) => field.name === "op")?.type).toBe(
      "segmented-control",
    );
    expect(
      form.fields.find((field) => field.name === "booleanValue")?.type,
    ).toBe("segmented-control");
  });

  it("uses character selects for character-valued visibility and override targets", () => {
    const visibilityForm = createVisibilityConditionForm({
      targetOptions: [
        { label: "Current Dialogue Character", value: "dialogue.characterId" },
      ],
    });
    const overrideForm = createConditionalOverrideConditionForm({
      targetOptions: [
        { label: "Current Dialogue Character", value: "dialogue.characterId" },
      ],
    });

    expect(
      visibilityForm.fields.find((field) => field.name === "characterValue"),
    ).toMatchObject({
      type: "select",
      label: "Character",
      options: "${characterValueOptions}",
    });
    expect(
      overrideForm.fields.find((field) => field.name === "characterValue"),
    ).toMatchObject({
      type: "select",
      label: "Character",
      options: "${characterValueOptions}",
    });
  });

  it("uses segmented controls for compact override attribute choices", () => {
    const form = createConditionalOverrideAttributeForm({
      attributeOptions: [
        { label: "Visibility", value: "visible" },
        { label: "Text Alignment", value: "textStyle.align" },
      ],
      textStyleOptions: [],
      imageOptions: [],
    });

    expect(form.fields.find((field) => field.name === "align")?.type).toBe(
      "segmented-control",
    );
    expect(form.fields.find((field) => field.name === "visible")?.type).toBe(
      "segmented-control",
    );
  });
});
