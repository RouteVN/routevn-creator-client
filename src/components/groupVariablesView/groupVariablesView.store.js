import { buildResourceOverflowMenuItems } from "../../internal/ui/resourcePages/resourceOverflowMenu.js";
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
  COMPUTED_LITERAL_TYPES,
  COMPUTED_OPERATION_TYPES,
  canAddComputedOperationOperand,
  getComputedOperationDefinition,
  getComputedOperationLabel,
  isComputedLiteralValue,
  isComputedLogicalOperationType,
  isSupportedComputedOperationType,
} from "../../internal/computedOperations.js";
import {
  COMPUTED_CONDITION_OPERATION_TYPES,
  buildComputedFromConditionalDraft,
  cloneConditionalBranchDraft,
  createConditionalBranchDraft,
  createConditionalDraft,
  createConditionalDraftFromComputed,
  createConditionalOperationDraft,
  isComputedConditionOperationType,
} from "./support/computedConditionalDraft.js";
import {
  buildComputedFromOperationDraft,
  createOperationDraft,
  createOperationDraftFromComputed,
  resolveExcludedOperationVariableId,
  toVariablePath,
} from "./support/computedOperationDraft.js";
import {
  buildComputedExampleInput,
  createComputedExampleDefaultValues,
  createComputedExampleInputItems,
  evaluateComputedExample,
  formatComputedExampleValue,
  resolveComputedExampleInputValue,
} from "./support/computedExamples.js";

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
const COMPUTED_OPERAND_VARIABLE_TYPES = new Set([
  ...COMPUTED_LITERAL_TYPES,
  "object",
]);
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

const createOperationChoiceMenuItems = (
  copy = {},
  {
    includeConditional = false,
    operationTypes = COMPUTED_OPERATION_TYPES,
  } = {},
) => {
  const items = operationTypes.map((operationType) => ({
    label: getComputedOperationLabel(operationType, copy),
    type: "item",
    value: operationType,
  }));
  if (includeConditional) {
    items.push({
      label: copy.computedOperatorIf ?? "If",
      type: "item",
      value: "if",
    });
  }
  return items;
};

const getOperationTypesForResultType = (variableType) =>
  COMPUTED_OPERATION_TYPES.filter(
    (operationType) =>
      getComputedOperationDefinition(operationType).resultType === variableType,
  );

const createOperationBlockMenuItems = (copy = {}) => [
  {
    label: copy.removeMenuItem ?? "Remove",
    type: "item",
    value: "remove",
  },
];

const FORMULA_EXPRESSION_TARGET = Object.freeze({ kind: "formula" });

const cloneExpressionTarget = (target = FORMULA_EXPRESSION_TARGET) => {
  const nextTarget = {
    kind: target.kind ?? "formula",
  };
  if (target.branchIndex !== undefined) {
    nextTarget.branchIndex = target.branchIndex;
  }
  return nextTarget;
};

const isConditionalExpressionTarget = (target = {}) =>
  target.kind === "condition" ||
  target.kind === "result" ||
  target.kind === "default";

