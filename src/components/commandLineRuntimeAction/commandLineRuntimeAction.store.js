import {
  createRuntimeActionDefaultValues,
  createRuntimeActionForm,
  getRuntimeActionDefinition,
} from "../../internal/runtimeActions.js";
import {
  localizeCommandLineBreadcrumb,
  localizeCommandLineForm,
  localizeCommandLineText,
  selectCommandLineCopy,
} from "../../internal/ui/sceneEditor/commandLineCopy.js";

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

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCommandLineCopy(i18n);
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
  const form = createRuntimeActionForm(state.mode);
  const submitButton = form?.actions?.buttons?.find(
    (button) => button.id === "submit",
  );

  if (form) {
    form.actions = undefined;
  }

  return {
    breadcrumb: localizeCommandLineBreadcrumb(breadcrumb, copy),
    form: localizeCommandLineForm(form, copy),
    defaultValues,
    context: {
      values: defaultValues,
    },
    formKey: `${state.mode}-${valueSource}`,
    submitLabel: localizeCommandLineText(submitButton?.label ?? "Submit", copy),
  };
};
