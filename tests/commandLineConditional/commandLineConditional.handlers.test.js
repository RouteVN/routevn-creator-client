import { describe, expect, it, vi } from "vitest";
import {
  createDefaultBranchDraft,
  createInitialState,
  deleteBranch,
  hideDropdownMenu,
  moveBranch,
  resetTempBranch,
  selectBranches,
  selectDefaultBranch,
  selectDropdownMenuBranchId,
  selectSaveBranchDraft,
  selectVariableItemById,
  selectVariablesData,
  setBranches,
  setCurrentBranchId,
  setMode,
  setTempBranch,
  setVariablesData,
  showDropdownMenu,
  updateBranch,
} from "../../src/components/commandLineConditional/commandLineConditional.store.js";
import {
  handleAddOneOfValueClick,
  handleAddDefaultClick,
  handleBranchClick,
  handleBranchMenuButtonClick,
  handleBranchMenuButtonKeyDown,
  handleDropdownMenuClickItem,
  handleEnumValueSelectChange,
  handleOneOfValueChange,
  handleOperatorSelectChange,
  handleRemoveOneOfValueClick,
  handleSaveBranchClick,
  handleSubmitClick,
  handleVariableSelectChange,
} from "../../src/components/commandLineConditional/commandLineConditional.handlers.js";
import { EN_I18N as i18n } from "../support/i18n.js";