const createOperandSourceMenuItems = (
  copy = {},
  {
    operationEnabled = true,
    operationTypes = COMPUTED_OPERATION_TYPES,
    valueEnabled = true,
    valueVisible = true,
    variableVisible = true,
    variableItems = [],
  } = {},
) => {
  const items = [];
  if (variableVisible && variableItems.length > 0) {
    items.push({
      label: copy.computedNodeVariableSource ?? "Variable",
      type: "item",
      value: "variable",
      items: variableItems,
    });
  }
  if (valueVisible && valueEnabled) {
    items.push({
      label: copy.computedNodeValueSource ?? "Value",
      type: "item",
      value: "value",
    });
  }
  if (operationEnabled) {
    items.push({
      label: copy.computedNodeOperationSource ?? "Operation",
      type: "item",
      value: "operation",
      items: createOperationChoiceMenuItems(copy, { operationTypes }),
    });
  }
  return items;
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

const createComputedExampleForm = ({
  copy = {},
  inputItems = [],
  mode = "add",
} = {}) => ({
  title:
    mode === "edit"
      ? (copy.computedEditExampleTitle ?? "Edit Example")
      : (copy.computedAddExampleTitle ?? "Add Example"),
  fields: [
    {
      name: "name",
      type: "input-text",
      label: copy.nameLabel ?? "Name",
      required: true,
    },
    ...inputItems.map((item) => {
      const field = {
        name: item.formName,
        type:
          item.type === "number"
            ? "input-number"
            : item.type === "boolean"
              ? "select"
              : item.type === "object"
                ? "input-textarea"
                : "input-text",
        label: item.name,
        description: getVariableTypeLabel(item.type, copy),
        required: item.type !== "string",
      };
      if (item.type === "boolean") {
        field.clearable = false;
        field.options = [
          { value: true, label: copy.booleanTrueLabel ?? "True" },
          { value: false, label: copy.booleanFalseLabel ?? "False" },
        ];
      }
      return field;
    }),
    ...(inputItems.length === 0
      ? [{ type: "slot", slot: "computed-example-empty" }]
      : []),
    { type: "slot", slot: "computed-example-result" },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        validate: true,
        label:
          mode === "edit"
            ? (copy.computedUpdateExampleButton ?? "Update")
            : (copy.computedAddExampleButton ?? "Add Example"),
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
        label: copy.addVariableButton ?? "Add",
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
  conditionalDraft: undefined,
  computedExamples: [],
  computedExampleDialog: {
    isOpen: false,
    key: 0,
    mode: "add",
    editingExampleId: undefined,
    inputItems: [],
    defaultValues: {},
    draftValues: {},
  },
  operationChoiceMenu: {
    isOpen: false,
    x: 0,
    y: 0,
  },
  operationBlockMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    operationPath: [],
    purpose: "operation",
    target: cloneExpressionTarget(),
    operandIndex: undefined,
  },
  operandSourceMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    operationPath: [],
    purpose: "operand",
    target: cloneExpressionTarget(),
    operandIndex: undefined,
  },
  operationValuePopover: {
    isOpen: false,
    x: 0,
    y: 0,
    operationPath: [],
    purpose: "operand",
    target: cloneExpressionTarget(),
    operandIndex: undefined,
    initialValue: undefined,
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

const collectDraftVariablePaths = (value, paths) => {
  if (Array.isArray(value)) {
    value.forEach((item) => {
      collectDraftVariablePaths(item, paths);
    });
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }
  if (value.source === "variable" && value.variablePath) {
    paths.add(value.variablePath);
    return;
  }
  Object.values(value).forEach((item) => {
    collectDraftVariablePaths(item, paths);
  });
};

export const selectComputedExampleInputDefinition = ({ state }) => {
  if (state.defaultValues.computed) {
    return state.defaultValues.computed;
  }
  const variablePaths = new Set();
  collectDraftVariablePaths(state.operationDraft, variablePaths);
  collectDraftVariablePaths(state.conditionalDraft, variablePaths);
  return {
    expr: {
      exampleInputs: [...variablePaths].map((variablePath) => ({
        var: variablePath,
      })),
    },
  };
};

export const selectComputedExampleDialog = ({ state }) =>
  state.computedExampleDialog;

export const selectComputedExampleDialogDefaultValues = ({ state }) =>
  state.computedExampleDialog.defaultValues;

export const selectSubmitContext = ({ state }) => ({
  defaultValues: state.defaultValues,
  targetGroupId: state.targetGroupId,
  dialogMode: state.dialogMode,
  editingItemId: state.editingItemId,
  computedMode: state.conditionalDraft ? "conditional" : "operation",
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
  const previousVariableType = state.defaultValues.variableType;
  state.defaultValues = {
    ...state.defaultValues,
    ...payload,
  };
  const operationDefinition = getComputedOperationDefinition(
    state.operationDraft?.type,
  );
  if (
    state.defaultValues.valueSource === "computed" &&
    ((operationDefinition &&
      operationDefinition.resultType !== state.defaultValues.variableType) ||
      (state.conditionalDraft &&
        previousVariableType !== state.defaultValues.variableType))
  ) {
    state.operationDraft = undefined;
    state.conditionalDraft = undefined;
    state.computedExamples = [];
    resetComputedExampleDialog(state);
    state.defaultValues.computed = undefined;
    state.operationChoiceMenu.isOpen = false;
    state.operationBlockMenu.isOpen = false;
    state.operandSourceMenu.isOpen = false;
    state.operationValuePopover.isOpen = false;
  }
};

export const toggleDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = !state.isDialogOpen;
};

const resetComputedExampleDialog = (state) => {
  state.computedExampleDialog.isOpen = false;
  state.computedExampleDialog.mode = "add";
  state.computedExampleDialog.editingExampleId = undefined;
  state.computedExampleDialog.inputItems = [];
  state.computedExampleDialog.defaultValues = {};
  state.computedExampleDialog.draftValues = {};
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
  state.conditionalDraft = undefined;
  state.computedExamples = [];
  resetComputedExampleDialog(state);
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
  state.conditionalDraft = createConditionalDraftFromComputed(
    defaultValues.computed,
  );
  state.operationDraft = state.conditionalDraft
    ? undefined
    : createOperationDraftFromComputed(defaultValues.computed);
  state.computedExamples = Array.isArray(defaultValues.computed?.examples)
    ? structuredClone(defaultValues.computed.examples)
    : [];
  resetComputedExampleDialog(state);
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
  state.conditionalDraft = undefined;
  state.computedExamples = [];
  resetComputedExampleDialog(state);
  state.defaultValues = structuredClone(DEFAULT_FORM_VALUES);
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.enumValuePopover.isOpen = false;
  state.enumValueMenu.isOpen = false;
  state.enumValueMenu.targetIndex = undefined;
};

const cloneComputedExampleValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(cloneComputedExampleValue);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        cloneComputedExampleValue(item),
      ]),
    );
  }
  return value;
};

const syncComputedDraft = (state) => {
  const computed = state.conditionalDraft
    ? buildComputedFromConditionalDraft(state.conditionalDraft)
    : buildComputedFromOperationDraft(state.operationDraft);
  if (computed && state.computedExamples.length > 0) {
    computed.examples = cloneComputedExampleValue(state.computedExamples);
  }
  state.defaultValues.computed = computed;
};

