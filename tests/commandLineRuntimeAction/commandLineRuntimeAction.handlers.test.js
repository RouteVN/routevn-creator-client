import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectSubmitData,
  setAction,
  setFormValues,
  setMode,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.store.js";
import {
  handleAfterMount,
  handleFormChange,
  handleBeforeMount,
  handleOnUpdate,
  handleSubmitClick,
} from "../../src/components/commandLineRuntimeAction/commandLineRuntimeAction.handlers.js";

const createStore = (state) => ({
  setMode: (payload) => setMode({ state }, payload),
  setAction: (payload) => setAction({ state }, payload),
  setFormValues: (payload) => setFormValues({ state }, payload),
  selectSubmitData: () => selectSubmitData({ state }),
});

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

  it.each([
    ["setMenuPage", "settings"],
    ["setMenuEntryPoint", "pause-menu"],
  ])("hydrates the existing %s value into the mounted form", (mode, value) => {
    const state = createInitialState();
    const store = createStore(state);
    const form = {
      reset: vi.fn(),
      setValues: vi.fn(),
    };

    handleBeforeMount({
      props: {
        mode,
        action: { value },
      },
      store,
    });
    handleAfterMount({
      refs: { form },
      store,
    });

    expect(form.reset).toHaveBeenCalledOnce();
    expect(form.setValues).toHaveBeenCalledWith({
      values: {
        valueSource: "fixed",
        value,
      },
    });
  });

  it("rehydrates the form when an existing runtime action is opened in place", () => {
    const state = createInitialState();
    const store = createStore(state);
    const form = {
      reset: vi.fn(),
      setValues: vi.fn(),
    };
    const render = vi.fn();

    handleOnUpdate(
      {
        refs: { form },
        store,
        render,
      },
      {
        newProps: {
          mode: "setMenuEntryPoint",
          action: { value: "pause-menu" },
        },
      },
    );

    expect(render).toHaveBeenCalledOnce();
    expect(form.reset).toHaveBeenCalledOnce();
    expect(form.setValues).toHaveBeenCalledWith({
      values: {
        valueSource: "fixed",
        value: "pause-menu",
      },
    });
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
          selectSubmitData: () => selectSubmitData({ state }),
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
          selectSubmitData: () => selectSubmitData({ state }),
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
