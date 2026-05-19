import { getTransitionAnimationOptions } from "../../internal/animationOptions.js";
import { getLayoutInputFieldItems } from "../../internal/project/layout.js";
import { getVariableOptions } from "../../internal/project/projection.js";
import { toFlatItems } from "../../internal/project/tree.js";

const INPUT_FIELDS_SLOT = "input-fields";
const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};
const BOOLEAN_OPTIONS = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];
const SUBMIT_ACTION_TYPE_OPTIONS = [
  { value: "nextLine", label: "Continue" },
  { value: "sectionTransition", label: "Move to Section" },
];
const FORM_TEMPLATE = {
  title: "Input",
  fields: [
    {
      name: "resourceId",
      type: "select",
      label: "Input Layout",
      required: true,
      clearable: false,
      options: "${layoutOptions}",
    },
    {
      type: "slot",
      slot: INPUT_FIELDS_SLOT,
      label: "Fields",
    },
    {
      name: "submitActionType",
      type: "segmented-control",
      label: "Submit Action",
      required: true,
      options: SUBMIT_ACTION_TYPE_OPTIONS,
    },
    {
      $when: `values.submitActionType == 'sectionTransition'`,
      name: "submitSceneId",
      type: "select",
      label: "Scene",
      options: "${scenes}",
    },
    {
      $when: `values.submitActionType == 'sectionTransition'`,
      name: "submitSectionId",
      type: "select",
      label: "Section",
      options: "${sections}",
    },
    {
      $when: `values.submitActionType == 'sectionTransition'`,
      name: "submitTransitionAnimationId",
      type: "select",
      label: "Screen",
      required: false,
      clearable: true,
      placeholder: "Animation",
      options: "${transitionAnimationOptions}",
    },
  ],
};

const createDefaultSettingsForm = () => ({
  submitActionType: "nextLine",
  submitSceneId: "",
  submitSectionId: "",
  submitTransitionAnimationId: "",
});

const getInputLayoutOptions = (layouts = []) =>
  layouts
    .filter((layout) => layout?.layoutType === "input")
    .map((layout) => ({
      value: layout.id,
      label: layout.name ?? layout.id,
    }));

const getLayoutById = ({ layouts = [], layoutsData, resourceId } = {}) => {
  return (
    layouts.find((layout) => layout?.id === resourceId) ??
    layoutsData?.items?.[resourceId]
  );
};

export const resolveSelectedResourceId = ({
  layouts = [],
  resourceId,
} = {}) => {
  const resourceOptions = getInputLayoutOptions(layouts);

  if (
    resourceId &&
    resourceOptions.some(
      (resourceOption) => resourceOption.value === resourceId,
    )
  ) {
    return resourceId;
  }

  return resourceOptions[0]?.value ?? "";
};

const getInputFieldItemsForResource = ({
  layouts = [],
  layoutsData,
  resourceId,
} = {}) => {
  if (!resourceId) {
    return [];
  }

  const layout = getLayoutById({
    layouts,
    layoutsData,
    resourceId,
  });

  return getLayoutInputFieldItems({
    layout,
    layoutId: resourceId,
    layoutsData,
  });
};

const normalizeMaxLengthValue = (value) => {
  if (value === "" || value === undefined || value === null) {
    return "";
  }

  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0
    ? Math.round(numericValue)
    : "";
};

const createFallbackInputFieldItems = (fields = {}) => {
  return Object.entries(fields).map(([field, fieldData]) => ({
    field,
    label: field,
    placeholder: fieldData?.placeholder,
    multiline: fieldData?.multiline,
    maxLength: fieldData?.maxLength,
  }));
};

const createFieldConfig = ({ item, existingField } = {}) => ({
  field: item.field,
  label: item.label ?? item.field,
  variableId: existingField?.variableId ?? "",
  required: existingField?.required === true,
  trim: existingField?.trim !== false,
  placeholder: existingField?.placeholder ?? item.placeholder ?? "",
  multiline: existingField?.multiline ?? item.multiline ?? false,
  maxLength: normalizeMaxLengthValue(
    existingField?.maxLength ?? item.maxLength,
  ),
});