export const openComputedExampleDialog = (
  { state },
  { exampleId, inputItems = [] } = {},
) => {
  const example = state.computedExamples.find((item) => item.id === exampleId);
  const defaultValues = createComputedExampleDefaultValues({
    inputItems,
    example,
  });
  state.computedExampleDialog.isOpen = true;
  state.computedExampleDialog.key += 1;
  state.computedExampleDialog.mode = example ? "edit" : "add";
  state.computedExampleDialog.editingExampleId = example?.id;
  state.computedExampleDialog.inputItems = structuredClone(inputItems);
  state.computedExampleDialog.defaultValues = defaultValues;
  state.computedExampleDialog.draftValues = structuredClone(defaultValues);
};

export const closeComputedExampleDialog = ({ state }) => {
  resetComputedExampleDialog(state);
};

export const updateComputedExampleDraft = ({ state }, { values = {} } = {}) => {
  state.computedExampleDialog.draftValues = {
    ...state.computedExampleDialog.draftValues,
    ...values,
  };
};

export const saveComputedExample = ({ state }, { id, name, input } = {}) => {
  if (!id || !name || !input) {
    return;
  }
  const example = {
    id,
    name,
    input: cloneComputedExampleValue(input),
  };
  const index = state.computedExamples.findIndex((item) => item.id === id);
  if (index === -1) {
    state.computedExamples.push(example);
  } else {
    state.computedExamples[index] = example;
  }
  syncComputedDraft(state);
};

export const removeComputedExample = ({ state }, { exampleId } = {}) => {
  const index = state.computedExamples.findIndex(
    (item) => item.id === exampleId,
  );
  if (index === -1) {
    return;
  }
  state.computedExamples.splice(index, 1);
  syncComputedDraft(state);
};

export const createOperation = ({ state }, { operationType } = {}) => {
  const definition = getComputedOperationDefinition(operationType);
  if (
    !definition ||
    definition.resultType !== state.defaultValues.variableType
  ) {
    return;
  }
  if (state.operationDraft?.type !== operationType) {
    state.operationDraft = createOperationDraft(operationType);
  }
  state.conditionalDraft = undefined;
  syncComputedDraft(state);
};

export const createConditional = ({ state }) => {
  state.operationDraft = undefined;
  state.conditionalDraft = createConditionalDraft();
  syncComputedDraft(state);
};

const cloneOperationPath = (operationPath = []) => {
  return Array.isArray(operationPath) ? [...operationPath] : [];
};

const getConditionalNode = (conditionalDraft, target = {}) => {
  if (target.kind === "condition") {
    return conditionalDraft?.branches[target.branchIndex]?.when;
  }
  if (target.kind === "result") {
    return conditionalDraft?.branches[target.branchIndex]?.result;
  }
  if (target.kind === "default") {
    return conditionalDraft?.defaultResult;
  }
  return undefined;
};

const setConditionalNodeDraft = (conditionalDraft, target = {}, node) => {
  if (target.kind === "condition") {
    const branch = conditionalDraft?.branches[target.branchIndex];
    if (!branch) {
      return false;
    }
    branch.when = node;
    return true;
  }
  if (target.kind === "result") {
    const branch = conditionalDraft?.branches[target.branchIndex];
    if (!branch) {
      return false;
    }
    branch.result = node;
    return true;
  }
  if (target.kind === "default" && conditionalDraft) {
    conditionalDraft.defaultResult = node;
    return true;
  }
  return false;
};

const getExpressionTargetExpectedTypes = (state, target = {}) => {
  if (target.kind === "condition") {
    return ["boolean"];
  }
  if (target.kind === "result" || target.kind === "default") {
    return [state.defaultValues.variableType];
  }
  return [];
};

export const setConditionalNode = (
  { state },
  { source, variablePath, value, operationType, target } = {},
) => {
  if (!state.conditionalDraft || !isConditionalExpressionTarget(target)) {
    return;
  }
  if (target.kind === "condition" && source !== "operation") {
    return;
  }

  const expectedTypes = getExpressionTargetExpectedTypes(state, target);
  let node;
  if (source === "variable" && variablePath) {
    node = {
      source: "variable",
      variablePath,
    };
  } else if (
    source === "value" &&
    target.kind !== "condition" &&
    isComputedLiteralValue(value) &&
    expectedTypes.includes(typeof value)
  ) {
    node = {
      source: "value",
      value,
    };
  } else if (
    source === "operation" &&
    isSupportedComputedOperationType(operationType) &&
    expectedTypes.includes(
      getComputedOperationDefinition(operationType).resultType,
    ) &&
    (target.kind !== "condition" ||
      isComputedConditionOperationType(operationType))
  ) {
    const operation =
      target.kind === "condition"
        ? createConditionalOperationDraft(operationType)
        : createOperationDraft(operationType);
    node = {
      source: "operation",
      operation,
    };
  } else {
    return;
  }

  if (!setConditionalNodeDraft(state.conditionalDraft, target, node)) {
    return;
  }
  syncComputedDraft(state);
};

export const removeConditionalNode = ({ state }, { target } = {}) => {
  if (
    !state.conditionalDraft ||
    !isConditionalExpressionTarget(target) ||
    !setConditionalNodeDraft(state.conditionalDraft, target, undefined)
  ) {
    return;
  }
  syncComputedDraft(state);
};

