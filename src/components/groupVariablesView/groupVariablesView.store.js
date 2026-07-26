import {
  matchesTagAwareSearch,
  matchesTagFilter,
} from "../../internal/resourceTags.js";
import {
  buildVariableEnumOptions,
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";
import { createTagField } from "../../internal/ui/resourcePages/tags.js";
import { buildProgressivePlaceholderChildren } from "../../internal/ui/resourcePages/progressivePlaceholders.js";
import {
  buildTagFilterPopoverViewData,
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  createTagFilterPopoverState,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
} from "../../internal/ui/tagFilterPopover.js";
import { resolveResourceScrollBottomPadding } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { selectI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  buildComputedFromOperationDraft,
  createAddOperationDraft,
  createOperationDraftFromComputed,
  resolveExcludedOperationVariableId,
  toVariablePath,
} from "./support/computedOperationDraft.js";

const DEFAULT_FORM_VALUES = {
  name: "",
  description: "",
  valueSource: "variable",
  scope: "context",
  variableType: "string",
  isEnum: false,
  enumValues: [],
  default: "",
  computed: undefined,
  tagIds: [],
};

const DEFAULT_ENUM_VALUE_FORM_VALUES = {
  value: "",
};
const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 4;
const MENU_BUTTON_LABEL = "Menu";

const selectGroupVariablesViewCopy = (i18n = {}) =>
  selectI18nCopy(i18n, ["resourcePages", "variablesPage"]);

const getScopeLabel = (scope, copy = {}) => {
  if (scope === "device") {
    return copy.scopeDeviceLabel ?? "Device";
  }
  if (scope === "account") {
    return copy.scopeAccountLabel ?? "Account";
  }
  return copy.scopeContextLabel ?? "Context";
};

const getVariableTypeLabel = (variableType, copy = {}) => {
  if (variableType === "object") {
    return copy.variableTypeObjectLabel ?? "Object";
  }
  if (variableType === "number") {
    return copy.variableTypeNumberLabel ?? "Number";
  }
  if (variableType === "boolean") {
    return copy.variableTypeBooleanLabel ?? "Boolean";
  }
  return copy.variableTypeStringLabel ?? "String";
};

const getBooleanLabel = (value, copy = {}) => {
  return value
    ? (copy.booleanTrueLabel ?? "True")
    : (copy.booleanFalseLabel ?? "False");
};

const createDropdownMenuItems = (copy = {}) => [
  { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit-item" },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createEnumValueMenuItems = (copy = {}) => [
  { label: copy.removeMenuItem ?? "Remove", type: "item", value: "remove" },
];

const createOperationChoiceMenuItems = (copy = {}) => [
  {
    label: copy.computedOperatorAdd ?? "Add",
    type: "item",
    value: "add",
  },
  {
    label: copy.computedOperatorIf ?? "If",
    type: "item",
    value: "if",
    disabled: true,
  },
];

const createOperationBlockMenuItems = (copy = {}) => [
  {
    label: copy.removeMenuItem ?? "Remove",
    type: "item",
    value: "remove",
  },
];

const createOperandSourceMenuItems = (
  copy = {},
  { operationEnabled = true, variableItems = [] } = {},
) => {
  const operationItem = {
    label: copy.computedNodeOperationSource ?? "Operation",
    type: "item",
    value: "operation",
  };
  if (!operationEnabled) {
    operationItem.disabled = true;
  }

  return [
    {
      label: copy.computedNodeVariableSource ?? "Variable",
      type: "item",
      value: "variable",
      items: variableItems,
    },
    {
      label: copy.computedNodeValueSource ?? "Value",
      type: "item",
      value: "value",
    },
    operationItem,
  ];
};

const createEnumValueForm = (copy = {}) => ({
  title: copy.addValueTitle ?? "Add Value",
  fields: [
    {
      name: "value",
      type: "input-text",
      label: copy.valueLabel ?? "Value",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.addValueButton ?? "Add Value",
      },
    ],
  },
});

const createVariableForm = (copy = {}) => ({
  title: copy.addVariableTitle ?? "Add Variable",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
      tooltip: {
        content:
          copy.nameRequiredTooltip ??
          "This field is mandatory and must be unique",
      },
    },
    {
      name: "description",
      type: "input-textarea",
      label: copy.descriptionLabel ?? "Description",
      required: false,
    },
    createTagField({
      label: copy.tagsLabel ?? "Tags",
      placeholder: copy.selectTagsPlaceholder ?? "Select tags",
      addOptionLabel: copy.addTagOption ?? "Add tag",
    }),
    {
      name: "valueSource",
      type: "segmented-control",
      label: copy.valueSourceLabel ?? "Value source",
      noClear: true,
      required: true,
      options: [
        {
          value: "variable",
          label: copy.variableSourceLabel ?? "Variable",
        },
        {
          value: "computed",
          label: copy.computedSourceLabel ?? "Computed",
        },
      ],
    },
    {
      name: "scope",
      type: "select",
      label: copy.scopeLabel ?? "Scope",
      required: true,
      options: [
        { value: "context", label: copy.scopeContextLabel ?? "Context" },
        { value: "device", label: copy.scopeDeviceLabel ?? "Device" },
        { value: "account", label: copy.scopeAccountLabel ?? "Account" },
      ],
    },
    {
      name: "variableType",
      type: "select",
      label: copy.typeLabel ?? "Type",
      required: true,
      options: "${variableTypeOptions}",
    },
    {
      $when:
        "values.valueSource != 'computed' && values.variableType == 'string'",
      name: "isEnum",
      type: "checkbox",
      content: copy.enumLabel ?? "Enum",
    },
    {
      $when:
        "values.valueSource != 'computed' && values.variableType == 'string' && values.isEnum == true",
      type: "slot",
      slot: "enum-values",
      label: copy.valuesLabel ?? "Values",
    },
    {
      $when:
        "values.valueSource != 'computed' && values.variableType == 'boolean'",
      name: "default",
      type: "select",
      label: copy.defaultLabel ?? "Default",
      options: [
        { value: true, label: copy.booleanTrueLabel ?? "True" },
        { value: false, label: copy.booleanFalseLabel ?? "False" },
      ],
      required: true,
    },
    {
      $when:
        "values.valueSource != 'computed' && values.variableType == 'string' && values.isEnum != true",
      name: "default",
      type: "input-text",
      label: copy.defaultLabel ?? "Default",
      required: false,
    },
    {
      $when:
        "values.valueSource != 'computed' && values.variableType == 'string' && values.isEnum == true",
      name: "default",
      type: "select",
      label: copy.defaultLabel ?? "Default",
      clearable: false,
      options: "${enumValueOptions}",
      required: false,
    },
    {
      $when:
        "values.valueSource != 'computed' && values.variableType == 'number'",
      name: "default",
      type: "input-number",
      label: copy.defaultLabel ?? "Default",
      required: true,
    },
    {
      $when: "values.valueSource == 'computed'",
      type: "slot",
      slot: "operation",
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: copy.addVariableButton ?? "Add Variable",
      },
    ],
  },
});

