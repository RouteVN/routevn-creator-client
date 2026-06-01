import { generateId } from "../../internal/id.js";
import { getLayoutInputFieldItems } from "../../internal/project/layout.js";
import { getVariableOptions } from "../../internal/project/projection.js";

const INPUT_FIELDS_SLOT = "input-fields";
const DEFAULT_FIELD_MAX_LENGTH = 32;
const EMPTY_COLLECTION = {
  items: {},
  tree: [],
};
const BOOLEAN_OPTIONS = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
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
  ],
};

const createFormId = () => generateId();

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
  if (!resourceId) {
    return "";
  }

  const resourceOptions = getInputLayoutOptions(layouts);
  if (
    resourceOptions.some(
      (resourceOption) => resourceOption.value === resourceId,
    )
  ) {
    return resourceId;
  }

  return "";
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
    existingField?.maxLength ?? item.maxLength ?? DEFAULT_FIELD_MAX_LENGTH,
  ),
});

const createEmptyFieldConfig = () => ({
  field: "",
  label: "",
  variableId: "",
  required: false,
  trim: true,
  placeholder: "",
  multiline: false,
  maxLength: DEFAULT_FIELD_MAX_LENGTH,
});

const copyFieldConfig = (fieldConfig = {}) => ({
  field: fieldConfig.field ?? "",
  label: fieldConfig.label ?? fieldConfig.field ?? "",
  variableId: fieldConfig.variableId ?? "",
  required: fieldConfig.required === true,
  trim: fieldConfig.trim !== false,
  placeholder: fieldConfig.placeholder ?? "",
  multiline: fieldConfig.multiline === true,
  maxLength: normalizeMaxLengthValue(fieldConfig.maxLength),
});

const resetFieldEditor = (state) => {
  state.mode = "list";
  state.editingField = "";
  state.editFieldForm = createEmptyFieldConfig();
};

const setFieldConfigValue = (fieldConfig, name, value) => {
  if (!fieldConfig || !name) {
    return;
  }

  if (name === "required" || name === "trim" || name === "multiline") {
    fieldConfig[name] = value === true || value === "true";
    return;
  }

  if (name === "maxLength") {
    fieldConfig[name] = value ?? "";
    return;
  }

  fieldConfig[name] = value ?? "";
};

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

const createFormExtras = (form = {}) => {
  if (!form || typeof form !== "object" || Array.isArray(form)) {
    return {};
  }

  const {
    resourceId: _resourceId,
    fields: _fields,
    submitActions: _submitActions,
    cancelActions: _cancelActions,
    ...extras
  } = form;

  return structuredClone(extras);
};

export const buildSubmitActions = () => {
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
  formExtras = {},
} = {}) => {
  if (!resourceId) {
    return undefined;
  }

  const formData = structuredClone(formExtras);
  if (!formData.id) {
    formData.id = createFormId();
  }

  return {
    ...formData,
    resourceId,
    fields: createFormFieldsObject(fieldRows),
    submitActions: buildSubmitActions(),
  };
};

export const createInitialState = () => ({
  mode: "list",
  selectedResourceId: "",
  fields: {},
  fieldOrder: [],
  editingField: "",
  editFieldForm: createEmptyFieldConfig(),
  formExtras: {
    id: createFormId(),
  },
  variables: EMPTY_COLLECTION,
});

export const setRepositoryData = ({ state }, { variables } = {}) => {
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

  const previousFormId = state.formExtras?.id;

  state.selectedResourceId = resourceId;
  state.formExtras = createFormExtras(form);
  if (!state.formExtras.id) {
    state.formExtras.id = previousFormId ?? createFormId();
  }
  applyFieldConfigs(state, fieldConfigs);
  resetFieldEditor(state);
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
  resetFieldEditor(state);
};

export const updateFieldConfig = ({ state }, { field, name, value } = {}) => {
  if (!field || !state.fields[field]) {
    return;
  }

  setFieldConfigValue(state.fields[field], name, value);
};

export const startEditingField = ({ state }, { field } = {}) => {
  if (!field || !state.fields[field]) {
    resetFieldEditor(state);
    return;
  }

  state.mode = "editField";
  state.editingField = field;
  state.editFieldForm = copyFieldConfig(state.fields[field]);
};

export const updateEditFieldConfig = ({ state }, { name, value } = {}) => {
  if (state.mode !== "editField" || !state.editingField) {
    return;
  }

  setFieldConfigValue(state.editFieldForm, name, value);
};

export const saveEditingField = ({ state }, _payload = {}) => {
  const field = state.editingField;
  const fieldConfig = state.fields[field];

  if (!field || !fieldConfig) {
    resetFieldEditor(state);
    return;
  }

  fieldConfig.variableId = state.editFieldForm.variableId ?? "";
  fieldConfig.required = state.editFieldForm.required === true;
  fieldConfig.trim = state.editFieldForm.trim === true;
  fieldConfig.placeholder = state.editFieldForm.placeholder ?? "";
  fieldConfig.multiline = state.editFieldForm.multiline === true;
  fieldConfig.maxLength = normalizeMaxLengthValue(
    state.editFieldForm.maxLength,
  );
  resetFieldEditor(state);
};

