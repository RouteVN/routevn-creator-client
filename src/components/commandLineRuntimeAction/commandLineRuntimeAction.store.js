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

export const selectSubmitData = ({ state }) => ({
  mode: state.mode,
  action: state.action,
  formValues: state.formValues,
});

// The form's values over the action's defaults. The form leaves out a field
// it hides, so a field that shows again, such as the predefined value after
// Custom, still has a value.
export const selectResolvedFormValues = ({ state }) => ({
  ...createRuntimeActionDefaultValues(state.mode, state.action),
  ...state.formValues,
});

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

  const defaultValues = selectResolvedFormValues({ state });
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
    // The fields that show depend on these, and the form fills a field only
    // when it mounts.
    formKey: [state.mode, valueSource, defaultValues.valueChoice]
      .filter(Boolean)
      .join("-"),
    submitLabel: localizeCommandLineText(submitButton?.label ?? "Submit", copy),
  };
};
