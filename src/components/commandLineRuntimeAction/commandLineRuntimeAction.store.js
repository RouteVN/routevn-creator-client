import {
  createRuntimeActionDefaultValues,
  createRuntimeActionForm,
  getRuntimeActionDefinition,
} from "../../internal/runtimeActions.js";

export const createInitialState = () => ({
  mode: "",
  action: {},
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode ?? "";
};

export const setAction = ({ state }, { action } = {}) => {
  state.action = action ?? {};
};

export const selectViewData = ({ state }) => {
  const definition = getRuntimeActionDefinition(state.mode);
  const breadcrumb = [
    {
      id: "actions",
      label: "Actions",
      click: true,
    },
    {
      label: definition?.label ?? "Runtime Action",
    },
  ];

  return {
    breadcrumb,
    form: createRuntimeActionForm(state.mode),
    defaultValues: createRuntimeActionDefaultValues(state.mode, state.action),
  };
};
