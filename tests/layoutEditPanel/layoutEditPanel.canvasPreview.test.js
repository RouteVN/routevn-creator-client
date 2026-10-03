import { describe, expect, it, vi } from "vitest";
import {
  handlePopoverFormChange,
  handlePopoverFormInput,
  handlePopoverPresetClick,
  handlePopverFormClose,
} from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";
import { normalizeLayoutRotation } from "../../src/internal/project/layout.js";
import { EN_I18N } from "../support/i18n.js";

const createDeps = (name = "x") => {
  const events = [];
  return {
    events,
    deps: {
      store: {
        selectPopoverForm: () => ({ name, defaultValues: { value: 100 } }),
        selectValues: () => ({ x: 100, y: 50 }),
        updatePopoverFormContext: vi.fn(),
        closePopoverForm: vi.fn(),
      },
      props: { projectResolution: { width: 1920, height: 1080 } },
      i18n: EN_I18N,
      render: vi.fn(),
      dispatchEvent: (event) => events.push(event),
    },
  };
};

const formEvent = (values) => ({ _event: { detail: { values } } });

describe("layout edit panel canvas preview", () => {
  it("previews a value while the slider moves, without rebuilding the form", () => {
    const { deps, events } = createDeps();

    handlePopoverFormInput(deps, formEvent({ value: 412.6 }));

    expect(events.map((event) => [event.type, event.detail])).toEqual([
      ["preview", { formValues: { x: 100, y: 50 }, name: "x", value: 413 }],
    ]);
    // Rebuilding the form remounts it and ends the slider drag.
    expect(deps.store.updatePopoverFormContext).not.toHaveBeenCalled();
    expect(deps.render).not.toHaveBeenCalled();
  });

  it("previews only plain numbers", () => {
    const { deps, events } = createDeps();

    handlePopoverFormInput(deps, formEvent({ value: "${variables.x}" }));
    handlePopoverFormInput(deps, formEvent({ value: "" }));

    expect(events).toEqual([]);
  });

  it("previews a committed value and a chosen preset", () => {
    const { deps, events } = createDeps();

    handlePopoverFormChange(deps, formEvent({ value: 300 }));
    handlePopoverPresetClick(deps, {
      _event: { currentTarget: { dataset: { value: "960" } } },
    });

    expect(events.map((event) => event.detail.value)).toEqual([300, 960]);
    expect(deps.store.updatePopoverFormContext).toHaveBeenCalledTimes(2);
  });

  it("normalizes a rotation preview like a saved value", () => {
    const { deps, events } = createDeps("rotation");

    handlePopoverFormInput(deps, formEvent({ value: 12.34567 }));

    expect(events[0].detail.value).toBe(normalizeLayoutRotation(12.34567));
    expect(events[0].detail.value).not.toBe(12.34567);
  });

  it("cancels the preview when the popover closes without submitting", () => {
    const { deps, events } = createDeps();

    handlePopverFormClose(deps);

    expect(deps.store.closePopoverForm).toHaveBeenCalledOnce();
    expect(events.map((event) => event.type)).toEqual(["preview-cancel"]);
  });
});