const SHARED_VARIABLE_FIELD_NAMES = new Set([
  "name",
  "description",
  "tagIds",
  "scope",
  "variableType",
]);

const createStoredVariableForm = (copy = {}) => {
  const form = createVariableForm(copy);
  form.fields = form.fields.filter(
    (field) =>
      SHARED_VARIABLE_FIELD_NAMES.has(field.name) ||
      field.name === "isEnum" ||
      field.name === "default" ||
      field.slot === "enum-values",
  );
  return form;
};

const createComputedVariableForm = (copy = {}) => {
  const form = createVariableForm(copy);
  form.fields = form.fields.filter(
    (field) =>
      (SHARED_VARIABLE_FIELD_NAMES.has(field.name) && field.name !== "scope") ||
      field.slot === "operation",
  );
  return form;
};

export const createInitialState = () => ({
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  searchQuery: "",
  progressiveRenderedItemCount: DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
  progressiveRenderSignature: "",
  progressiveFrameId: undefined,
  syncRenderFrameId: undefined,
  isDialogOpen: false,
  targetGroupId: null,
  dialogMode: "add",
  editingItemId: null,
  operationDraft: undefined,
  operationChoiceMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    parentOperationPath: undefined,
  },
  operationBlockMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    operationPath: [],
  },
  operandSourceMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    operationPath: [],
  },
  operationValuePopover: {
    isOpen: false,
    x: 0,
    y: 0,
    operationPath: [],
  },

  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetItemId: null,
    items: createDropdownMenuItems(),
  },

  enumValuePopover: {
    isOpen: false,
    x: 0,
    y: 0,
    key: 0,
  },
  enumValueMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetIndex: undefined,
    items: createEnumValueMenuItems(),
  },
  enumValueDefaultValues: structuredClone(DEFAULT_ENUM_VALUE_FORM_VALUES),

  defaultValues: structuredClone(DEFAULT_FORM_VALUES),
});

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
};

