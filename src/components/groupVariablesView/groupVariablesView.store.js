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

const DEFAULT_FORM_VALUES = {
  name: "",
  description: "",
  scope: "context",
  variableType: "string",
  isEnum: false,
  enumValues: [],
  default: "",
  tagIds: [],
};

const DEFAULT_ENUM_VALUE_FORM_VALUES = {
  value: "",
};
const DEFAULT_PROGRESSIVE_INITIAL_ITEM_COUNT = 4;

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
      options: [
        { value: "string", label: copy.variableTypeStringLabel ?? "String" },
        { value: "number", label: copy.variableTypeNumberLabel ?? "Number" },
        {
          value: "boolean",
          label: copy.variableTypeBooleanLabel ?? "Boolean",
        },
      ],
    },
    {
      $when: "values.variableType == 'string'",
      name: "isEnum",
      type: "checkbox",
      content: copy.enumLabel ?? "Enum",
    },
    {
      $when: "values.variableType == 'string' && values.isEnum == true",
      type: "slot",
      slot: "enum-values",
      label: copy.valuesLabel ?? "Values",
    },
    {
      $when: "values.variableType == 'boolean'",
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
      $when: "values.variableType == 'string' && values.isEnum != true",
      name: "default",
      type: "input-text",
      label: copy.defaultLabel ?? "Default",
      required: false,
    },
    {
      $when: "values.variableType == 'string' && values.isEnum == true",
      name: "default",
      type: "select",
      label: copy.defaultLabel ?? "Default",
      clearable: false,
      options: "${enumValueOptions}",
      required: false,
    },
    {
      $when: "values.variableType == 'number'",
      name: "default",
      type: "input-number",
      label: copy.defaultLabel ?? "Default",
      required: false,
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

  form: createVariableForm(),
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

export const openAddDialog = ({ state }, { groupId } = {}) => {
  state.isDialogOpen = true;
  state.targetGroupId = groupId;
  state.dialogMode = "add";
  state.editingItemId = null;
  state.defaultValues = structuredClone(DEFAULT_FORM_VALUES);
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
  state.defaultValues = {
    ...structuredClone(DEFAULT_FORM_VALUES),
    ...defaultValues,
  };
  state.enumValuePopover.isOpen = false;
  state.enumValueMenu.isOpen = false;
  state.enumValueMenu.targetIndex = undefined;
};

export const closeDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.targetGroupId = null;
  state.dialogMode = "add";
  state.editingItemId = null;
  state.defaultValues = structuredClone(DEFAULT_FORM_VALUES);
  state.enumValuePopover.isOpen = false;
  state.enumValueMenu.isOpen = false;
  state.enumValueMenu.targetIndex = undefined;
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

    const scope = item.scope || "context";
    const variableType = item.variableType || "string";
    const defaultValue =
      typeof item.default === "boolean"
        ? getBooleanLabel(item.default, copy)
        : String(item.default ?? "");
    const searchTerms = [
      scope,
      getScopeLabel(scope, copy),
      variableType,
      getVariableTypeLabel(variableType, copy),
      String(item.default ?? ""),
      defaultValue,
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

        let defaultValue = item.default ?? "";
        if (typeof defaultValue === "boolean") {
          defaultValue = getBooleanLabel(defaultValue, copy);
        }
        const scope = item.scope || "context";
        const variableType = item.variableType || "string";
        return {
          id: item.id,
          name: item.name,
          description: item.description ?? "",
          scope: getScopeLabel(scope, copy),
          variableType: getVariableTypeLabel(variableType, copy),
          default: defaultValue,
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
  const form = createVariableForm(copy);
  const submitButton = form.actions?.buttons?.find(
    (button) => button.id === "submit",
  );

  if (state.dialogMode === "edit") {
    form.title = copy.editVariableTitle ?? "Edit Variable";
    form.fields = (form.fields || []).map((field) => {
      if (field?.name !== "variableType") {
        return field;
      }
      const { options: _options, ...restField } = field;
      return {
        ...restField,
        type: "read-only-text",
        required: false,
        content: getVariableTypeLabel(defaultValues.variableType, copy),
      };
    });
    if (submitButton) {
      submitButton.label = copy.updateVariableButton ?? "Update Variable";
    }
  } else {
    form.title = copy.addVariableTitle ?? "Add Variable";
    if (submitButton) {
      submitButton.label = copy.addVariableButton ?? "Add Variable";
    }
  }

  const enumValueOptions = buildVariableEnumOptions(defaultValues.enumValues);
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
    tagFilterButtonBackgroundColor: hasActiveFilter ? "ac" : "bg",
    tagFilterButtonBorderColor: hasActiveFilter ? "ac" : "bo",
    tagFilterButtonIconColor: hasActiveFilter ? "white" : "mu-fg",
    isDialogOpen: state.isDialogOpen,
    defaultValues: defaultValues,
    form,
    dialogKey,
    dialogMode: state.dialogMode,
    editingItemId: state.editingItemId,
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
    addVariableButton: copy.addVariableButton ?? "Add Variable",
    nameLabel: copy.nameLabel ?? "Name",
    scopeLabel: copy.scopeLabel ?? "Scope",
    typeLabel: copy.typeLabel ?? "Type",
    defaultLabel: copy.defaultLabel ?? "Default",
    enumLabel: copy.enumLabel ?? "Enum",
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
    },
  };
};
