import { describe, expect, it } from "vitest";
import {
  createInitialState,
  selectAction,
  updateActions,
} from "../../src/components/systemActions/systemActions.store.js";
import {
  handleEmbeddedCloseClick,
  handleCommandLineSubmit,
  open,
} from "../../src/components/systemActions/systemActions.handlers.js";

describe("systemActions.handlers", () => {
  it("emits the full next action set when adding a new action", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const stopPropagation = () => {};

    updateActions(
      { state },
      {
        toggleAutoMode: {},
      },
    );

    const deps = {
      store: {
        selectAction: () => selectAction({ state }),
        updateActions: (payload) => updateActions({ state }, payload),
        hideActionsDialog: () => {},
      },
      render: () => {},
      dispatchEvent: (event) => {
        dispatchedEvents.push(event);
      },
    };

    handleCommandLineSubmit(deps, {
      _event: {
        stopPropagation,
        detail: {
          toggleSkipMode: {},
        },
      },
    });

    expect(selectAction({ state })).toEqual({
      toggleAutoMode: {},
      toggleSkipMode: {},
    });
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("actions-change");
    expect(dispatchedEvents[0].detail).toEqual({
      toggleAutoMode: {},
      toggleSkipMode: {},
    });
  });

  it("stops nested submit events from leaking to outer action editors", () => {
    const state = createInitialState();
    let stopPropagationCalled = false;

    const deps = {
      store: {
        selectAction: () => selectAction({ state }),
        updateActions: (payload) => updateActions({ state }, payload),
        hideActionsDialog: () => {},
      },
      render: () => {},
      dispatchEvent: () => {},
    };

    handleCommandLineSubmit(deps, {
      _event: {
        stopPropagation: () => {
          stopPropagationCalled = true;
        },
        detail: {
          updateVariable: {
            id: "updateVariable1",
            operations: [],
          },
        },
      },
    });

    expect(stopPropagationCalled).toBe(true);
    expect(selectAction({ state })).toEqual({
      updateVariable: {
        id: "updateVariable1",
        operations: [],
      },
    });
  });

  it("emits close from embedded system action editors", () => {
    const dispatchedEvents = [];
    let stopPropagationCalled = false;

    handleEmbeddedCloseClick(
      {
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {
            stopPropagationCalled = true;
          },
        },
      },
    );

    expect(stopPropagationCalled).toBe(true);
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].type).toBe("close");
  });

  it("resyncs local actions from props when opened", () => {
    const state = createInitialState();

    updateActions(
      { state },
      {
        toggleSkipMode: {},
      },
    );

    const deps = {
      props: {
        actions: {
          pushOverlay: {
            resourceId: "layout-settings",
          },
        },
      },
      store: {
        updateActions: (payload) => updateActions({ state }, payload),
        showActionsDialog: () => {},
        setMode: () => {},
      },
      render: () => {},
    };

    open(deps, {
      mode: "actions",
    });

    expect(selectAction({ state })).toEqual({
      pushOverlay: {
        resourceId: "layout-settings",
      },
    });
  });

  it("prefers explicit open actions over stale props actions", () => {
    const state = createInitialState();

    const deps = {
      props: {
        actions: {
          pushOverlay: {
            resourceId: "stale-layout",
          },
        },
      },
      store: {
        updateActions: (payload) => updateActions({ state }, payload),
        showActionsDialog: () => {},
        setMode: () => {},
      },
      render: () => {},
    };

    open(deps, {
      mode: "actions",
      actions: {
        pushOverlay: {
          resourceId: "fresh-layout",
        },
        updateVariable: {
          id: "updateVariable1",
          operations: [],
        },
      },
    });

    expect(selectAction({ state })).toEqual({
      pushOverlay: {
        resourceId: "fresh-layout",
      },
      updateVariable: {
        id: "updateVariable1",
        operations: [],
      },
    });
  });
});
