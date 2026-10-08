import { describe, expect, it, vi } from "vitest";
import {
  handleConditionalOverrideConditionFormChange,
  handleVisibilityConditionFormChange,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
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
    expect(
      form.fields.find((field) => field.name === "align")?.options,
    ).toEqual([
      {
        label: "Left",
        svg: "text-align-left",
        ariaLabel: "Left",
        value: "left",
      },
      {
        label: "Center",
        svg: "text-align-center",
        ariaLabel: "Center",
        value: "center",
      },
      {
        label: "Right",
        svg: "text-align-right",
        ariaLabel: "Right",
        value: "right",
      },
    ]);
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

describe.each([
  {
    dialog: "visibility",
    handler: handleVisibilityConditionFormChange,
    formRef: "visibilityConditionForm",
    setter: "setVisibilityConditionDialogSelectedVariableType",
  },
  {
    dialog: "conditional override",
    handler: handleConditionalOverrideConditionFormChange,
    formRef: "conditionalOverrideConditionForm",
    setter: "setConditionalOverrideConditionDialogSelectedVariableType",
  },
])(
  "layoutEditPanel $dialog condition target defaults",
  ({ handler, formRef, setter }) => {
    const TYPES = {
      "variables['enabled']": "boolean",
      "variables['score']": "number",
    };
    const changeForm = (values) => {
      const calls = [];
      handler(
        {
          refs: {
            [formRef]: {
              setValues: ({ values: nextValues }) =>
                calls.push({ type: "set", values: nextValues }),
            },
          },
          render: () => calls.push({ type: "render" }),
          store: {
            selectVisibilityConditionTargetTypeByTarget: () => TYPES,
            selectVisibilityConditionTargetValueKindByTarget: () => TYPES,
            [setter]: (kinds) => calls.push({ type: "kinds", kinds }),
          },
        },
        { _event: { detail: { values } } },
      );
      return calls;
    };

    it("selects Equals after choosing a target", () => {
      expect(changeForm({ target: "variables['score']" })).toEqual([
        {
          type: "kinds",
          kinds: {
            selectedVariableType: "number",
            selectedValueKind: "number",
          },
        },
        { type: "render" },
        { type: "set", values: { target: "variables['score']", op: "eq" } },
      ]);
    });

    it("selects True for a Boolean target after the render that shows its value", () => {
      expect(changeForm({ target: "variables['enabled']" })).toEqual([
        {
          type: "kinds",
          kinds: {
            selectedVariableType: "boolean",
            selectedValueKind: "boolean",
          },
        },
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

    it("selects True when Equals is already set, as after another target", () => {
      expect(
        changeForm({ target: "variables['enabled']", op: "eq" }).at(-1),
      ).toEqual({
        type: "set",
        values: {
          target: "variables['enabled']",
          op: "eq",
          booleanValue: true,
        },
      });
    });

    it("keeps a value already chosen, and sets nothing without a target", () => {
      const chosen = changeForm({
        target: "variables['enabled']",
        op: "eq",
        booleanValue: false,
      });
      expect(chosen.some(({ type }) => type === "set")).toBe(false);

      expect(changeForm({})).toEqual([
        {
          type: "kinds",
          kinds: {
            selectedVariableType: undefined,
            selectedValueKind: undefined,
          },
        },
        { type: "render" },
      ]);
    });
  },
);
