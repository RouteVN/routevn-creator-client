import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import {
  handleOnUpdate,
  handleSubmitClick,
  handleValueTypeChange,
} from "../../src/components/computedValueOperandPopover/computedValueOperandPopover.handlers.js";
import {
  createInitialState,
  resetValue,
  selectViewData,
} from "../../src/components/computedValueOperandPopover/computedValueOperandPopover.store.js";

const view = readFileSync(
  new URL(
    "../../src/components/computedValueOperandPopover/computedValueOperandPopover.view.yaml",
    import.meta.url,
  ),
  "utf8",
);

describe("computedValueOperandPopover", () => {
  it("renders a number input inside a popover", () => {
    expect(() => yaml.load(view)).not.toThrow();
    expect(view).toContain("rtgl-popover#popover");
    expect(view).toContain("rtgl-input-number#numberValueInput");
    expect(view).toContain("rtgl-input#stringValueInput");
    expect(view).toContain("rtgl-select#booleanValueInput");
    expect(view).toContain("rtgl-select#valueTypeSelect");
    expect(view).toContain("rtgl-button#valueSubmit");
  });

  it("resets the input when opened without re-entering render", () => {
    const resetValue = vi.fn();
    const render = vi.fn();
    const focus = vi.fn();
    const valueInput = { value: 8, focus };

    handleOnUpdate(
      {
        refs: { valueInput },
        render,
        store: { resetValue },
      },
      {
        oldProps: { open: false },
        newProps: { open: true, valueTypes: ["boolean"] },
      },
    );

    expect(resetValue).toHaveBeenCalledWith({
      valueTypes: ["boolean"],
      initialValue: undefined,
    });
    expect(render).not.toHaveBeenCalled();
    expect(focus).not.toHaveBeenCalled();
  });

  it("prefills an existing literal when editing", () => {
    const state = createInitialState();
    const initialValue = { value: "Ready" };

    resetValue(
      { state },
      {
        valueTypes: ["string"],
        initialValue,
      },
    );

    expect(
      selectViewData({
        state,
        props: {
          open: true,
          valueTypes: ["string"],
          initialValue,
        },
        i18n: {
          variablesPage: {
            computedUpdateValueButton: "Save literal",
          },
        },
      }),
    ).toMatchObject({
      value: "Ready",
      valueType: "string",
      stringValue: "Ready",
      addValueLabel: "Save literal",
    });
  });

  it("emits the entered number", () => {
    const dispatchEvent = vi.fn();
    const setValue = vi.fn();

    handleSubmitClick({
      dispatchEvent,
      store: {
        selectValue: () => "7.25",
        selectValueType: () => "number",
        setValue,
      },
    });

    expect(setValue).toHaveBeenCalledWith({ value: 7.25 });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "value-submit",
        detail: { value: 7.25 },
      }),
    );
  });

  it("switches literal types and emits boolean values", () => {
    const dispatchEvent = vi.fn();
    const focus = vi.fn();
    const render = vi.fn();
    const setValueType = vi.fn();
    const setValue = vi.fn();

    handleValueTypeChange(
      {
        refs: {
          booleanValueInput: { focus },
        },
        render,
        store: { setValueType },
      },
      {
        _event: {
          detail: { value: "boolean" },
        },
      },
    );

    expect(setValueType).toHaveBeenCalledWith({ valueType: "boolean" });
    expect(render).toHaveBeenCalledOnce();
    expect(focus).toHaveBeenCalledOnce();

    handleSubmitClick({
      dispatchEvent,
      store: {
        selectValue: () => "false",
        selectValueType: () => "boolean",
        setValue,
      },
    });
    expect(setValue).toHaveBeenCalledWith({ value: false });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "value-submit",
        detail: { value: false },
      }),
    );
  });

  it("uses localized labels and positioning", () => {
    expect(
      selectViewData({
        state: createInitialState(),
        props: {
          open: true,
          x: 30,
          y: 40,
          valueTypes: ["number", "string", "boolean"],
        },
        i18n: {
          variablesPage: {
            computedNodeValueSource: "数値",
            computedValueTypeLabel: "値の型",
            variableTypeNumberLabel: "数値",
            variableTypeStringLabel: "文字列",
            variableTypeBooleanLabel: "真偽値",
            booleanTrueLabel: "真",
            booleanFalseLabel: "偽",
            addValueButton: "追加",
          },
        },
      }),
    ).toMatchObject({
      open: true,
      x: 30,
      y: 40,
      value: 0,
      valueType: "number",
      valueTypeLabel: "値の型",
      showValueTypeSelect: true,
      valueTypeOptions: [
        { value: "number", label: "数値" },
        { value: "string", label: "文字列" },
        { value: "boolean", label: "真偽値" },
      ],
      booleanOptions: [
        { value: "true", label: "真" },
        { value: "false", label: "偽" },
      ],
      valueLabel: "数値",
      addValueLabel: "追加",
    });
  });
});