export const selectSubmitContext = ({ state }) => ({
  defaultValues: state.defaultValues,
  targetGroupId: state.targetGroupId,
  dialogMode: state.dialogMode,
  editingItemId: state.editingItemId,
});

export const selectIsEditMode = ({ state }) => {
  return state.dialogMode === "edit";
};

export const toggleGroupCollapse = ({ state }, { groupId } = {}) => {
  const index = state.collapsedIds.indexOf(groupId);
  if (index > -1) {
    state.collapsedIds.splice(index, 1);
  } else {
    state.collapsedIds.push(groupId);
  }
};

export const updateFormValues = ({ state }, payload = {}) => {
  state.defaultValues = {
    ...state.defaultValues,
    ...payload,
  };
};

export const toggleDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = !state.isDialogOpen;
};

export const openAddDialog = (
  { state },
  { groupId, valueSource = "variable" } = {},
) => {
  state.isDialogOpen = true;
  state.targetGroupId = groupId;
  state.dialogMode = "add";
  state.editingItemId = null;
  state.operationDraft = undefined;
  state.defaultValues = structuredClone(DEFAULT_FORM_VALUES);
  state.defaultValues.valueSource = valueSource;
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.enumValuePopover.isOpen = false;
  state.enumValueMenu.isOpen = false;
  state.enumValueMenu.targetIndex = undefined;
};

export const openEditDialog = (
  { state },
  { groupId, itemId, defaultValues } = {},
) => {
  state.isDialogOpen = true;
  state.targetGroupId = groupId;
  state.dialogMode = "edit";
  state.editingItemId = itemId;
  state.operationDraft = createOperationDraftFromComputed(
    defaultValues.computed,
  );
  const nextDefaultValues = {
    ...structuredClone(DEFAULT_FORM_VALUES),
    ...defaultValues,
  };
  if (
    nextDefaultValues.computed === undefined &&
    nextDefaultValues.variableType === "number" &&
    (nextDefaultValues.default === undefined ||
      nextDefaultValues.default === "")
  ) {
    nextDefaultValues.default = 0;
  }
  state.defaultValues = nextDefaultValues;
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.enumValuePopover.isOpen = false;
  state.enumValueMenu.isOpen = false;
  state.enumValueMenu.targetIndex = undefined;
};

export const closeDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.targetGroupId = null;
  state.dialogMode = "add";
  state.editingItemId = null;
  state.operationDraft = undefined;
  state.defaultValues = structuredClone(DEFAULT_FORM_VALUES);
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.enumValuePopover.isOpen = false;
  state.enumValueMenu.isOpen = false;
  state.enumValueMenu.targetIndex = undefined;
};

const syncOperationComputed = (state) => {
  state.defaultValues.computed = buildComputedFromOperationDraft(
    state.operationDraft,
  );
};

export const createAddOperation = ({ state }) => {
  if (state.operationDraft?.type !== "add") {
    state.operationDraft = createAddOperationDraft();
  }
  state.defaultValues.variableType = "number";
  syncOperationComputed(state);
};

const cloneOperationPath = (operationPath = []) => {
  return Array.isArray(operationPath) ? [...operationPath] : [];
};

const findOperationAtPath = (operationDraft, operationPath = []) => {
  let operation = operationDraft;
  for (const operandIndex of operationPath) {
    const operand = operation?.operands[operandIndex];
    if (operand?.source !== "operation") {
      return undefined;
    }
    operation = operand.operation;
  }
  return operation;
};

export const addOperationOperand = (
  { state },
  { source, variablePath, value, operationType, operationPath = [] } = {},
) => {
  const operation = findOperationAtPath(state.operationDraft, operationPath);
  if (operation?.type !== "add") {
    return;
  }

  if (source === "variable") {
    const operand = {
      source: "variable",
      variablePath: variablePath ?? "",
    };
    if (operation.operands[0]?.source === "operation") {
      operation.operands.unshift(operand);
    } else {
      operation.operands.push(operand);
    }
  } else if (source === "value") {
    const operand = {
      source: "value",
      value: Number.isFinite(value) ? value : 0,
    };
    if (operation.operands[0]?.source === "operation") {
      operation.operands.unshift(operand);
    } else {
      operation.operands.push(operand);
    }
  } else if (
    source === "operation" &&
    operationType === "add" &&
    operation.operands.length > 0 &&
    operation.operands[0].source !== "operation"
  ) {
    operation.operands.push({
      source: "operation",
      operation: createAddOperationDraft(),
    });
  } else {
    return;
  }
  syncOperationComputed(state);
};