export const selectConditionalNodeValue = ({ state }, { target } = {}) => {
  const node = getConditionalNode(state.conditionalDraft, target);
  return node?.source === "value" ? node.value : undefined;
};

export const addConditionalBranch = ({ state }) => {
  if (!state.conditionalDraft) {
    return;
  }
  state.conditionalDraft.branches.push(createConditionalBranchDraft());
  syncComputedDraft(state);
};

export const duplicateConditionalBranch = ({ state }, { branchIndex } = {}) => {
  const branch = state.conditionalDraft?.branches[branchIndex];
  if (!branch) {
    return;
  }
  state.conditionalDraft.branches.splice(
    branchIndex + 1,
    0,
    cloneConditionalBranchDraft(branch),
  );
  syncComputedDraft(state);
};

export const moveConditionalBranch = (
  { state },
  { branchIndex, offset } = {},
) => {
  const branches = state.conditionalDraft?.branches;
  const targetIndex = branchIndex + offset;
  if (
    !branches?.[branchIndex] ||
    targetIndex < 0 ||
    targetIndex >= branches.length
  ) {
    return;
  }
  const [branch] = branches.splice(branchIndex, 1);
  branches.splice(targetIndex, 0, branch);
  syncComputedDraft(state);
};

export const removeConditionalBranch = ({ state }, { branchIndex } = {}) => {
  const branches = state.conditionalDraft?.branches;
  if (!branches?.[branchIndex] || branches.length <= 1) {
    return;
  }
  branches.splice(branchIndex, 1);
  syncComputedDraft(state);
};

const findOperationAtPath = (
  state,
  target = FORMULA_EXPRESSION_TARGET,
  operationPath = [],
) => {
  const rootNode = getConditionalNode(state.conditionalDraft, target);
  let operation =
    target.kind === "formula"
      ? state.operationDraft
      : rootNode?.source === "operation"
        ? rootNode.operation
        : undefined;
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
  {
    source,
    variablePath,
    value,
    operationType,
    operationPath = [],
    target = FORMULA_EXPRESSION_TARGET,
  } = {},
) => {
  const operation = findOperationAtPath(state, target, operationPath);
  const definition = getComputedOperationDefinition(operation?.type);
  if (
    !definition ||
    !canAddComputedOperationOperand(operation.type, operation.operands.length)
  ) {
    return;
  }

  if (source === "variable") {
    const operand = {
      source: "variable",
      variablePath: variablePath ?? "",
    };
    if (
      definition.expressionShape === "left-fold" &&
      operation.operands[0]?.source === "operation"
    ) {
      operation.operands.unshift(operand);
    } else {
      operation.operands.push(operand);
    }
  } else if (
    source === "value" &&
    isComputedLiteralValue(value) &&
    definition.operandTypes.includes(typeof value)
  ) {
    const operand = {
      source: "value",
      value,
    };
    if (
      definition.expressionShape === "left-fold" &&
      operation.operands[0]?.source === "operation"
    ) {
      operation.operands.unshift(operand);
    } else {
      operation.operands.push(operand);
    }
  } else if (
    source === "operation" &&
    isSupportedComputedOperationType(operationType) &&
    (target.kind !== "condition" ||
      isComputedConditionOperationType(operationType)) &&
    definition.operandTypes.includes(
      getComputedOperationDefinition(operationType).resultType,
    ) &&
    (definition.expressionShape !== "left-fold" ||
      (operation.operands.length > 0 &&
        operation.operands[0].source !== "operation"))
  ) {
    operation.operands.push({
      source: "operation",
      operation: createOperationDraft(operationType),
    });
  } else {
    return;
  }
  syncComputedDraft(state);
};

export const updateOperationValueOperand = (
  { state },
  { operationPath = [], target = FORMULA_EXPRESSION_TARGET, index, value } = {},
) => {
  const operation = findOperationAtPath(state, target, operationPath);
  const operand = operation?.operands[index];
  const definition = getComputedOperationDefinition(operation?.type);
  if (
    !operand ||
    operand.source !== "value" ||
    !isComputedLiteralValue(value) ||
    !definition?.operandTypes.includes(typeof value)
  ) {
    return;
  }
  operand.value = value;
  syncComputedDraft(state);
};

export const updateOperationVariableOperand = (
  { state },
  {
    operationPath = [],
    target = FORMULA_EXPRESSION_TARGET,
    index,
    variablePath,
  } = {},
) => {
  const operation = findOperationAtPath(state, target, operationPath);
  const operand = operation?.operands[index];
  if (operand?.source !== "variable" || !variablePath) {
    return;
  }
  operand.variablePath = variablePath;
  syncComputedDraft(state);
};

export const removeOperationOperand = (
  { state },
  { operationPath = [], target = FORMULA_EXPRESSION_TARGET, index } = {},
) => {
  const operation = findOperationAtPath(state, target, operationPath);
  if (!operation?.operands[index]) {
    return;
  }
  operation.operands.splice(index, 1);
  syncComputedDraft(state);
};

