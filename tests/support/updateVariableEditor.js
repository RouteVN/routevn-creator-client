// Mounts the Update Variable editor with its real store and handlers, as the
// actions dialog does, and drives it the way its controls do.
import { vi } from "vitest";
import * as updateVariableHandlers from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.handlers.js";
import * as updateVariableStore from "../../src/components/commandLineUpdateVariable/commandLineUpdateVariable.store.js";
import { EN_I18N } from "./i18n.js";
import { mountHandlers } from "./mountHandlers.js";
import { withSelectors } from "./storeFake.js";

export const VARIABLE_ITEMS = {
  dice: {
    id: "dice",
    type: "variable",
    name: "Dice",
    variableType: "number",
    scope: "context",
    default: 0,
    value: 0,
  },
  lucky: {
    id: "lucky",
    type: "variable",
    name: "Lucky",
    variableType: "boolean",
    scope: "context",
    default: true,
    value: true,
  },
  weather: {
    id: "weather",
    type: "variable",
    name: "Weather",
    variableType: "string",
    scope: "context",
    default: "",
    value: "",
  },
  mood: {
    id: "mood",
    type: "variable",
    name: "Mood",
    variableType: "string",
    isEnum: true,
    enumValues: ["happy", "sad", "calm"],
    scope: "context",
    default: "happy",
    value: "happy",
  },
  data: {
    id: "data",
    type: "variable",
    name: "Data",
    variableType: "object",
    scope: "context",
    default: {},
    value: {},
  },
};

export const createVariables = () => ({
  items: structuredClone(VARIABLE_ITEMS),
  tree: Object.keys(VARIABLE_ITEMS).map((id) => ({ id })),
});

// Binds the real store actions and selectors to a plain state.
const createStore = (state) => {
  const actions = Object.fromEntries(
    Object.entries(updateVariableStore)
      .filter(
        ([name]) => !name.startsWith("select") && name !== "createInitialState",
      )
      .map(([name, action]) => [name, (payload) => action({ state }, payload)]),
  );
  return withSelectors(
    { getState: () => state, ...actions },
    updateVariableStore,
  );
};

export const mountEditor = async (
  updateVariable,
  { i18n = EN_I18N, variables = createVariables() } = {},
) => {
  const state = updateVariableStore.createInitialState();
  const dispatchedEvents = [];
  const deps = {
    appService: { showAlert: vi.fn() },
    dispatchEvent: (event) => dispatchedEvents.push(event),
    i18n,
    props: { updateVariable },
    projectService: {
      getRepository: async () => ({ getState: () => ({ variables }) }),
    },
    render: vi.fn(),
    store: createStore(state),
  };

  await mountHandlers(updateVariableHandlers, deps).afterMount;
  return { deps, dispatchedEvents, state };
};

export const clickEvent = () => ({ _event: { stopPropagation: vi.fn() } });

export const valueEvent = (value) => ({ _event: { detail: { value } } });

// An event from a control of the random value row with this id.
export const rowEvent = (valueId, value) => ({
  _event: {
    currentTarget: { dataset: { valueId } },
    detail: { value },
    stopPropagation: vi.fn(),
  },
});

export const operationEvent = (operationId) => ({
  _event: { currentTarget: { dataset: { operationId } } },
});

// Adds an operation and picks the variable and the Random operation.
export const startRandomOperation = (deps, variableId) => {
  const {
    handleAddOperationClick,
    handleOperationSelectChange,
    handleVariableSelectChange,
  } = updateVariableHandlers;
  handleAddOperationClick(deps, clickEvent());
  handleVariableSelectChange(deps, valueEvent(variableId));
  handleOperationSelectChange(deps, valueEvent("random"));
};

export const randomValueIds = (state) =>
  state.tempOperation.random.values.map((entry) => entry.id);

export const randomValues = (state) =>
  state.tempOperation.random.values.map(({ value, weight }) => ({
    value,
    weight,
  }));

export const submittedOperations = (dispatchedEvents) =>
  dispatchedEvents.at(-1).detail.updateVariable.operations;