export const cancelEditingField = ({ state }, _payload = {}) => {
  resetFieldEditor(state);
};

export const selectSelectedResourceId = ({ state }) =>
  state.selectedResourceId ?? "";

export const selectMode = ({ state }) => state.mode ?? "list";

export const selectEditFieldForm = ({ state }) =>
  state.editFieldForm ?? createEmptyFieldConfig();

export const selectCanSaveEditField = ({ state }) => {
  return (
    state.mode === "editField" &&
    !!state.editingField &&
    !!state.fields[state.editingField] &&
    !!state.editFieldForm?.variableId
  );
};

export const selectFieldRows = ({ state }) =>
  state.fieldOrder.map((field) => state.fields[field]).filter(Boolean);

export const selectFieldRowsWithEditingDraft = ({ state }) => {
  const fieldRows = selectFieldRows({ state });

  if (state.mode !== "editField" || !state.editingField) {
    return fieldRows;
  }

  return fieldRows.map((fieldRow) =>
    fieldRow.field === state.editingField ? state.editFieldForm : fieldRow,
  );
};

export const selectFormData = ({ state }) =>
  createFormData({
    resourceId: state.selectedResourceId,
    fieldRows: selectFieldRows({ state }),
    formExtras: state.formExtras,
  });

export const selectFormDataWithEditingDraft = ({ state }) =>
  createFormData({
    resourceId: state.selectedResourceId,
    fieldRows: selectFieldRowsWithEditingDraft({ state }),
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

  return true;
};

const getFieldRowSummary = (row, variableLabel) => {
  const summary = [
    variableLabel,
    row.required ? "Required" : "Optional",
    row.trim ? "Trim" : "Keep whitespace",
    row.multiline ? "Multiline" : "Single line",
  ];

  if (row.placeholder) {
    summary.push(`Placeholder: ${row.placeholder}`);
  }

  if (row.maxLength !== "" && row.maxLength !== undefined) {
    summary.push(`Max: ${row.maxLength}`);
  }

  return summary.join(" - ");
};

const createFieldDisplayRows = (fieldRows = [], variableOptions = []) => {
  const variableLabels = new Map(
    variableOptions.map((option) => [option.value, option.label]),
  );

  return fieldRows.map((row) => {
    const variableLabel =
      variableLabels.get(row.variableId) ?? "No variable mapped";

    return {
      ...row,
      variableLabel,
      summary: getFieldRowSummary(row, variableLabel),
    };
  });
};

const createFieldVariableOptions = (variablesData = EMPTY_COLLECTION) => {
  return getVariableOptions(variablesData, {
    type: "string",
  }).map((option) => {
    const variableType = (
      variablesData.items?.[option.value]?.variableType || "string"
    ).toLowerCase();

    return {
      ...option,
      suffixText: variableType,
    };
  });
};

const createBreadcrumb = (state) => {
  const breadcrumb = [{ id: "actions", label: "Actions", click: true }];

  if (state.mode === "editField") {
    breadcrumb.push({ id: "input", label: "Input", click: true });
    breadcrumb.push({
      label: state.editFieldForm?.label
        ? `Edit ${state.editFieldForm.label}`
        : "Edit Field",
    });
    return breadcrumb;
  }

  breadcrumb.push({ label: "Input" });
  return breadcrumb;
};

export const selectViewData = ({ state, props }) => {
  const layouts = props?.layouts ?? [];
  const layoutOptions = getInputLayoutOptions(layouts);
  const selectedResourceId = resolveSelectedResourceId({
    layouts,
    resourceId: state.selectedResourceId,
  });
  const fieldVariableOptions = createFieldVariableOptions(state.variables);
  const fieldRows = createFieldDisplayRows(
    selectFieldRows({ state }),
    fieldVariableOptions,
  );
  const editFieldForm = selectEditFieldForm({ state });

  return {
    mode: selectMode({ state }),
    breadcrumb: createBreadcrumb(state),
    form: FORM_TEMPLATE,
    formKey: `${selectedResourceId}|${state.fieldOrder.join("|")}`,
    defaultValues: {
      resourceId: selectedResourceId,
    },
    context: {
      layoutOptions,
    },
    inputFieldsSlot: INPUT_FIELDS_SLOT,
    selectedResourceId,
    fieldRows,
    hasFields: fieldRows.length > 0,
    editFieldForm,
    fieldVariableOptions,
    booleanOptions: BOOLEAN_OPTIONS,
    canSaveEditField: selectCanSaveEditField({ state }),
    submitDisabled: !selectCanSubmit({ state }),
  };
};
