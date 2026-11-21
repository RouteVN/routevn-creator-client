import { parseAndRender } from "jempl";
import { describe, expect, it, vi } from "vitest";
import {
  handleConditionalOverrideConditionFormChange,
  handleVisibilityConditionFormAction,
  handleVisibilityConditionFormChange,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import { createConditionalOverrideConditionDefaults } from "../../src/components/layoutEditPanel/support/layoutEditPanelConditionalOverrides.js";
import {
  createVisibilityConditionDialogDefaults,
  createVisibilityConditionForm,
  getConditionPresetValueOptions,
  getVisibilityConditionSummary,
  resolveConditionPresetValue,
  toVisibilityConditionTargetValueKindByTarget,
} from "../../src/components/layoutEditPanel/support/layoutEditPanelVisibility.js";

const MENU_PAGE = "runtime.menuPage";
const MENU_ENTRY_POINT = "runtime.menuEntryPoint";
const TYPES = { [MENU_PAGE]: "string", [MENU_ENTRY_POINT]: "string" };
const KINDS = toVisibilityConditionTargetValueKindByTarget();

describe("layoutEditPanel condition predefined values", () => {
  it("offers Predefined or Custom for the menu page and menu entry point", () => {
    expect(KINDS[MENU_PAGE]).toBe("menuPage");
    expect(KINDS[MENU_ENTRY_POINT]).toBe("menuEntryPoint");
    expect(KINDS["dialogue.characterId"]).toBe("character");

    expect(
      getConditionPresetValueOptions("menuEntryPoint").map(
        ({ value }) => value,
      ),
    ).toEqual(["story", "title"]);
    expect(getConditionPresetValueOptions("string")).toEqual([]);

    const fieldNames = createVisibilityConditionForm()
      .fields.filter((field) => field.$when?.includes("hasPresetValues"))
      .map((field) => field.name);
    expect(fieldNames).toEqual(["valueChoice", "presetValue", "stringValue"]);
  });

  it.each([
    ["visibility", (when) => when, createVisibilityConditionDialogDefaults],
    [
      "conditional override",
      (when) => ({ when }),
      createConditionalOverrideConditionDefaults,
    ],
  ])("opens a saved %s condition on its choice", (_name, wrap, defaults) => {
    const open = (value) =>
      defaults(wrap({ target: MENU_PAGE, op: "eq", value }), TYPES, KINDS);

    expect(open("save")).toMatchObject({
      valueChoice: "predefined",
      presetValue: "save",
    });
    expect(open("credits")).toMatchObject({
      valueChoice: "custom",
      stringValue: "credits",
      presetValue: "options",
    });
    expect(open(undefined)).toMatchObject({
      valueChoice: "predefined",
      presetValue: "options",
    });
  });

  it.each([
    [
      handleVisibilityConditionFormChange,
      "visibilityConditionForm",
      "setVisibilityConditionDialogTarget",
    ],
    [
      handleConditionalOverrideConditionFormChange,
      "conditionalOverrideConditionForm",
      "setConditionalOverrideConditionDialogSelectedVariableType",
    ],
  ])("fills the predefined value as the form changes", (handler, ref, set) => {
    const changeForm = (values) => {
      const setValues = vi.fn();
      handler(
        {
          refs: { [ref]: { setValues } },
          render: vi.fn(),
          store: {
            selectVisibilityConditionEnumOptions: () => undefined,
            selectVisibilityConditionTargetTypeByTarget: () => TYPES,
            selectVisibilityConditionTargetValueKindByTarget: () => KINDS,
            [set]: vi.fn(),
          },
        },
        { _event: { detail: { values } } },
      );
      return setValues.mock.calls[0]?.[0].values;
    };

    // A newly picked target starts at its first predefined value.
    expect(changeForm({ target: MENU_PAGE })).toEqual({
      target: MENU_PAGE,
      op: "eq",
      valueChoice: "predefined",
      presetValue: "options",
    });
    // Another target's predefined value is not kept.
    expect(
      changeForm({
        target: MENU_ENTRY_POINT,
        op: "eq",
        valueChoice: "predefined",
        presetValue: "save",
      }),
    ).toMatchObject({ presetValue: "story" });
    // Back from Custom, where the form left the predefined value out.
    expect(
      changeForm({ target: MENU_PAGE, op: "eq", valueChoice: "predefined" }),
    ).toMatchObject({ presetValue: "options" });
    expect(
      changeForm({
        target: MENU_PAGE,
        op: "eq",
        valueChoice: "custom",
        stringValue: "credits",
      }),
    ).toBeUndefined();
  });

  it("submits the predefined value, or the custom one typed in", () => {
    expect(
      resolveConditionPresetValue("menuPage", {
        valueChoice: "predefined",
        presetValue: "load",
        stringValue: "ignored",
      }),
    ).toBe("load");
    expect(
      resolveConditionPresetValue("menuPage", {
        valueChoice: "custom",
        stringValue: "credits",
      }),
    ).toBe("credits");
    expect(resolveConditionPresetValue("string", {})).toBeUndefined();
  });

  it.each([
    ["eq", "=="],
    ["neq", "!="],
  ])("saves a predefined visibility value with %s", (op, symbol) => {
    const applied = [];
    handleVisibilityConditionFormAction(
      {
        render: vi.fn(),
        dispatchEvent: (event) => applied.push(event.detail),
        props: {},
        store: {
          selectValues: () => ({}),
          selectVisibilityConditionTargetTypeByTarget: () => TYPES,
          selectVisibilityConditionTargetValueKindByTarget: () => KINDS,
          closeVisibilityConditionDialog: vi.fn(),
          updateValueProperty: vi.fn(),
        },
      },
      {
        _event: {
          detail: {
            actionId: "submit",
            values: {
              target: MENU_PAGE,
              op,
              valueChoice: "predefined",
              presetValue: "save",
            },
          },
        },
      },
    );

    expect(applied).toContainEqual(
      expect.objectContaining({
        name: "$when",
        value: `runtime.menuPage ${symbol} "save"`,
      }),
    );
  });

  it("shows the select for Predefined and the text input for Custom", () => {
    const form = createVisibilityConditionForm({ targetOptions: [] });
    const showFields = (selectedValueKind, values) => {
      const presetValueOptions =
        getConditionPresetValueOptions(selectedValueKind);
      return parseAndRender(form, {
        selectedVariableType: "string",
        selectedValueKind,
        presetValueOptions,
        hasPresetValues: presetValueOptions.length > 0,
        ...values,
      })
        .fields.slice(2)
        .map((field) => `${field.name}:${field.type}`);
    };

    expect(
      showFields("menuPage", { target: MENU_PAGE, valueChoice: "predefined" }),
    ).toEqual(["valueChoice:segmented-control", "presetValue:select"]);
    expect(
      showFields("menuPage", { target: MENU_PAGE, valueChoice: "custom" }),
    ).toEqual(["valueChoice:segmented-control", "stringValue:input-text"]);
    expect(showFields("string", { target: "variables.name" })).toEqual([
      "stringValue:input-text",
    ]);
  });

  it("names a predefined value in the summary", () => {
    expect(
      getVisibilityConditionSummary({
        target: MENU_PAGE,
        op: "eq",
        value: "music-room",
      }),
    ).toBe("Menu Page Equals Music Room");
    expect(
      getVisibilityConditionSummary({
        target: MENU_PAGE,
        op: "eq",
        value: "credits",
      }),
    ).toBe("Menu Page Equals credits");
  });
});
