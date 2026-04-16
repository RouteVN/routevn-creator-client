import { describe, expect, it } from "vitest";
import {
  createConditionalOverrideAttributeForm,
  createConditionalOverrideConditionForm,
} from "../../src/components/layoutEditPanel/support/layoutEditPanelConditionalOverrides.js";

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