export const removeOperation = (
  { state },
  { operationPath = [], target = FORMULA_EXPRESSION_TARGET } = {},
) => {
  if (operationPath.length === 0) {
    if (target.kind === "formula") {
      state.operationDraft = undefined;
    } else if (
      !setConditionalNodeDraft(state.conditionalDraft, target, undefined)
    ) {
      return;
    }
  } else {
    const parentOperationPath = operationPath.slice(0, -1);
    const operandIndex = operationPath.at(-1);
    const parentOperation = findOperationAtPath(
      state,
      target,
      parentOperationPath,
    );
    const operand = parentOperation?.operands[operandIndex];
    if (operand?.source !== "operation") {
      return;
    }
    parentOperation.operands.splice(operandIndex, 1);
  }
  syncComputedDraft(state);
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
};

export const showOperationChoiceMenu = ({ state }, { x, y } = {}) => {
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.operationChoiceMenu.isOpen = true;
  state.operationChoiceMenu.x = x ?? 0;
  state.operationChoiceMenu.y = y ?? 0;
};

export const hideOperationChoiceMenu = ({ state }) => {
  state.operationChoiceMenu.isOpen = false;
};

export const showOperationBlockMenu = (
  { state },
  {
    x,
    y,
    operationPath = [],
    purpose = "operation",
    target = FORMULA_EXPRESSION_TARGET,
    operandIndex,
  } = {},
) => {
  state.operationChoiceMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.operationBlockMenu.isOpen = true;
  state.operationBlockMenu.x = x ?? 0;
  state.operationBlockMenu.y = y ?? 0;
  state.operationBlockMenu.operationPath = cloneOperationPath(operationPath);
  state.operationBlockMenu.purpose = purpose;
  state.operationBlockMenu.target = cloneExpressionTarget(target);
  state.operationBlockMenu.operandIndex = operandIndex;
};

export const hideOperationBlockMenu = ({ state }) => {
  state.operationBlockMenu.isOpen = false;
};

export const selectOperationBlockMenuPath = ({ state }) => {
  return [...state.operationBlockMenu.operationPath];
};

export const selectOperationBlockMenuPosition = ({ state }) => ({
  operationPath: [...state.operationBlockMenu.operationPath],
  purpose: state.operationBlockMenu.purpose,
  target: cloneExpressionTarget(state.operationBlockMenu.target),
  operandIndex: state.operationBlockMenu.operandIndex,
});

export const showOperandSourceMenu = (
  { state },
  {
    x,
    y,
    operationPath = [],
    purpose = "operand",
    target = FORMULA_EXPRESSION_TARGET,
    operandIndex,
  } = {},
) => {
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operationValuePopover.isOpen = false;
  state.operandSourceMenu.isOpen = true;
  state.operandSourceMenu.x = x ?? 0;
  state.operandSourceMenu.y = y ?? 0;
  state.operandSourceMenu.operationPath = cloneOperationPath(operationPath);
  state.operandSourceMenu.purpose = purpose;
  state.operandSourceMenu.target = cloneExpressionTarget(target);
  state.operandSourceMenu.operandIndex = operandIndex;
};

export const hideOperandSourceMenu = ({ state }) => {
  state.operandSourceMenu.isOpen = false;
};

export const selectOperandSourceMenuPosition = ({ state }) => ({
  x: state.operandSourceMenu.x,
  y: state.operandSourceMenu.y,
  operationPath: [...state.operandSourceMenu.operationPath],
  purpose: state.operandSourceMenu.purpose,
  target: cloneExpressionTarget(state.operandSourceMenu.target),
  operandIndex: state.operandSourceMenu.operandIndex,
});

export const showOperationValuePopover = (
  { state },
  {
    x,
    y,
    operationPath = [],
    purpose = "operand",
    target = FORMULA_EXPRESSION_TARGET,
    operandIndex,
    initialValue,
  } = {},
) => {
  state.operationChoiceMenu.isOpen = false;
  state.operationBlockMenu.isOpen = false;
  state.operandSourceMenu.isOpen = false;
  state.operationValuePopover.isOpen = true;
  state.operationValuePopover.x = x ?? 0;
  state.operationValuePopover.y = y ?? 0;
  state.operationValuePopover.operationPath = cloneOperationPath(operationPath);
  state.operationValuePopover.purpose = purpose;
  state.operationValuePopover.target = cloneExpressionTarget(target);
  state.operationValuePopover.operandIndex = operandIndex;
  state.operationValuePopover.initialValue = initialValue;
};

export const hideOperationValuePopover = ({ state }) => {
  state.operationValuePopover.isOpen = false;
};

export const selectOperationValuePopoverPath = ({ state }) => {
  return [...state.operationValuePopover.operationPath];
};

export const selectOperationValuePopoverPosition = ({ state }) => ({
  operationPath: [...state.operationValuePopover.operationPath],
  purpose: state.operationValuePopover.purpose,
  target: cloneExpressionTarget(state.operationValuePopover.target),
  operandIndex: state.operationValuePopover.operandIndex,
});

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
  target = FORMULA_EXPRESSION_TARGET,
  variableOptionsByPath,
  copy,
}) => {
  if (!isSupportedComputedOperationType(operation?.type)) {
    return undefined;
  }

  const viewData = {
    type: operation.type,
    operationPath: [...operationPath],
    operands: operation.operands.map((operand, index) => {
      const viewOperand = {
        source: operand.source,
        index,
      };
      if (operand.source === "variable") {
        const option = variableOptionsByPath.get(operand.variablePath);
        viewOperand.variablePath = operand.variablePath;
        viewOperand.variableLabel = option?.label ?? operand.variablePath ?? "";
        viewOperand.variableTypeLabel =
          option?.suffixText ?? copy.computedAnyTypeLabel ?? "Any";
      } else if (operand.source === "value") {
        viewOperand.value = operand.value;
        if (typeof operand.value === "boolean") {
          viewOperand.booleanValueLabel = getBooleanLabel(operand.value, copy);
        }
      } else if (operand.source === "operation") {
        viewOperand.operation = buildOperationBlockViewData({
          operation: operand.operation,
          operationPath: [...operationPath, index],
          target,
          variableOptionsByPath,
          copy,
        });
      }
      return viewOperand;
    }),
  };
  if (target.kind !== "formula") {
    viewData.target = cloneExpressionTarget(target);
  }
  return viewData;
};