export const updateOperationValueOperand = (
  { state },
  { operationPath = [], index, value } = {},
) => {
  const operation = findOperationAtPath(state.operationDraft, operationPath);
  const operand = operation?.operands[index];
  if (!operand || operand.source !== "value") {
    return;
  }
  operand.value = value;
  syncOperationComputed(state);
};

export const removeOperationOperand = (
  { state },
  { operationPath = [], index } = {},
) => {
  const operation = findOperationAtPath(state.operationDraft, operationPath);
  if (!operation?.operands[index]) {
    return;
  }
  operation.operands.splice(index, 1);
  syncOperationComputed(state);
};

export const removeOperation = ({ state }, { operationPath = [] } = {}) => {
  if (operationPath.length === 0) {
    state.operationDraft = undefined;
  } else {
    const parentOperationPath = operationPath.slice(0, -1);
    const operandIndex = operationPath.at(-1);
    const parentOperation = findOperationAtPath(
      state.operationDraft,
      parentOperationPath,
    );
    const operand = parentOperation?.operands[operandIndex];
    if (operand?.source !== "operation") {
      return;
    }
    parentOperation.operands.splice(operandIndex, 1);
  }
  syncOperationComputed(state);
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
};

export const showOperationChoiceMenu = (
  { state },
  { x, y, parentOperationPath } = {},
) => {
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.operationChoiceMenu.isOpen = true;
  state.operationChoiceMenu.x = x ?? 0;
  state.operationChoiceMenu.y = y ?? 0;
  state.operationChoiceMenu.parentOperationPath =
    parentOperationPath === undefined
      ? undefined
      : cloneOperationPath(parentOperationPath);
};

export const hideOperationChoiceMenu = ({ state }) => {
  state.operationChoiceMenu.isOpen = false;
};

export const selectOperationChoiceMenuParentPath = ({ state }) => {
  const operationPath = state.operationChoiceMenu.parentOperationPath;
  return operationPath === undefined ? undefined : [...operationPath];
};

export const showOperationBlockMenu = (
  { state },
  { x, y, operationPath = [] } = {},
) => {
  state.operationChoiceMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.operationBlockMenu.isOpen = true;
  state.operationBlockMenu.x = x ?? 0;
  state.operationBlockMenu.y = y ?? 0;
  state.operationBlockMenu.operationPath = cloneOperationPath(operationPath);
};

export const hideOperationBlockMenu = ({ state }) => {
  state.operationBlockMenu.isOpen = false;
};

export const selectOperationBlockMenuPath = ({ state }) => {
  return [...state.operationBlockMenu.operationPath];
};

export const showOperandSourceMenu = (
  { state },
  { x, y, operationPath = [] } = {},
) => {
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.operandSourceMenu.isOpen = true;
  state.operandSourceMenu.x = x ?? 0;
  state.operandSourceMenu.y = y ?? 0;
  state.operandSourceMenu.operationPath = cloneOperationPath(operationPath);
};

export const hideOperandSourceMenu = ({ state }) => {
  state.operandSourceMenu.isOpen = false;
};

export const selectOperandSourceMenuPosition = ({ state }) => ({
  x: state.operandSourceMenu.x,
  y: state.operandSourceMenu.y,
  operationPath: [...state.operandSourceMenu.operationPath],
});

export const showOperationValuePopover = (
  { state },
  { x, y, operationPath = [] } = {},
) => {
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = true;
  state.operationValuePopover.x = x ?? 0;
  state.operationValuePopover.y = y ?? 0;
  state.operationValuePopover.operationPath = cloneOperationPath(operationPath);
};

export const hideOperationValuePopover = ({ state }) => {
  state.operationValuePopover.isOpen = false;
};

export const selectOperationValuePopoverPath = ({ state }) => {
  return [...state.operationValuePopover.operationPath];
};

export const setSearchQuery = ({ state }, { query } = {}) => {
  state.searchQuery = query;
};

export const setTargetGroupId = ({ state }, { groupId } = {}) => {
  state.targetGroupId = groupId;
};

export const showContextMenu = ({ state }, { itemId, x, y } = {}) => {
  state.dropdownMenu.isOpen = true;
  state.dropdownMenu.x = x;
  state.dropdownMenu.y = y;
  state.dropdownMenu.targetItemId = itemId;
};

