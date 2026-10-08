import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setValues,
  updateValueProperty,
} from "../../src/components/layoutEditPanel/layoutEditPanel.store.js";
import { handleOptionSelected } from "../../src/components/layoutEditPanel/layoutEditPanel.handlers.js";

const createDeps = (values) => {
  const state = createInitialState();
  setValues({ state }, { values });
  const events = [];

  return {
    props: { itemType: "text" },
    store: {
      selectValues: () => state.values,
      updateValueProperty: (payload) => updateValueProperty({ state }, payload),
      closePopoverForm: vi.fn(),
    },
    render: vi.fn(),
    dispatchEvent: (event) => events.push([event.type, event.detail]),
    state,
    events,
  };
};

describe("layoutEditPanel text style clear", () => {
  it.each(["hoverTextStyleId", "clickTextStyleId"])(
    "removes the %s variant when its select is cleared",
    (name) => {
      const deps = createDeps({
        type: "text",
        textStyleId: "style-default",
        [name]: "style-variant",
      });

      // rtgl-select's clear button reports no value and no item.
      handleOptionSelected(deps, {
        _event: {
          currentTarget: { dataset: { name } },
          detail: { value: undefined, item: undefined },
        },
      });

      expect(deps.state.values[name]).toBeUndefined();
      expect(deps.state.values.textStyleId).toBe("style-default");
      const [type, detail] = deps.events.at(-1);
      expect(type).toBe("update");
      expect(detail).toMatchObject({ name, value: undefined });
    },
  );
});
