import {
  createProjectResolutionFormValues,
  CUSTOM_PROJECT_RESOLUTION_PRESET,
  DEFAULT_PROJECT_RESOLUTION_PRESET,
  PROJECT_RESOLUTION_OPTIONS,
} from "../../internal/projectResolution.js";
import { DEFAULT_PROJECT_LANGUAGE } from "../../internal/projectLanguage.js";
import {
  createProjectLanguageOptions,
  selectProjectLanguageCopy,
} from "../../internal/ui/projectLanguage.js";

const CREATE_PROJECT_RESOLUTION_OPTIONS = PROJECT_RESOLUTION_OPTIONS.filter(
  ({ value }) =>
    value === DEFAULT_PROJECT_RESOLUTION_PRESET ||
    value === CUSTOM_PROJECT_RESOLUTION_PRESET,
);

const createCreateProjectDefaultValues = (values = {}) => {
  const preset =
    typeof values.resolution === "string" && values.resolution.length > 0
      ? values.resolution
      : undefined;
  const nextValues = {
    name: values.name ?? "",
    description: values.description ?? "",
    language: values.language ?? DEFAULT_PROJECT_LANGUAGE,
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
  title: "Create Project",
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
      testId: "project-description-input",
    },
    {
      name: "language",
      type: "select",
      label: "Project Language",
      description:
        "This language determines whether writing goals use word or character counts.",
      required: true,
      clearable: false,
      options: [],
    },
    {
      name: "projectIcon",
      type: "slot",
      slot: "project-icon-selector",
      label: "Project Icon",
    },
    {
      name: "resolution",
      type: "select",
      label: "Resolution",
      description: "Choose the project resolution.",
      required: true,
      clearable: false,
      options: CREATE_PROJECT_RESOLUTION_OPTIONS,
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
      description: "Select an empty folder for the project",
      required: true,
    },
  ],
};

const selectCopy = (i18n = {}) => {
  if (!i18n.projectsPage) {
    throw new Error("projectsPage i18n catalog is required.");
  }

  return i18n.projectsPage;
};

const createLocalizedForm = (copy = {}, projectLanguageCopy, i18n) => ({
  ...form,
  title: copy.createProjectTitle,
  fields: form.fields.map((field) => {
    if (field.name === "name") {
      return {
        ...field,
        label: copy.projectNameLabel,
        validations: [
          {
            ...field.validations[0],
            message: copy.projectNameRequiredMessage,
          },
        ],
      };
    }

    if (field.name === "description") {
      return {
        ...field,
        label: copy.descriptionLabel,
      };
    }

    if (field.name === "language") {
      return {
        ...field,
        label: projectLanguageCopy.label,
        description: projectLanguageCopy.description,
        searchable: true,
        searchPlaceholder: projectLanguageCopy.searchPlaceholder,
        emptySearchLabel: projectLanguageCopy.emptySearchLabel,
        options: createProjectLanguageOptions(i18n),
      };
    }

    if (field.name === "projectIcon") {
      return {
        ...field,
        label: copy.projectIconLabel,
      };
    }

    if (field.name === "resolution") {
      return {
        ...field,
        label: copy.resolutionLabel,
        description: copy.projectResolutionDescription,
      };
    }

    if (field.name === "resolutionWidth") {
      return {
        ...field,
        label: copy.resolutionWidthLabel,
      };
    }

    if (field.name === "resolutionHeight") {
      return {
        ...field,
        label: copy.resolutionHeightLabel,
      };
    }

    if (field.name === "projectPath") {
      return {
        ...field,
        label: copy.projectLocationLabel,
        description: copy.projectLocationDescription,
      };
    }

    return field;
  }),
});

export const createInitialState = () => ({
  platform: "tauri",
  formKey: 0,
  defaultValues: createCreateProjectDefaultValues(),
  validationErrors: {},
  iconFile: undefined,
  iconPreviewUrl: undefined,
  isIconCropDialogOpen: false,
  iconCropFile: undefined,
});

export const syncFromProps = ({ state }, { props } = {}) => {
  state.platform =
    props?.platform === "tauri"
      ? "tauri"
      : props?.platform === "android" || props?.platform === "ios"
        ? "android"
        : "web";
  state.formKey += 1;
  state.defaultValues = createCreateProjectDefaultValues(props?.defaultValues);
  state.validationErrors = {};
  state.iconFile = undefined;
  state.iconPreviewUrl = undefined;
  state.isIconCropDialogOpen = false;
  state.iconCropFile = undefined;
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

export const setIconFile = ({ state }, { file, previewUrl } = {}) => {
  state.iconFile = file;
  state.iconPreviewUrl = previewUrl;
};

export const clearIconFile = ({ state }) => {
  state.iconFile = undefined;
  state.iconPreviewUrl = undefined;
};

export const openIconCropDialog = ({ state }, { file } = {}) => {
  state.isIconCropDialogOpen = true;
  state.iconCropFile = file;
};

export const closeIconCropDialog = ({ state }) => {
  state.isIconCropDialogOpen = false;
  state.iconCropFile = undefined;
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

export const selectIconFile = ({ state }) => {
  return state.iconFile;
};

export const selectIconPreviewUrl = ({ state }) => {
  return state.iconPreviewUrl;
};

export const selectIsIconCropDialogOpen = ({ state }) => {
  return state.isIconCropDialogOpen;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectCopy(i18n);
  const projectLanguageCopy = selectProjectLanguageCopy(i18n);
  return {
    platform: state.platform,
    form: createLocalizedForm(copy, projectLanguageCopy, i18n),
    formKey: `${state.formKey}-${state.defaultValues.resolution}`,
    defaultValues: state.defaultValues,
    projectPathDisplay:
      state.defaultValues.projectPath || copy.noFolderSelected,
    noFolderSelectedLabel: copy.noFolderSelected,
    validationErrors: state.validationErrors,
    iconPreviewUrl: state.iconPreviewUrl,
    isIconCropDialogOpen: state.isIconCropDialogOpen,
    iconCropFile: state.iconCropFile,
    context: {
      platform: state.platform,
      values: state.defaultValues,
    },
    clickToUploadLabel: copy.clickToUpload,
    browseButtonLabel: copy.browseButton,
  };
};