export const hideContextMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu.isOpen = false;
  state.dropdownMenu.targetItemId = null;
};

export const selectTargetItemId = ({ state }) => {
  return state.dropdownMenu.targetItemId;
};

export const setProgressiveRenderedItemCount = (
  { state },
  { itemCount } = {},
) => {
  state.progressiveRenderedItemCount = itemCount ?? 0;
};

export const selectProgressiveRenderedItemCount = ({ state }) =>
  state.progressiveRenderedItemCount;

export const setProgressiveRenderSignature = (
  { state },
  { signature } = {},
) => {
  state.progressiveRenderSignature = signature ?? "";
};

export const selectProgressiveRenderSignature = ({ state }) =>
  state.progressiveRenderSignature;

export const setProgressiveFrameId = ({ state }, { frameId } = {}) => {
  state.progressiveFrameId = frameId;
};

export const clearProgressiveFrameId = ({ state }) => {
  state.progressiveFrameId = undefined;
};

export const selectProgressiveFrameId = ({ state }) => state.progressiveFrameId;

export const setSyncRenderFrameId = ({ state }, { frameId } = {}) => {
  state.syncRenderFrameId = frameId;
};

export const clearSyncRenderFrameId = ({ state }) => {
  state.syncRenderFrameId = undefined;
};

export const selectSyncRenderFrameId = ({ state }) => state.syncRenderFrameId;

export const openEnumValuePopover = ({ state }, { x, y } = {}) => {
  state.enumValuePopover.isOpen = true;
  state.enumValuePopover.x = x ?? 0;
  state.enumValuePopover.y = y ?? 0;
  state.enumValuePopover.key += 1;
  state.enumValueDefaultValues = structuredClone(
    DEFAULT_ENUM_VALUE_FORM_VALUES,
  );
};

export const closeEnumValuePopover = ({ state }) => {
  state.enumValuePopover.isOpen = false;
  state.enumValueDefaultValues = structuredClone(
    DEFAULT_ENUM_VALUE_FORM_VALUES,
  );
};

export const showEnumValueMenu = ({ state }, { index, x, y } = {}) => {
  state.enumValueMenu.isOpen = true;
  state.enumValueMenu.x = x ?? 0;
  state.enumValueMenu.y = y ?? 0;
  state.enumValueMenu.targetIndex = index;
};

export const hideEnumValueMenu = ({ state }) => {
  state.enumValueMenu.isOpen = false;
  state.enumValueMenu.targetIndex = undefined;
};

export const selectEnumValueMenuTargetIndex = ({ state }) => {
  return state.enumValueMenu.targetIndex;
};

export {
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
};

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

const parseNonNegativeIntegerProp = (value, fallback) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return Math.round(numericValue);
};

const buildOperationBlockViewData = ({
  operation,
  operationPath = [],
  numberVariableOptionsByPath,
  copy,
}) => {
  if (operation?.type !== "add") {
    return undefined;
  }

  return {
    type: "add",
    operationPath: [...operationPath],
    operands: operation.operands.map((operand, index) => {
      const viewOperand = {
        source: operand.source,
        index,
      };
      if (operand.source === "variable") {
        const option = numberVariableOptionsByPath.get(operand.variablePath);
        viewOperand.variablePath = operand.variablePath;
        viewOperand.variableLabel = option?.label ?? operand.variablePath ?? "";
        viewOperand.variableTypeLabel =
          option?.suffixText ?? copy.variableTypeNumberLabel ?? "Number";
      } else if (operand.source === "value") {
        viewOperand.value = operand.value;
      } else if (operand.source === "operation") {
        viewOperand.operation = buildOperationBlockViewData({
          operation: operand.operation,
          operationPath: [...operationPath, index],
          numberVariableOptionsByPath,
          copy,
        });
      }
      return viewOperand;
    }),
  };
};

