import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import yaml from "js-yaml";
import {
  handleOnUpdate,
  handleSubmitClick,
} from "../../src/components/computedValueOperandPopover/computedValueOperandPopover.handlers.js";
import {
  createInitialState,
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
    expect(view).toContain("rtgl-input-number#valueInput");
    expect(view).toContain("rtgl-button#valueSubmit");
  });

  it("resets and focuses the input when opened", () => {
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
        newProps: { open: true },
      },
    );

    expect(resetValue).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    expect(valueInput.value).toBe(0);
    expect(focus).toHaveBeenCalledOnce();
  });

  it("emits the entered number", () => {
    const dispatchEvent = vi.fn();
    const setValue = vi.fn();

    handleSubmitClick({
      dispatchEvent,
      refs: { valueInput: { value: "7.25" } },
      store: { setValue },
    });

    expect(setValue).toHaveBeenCalledWith({ value: 7.25 });
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "value-submit",
        detail: { value: 7.25 },
      }),
    );
  });

  it("uses localized labels and positioning", () => {
    expect(
      selectViewData({
        state: createInitialState(),
        props: { open: true, x: 30, y: 40 },
        i18n: {
          variablesPage: {
            computedNodeValueSource: "数値",
            addValueButton: "追加",
          },
        },
      }),
    ).toEqual({
      open: true,
      x: 30,
      y: 40,
      value: 0,
      valueLabel: "数値",
      addValueLabel: "追加",
    });
  });
});
