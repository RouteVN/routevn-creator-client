import { describe, expect, it, vi } from "vitest";
import { handleConditionalOverrideConditionFormChange } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import {
  createConditionalOverrideAttributeForm,
  createConditionalOverrideAttributeImagePreview,
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
    expect(form.fields.find((field) => field.name === "target")).toMatchObject({
      searchable: true,
      searchPlaceholder: "Search targets...",
      emptySearchLabel: "No targets found",
    });
  });

  it("omits the cancel action from the override condition dialog", () => {
    const form = createConditionalOverrideConditionForm();

    expect(form.actions.buttons).toEqual([
      {
        id: "submit",
        variant: "pr",
        label: "Save",
      },
    ]);
  });

  it("selects Equals by default after choosing a condition target", () => {
    const setValues = vi.fn();

    handleConditionalOverrideConditionFormChange(
      {
        refs: {
          conditionalOverrideConditionForm: { setValues },
        },
        render: vi.fn(),
        store: {
          selectVisibilityConditionTargetTypeByTarget: () => ({
            "variables['score']": "number",
          }),
          selectVisibilityConditionTargetValueKindByTarget: () => ({
            "variables['score']": "number",
          }),
          setConditionalOverrideConditionDialogSelectedVariableType: vi.fn(),
        },
      },
      {
        _event: {
          detail: {
            values: {
              target: "variables['score']",
            },
          },
        },
      },
    );

    expect(setValues).toHaveBeenCalledWith({
      values: {
        target: "variables['score']",
        op: "eq",
      },
    });
  });

  it("selects True by default after choosing a Boolean target", () => {
    const setValues = vi.fn();

    handleConditionalOverrideConditionFormChange(
      {
        refs: {
          conditionalOverrideConditionForm: { setValues },
        },
        render: vi.fn(),
        store: {
          selectVisibilityConditionTargetTypeByTarget: () => ({
            "variables['enabled']": "boolean",
          }),
          selectVisibilityConditionTargetValueKindByTarget: () => ({
            "variables['enabled']": "boolean",
          }),
          setConditionalOverrideConditionDialogSelectedVariableType: vi.fn(),
        },
      },
      {
        _event: {
          detail: {
            values: {
              target: "variables['enabled']",
            },
          },
        },
      },
    );

    expect(setValues).toHaveBeenCalledWith({
      values: {
        target: "variables['enabled']",
        op: "eq",
        booleanValue: true,
      },
    });
  });

  it("selects True after Equals is already populated", () => {
    const calls = [];

    handleConditionalOverrideConditionFormChange(
      {
        refs: {
          conditionalOverrideConditionForm: {
            setValues: ({ values }) => calls.push({ type: "set", values }),
          },
        },
        render: () => calls.push({ type: "render" }),
        store: {
          selectVisibilityConditionTargetTypeByTarget: () => ({
            "variables['enabled']": "boolean",
          }),
          selectVisibilityConditionTargetValueKindByTarget: () => ({
            "variables['enabled']": "boolean",
          }),
          setConditionalOverrideConditionDialogSelectedVariableType: vi.fn(),
        },
      },
      {
        _event: {
          detail: {
            values: {
              target: "variables['enabled']",
              op: "eq",
            },
          },
        },
      },
    );

    expect(calls).toEqual([
      { type: "render" },
      {
        type: "set",
        values: {
          target: "variables['enabled']",
          op: "eq",
          booleanValue: true,
        },
      },
    ]);
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
    });

    expect(form.fields.find((field) => field.name === "align")?.type).toBe(
      "segmented-control",
    );
    expect(form.fields.find((field) => field.name === "visible")?.type).toBe(
      "segmented-control",
    );
    expect(form.actions.buttons).toEqual([
      {
        id: "submit",
        variant: "pr",
        label: "Save",
      },
    ]);
  });

  it("uses the image selector slot for override image attributes", () => {
    const form = createConditionalOverrideAttributeForm({
      attributeOptions: [{ label: "Image", value: "imageId" }],
      textStyleOptions: [],
    });

    expect(
      form.fields.find((field) => field.slot === "conditional-override-image"),
    ).toMatchObject({
      type: "slot",
      label: "Image",
    });
    expect(
      form.fields.find((field) => field.name === "selectedImageId"),
    ).toBeUndefined();
  });

  it("uses the selected image aspect ratio for the override preview", () => {
    expect(
      createConditionalOverrideAttributeImagePreview(
        {
          items: {
            "image-wide": {
              id: "image-wide",
              name: "Wide Image",
              fileId: "file-wide",
              thumbnailFileId: "thumbnail-wide",
              width: 320,
              height: 180,
            },
          },
        },
        "image-wide",
      ),
    ).toEqual({
      imageId: "image-wide",
      previewFileId: "thumbnail-wide",
      previewAspectRatio: "16 / 9",
      name: "Wide Image",
      itemBorderColor: "bo",
      itemHoverBorderColor: "ac",
    });
  });
});
