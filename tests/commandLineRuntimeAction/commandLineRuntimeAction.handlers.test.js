import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setAction,
  setFormValues,
  setMode,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.store.js";
import {
  handleFormChange,
  handleSubmitClick,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.handlers.js";

describe("commandLineRuntimeAction.handlers", () => {
  it("stores form values on change so conditional fields can rerender", () => {
    const state = createInitialState();
    const render = vi.fn();

    handleFormChange(
      {
        store: {
          setFormValues: (payload) => setFormValues({ state }, payload),
        },
        render,
      },
      {
        _event: {
          detail: {
            values: {
              valueSource: "fixed",
              value: 42,
            },
          },
        },
      },
    );

    expect(state.formValues).toEqual({
      valueSource: "fixed",
      value: 42,
    });
    expect(render).toHaveBeenCalled();
  });

  it("submits current value bindings through the shared runtime action helper", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setMode({ state }, { mode: "setMusicVolume" });
    setAction({ state }, { action: {} });
    setFormValues(
      { state },
      {
        values: {
          valueSource: "event",
          value: 13,
        },
      },
    );

    handleSubmitClick(
      {
        store: {
          getState: () => state,
        },
        dispatchEvent,
      },
      {
        _event: {
          detail: {
            actionId: "submit",
          },
        },
      },
    );

    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    expect(dispatchEvent.mock.calls[0][0].detail).toEqual({
      setMusicVolume: {
        value: "_event.value",
      },
    });
  });
});