export const selectViewData = ({ state, props, i18n }) => {
  const copy = selectGroupVariablesViewCopy(i18n);
  const readonly = props.readonly === true;
  const rawSearchQuery = state.searchQuery ?? "";
  const searchQuery = rawSearchQuery.toLowerCase();
  const activeTagIds = props.selectedTagFilterValues ?? [];
  const hasActiveTagFilter = activeTagIds.length > 0;
  const searchInFilterPopover = parseBooleanProp(props.searchInFilterPopover);
  const showMenuButton = parseBooleanProp(props.showMenuButton);
  const menuButtonPlacement =
    props.menuButtonPlacement === "trailing" ? "trailing" : "leading";
  const hasActiveSearch = rawSearchQuery.trim().length > 0;
  const hasActiveFilter =
    hasActiveTagFilter || (searchInFilterPopover && hasActiveSearch);
  const tagFilterPopoverViewData = buildTagFilterPopoverViewData({
    state,
    props,
  });
  const mobileLayout = parseBooleanProp(props.mobileLayout);
  const scrollBottomPadding = resolveResourceScrollBottomPadding({
    mobileLayout,
    scrollBottomPadding: props.scrollBottomPadding,
  });
  const progressiveRenderEnabled = parseBooleanProp(props.progressiveRender);
  let remainingProgressiveItemCount = progressiveRenderEnabled
    ? state.progressiveRenderedItemCount
    : Number.POSITIVE_INFINITY;

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    if (matchesTagAwareSearch(item, searchQuery)) {
      return true;
    }

    const scope = item.scope ?? "context";
    const variableType = item.variableType || "string";
    const defaultValue =
      typeof item.default === "boolean"
        ? getBooleanLabel(item.default, copy)
        : String(item.default ?? "");
    const searchTerms = [
      item.computed === undefined
        ? scope
        : (copy.computedTemporaryLabel ?? "Temporary"),
      item.computed === undefined
        ? getScopeLabel(scope, copy)
        : (copy.computedTemporaryLabel ?? "Temporary"),
      variableType,
      getVariableTypeLabel(variableType, copy),
      String(item.default ?? ""),
      defaultValue,
      item.computed
        ? (copy.computedSourceLabel ?? "Computed")
        : (copy.variableSourceLabel ?? "Variable"),
    ];

    return searchTerms.some((term) => term.toLowerCase().includes(searchQuery));
  };

  // Apply collapsed state and search filtering to flatGroups
  const flatGroups = (props.flatGroups || [])
    .map((group) => {
      // Filter children based on search query
      const filteredChildren = (group.children || []).filter(
        (item) =>
          matchesSearch(item) &&
          matchesTagFilter({
            item,
            activeTagIds,
          }),
      );

      // Only show groups that have matching children or if there's no search query
      const hasMatchingChildren = filteredChildren.length > 0;
      const shouldShowGroup = !searchQuery || hasMatchingChildren;

      const isCollapsed = state.collapsedIds.includes(group.id);
      const children = isCollapsed ? [] : filteredChildren;
      const hasVisibleChildren = children.length > 0;
      const hasChildFolders = Boolean(group.hasChildFolders);
      const progressiveChildren = buildProgressivePlaceholderChildren({
        children,
        remainingProgressiveItemCount,
        groupId: group.id,
        placeholderItemCount: children.length,
        createPlaceholder: ({ item, absoluteIndex, groupId }) => ({
          id: `${item.id ?? `${groupId}-${absoluteIndex}`}-placeholder`,
          sourceItemId: item.id,
          isPlaceholder: true,
          isInteractive: false,
        }),
      });

      remainingProgressiveItemCount =
        progressiveChildren.remainingProgressiveItemCount;

      const viewChildren = progressiveChildren.children.map((item) => {
        if (item.isPlaceholder) {
          return {
            id: item.id,
            sourceItemId: item.sourceItemId,
            domItemId: "",
            isPlaceholder: true,
            cursor: "default",
          };
        }

        const isComputed = item.computed !== undefined;
        const isConditional = Array.isArray(item.computed?.branches);
        const isAddOperation = Array.isArray(item.computed?.expr?.add);
        const variableType = item.variableType || "string";
        const storedDefault =
          variableType === "number" &&
          (item.default === undefined || item.default === "")
            ? 0
            : (item.default ?? "");
        let defaultValue = isComputed
          ? isConditional
            ? (copy.computedOperatorIf ?? "If")
            : isAddOperation
              ? (copy.computedOperatorAdd ?? "Add")
              : (copy.computedUnknownReference ?? "Unknown")
          : storedDefault;
        if (typeof defaultValue === "boolean") {
          defaultValue = getBooleanLabel(defaultValue, copy);
        }
        const scope = item.scope ?? "context";
        return {
          id: item.id,
          name: item.name,
          description: item.description ?? "",
          scope: isComputed
            ? (copy.computedTemporaryLabel ?? "Temporary")
            : getScopeLabel(scope, copy),
          variableType: getVariableTypeLabel(variableType, copy),
          default: defaultValue,
          isComputed,
          isEnum: isVariableEnumEnabled(item),
          isSelected: item.id === props.selectedItemId,
          domItemId: item.id,
          cursor: "pointer",
        };
      });

      return {
        ...group,
        isCollapsed,
        headerBackgroundColor:
          group.id === props.selectedFolderId ? "mu" : "bg",
        children: viewChildren,
        hasChildren: hasVisibleChildren,
        hasChildFolders,
        showEmptyAdd: !hasVisibleChildren && !hasChildFolders,
        progressiveContentMinHeight: 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  const defaultValues = structuredClone(state.defaultValues);
  const variableForm = createStoredVariableForm(copy);
  const computedForm = createComputedVariableForm(copy);
  const forms = [variableForm, computedForm];

  if (state.dialogMode === "edit") {
    variableForm.title = copy.editVariableTitle ?? "Edit Variable";
    computedForm.title =
      copy.editComputedVariableTitle ?? "Edit Computed Variable";
    forms.forEach((form) => {
      form.fields = (form.fields ?? []).map((field) => {
        if (field?.name !== "variableType") return field;
        const { options: _options, ...restField } = field;
        return {
          ...restField,
          type: "read-only-text",
          required: false,
          content: getVariableTypeLabel(defaultValues.variableType, copy),
        };
      });
      const submitButton = form.actions?.buttons?.find(
        (button) => button.id === "submit",
      );
      if (submitButton) {
        submitButton.label = copy.updateVariableButton ?? "Update Variable";
      }
    });
    const computedSubmitButton = computedForm.actions?.buttons?.find(
      (button) => button.id === "submit",
    );
    if (computedSubmitButton) {
      computedSubmitButton.label =
        copy.updateComputedVariableButton ?? "Update Computed Variable";
    }
  } else {
    variableForm.title = copy.addVariableTitle ?? "Add Variable";
    computedForm.title =
      copy.addComputedVariableTitle ?? "Add Computed Variable";
    const computedSubmitButton = computedForm.actions?.buttons?.find(
      (button) => button.id === "submit",
    );
    if (computedSubmitButton) {
      computedSubmitButton.label =
        copy.addComputedVariableButton ?? "Add Computed Variable";
    }
  }

  const enumValueOptions = buildVariableEnumOptions(defaultValues.enumValues);
  const variableTypeOptions = [
    { value: "string", label: copy.variableTypeStringLabel ?? "String" },
    { value: "number", label: copy.variableTypeNumberLabel ?? "Number" },
    {
      value: "boolean",
      label: copy.variableTypeBooleanLabel ?? "Boolean",
    },
  ];
  if (defaultValues.valueSource === "computed") {
    variableTypeOptions.push({
      value: "object",
      label: copy.variableTypeObjectLabel ?? "Object",
    });
  }
  const excludedOperationVariableId = resolveExcludedOperationVariableId({
    dialogMode: state.dialogMode,
    editingItemId: state.editingItemId,
    selectedItemId: props.selectedItemId,
  });
  const numberVariableOptions = (props.flatGroups ?? [])
    .flatMap((group) => group.children ?? [])
    .filter(
      (item) => item.type === "variable" && item.variableType === "number",
    )
    .map((item) => ({
      itemId: item.id,
      value: toVariablePath(item.id),
      label: item.name,
      suffixText: getVariableTypeLabel(item.variableType, copy),
    }));
  const numberVariableMenuItems = numberVariableOptions
    .filter((item) => item.itemId !== excludedOperationVariableId)
    .map(({ itemId: _itemId, ...item }) => ({
      ...item,
      type: "item",
    }));
  const numberVariableOptionsByPath = new Map(
    numberVariableOptions.map((item) => [item.value, item]),
  );
  const operationChoiceMenu = {
    ...state.operationChoiceMenu,
    items: createOperationChoiceMenuItems(copy),
  };
  const operationBlockMenu = {
    ...state.operationBlockMenu,
    items: createOperationBlockMenuItems(copy),
  };
  const operandTargetOperation = findOperationAtPath(
    state.operationDraft,
    state.operandSourceMenu.operationPath,
  );
  const operandSourceMenu = {
    ...state.operandSourceMenu,
    items: createOperandSourceMenuItems(copy, {
      operationEnabled:
        (operandTargetOperation?.operands.length ?? 0) > 0 &&
        operandTargetOperation.operands[0].source !== "operation",
      variableItems: numberVariableMenuItems,
    }),
  };
  const operationValuePopover = state.operationValuePopover;
  const operationBlock = buildOperationBlockViewData({
    operation: state.operationDraft,
    numberVariableOptionsByPath,
    copy,
  });
  const enumValues = normalizeVariableEnumValues(defaultValues.enumValues).map(
    (value, index) => ({
      value,
      label: value,
      index,
    }),
  );
  const dialogKey = state.editingItemId ?? state.targetGroupId ?? "new";

  return {
    flatGroups,
    navTitle: props.navTitle ?? "",
    selectedItemId: props.selectedItemId,
    readonly,
    searchQuery: rawSearchQuery,
    tagFilterOptions: props.tagFilterOptions ?? [],
    selectedTagFilterValues: activeTagIds,
    tagFilterPlaceholder:
      props.tagFilterPlaceholder ?? copy.tagFilterPlaceholder ?? "Filter tags",
    tagFilterPopover: {
      ...tagFilterPopoverViewData.tagFilterPopover,
      clearDisabled:
        tagFilterPopoverViewData.tagFilterPopover.clearDisabled &&
        !(searchInFilterPopover && hasActiveSearch),
    },
    showTagFilter: parseBooleanProp(props.showTagFilter),
    showSearch:
      parseBooleanProp(props.showSearch, true) && !searchInFilterPopover,
    showFilterPopoverSearch: searchInFilterPopover,
    showLeadingMenuButton: showMenuButton && menuButtonPlacement === "leading",
    showTrailingMenuButton:
      showMenuButton && menuButtonPlacement === "trailing",
    progressiveRender: progressiveRenderEnabled,
    progressiveInitialItemCount: parseNonNegativeIntegerProp(
      props.progressiveInitialItemCount,
      DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT,
    ),
    mobileLayout,
    scrollBottomPadding,
    hasActiveTagFilter,
    tagFilterButtonVariant: hasActiveFilter ? "pr" : "ol",
    menuButtonLabel: copy.menuButtonLabel ?? MENU_BUTTON_LABEL,
    isVariableDialogOpen:
      state.isDialogOpen && defaultValues.valueSource !== "computed",
    isComputedDialogOpen:
      state.isDialogOpen && defaultValues.valueSource === "computed",
    defaultValues: defaultValues,
    variableForm,
    computedForm,
    dialogKey,
    dialogMode: state.dialogMode,
    editingItemId: state.editingItemId,
    operationBlock,
    operationBlockMenu,
    operationChoiceMenu,
    operandSourceMenu,
    operationValuePopover,
    operationLabel: copy.computedOperationLabel ?? "Operation",
    addOperationLabel: copy.computedAddOperationLabel ?? "Add operation",
    operationEmptyMessage:
      copy.computedOperationEmptyMessage ?? "Add an operation.",
    enumValues,
    enumValuePopover: state.enumValuePopover,
    enumValueForm: createEnumValueForm(copy),
    enumValueDefaultValues: state.enumValueDefaultValues,
    enumValueMenu: {
      ...state.enumValueMenu,
      items: createEnumValueMenuItems(copy),
    },
    dropdownMenu: {
      ...state.dropdownMenu,
      items: createDropdownMenuItems(copy),
    },
    addButton: copy.addText ?? "Add",
    addVariableButton: copy.addText ?? "Add",
    nameLabel: copy.nameLabel ?? "Name",
    scopeLabel: copy.scopeLabel ?? "Scope",
    typeLabel: copy.typeLabel ?? "Type",
    defaultLabel: copy.valueLabel ?? "Value",
    enumLabel: copy.enumLabel ?? "Enum",
    computedLabel: copy.computedSourceLabel ?? "Computed",
    searchPlaceholder: copy.searchVariablesPlaceholder ?? "Search variables...",
    noVariablesInGroupMessage:
      copy.noVariablesInGroupMessage ?? "No variables in this group",
    noVariablesFoundMessage:
      copy.noVariablesFoundMessage ?? "No variables found",
    noDataMessage: copy.noDataMessage ?? "No data",
    noValuesYetMessage: copy.noValuesYetMessage ?? "No values yet",
    addValueButton: copy.addValueButton ?? "Add Value",
    filterLabel: copy.filterLabel ?? "Filter",
    noTagsAvailableMessage: copy.noTagsAvailableMessage ?? "No tags available",
    clearButton: copy.clearButton ?? "Clear",
    saveButton: copy.saveButton ?? "Save",
    context: {
      values: defaultValues,
      enumValueOptions,
      variableTypeOptions,
    },
  };
};