const createFieldConfigs = ({ inputFieldItems = [], existingFields = {} }) => {
  const sourceItems =
    inputFieldItems.length > 0
      ? inputFieldItems
      : createFallbackInputFieldItems(existingFields);
  const fields = {};
  const fieldOrder = [];

  for (const item of sourceItems) {
    if (!item?.field) {
      continue;
    }

    fields[item.field] = createFieldConfig({
      item,
      existingField: existingFields[item.field],
    });
    fieldOrder.push(item.field);
  }

  return {
    fields,
    fieldOrder,
  };
};

const applyFieldConfigs = (state, fieldConfigs) => {
  state.fields = fieldConfigs.fields;
  state.fieldOrder = fieldConfigs.fieldOrder;
};

const createSettingsFormFromSubmitActions = (submitActions = {}) => {
  const settingsForm = createDefaultSettingsForm();
  const sectionTransition = submitActions.sectionTransition;

  if (sectionTransition) {
    settingsForm.submitActionType = "sectionTransition";
    settingsForm.submitSceneId = sectionTransition.sceneId ?? "";
    settingsForm.submitSectionId = sectionTransition.sectionId ?? "";
    settingsForm.submitTransitionAnimationId =
      sectionTransition.screen?.animations?.resourceId ?? "";
  }

  return settingsForm;
};

const createFormExtras = (form = {}) => {
  if (!form || typeof form !== "object" || Array.isArray(form)) {
    return {};
  }

  const {
    resourceId: _resourceId,
    fields: _fields,
    submitActions: _submitActions,
    ...extras
  } = form;

  return structuredClone(extras);
};

export const buildSubmitActions = (settingsForm = {}) => {
  if (settingsForm.submitActionType === "sectionTransition") {
    const sectionTransition = {
      sceneId: settingsForm.submitSceneId,
      sectionId: settingsForm.submitSectionId,
    };

    if (settingsForm.submitTransitionAnimationId) {
      sectionTransition.screen = {
        animations: {
          resourceId: settingsForm.submitTransitionAnimationId,
        },
      };
    }

    return {
      sectionTransition,
    };
  }

  return {
    nextLine: {},
  };
};

const createFormFieldsObject = (fieldRows = []) => {
  const fields = {};

  for (const row of fieldRows) {
    const field = {
      variableId: row.variableId,
      required: row.required === true,
      trim: row.trim === true,
      placeholder: row.placeholder ?? "",
    };

    if (row.multiline === true) {
      field.multiline = true;
    }

    const maxLength = normalizeMaxLengthValue(row.maxLength);
    if (maxLength !== "") {
      field.maxLength = maxLength;
    }

    fields[row.field] = field;
  }

  return fields;
};

export const createFormData = ({
  resourceId,
  fieldRows,
  settingsForm,
  formExtras = {},
} = {}) => {
  if (!resourceId) {
    return undefined;
  }

  return {
    ...structuredClone(formExtras),
    resourceId,
    fields: createFormFieldsObject(fieldRows),
    submitActions: buildSubmitActions(settingsForm),
  };
};

export const createInitialState = () => ({
  selectedResourceId: "",
  fields: {},
  fieldOrder: [],
  settingsForm: createDefaultSettingsForm(),
  formExtras: {},
  scenes: EMPTY_COLLECTION,
  animations: EMPTY_COLLECTION,
  variables: EMPTY_COLLECTION,
});

export const setRepositoryData = (
  { state },
  { scenes, animations, variables } = {},
) => {
  state.scenes = scenes ?? EMPTY_COLLECTION;
  state.animations = animations ?? EMPTY_COLLECTION;
  state.variables = variables ?? EMPTY_COLLECTION;
};

export const hydrateForm = ({ state }, { form, layouts, layoutsData } = {}) => {
  const resourceId = resolveSelectedResourceId({
    layouts,
    resourceId: form?.resourceId,
  });
  const inputFieldItems = getInputFieldItemsForResource({
    layouts,
    layoutsData,
    resourceId,
  });
  const fieldConfigs = createFieldConfigs({
    inputFieldItems,
    existingFields: form?.fields ?? {},
  });

  state.selectedResourceId = resourceId;
  state.settingsForm = createSettingsFormFromSubmitActions(form?.submitActions);
  state.formExtras = createFormExtras(form);
  applyFieldConfigs(state, fieldConfigs);
};