const buildConditionalNodeViewData = ({
  node,
  target,
  variableOptionsByPath,
  copy,
}) => {
  if (!node) {
    return undefined;
  }

  const viewNode = {
    source: node.source,
    target: cloneExpressionTarget(target),
  };
  if (node.source === "variable") {
    const option = variableOptionsByPath.get(node.variablePath);
    viewNode.variableLabel = option?.label ?? node.variablePath ?? "";
    viewNode.variableTypeLabel =
      option?.suffixText ?? copy.computedAnyTypeLabel ?? "Any";
  } else if (node.source === "value") {
    viewNode.value =
      typeof node.value === "object" ? JSON.stringify(node.value) : node.value;
    if (typeof node.value === "boolean") {
      viewNode.booleanValueLabel = getBooleanLabel(node.value, copy);
    }
  } else if (node.source === "operation") {
    viewNode.operation = buildOperationBlockViewData({
      operation: node.operation,
      target,
      variableOptionsByPath,
      copy,
    });
  }
  return viewNode;
};

const getOperationOperandOutputType = (operand, variableOptionsByPath) => {
  if (operand?.source === "value") {
    return typeof operand.value;
  }
  if (operand?.source === "variable") {
    return variableOptionsByPath.get(operand.variablePath)?.variableType;
  }
  if (operand?.source === "operation") {
    return getComputedOperationDefinition(operand.operation?.type)?.resultType;
  }
  return undefined;
};

const getAcceptedOperationOperandTypes = (operation, variableOptionsByPath) => {
  const definition = getComputedOperationDefinition(operation?.type);
  if (!definition) {
    return ["number"];
  }

  if (definition.operandTypes.length === 1 || operation.operands.length === 0) {
    return definition.operandTypes;
  }

  const firstOperandType = getOperationOperandOutputType(
    operation.operands[0],
    variableOptionsByPath,
  );
  return definition.operandTypes.includes(firstOperandType)
    ? [firstOperandType]
    : definition.operandTypes;
};

