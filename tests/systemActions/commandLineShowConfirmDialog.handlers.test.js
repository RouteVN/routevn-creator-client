import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  setCancelActions,
  setConfirmActions,
} from "../../src/components/commandLineShowConfirmDialog/commandLineShowConfirmDialog.store.js";
import {
  handleCancelActionsChange,
  handleCancelActionsDelete,
  handleConfirmActionsChange,
  handleConfirmActionsDelete,
} from "../../src/components/commandLineShowConfirmDialog/commandLineShowConfirmDialog.handlers.js";

const createDeps = () => {
  const state = createInitialState();

  return {
    state,
    store: {
      getState: () => state,
      setConfirmActions: (payload) => setConfirmActions({ state }, payload),
      setCancelActions: (payload) => setCancelActions({ state }, payload),
    },
    render: vi.fn(),
  };
};

describe("commandLineShowConfirmDialog.handlers", () => {
  it("merges confirm actions instead of replacing the existing set", () => {
    const deps = createDeps();

    setConfirmActions(
      { state: deps.state },
      {
        actions: {
          toggleAutoMode: {},
        },
      },
    );

    handleConfirmActionsChange(deps, {
      _event: {
        detail: {
          toggleSkipMode: {},
        },
      },
    });

    expect(deps.state.confirmActions).toEqual({
      toggleAutoMode: {},
      toggleSkipMode: {},
    });
  });

  it("merges cancel actions instead of replacing the existing set", () => {
    const deps = createDeps();

    setCancelActions(
      { state: deps.state },
      {
        actions: {
          popOverlay: {},
        },
      },
    );

    handleCancelActionsChange(deps, {
      _event: {
        detail: {
          hideConfirmDialog: {},
        },
      },
    });

    expect(deps.state.cancelActions).toEqual({
      popOverlay: {},
      hideConfirmDialog: {},
    });
  });

  it("deletes a nested confirm action by action type", () => {
    const deps = createDeps();

    setConfirmActions(
      { state: deps.state },
      {
        actions: {
          toggleAutoMode: {},
          toggleSkipMode: {},
        },
      },
    );

    handleConfirmActionsDelete(deps, {
      _event: {
        detail: {
          actionType: "toggleAutoMode",
        },
      },
    });

    expect(deps.state.confirmActions).toEqual({
      toggleSkipMode: {},
    });
  });

  it("deletes a nested cancel action by action type", () => {
    const deps = createDeps();

    setCancelActions(
      { state: deps.state },
      {
        actions: {
          popOverlay: {},
          hideConfirmDialog: {},
        },
      },
    );

    handleCancelActionsDelete(deps, {
      _event: {
        detail: {
          actionType: "popOverlay",
        },
      },
    });

    expect(deps.state.cancelActions).toEqual({
      hideConfirmDialog: {},
    });
  });
});