export const setSelectedResourceId = (
  { state },
  { resourceId, layouts, layoutsData } = {},
) => {
  state.selectedResourceId = resourceId ?? "";
  const inputFieldItems = getInputFieldItemsForResource({
    layouts,
    layoutsData,
    resourceId: state.selectedResourceId,
  });
  const fieldConfigs = createFieldConfigs({
    inputFieldItems,
    existingFields: state.fields,
  });

  applyFieldConfigs(state, fieldConfigs);
};

export const updateSettingsForm = ({ state }, { field, value } = {}) => {
  state.settingsForm[field] = value;
};

export const updateFieldConfig = ({ state }, { field, name, value } = {}) => {
  if (!field || !state.fields[field]) {
    return;
  }

  if (name === "required" || name === "trim" || name === "multiline") {
    state.fields[field][name] = value === true || value === "true";
    return;
  }

  if (name === "maxLength") {
    state.fields[field][name] = value ?? "";
    return;
  }

  state.fields[field][name] = value ?? "";
};

export const selectSelectedResourceId = ({ state }) =>
  state.selectedResourceId ?? "";

export const selectFieldRows = ({ state }) =>
  state.fieldOrder.map((field) => state.fields[field]).filter(Boolean);

export const selectSettingsForm = ({ state }) => state.settingsForm;

export const selectFormData = ({ state }) =>
  createFormData({
    resourceId: state.selectedResourceId,
    fieldRows: selectFieldRows({ state }),
    settingsForm: state.settingsForm,
    formExtras: state.formExtras,
  });

export const selectCanSubmit = ({ state }) => {
  const fieldRows = selectFieldRows({ state });
  if (!state.selectedResourceId || fieldRows.length === 0) {
    return false;
  }

  if (fieldRows.some((row) => !row.variableId)) {
    return false;
  }

  if (state.settingsForm.submitActionType === "sectionTransition") {
    return (
      !!state.settingsForm.submitSceneId && !!state.settingsForm.submitSectionId
    );
  }

  return true;
};

export const selectViewData = ({ state, props }) => {
  const layouts = props?.layouts ?? [];
  const layoutOptions = getInputLayoutOptions(layouts);
  const selectedResourceId = resolveSelectedResourceId({
    layouts,
    resourceId: state.selectedResourceId,
  });
  const allScenes = toFlatItems(state.scenes).filter(
    (item) => item.type === "scene",
  );
  const scenes = allScenes.map((item) => ({
    label: item.name,
    value: item.id,
  }));
  const selectedScene = allScenes.find(
    (scene) => scene.id === state.settingsForm.submitSceneId,
  );
  const sections = selectedScene
    ? toFlatItems(selectedScene.sections).map((item) => ({
        label: item.name,
        value: item.id,
      }))
    : [];
  const fieldRows = selectFieldRows({ state });

  return {
    breadcrumb: [
      { id: "actions", label: "Actions", click: true },
      { label: "Input" },
    ],
    form: FORM_TEMPLATE,
    formKey: `${selectedResourceId}|${state.fieldOrder.join("|")}|${state.settingsForm.submitActionType}|${state.settingsForm.submitSceneId}`,
    defaultValues: {
      resourceId: selectedResourceId,
      ...state.settingsForm,
    },
    context: {
      layoutOptions,
      scenes,
      sections,
      transitionAnimationOptions: getTransitionAnimationOptions(
        state.animations,
        state.settingsForm.submitTransitionAnimationId,
      ),
    },
    inputFieldsSlot: INPUT_FIELDS_SLOT,
    selectedResourceId,
    fieldRows,
    hasFields: fieldRows.length > 0,
    fieldVariableOptions: getVariableOptions(state.variables, {
      type: "string",
      showType: true,
    }),
    booleanOptions: BOOLEAN_OPTIONS,
    submitDisabled: !selectCanSubmit({ state }),
  };
};
