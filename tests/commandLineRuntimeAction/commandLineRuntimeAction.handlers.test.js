import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setAction,
  setFormValues,
  setMode,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.store.js";
import {
  handleFormChange,
  handleBeforeMount,
  handleSubmitClick,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.handlers.js";

describe("commandLineRuntimeAction.handlers", () => {
  it("initializes scene-editor-facing runtime actions from props on mount", () => {
    const state = createInitialState();

    setFormValues(
      { state },
      {
        values: {
          valueSource: "fixed",
          value: 999,
        },
      },
    );

    handleBeforeMount({
      props: {
        mode: "setDialogueTextSpeed",
        action: {
          value: 80,
        },
      },
      store: {
        setMode: (payload) => setMode({ state }, payload),
        setAction: (payload) => setAction({ state }, payload),
        setFormValues: (payload) => setFormValues({ state }, payload),
      },
    });

    expect(state.mode).toBe("setDialogueTextSpeed");
    expect(state.action).toEqual({
      value: 80,
    });
    expect(state.formValues).toEqual({});
  });

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

  it("submits fixed dialogue text speed values for the extracted scene-editor flow", () => {
    const state = createInitialState();
    const dispatchEvent = vi.fn();

    setMode({ state }, { mode: "setDialogueTextSpeed" });
    setAction({ state }, { action: {} });
    setFormValues(
      { state },
      {
        values: {
          valueSource: "fixed",
          value: 70,
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
      setDialogueTextSpeed: {
        value: 70,
      },
    });
  });
});
