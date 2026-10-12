import { describe, expect, it, vi } from "vitest";
import * as storeModule from "../../src/components/commandLineShowConfirmDialog/commandLineShowConfirmDialog.store.js";
import {
  handleCancelActionsChange,
  handleCancelActionsDelete,
  handleConfirmActionsChange,
  handleConfirmActionsDelete,
} from "../../src/components/commandLineShowConfirmDialog/commandLineShowConfirmDialog.handlers.js";

// The real store module's selectors and actions, bound to a plain state.
const bindStore = (state) =>
  Object.fromEntries(
    Object.entries(storeModule)
      .filter(([, value]) => typeof value === "function")
      .map(([name, fn]) => [name, (payload) => fn({ state }, payload)]),
  );

const createDeps = () => {
  const state = storeModule.createInitialState();

  return {
    state,
    store: bindStore(state),
    render: vi.fn(),
  };
};

describe("commandLineShowConfirmDialog.handlers", () => {
  it("merges confirm actions instead of replacing the existing set", () => {
    const deps = createDeps();

    deps.store.setConfirmActions({
      actions: {
        toggleAutoMode: {},
      },
    });

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

    deps.store.setCancelActions({
      actions: {
        popOverlay: {},
      },
    });

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

    deps.store.setConfirmActions({
      actions: {
        toggleAutoMode: {},
        toggleSkipMode: {},
      },
    });

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

    deps.store.setCancelActions({
      actions: {
        popOverlay: {},
        hideConfirmDialog: {},
      },
    });

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
