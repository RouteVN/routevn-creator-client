import {
  createProjectResolutionFormValues,
  CUSTOM_PROJECT_RESOLUTION_PRESET,
  PROJECT_RESOLUTION_OPTIONS,
} from "../../internal/projectResolution.js";

const createCreateProjectDefaultValues = (values = {}) => {
  const preset =
    typeof values.resolution === "string" && values.resolution.length > 0
      ? values.resolution
      : undefined;
  const nextValues = {
    name: values.name ?? "",
    description: values.description ?? "",
    projectPath: values.projectPath ?? "",
    template: values.template ?? "default",
    ...createProjectResolutionFormValues(preset),
  };

  if (nextValues.resolution === CUSTOM_PROJECT_RESOLUTION_PRESET) {
    nextValues.resolutionWidth =
      values.resolutionWidth ?? nextValues.resolutionWidth;
    nextValues.resolutionHeight =
      values.resolutionHeight ?? nextValues.resolutionHeight;
  }

  return nextValues;
};

const form = {
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Project Name",
      required: true,
      testId: "project-name-input",
      validations: [
        {
          rule: /^.+$/,
          message: "Name is required",
        },
      ],
    },
    {
      name: "description",
      type: "input-text",
      label: "Description",
      description: "Enter a brief description of the project",
      required: true,
      testId: "project-description-input",
      validations: [
        {
          rule: /^.+$/,
          message: "Description is required",
        },
      ],
    },
    {
      name: "resolution",
      type: "select",
      label: "Resolution",
      required: true,
      options: PROJECT_RESOLUTION_OPTIONS,
    },
    {
      $when: "values.resolution == 'custom'",
      name: "resolutionWidth",
      type: "input-number",
      label: "Resolution Width",
      required: true,
      min: 1,
      step: 1,
    },
    {
      $when: "values.resolution == 'custom'",
      name: "resolutionHeight",
      type: "input-number",
      label: "Resolution Height",
      required: true,
      min: 1,
      step: 1,
    },
    {
      $when: "platform == 'tauri'",
      name: "projectPath",
      type: "slot",
      slot: "project-path-selector",
      label: "Project Location",
      required: true,
    },
  ],
};

export const createInitialState = () => ({
  platform: "tauri",
  formKey: 0,
  defaultValues: createCreateProjectDefaultValues(),
  validationErrors: {},
});

export const syncFromProps = ({ state }, { props } = {}) => {
  state.platform = props?.platform === "web" ? "web" : "tauri";
  state.formKey += 1;
  state.defaultValues = createCreateProjectDefaultValues(props?.defaultValues);
  state.validationErrors = {};
};

export const updateFormValues = (
  { state },
  { values, shouldRemount = false } = {},
) => {
  if (values) {
    Object.assign(state.defaultValues, values);
  }

  if (shouldRemount) {
    state.formKey += 1;
  }
};

export const setProjectPath = ({ state }, { path } = {}) => {
  state.defaultValues.projectPath = path ?? "";
  delete state.validationErrors.projectPath;
};

export const setValidationErrors = ({ state }, { errors } = {}) => {
  state.validationErrors = errors ?? {};
};

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};

export const selectProjectPath = ({ state }) => {
  return state.defaultValues.projectPath ?? "";
};

export const selectPlatform = ({ state }) => {
  return state.platform;
};

export const selectViewData = ({ state }) => {
  return {
    platform: state.platform,
    form,
    formKey: `${state.formKey}-${state.defaultValues.resolution}`,
    defaultValues: state.defaultValues,
    projectPathDisplay: state.defaultValues.projectPath || "No folder selected",
    validationErrors: state.validationErrors,
    context: {
      platform: state.platform,
      values: state.defaultValues,
    },
  };
};
