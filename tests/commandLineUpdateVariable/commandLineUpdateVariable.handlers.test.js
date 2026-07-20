import { describe, expect, it, vi } from "vitest";
import {
  createInitialState,
  selectOperationChangeData,
  selectOperationSaveData,
  selectSubmitData,
  selectVariableItemById,
  selectViewData,
  setTempOperation,
  setVariablesData,
} from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.store.js";
import {
  handleEnumValueSelectChange,
  handleOperationSelectChange,
  handleRoundToInputChange,
  handleSaveOperationClick,
  handleSubmitClick,
  handleVariableSelectChange,
} from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";
import { EN_I18N as i18n } from "../support/i18n.js";

const createStore = (state, overrides = {}) => ({
  selectOperationChangeData: () => selectOperationChangeData({ state }),
  selectOperationSaveData: () => selectOperationSaveData({ state }),
  selectSubmitData: () => selectSubmitData({ state }),
  selectVariableItemById: (payload) =>
    selectVariableItemById({ state }, payload),
  setTempOperation: (payload) => setTempOperation({ state }, payload),
  ...overrides,
});

describe("commandLineUpdateVariable.handlers", () => {
  it.each([
    ["string", ""],
    ["number", 1],
    ["boolean", false],
  ])(
    "defaults a %s variable to the set operation",
    (variableType, defaultValue) => {
      const state = createInitialState();

      setVariablesData(
        { state },
        {
          variables: {
            items: {
              selectedVariable: {
                id: "selectedVariable",
                type: "variable",
                variableType,
                name: "Selected Variable",
              },
            },
            tree: [],
          },
        },
      );
      setTempOperation(
        { state },
        {
          variableId: "",
          op: "",
          value: "",
        },
      );

      handleVariableSelectChange(
        {
          store: createStore(state),
          render: () => {},
        },
        {
          _event: {
            detail: {
              value: "selectedVariable",
            },
          },
        },
      );

      expect(state.tempOperation).toEqual({
        variableId: "selectedVariable",
        op: "set",
        value: defaultValue,
        roundTo: undefined,
      });
    },
  );

  it("shows variable type as select suffix text", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            saveLoadPagination: {
              id: "saveLoadPagination",
              type: "variable",
              variableType: "number",
              name: "Save/Load Pagination",
            },
          },
          tree: [],
        },
      },
    );

    expect(selectViewData({ state, i18n }).variableOptions).toEqual([
      {
        label: "Save/Load Pagination",
        value: "saveLoadPagination",
        suffixText: "number",
      },
    ]);
  });

  it("defaults enum variables to the first enum value", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              type: "variable",
              variableType: "string",
              name: "Mood",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [],
        },
      },
    );

    handleVariableSelectChange(
      {
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "mood",
          },
        },
      },
    );

    expect(state.tempOperation).toEqual({
      variableId: "mood",
      op: "set",
      value: "happy",
      roundTo: undefined,
    });
  });

  it("uses enum select view data for set operations on enum variables", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              type: "variable",
              variableType: "string",
              name: "Mood",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [],
        },
      },
    );
    setTempOperation(
      { state },
      {
        variableId: "mood",
        op: "set",
        value: "happy",
      },
    );

    expect(selectViewData({ state, i18n })).toMatchObject({
      showEnumValueSelect: true,
      enumValueOptions: [
        { value: "happy", label: "happy" },
        { value: "sad", label: "sad" },
      ],
      canSaveOperation: true,
    });

    setTempOperation(
      { state },
      {
        value: "angry",
      },
    );

    expect(selectViewData({ state, i18n }).canSaveOperation).toBe(false);
  });

  it("normalizes enum set operations to a selectable enum value", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            mood: {
              id: "mood",
              type: "variable",
              variableType: "string",
              name: "Mood",
              isEnum: true,
              enumValues: ["happy", "sad"],
            },
          },
          tree: [],
        },
      },
    );
    setTempOperation(
      { state },
      {
        variableId: "mood",
        op: "",
        value: "angry",
      },
    );

    handleOperationSelectChange(
      {
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "set",
          },
        },
      },
    );

    expect(state.tempOperation).toMatchObject({
      op: "set",
      value: "happy",
    });
  });

  it("updates enum values from the enum select", () => {
    const state = createInitialState();

    setTempOperation(
      { state },
      {
        variableId: "mood",
        op: "set",
        value: "happy",
      },
    );

    handleEnumValueSelectChange(
      {
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "sad",
          },
        },
      },
    );

    expect(state.tempOperation.value).toBe("sad");
  });

  it("shows roundTo for divide operations and updates it from input", () => {
    const state = createInitialState();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
            },
          },
          tree: [],
        },
      },
    );
    setTempOperation(
      { state },
      {
        variableId: "score",
        op: "",
        value: "10",
      },
    );

    handleOperationSelectChange(
      {
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "divide",
          },
        },
      },
    );

    expect(selectViewData({ state, i18n })).toMatchObject({
      showRoundToField: true,
      tempOperation: {
        roundToValue: 2,
      },
      canSaveOperation: true,
    });

    handleRoundToInputChange(
      {
        store: createStore(state),
        render: () => {},
      },
      {
        _event: {
          detail: {
            value: "4",
          },
        },
      },
    );

    expect(selectViewData({ state, i18n })).toMatchObject({
      tempOperation: {
        roundTo: "4",
        roundToValue: "4",
      },
      canSaveOperation: true,
    });
  });

  it("submits number operation values as numbers", () => {
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
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
            },
          },
          tree: [],
        },
      },
    );
    state.actionId = "updateScore";
    state.operations = [
      {
        id: "operation-1",
        variableId: "score",
        op: "increment",
        value: "5",
      },
    ];

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
    expect(dispatchedEvents[0].detail).toEqual({
      updateVariable: {
        id: "updateScore",
        operations: [
          {
            variableId: "score",
            op: "increment",
            value: 5,
          },
        ],
      },
    });
  });

  it("submits divide roundTo as a number", () => {
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
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
            },
          },
          tree: [],
        },
      },
    );
    state.actionId = "updateScore";
    state.operations = [
      {
        id: "operation-1",
        variableId: "score",
        op: "divide",
        value: "3",
        roundTo: "4",
      },
    ];

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
    expect(dispatchedEvents[0].detail).toEqual({
      updateVariable: {
        id: "updateScore",
        operations: [
          {
            variableId: "score",
            op: "divide",
            value: 3,
            roundTo: 4,
          },
        ],
      },
    });
  });

  it("saves number set operation values as numbers", () => {
    const state = createInitialState();
    const appService = {
      showAlert: vi.fn(),
    };
    const updateOperation = vi.fn();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
            },
          },
          tree: [],
        },
      },
    );
    state.currentEditingId = "operation-1";
    state.tempOperation = {
      variableId: "score",
      op: "set",
      value: "7",
    };

    handleSaveOperationClick(
      {
        appService,
        i18n,
        store: createStore(state, {
          updateOperation,
          setMode: vi.fn(),
          setCurrentEditingId: vi.fn(),
        }),
        render: vi.fn(),
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(updateOperation).toHaveBeenCalledWith({
      id: "operation-1",
      variableId: "score",
      op: "set",
      value: 7,
      roundTo: undefined,
    });
  });

  it("saves divide roundTo values as numbers", () => {
    const state = createInitialState();
    const appService = {
      showAlert: vi.fn(),
    };
    const updateOperation = vi.fn();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
            },
          },
          tree: [],
        },
      },
    );
    state.currentEditingId = "operation-1";
    state.tempOperation = {
      variableId: "score",
      op: "divide",
      value: "3",
      roundTo: "4",
    };

    handleSaveOperationClick(
      {
        appService,
        i18n,
        store: createStore(state, {
          updateOperation,
          setMode: vi.fn(),
          setCurrentEditingId: vi.fn(),
        }),
        render: vi.fn(),
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).not.toHaveBeenCalled();
    expect(updateOperation).toHaveBeenCalledWith({
      id: "operation-1",
      variableId: "score",
      op: "divide",
      value: 3,
      roundTo: 4,
    });
  });

  it("prevents saving invalid number operation values", () => {
    const state = createInitialState();
    const appService = {
      showAlert: vi.fn(),
    };
    const updateOperation = vi.fn();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
            },
          },
          tree: [],
        },
      },
    );
    state.currentEditingId = "operation-1";
    state.tempOperation = {
      variableId: "score",
      op: "set",
      value: "",
    };

    handleSaveOperationClick(
      {
        appService,
        i18n,
        store: createStore(state, {
          updateOperation,
          setMode: vi.fn(),
          setCurrentEditingId: vi.fn(),
        }),
        render: vi.fn(),
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Variable operation value is invalid.",
      title: "Warning",
    });
    expect(updateOperation).not.toHaveBeenCalled();
  });

  it("prevents saving invalid divide roundTo values", () => {
    const state = createInitialState();
    const appService = {
      showAlert: vi.fn(),
    };
    const updateOperation = vi.fn();

    setVariablesData(
      { state },
      {
        variables: {
          items: {
            score: {
              id: "score",
              type: "variable",
              variableType: "number",
              name: "Score",
            },
          },
          tree: [],
        },
      },
    );
    state.currentEditingId = "operation-1";
    state.tempOperation = {
      variableId: "score",
      op: "divide",
      value: "3",
      roundTo: "1.5",
    };

    handleSaveOperationClick(
      {
        appService,
        i18n,
        store: createStore(state, {
          updateOperation,
          setMode: vi.fn(),
          setCurrentEditingId: vi.fn(),
        }),
        render: vi.fn(),
      },
      {
        _event: {
          stopPropagation: () => {},
        },
      },
    );

    expect(appService.showAlert).toHaveBeenCalledWith({
      message: "Variable operation value is invalid.",
      title: "Warning",
    });
    expect(updateOperation).not.toHaveBeenCalled();
  });
});
