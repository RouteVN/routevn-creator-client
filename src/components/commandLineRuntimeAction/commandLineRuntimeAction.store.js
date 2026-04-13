import {
  createRuntimeActionDefaultValues,
  createRuntimeActionForm,
  getRuntimeActionDefinition,
} from "../../internal/runtimeActions.js";

export const createInitialState = () => ({
  mode: "",
  action: {},
  formValues: {},
});

export const setMode = ({ state }, { mode } = {}) => {
  state.mode = mode ?? "";
};

export const setAction = ({ state }, { action } = {}) => {
  state.action = action ?? {};
};

export const setFormValues = ({ state }, { values } = {}) => {
  state.formValues = values ?? {};
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

  const defaultValues =
    Object.keys(state.formValues || {}).length > 0
      ? state.formValues
      : createRuntimeActionDefaultValues(state.mode, state.action);
  const valueSource = defaultValues.valueSource ?? "fixed";

  return {
    breadcrumb,
    form: createRuntimeActionForm(state.mode),
    defaultValues,
    context: {
      values: defaultValues,
    },
    formKey: `${state.mode}-${valueSource}`,
  };
};