const createStore = (state) => ({
  createDefaultBranchDraft: (payload) =>
    createDefaultBranchDraft({ state }, payload),
  deleteBranch: (payload) => deleteBranch({ state }, payload),
  getState: () => state,
  hideDropdownMenu: (payload) => hideDropdownMenu({ state }, payload),
  moveBranch: (payload) => moveBranch({ state }, payload),
  resetTempBranch: (payload) => resetTempBranch({ state }, payload),
  selectBranches: () => selectBranches({ state }),
  selectDefaultBranch: () => selectDefaultBranch({ state }),
  selectDropdownMenuBranchId: () => selectDropdownMenuBranchId({ state }),
  selectSaveBranchDraft: () => selectSaveBranchDraft({ state }),
  selectVariableItemById: (payload) =>
    selectVariableItemById({ state }, payload),
  selectVariablesData: () => selectVariablesData({ state }),
  setCurrentBranchId: (payload) => setCurrentBranchId({ state }, payload),
  setMode: (payload) => setMode({ state }, payload),
  setTempBranch: (payload) => setTempBranch({ state }, payload),
  showDropdownMenu: (payload) => showDropdownMenu({ state }, payload),
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
              type: "variable",
              variableType: "number",
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
        op: "eq",
        value: "70",
        actions: {
          nextLine: {},
        },
      },
    );

    handleSaveBranchClick(
      {
        appService,
        i18n,
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
        i18n,
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
              eq: [{ var: "variables.trust" }, 70],
            },
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    });
  });

  it.each(["gt", "gte", "lt", "lte"])(
    "saves the %s operator for number variables",
    (op) => {
      const state = createInitialState();
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
                type: "variable",
                variableType: "number",
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
          op,
          value: "70.5",
          actions: {
            nextLine: {},
          },
        },
      );

      handleSaveBranchClick(
        {
          appService,
          i18n,
          store: createStore(state),
          render: () => {},
        },
        {
          _event: {
            stopPropagation: () => {},
          },
        },
      );

      expect(appService.showAlert).not.toHaveBeenCalled();
      expect(state.branches[0]).toMatchObject({
        when: {
          [op]: [{ var: "variables.trust" }, 70.5],
        },
      });
    },
  );

  it.each([
    ["string", ["north", "south"], ["north", "south"]],
    ["number", ["1.5", 2], [1.5, 2]],
    ["boolean", [true, false], [true, false]],
  ])(
    "saves one-of conditions for %s variables",
    (variableType, values, expectedValues) => {
      const state = createInitialState();
      const appService = {
        showAlert: vi.fn(),
      };

      setVariablesData(
        { state },
        {
          variables: {
            items: {
              route: {
                id: "route",
                name: "Route",
                type: "variable",
                variableType,
              },
            },
            tree: [{ id: "route" }],
          },
        },
      );
      setTempBranch(
        { state },
        {
          conditionKind: "variable",
          variableId: "route",
          op: "in",
          value: values,
          actions: {
            nextLine: {},
          },
        },
      );

      handleSaveBranchClick(
        {
          appService,
          i18n,
          store: createStore(state),
          render: () => {},
        },
        {
          _event: {
            stopPropagation: () => {},
          },
        },
      );

      expect(appService.showAlert).not.toHaveBeenCalled();
      expect(state.branches[0]).toMatchObject({
        when: {
          in: [{ var: "variables.route" }, { literal: expectedValues }],
        },
      });
    },
  );

  it("loads a saved one-of condition for editing", () => {
    const state = createInitialState();
    const store = createStore(state);

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            route: {
              id: "route",
              name: "Route",
              type: "variable",
              variableType: "string",
            },
          },
          tree: [{ id: "route" }],
        },
      },
    );
    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-route",
            when: {
              in: [{ var: "variables.route" }, { literal: ["north", "south"] }],
            },
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    );

    handleBranchClick(
      { store, render: () => {} },
      {
        _event: {
          currentTarget: {
            dataset: { branchId: "branch-route" },
          },
        },
      },
    );

    expect(state.tempBranch).toMatchObject({
      conditionKind: "variable",
      variableId: "route",
      op: "in",
      value: ["north", "south"],
    });
  });

  it("adds, edits, and removes one-of values", () => {
    const state = createInitialState();
    const store = createStore(state);

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            trust: {
              id: "trust",
              name: "Trust",
              type: "variable",
              variableType: "number",
            },
          },
          tree: [{ id: "trust" }],
        },
      },
    );
    setTempBranch({ state }, { variableId: "trust", value: 1 });

    handleOperatorSelectChange(
      { store, render: () => {} },
      { _event: { detail: { value: "in" } } },
    );
    handleAddOneOfValueClick(
      { store, render: () => {} },
      { _event: { stopPropagation: () => {} } },
    );
    handleOneOfValueChange(
      { store, render: () => {} },
      {
        _event: {
          currentTarget: { dataset: { index: "1" } },
          detail: { value: 2 },
        },
      },
    );
    handleRemoveOneOfValueClick(
      { store, render: () => {} },
      {
        _event: {
          stopPropagation: () => {},
          currentTarget: { dataset: { index: "0" } },
        },
      },
    );

    expect(state.tempBranch).toMatchObject({
      op: "in",
      value: [2],
    });
  });

  it("loads a saved number ordering condition for editing", () => {
    const state = createInitialState();
    const store = createStore(state);

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            trust: {
              id: "trust",
              name: "Trust",
              type: "variable",
              variableType: "number",
            },
          },
          tree: [{ id: "trust" }],
        },
      },
    );
    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-gte",
            when: {
              gte: [{ var: "variables.trust" }, 70],
            },
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    );

    handleBranchClick(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              branchId: "branch-gte",
            },
          },
        },
      },
    );

    expect(state.tempBranch).toMatchObject({
      conditionKind: "variable",
      variableId: "trust",
      op: "gte",
      value: 70,
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
        i18n,
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
        i18n,
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

  it("preserves unsupported branch conditions when editing branch actions", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };
    const store = createStore(state);
    const unsupportedWhen = {
      all: [
        {
          gt: [{ var: "variables.trust" }, 70],
        },
      ],
    };

    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-unsupported",
            when: unsupportedWhen,
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    );

    handleBranchClick(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          currentTarget: {
            dataset: {
              branchId: "branch-unsupported",
            },
          },
        },
      },
    );
    setTempBranch(
      { state },
      {
        actions: {
          updateVariable: {
            variableId: "trust",
            value: 80,
          },
        },
      },
    );
    handleSaveBranchClick(
      {
        appService,
        i18n,
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
        i18n,
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

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            when: unsupportedWhen,
            actions: {
              updateVariable: {
                variableId: "trust",
                value: 80,
              },
            },
          },
        ],
      },
    });
  });

  it("submits enum branches using a selected enum value", () => {
    const state = createInitialState();
    const dispatchedEvents = [];
    const appService = {
      showAlert: vi.fn(),
    };
    const store = createStore(state);

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              name: "Mood",
              type: "variable",
              variableType: "string",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [{ id: "mood" }],
        },
      },
    );

    handleVariableSelectChange(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          detail: { value: "mood" },
        },
      },
    );
    handleEnumValueSelectChange(
      {
        store,
        render: () => {},
      },
      {
        _event: {
          detail: { value: "sad" },
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
        i18n,
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
        i18n,
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

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(dispatchedEvents[0].detail).toEqual({
      conditional: {
        branches: [
          {
            when: {
              eq: [{ var: "variables.mood" }, "sad"],
            },
            actions: {
              nextLine: {},
            },
          },
        ],
      },
    });
  });

  it("rejects number ordering operators for non-number variables", () => {
    const state = createInitialState();
    const appService = {
      showAlert: vi.fn(),
    };

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            route: {
              id: "route",
              name: "Route",
              type: "variable",
              variableType: "string",
            },
          },
          tree: [{ id: "route" }],
        },
      },
    );
    setTempBranch(
      { state },
      {
        conditionKind: "variable",
        variableId: "route",
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
        i18n,
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Condition operator is unsupported.",
      title: "Warning",
    });
    expect(state.branches).toEqual([]);
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
            when: {
              eq: [{ var: "variables.trust" }, 70],
            },
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
        i18n,
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

  it.each([
    ["move-up", ["branch-2", "branch-1", "branch-3", "branch-default"]],
    ["move-down", ["branch-1", "branch-3", "branch-2", "branch-default"]],
  ])("handles the %s branch menu action", (menuAction, expectedIds) => {
    const state = createInitialState();
    const render = vi.fn();
    const createConditionBranch = (id) => ({
      id,
      when: {
        eq: [{ var: "variables.trust" }, id],
      },
      actions: {},
    });

    setBranches(
      { state },
      {
        branches: [
          createConditionBranch("branch-1"),
          createConditionBranch("branch-2"),
          createConditionBranch("branch-3"),
          { id: "branch-default", actions: {} },
        ],
      },
    );
    showDropdownMenu(
      { state },
      { branchId: "branch-2", position: { x: 10, y: 20 } },
    );

    handleDropdownMenuClickItem(
      { store: createStore(state), render },
      {
        _event: {
          detail: {
            item: { value: menuAction },
          },
        },
      },
    );

    expect(state.branches.map((branch) => branch.id)).toEqual(expectedIds);
    expect(state.dropdownMenu.isOpen).toBe(false);
    expect(render).toHaveBeenCalledOnce();
  });

  it("opens the branch menu from its button", () => {
    const state = createInitialState();
    const store = createStore(state);
    const render = vi.fn();
    const stopPropagation = vi.fn();
    const createConditionBranch = (id) => ({
      id,
      when: {
        eq: [{ var: "variables.trust" }, id],
      },
      actions: {},
    });

    setBranches(
      { state },
      {
        branches: [
          createConditionBranch("branch-1"),
          createConditionBranch("branch-2"),
        ],
      },
    );
    const currentTarget = {
      dataset: { branchId: "branch-2" },
      getBoundingClientRect: () => ({ right: 320, bottom: 240 }),
    };

    handleBranchMenuButtonClick(
      { store, render },
      {
        _event: {
          currentTarget,
          stopPropagation,
        },
      },
    );

    expect(state.dropdownMenu).toMatchObject({
      isOpen: true,
      branchId: "branch-2",
      position: { x: 320, y: 240 },
    });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });

  it("repeatedly moves and deletes the same branch with keyboard shortcuts", () => {
    const state = createInitialState();
    const store = createStore(state);
    const render = vi.fn();
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();
    const createConditionBranch = (id) => ({
      id,
      when: {
        eq: [{ var: "variables.trust" }, id],
      },
      actions: {},
    });

    setBranches(
      { state },
      {
        branches: [
          createConditionBranch("branch-1"),
          createConditionBranch("branch-2"),
          createConditionBranch("branch-3"),
        ],
      },
    );
    const currentTarget = {
      dataset: { branchId: "branch-3" },
    };
    const pressShortcut = (key) => {
      handleBranchMenuButtonKeyDown(
        { store, render },
        {
          _event: {
            key,
            currentTarget,
            preventDefault,
            stopPropagation,
          },
        },
      );
    };

    pressShortcut("ArrowUp");
    pressShortcut("ArrowUp");

    expect(state.branches.map((branch) => branch.id)).toEqual([
      "branch-3",
      "branch-1",
      "branch-2",
    ]);

    pressShortcut("Delete");

    expect(state.branches.map((branch) => branch.id)).toEqual([
      "branch-1",
      "branch-2",
    ]);
    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(stopPropagation).toHaveBeenCalledTimes(3);
    expect(render).toHaveBeenCalledTimes(3);
  });

  it("deletes the default branch with its keyboard shortcut", () => {
    const state = createInitialState();
    const store = createStore(state);
    const render = vi.fn();
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();

    setBranches(
      { state },
      {
        branches: [
          {
            id: "branch-1",
            when: {
              eq: [{ var: "variables.trust" }, 70],
            },
            actions: {},
          },
          { id: "branch-default", actions: {} },
        ],
      },
    );

    handleBranchMenuButtonKeyDown(
      { store, render },
      {
        _event: {
          key: "Delete",
          currentTarget: {
            dataset: { branchId: "branch-default" },
          },
          preventDefault,
          stopPropagation,
        },
      },
    );

    expect(state.branches.map((branch) => branch.id)).toEqual(["branch-1"]);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
  });
});
