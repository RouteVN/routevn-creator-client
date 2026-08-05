import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  handleInputChange,
  handleSubmitClick,
  handleTriggerKeyDown,
} from "../../src/components/valuePopoverInput/valuePopoverInput.handlers.js";
import {
  createInitialState,
  selectViewData,
} from "../../src/components/valuePopoverInput/valuePopoverInput.store.js";

describe("valuePopoverInput", () => {
  it("renders a keyboard-accessible trigger and a padded popover form", () => {
    const view = readFileSync(
      "src/components/valuePopoverInput/valuePopoverInput.view.yaml",
      "utf8",
    );

    expect(view).toContain("role=button tabindex=${triggerTabIndex}");
    expect(view).toContain("content-ph=md content-pv=md");
  });

  it("opens from the keyboard and commits the entered value", () => {
    vi.useFakeTimers();
    const store = {
      closePopover: vi.fn(),
      openPopover: vi.fn(),
      selectTempValue: vi.fn(() => "1250"),
      setTempValue: vi.fn(),
      setValue: vi.fn(),
    };
    const input = {
      focus: vi.fn(),
      shadowRoot: {
        querySelector: vi.fn(() => ({ focus: vi.fn() })),
      },
    };
    const dispatchEvent = vi.fn();
    const render = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const deps = {
      dispatchEvent,
      props: { value: "1000" },
      refs: { input },
      render,
      store,
    };

    handleTriggerKeyDown(deps, {
      _event: {
        currentTarget: {
          getBoundingClientRect: () => ({ bottom: 80, left: 40 }),
        },
        key: "Enter",
        preventDefault,
        stopPropagation,
      },
    });
    vi.runAllTimers();
    handleInputChange(deps, { _event: { detail: { value: "1250" } } });
    handleSubmitClick(deps);
    vi.useRealTimers();

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(store.openPopover).toHaveBeenCalledWith({
      position: { x: 40, y: 80 },
    });
    expect(input.focus).toHaveBeenCalledOnce();
    expect(store.setTempValue).toHaveBeenCalledWith({ value: "1250" });
    expect(dispatchEvent.mock.calls[0][0]).toMatchObject({
      type: "value-change",
      detail: { value: "1250" },
    });
  });

  it("shows the current value and localized action", () => {
    const state = createInitialState();
    state.value = "500";

    expect(
      selectViewData({
        i18n: { animationEditorPage: { doneButton: "Apply" } },
        props: { label: "Duration" },
        state,
      }),
    ).toMatchObject({
      label: "Duration",
      submitLabel: "Apply",
      value: "500",
      valueColor: "fg",
    });
  });
});
