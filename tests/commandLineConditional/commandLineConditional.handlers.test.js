import { describe, expect, it, vi } from "vitest";
import {
  createDefaultBranchDraft,
  createInitialState,
  resetTempBranch,
  selectBranches,
  selectDefaultBranch,
  setBranches,
  setCurrentBranchId,
  setMode,
  setTempBranch,
  setVariablesData,
  updateBranch,
} from "../../src/components/commandLineConditional/commandLineConditional.store.js";
import {
  handleAddDefaultClick,
  handleSaveBranchClick,
  handleSubmitClick,
} from "../../src/components/commandLineConditional/commandLineConditional.handlers.js";

const createStore = (state) => ({
  createDefaultBranchDraft: (payload) =>
    createDefaultBranchDraft({ state }, payload),
  getState: () => state,
  resetTempBranch: (payload) => resetTempBranch({ state }, payload),
  selectBranches: () => selectBranches({ state }),
  selectDefaultBranch: () => selectDefaultBranch({ state }),
  setCurrentBranchId: (payload) => setCurrentBranchId({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  setTempBranch: (payload) => setTempBranch({ state }, payload),
  updateBranch: (payload) => updateBranch({ state }, payload),
});

describe("commandLineConditional.handlers", () => {
  it("submits variable branches using the route engine conditional shape", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            trust: {
              id: "trust",
              name: "Trust",
              type: "number",
            },
          },
          tree: [{ id: "trust" }],
        },
      },
    );
    setTempBranch(
      { state },
      {
        conditionKind: "variable",
        variableId: "trust",
        op: "gte",
        value: "70",
        actions: {
          nextLine: {},
        },
      },
    );

    handleSaveBranchClick(
      {
        appService,
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    handleSubmitClick(
      {
        appService,
        store: createStore(state),
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(dispatchedEvents).toHaveLength(1);
    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    });
  });

  it("submits a default branch without a condition", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };
    const store = createStore(state);

    handleAddDefaultClick(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    setTempBranch(
      { state },
      {
        actions: {
          nextLine: {},
        },
      },
    );
    handleSaveBranchClick(
      {
        appService,
        store,
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );
    handleSubmitClick(
      {
        appService,
        store,
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    });
  });

  it("rejects default branches before the final branch", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };

    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-1",
            actions: {
              nextLine: {},
            },
          },
          {
            id: "branch-2",
            when: "variables.trust >= 70",
            actions: {
              sectionTransition: {
                sceneId: "scene-2",
                sectionId: "section-2",
              },
            },
          },
        ],
      },
    );

    handleSubmitClick(
      {
        appService,
        store: createStore(state),
        dispatchEvent: (event) => {
          dispatchedEvents.push(event);
        },
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "The default branch must be the last branch.",
      title: "Warning",
    });
    expect(dispatchedEvents).toEqual([]);
  });
});