const canAddNestedOperation = (operation) => {
  const definition = getComputedOperationDefinition(operation?.type);
  if (
    !definition ||
    !canAddComputedOperationOperand(operation.type, operation.operands.length)
  ) {
    return false;
  }

  return (
    definition.expressionShape !== "left-fold" ||
    (operation.operands.length > 0 &&
      operation.operands[0].source !== "operation")
  );
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
  const showTagFilter = parseBooleanProp(props.showTagFilter);
  const resourceImportMenuItems = buildResourceOverflowMenuItems({
    showFilter: mobileLayout && showTagFilter,
    i18n,
  });
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
        const variableType = item.variableType || "string";
        const storedDefault =
          variableType === "number" &&
          (item.default === undefined || item.default === "")
            ? 0
            : (item.default ?? "");
        let defaultValue = isComputed ? "" : storedDefault;
        if (typeof defaultValue === "boolean") {
          defaultValue = getBooleanLabel(defaultValue, copy);
        }
        const scope = item.scope ?? "context";
        return {
          id: item.id,
          name: item.name,
          description: item.description ?? "",
          scope: isComputed ? "" : getScopeLabel(scope, copy),
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
        submitButton.label = copy.updateVariableButton ?? "Update";
      }
    });
    const computedSubmitButton = computedForm.actions?.buttons?.find(
      (button) => button.id === "submit",
    );
    if (computedSubmitButton) {
      computedSubmitButton.label =
        copy.updateComputedVariableButton ?? "Update";
    }
  } else {
    variableForm.title = copy.addVariableTitle ?? "Add Variable";
    computedForm.title =
      copy.addComputedVariableTitle ?? "Add Computed Variable";
    const computedSubmitButton = computedForm.actions?.buttons?.find(
      (button) => button.id === "submit",
    );
    if (computedSubmitButton) {
      computedSubmitButton.label = copy.addComputedVariableButton ?? "Add";
    }
  }

  const variableSubmitLabel =
    variableForm.actions?.buttons?.find((button) => button.id === "submit")
      ?.label ?? "Submit";
  const computedSubmitLabel =
    computedForm.actions?.buttons?.find((button) => button.id === "submit")
      ?.label ?? "Submit";
  variableForm.actions.buttons = [];
  computedForm.actions.buttons = [];

  const enumValueOptions = buildVariableEnumOptions(defaultValues.enumValues);
  const variableTypeOptions = [
    { value: "string", label: copy.variableTypeStringLabel ?? "String" },
    { value: "number", label: copy.variableTypeNumberLabel ?? "Number" },
    {
      value: "boolean",
      label: copy.variableTypeBooleanLabel ?? "Boolean",
    },
  ];
  const excludedOperationVariableId = resolveExcludedOperationVariableId({
    dialogMode: state.dialogMode,
    editingItemId: state.editingItemId,
    selectedItemId: props.selectedItemId,
  });
  const operationVariableOptions = (props.flatGroups ?? [])
    .flatMap((group) => group.children ?? [])
    .filter(
      (item) =>
        item.type === "variable" &&
        COMPUTED_OPERAND_VARIABLE_TYPES.has(item.variableType ?? "string"),
    )
    .map((item) => {
      const variableType = item.variableType ?? "string";
      return {
        itemId: item.id,
        value: toVariablePath(item.id),
        label: item.name,
        variableType,
        suffixText: getVariableTypeLabel(variableType, copy),
      };
    });
  const variableOptionsByPath = new Map(
    operationVariableOptions.map((item) => [item.value, item]),
  );
  const operationChoiceMenu = {
    ...state.operationChoiceMenu,
    items: createOperationChoiceMenuItems(copy, {
      includeConditional: true,
      operationTypes: getOperationTypesForResultType(
        defaultValues.variableType,
      ),
    }),
  };
  const operationBlockMenu = {
    ...state.operationBlockMenu,
    items: createOperationBlockMenuItems(copy),
  };
  const operandTargetOperation = findOperationAtPath(
    state,
    state.operandSourceMenu.target,
    state.operandSourceMenu.operationPath,
  );
  const isNodeVariableMenu =
    state.operandSourceMenu.purpose === "node-variable";
  const isOperationVariableMenu =
    state.operandSourceMenu.purpose === "operation-variable";
  const isVariableMenu = isNodeVariableMenu || isOperationVariableMenu;
  const isNodeSourceMenu =
    state.operandSourceMenu.purpose === "node" || isNodeVariableMenu;
  const isDirectConditionNode =
    isNodeSourceMenu && state.operandSourceMenu.target.kind === "condition";
  const acceptedOperandTypes = isNodeSourceMenu
    ? getExpressionTargetExpectedTypes(state, state.operandSourceMenu.target)
    : getAcceptedOperationOperandTypes(
        operandTargetOperation,
        variableOptionsByPath,
      );
  const variableMenuItems = operationVariableOptions
    .filter(
      (item) =>
        item.itemId !== excludedOperationVariableId &&
        acceptedOperandTypes.includes(item.variableType),
    )
    .map(({ itemId: _itemId, variableType: _variableType, ...item }) => ({
      ...item,
      type: "item",
    }));
  const availableOperationTypes =
    state.operandSourceMenu.target.kind === "condition"
      ? COMPUTED_CONDITION_OPERATION_TYPES
      : COMPUTED_OPERATION_TYPES;
  const nestedOperationTypes = availableOperationTypes.filter((operationType) =>
    acceptedOperandTypes.includes(
      getComputedOperationDefinition(operationType).resultType,
    ),
  );
  const valueTypes = isDirectConditionNode
    ? []
    : COMPUTED_LITERAL_TYPES.filter((valueType) =>
        acceptedOperandTypes.includes(valueType),
      );
  const operandSourceMenu = {
    ...state.operandSourceMenu,
    items: isVariableMenu
      ? variableMenuItems
      : createOperandSourceMenuItems(copy, {
          operationEnabled:
            (isNodeSourceMenu ||
              canAddNestedOperation(operandTargetOperation)) &&
            nestedOperationTypes.length > 0,
          operationTypes: nestedOperationTypes,
          valueEnabled:
            valueTypes.length > 0 &&
            !isComputedLogicalOperationType(operandTargetOperation?.type),
          valueVisible: !isDirectConditionNode,
          variableVisible: !isDirectConditionNode,
          variableItems: variableMenuItems,
        }),
  };
  const valueTargetOperation = findOperationAtPath(
    state,
    state.operationValuePopover.target,
    state.operationValuePopover.operationPath,
  );
  const valueAcceptedTypes =
    state.operationValuePopover.purpose === "node"
      ? getExpressionTargetExpectedTypes(
          state,
          state.operationValuePopover.target,
        )
      : getAcceptedOperationOperandTypes(
          valueTargetOperation,
          variableOptionsByPath,
        );
  const operationValuePopover = {
    ...state.operationValuePopover,
    valueTypes:
      state.operationValuePopover.purpose === "node" &&
      state.operationValuePopover.target.kind === "condition"
        ? []
        : COMPUTED_LITERAL_TYPES.filter((valueType) =>
            valueAcceptedTypes.includes(valueType),
          ),
  };
  const operationBlock = buildOperationBlockViewData({
    operation: state.operationDraft,
    target: FORMULA_EXPRESSION_TARGET,
    variableOptionsByPath,
    copy,
  });
  const conditionalBuilder = state.conditionalDraft
    ? {
        branches: state.conditionalDraft.branches.map((branch, branchIndex) => {
          const conditionTarget = { kind: "condition", branchIndex };
          const resultTarget = { kind: "result", branchIndex };
          return {
            branchIndex,
            branchLabel:
              branchIndex === 0
                ? (copy.computedConditionalIfLabel ?? "If")
                : (copy.computedConditionalElseIfLabel ?? "Else if"),
            canMoveUp: branchIndex > 0,
            canMoveDown:
              branchIndex < state.conditionalDraft.branches.length - 1,
            canRemove: state.conditionalDraft.branches.length > 1,
            condition: buildConditionalNodeViewData({
              node: branch.when,
              target: conditionTarget,
              variableOptionsByPath,
              copy,
            }),
            conditionTarget,
            result: buildConditionalNodeViewData({
              node: branch.result,
              target: resultTarget,
              variableOptionsByPath,
              copy,
            }),
            resultTarget,
          };
        }),
        defaultResult: buildConditionalNodeViewData({
          node: state.conditionalDraft.defaultResult,
          target: { kind: "default" },
          variableOptionsByPath,
          copy,
        }),
        defaultTarget: { kind: "default" },
      }
    : undefined;
  const computedExampleInputItems = createComputedExampleInputItems({
    computed: defaultValues.computed,
    flatGroups: props.flatGroups,
  });
  const computedExamples = state.computedExamples.map((example, index) => {
    const result = evaluateComputedExample({
      computed: defaultValues.computed,
      variableType: defaultValues.variableType,
      flatGroups: props.flatGroups,
      input: example.input,
    });
    return {
      id: example.id,
      label:
        example.name?.trim() ||
        (copy.computedExampleLabel ?? "Example {number}").replace(
          "{number}",
          String(index + 1),
        ),
      inputs: computedExampleInputItems.map((item) => ({
        label: item.name,
        value: formatComputedExampleValue(
          resolveComputedExampleInputValue({ item, example }),
        ),
      })),
      result: result.valid
        ? formatComputedExampleValue(result.value)
        : (copy.computedExampleResultError ?? "Unable to calculate result"),
      resultValid: result.valid,
    };
  });
  let computedExampleDialogInput;
  try {
    computedExampleDialogInput = buildComputedExampleInput({
      inputItems: state.computedExampleDialog.inputItems,
      values: state.computedExampleDialog.draftValues,
    });
  } catch {
    computedExampleDialogInput = undefined;
  }
  const computedExampleDialogResult = computedExampleDialogInput
    ? evaluateComputedExample({
        computed: defaultValues.computed,
        variableType: defaultValues.variableType,
        flatGroups: props.flatGroups,
        input: computedExampleDialogInput,
      })
    : { valid: false };
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
    showTagFilter: showTagFilter && !mobileLayout,
    resourceImportMenuItems,
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
    variableSubmitLabel,
    computedSubmitLabel,
    conditionalBuilder,
    dialogKey,
    dialogMode: state.dialogMode,
    editingItemId: state.editingItemId,
    operationBlock,
    operationBlockMenu,
    operationChoiceMenu,
    operandSourceMenu,
    operationValuePopover,
    computedExamples,
    computedExamplesLabel: copy.computedExamplesLabel ?? "Examples",
    computedExampleAddLabel: copy.computedAddExampleButton ?? "Add Example",
    computedNoExamplesMessage:
      copy.computedNoExamplesMessage ?? "No examples yet",
    computedExampleResultLabel: copy.computedExampleResultLabel ?? "Result",
    computedExampleDialog: state.computedExampleDialog,
    computedExampleForm: createComputedExampleForm({
      copy,
      inputItems: state.computedExampleDialog.inputItems,
      mode: state.computedExampleDialog.mode,
    }),
    computedExampleDefaultValues: state.computedExampleDialog.defaultValues,
    computedExampleDialogResult: computedExampleDialogResult.valid
      ? formatComputedExampleValue(computedExampleDialogResult.value)
      : (copy.computedExampleResultError ?? "Unable to calculate result"),
    computedExampleDialogResultValid: computedExampleDialogResult.valid,
    computedExampleNoInputsMessage:
      copy.computedExampleNoInputsMessage ??
      "This formula does not use any variable or runtime inputs.",
    operationLabel: copy.computedOperationLabel ?? "Operation",
    addOperationLabel: copy.computedAddOperationLabel ?? "Add an Operation",
    conditionalWhenLabel: copy.computedConditionalWhenLabel ?? "When",
    conditionalThenLabel: copy.computedConditionalThenLabel ?? "Then",
    conditionalOtherwiseLabel:
      copy.computedConditionalOtherwiseLabel ?? "Otherwise",
    conditionalAddBranchLabel:
      copy.computedConditionalAddBranchLabel ?? "Add condition",
    conditionalAddConditionLabel:
      copy.computedConditionalAddConditionLabel ?? "Add condition",
    conditionalAddResultLabel:
      copy.computedConditionalAddResultLabel ?? "Add result",
    conditionalDuplicateBranchLabel:
      copy.computedConditionalDuplicateBranchLabel ?? "Duplicate condition",
    conditionalRemoveBranchLabel:
      copy.computedConditionalRemoveBranchLabel ?? "Remove condition",
    conditionalMoveBranchUpLabel:
      copy.computedConditionalMoveBranchUpLabel ?? "Move condition up",
    conditionalMoveBranchDownLabel:
      copy.computedConditionalMoveBranchDownLabel ?? "Move condition down",
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
