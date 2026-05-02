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
import {
  buildTagFilterPopoverViewData,
  clearTagFilterPopoverTagIds,
  closeTagFilterPopover,
  createTagFilterPopoverState,
  openTagFilterPopover,
  selectTagFilterPopoverDraftTagIds,
  toggleTagFilterPopoverTagId,
} from "../../internal/ui/tagFilterPopover.js";

const DEFAULT_FORM_VALUES = {
  name: "",
  description: "",
  scope: "context",
  type: "string",
  isEnum: false,
  enumValues: [],
  default: "",
  tagIds: [],
};

export const createInitialState = () => ({
  collapsedIds: [],
  ...createTagFilterPopoverState(),
  searchQuery: "",
  isDialogOpen: false,
  targetGroupId: null,
  dialogMode: "add",
  editingItemId: null,

  dropdownMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    targetItemId: null,
    items: [
      { label: "Edit", type: "item", value: "edit-item" },
      { label: "Delete", type: "item", value: "delete-item" },
    ],
  },

  defaultValues: structuredClone(DEFAULT_FORM_VALUES),

  form: {
    title: "Add Variable",
    description: "Create a new variable",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
        tooltip: {
          content: "This field is mandatory and must be unique",
        },
      },
      {
        name: "description",
        type: "input-textarea",
        label: "Description",
        required: false,
      },
      createTagField(),
      {
        name: "scope",
        type: "select",
        label: "Scope",
        required: true,
        options: [
          // # • context – temporary; resets when game restarts
          // # Example: Player progress, inventory items, story flags
          // # Use for values that are tied to gameplay state.
          //
          // # • device – saved on this device only
          // # Example: Text speed, sound/music volume, accessibility preferences
          // # Use for user preferences that should persist on the current device.
          //
          // # • account – synced across all devices
          // # Example: Whether the game is completed, unlocked bonus content, claimed daily rewards
          // # Use when the value should follow the player across multiple devices (via cloud sync).
          { value: "context", label: "Context" },
          { value: "device", label: "Device" },
          { value: "account", label: "Account" },
        ],
      },
      {
        name: "type",
        type: "select",
        label: "Type",
        required: true,
        options: [
          { value: "string", label: "String" },
          { value: "number", label: "Number" },
          { value: "boolean", label: "Boolean" },
        ],
      },
      {
        $when: "values.type == 'string'",
        name: "isEnum",
        type: "checkbox",
        content: "Enum",
      },
      {
        $when: "values.type == 'string' && values.isEnum == true",
        name: "enumValues",
        type: "tag-select",
        label: "Values",
        placeholder: "Add value",
        addOption: {
          label: "Add value",
        },
        options: "${enumValueOptions}",
        required: false,
      },
      {
        $when: "values.type == 'boolean'",
        name: "default",
        type: "select",
        label: "Default",
        options: [
          { value: true, label: "True" },
          { value: false, label: "False" },
        ],
        required: true,
      },
      {
        $when: "values.type == 'string' && values.isEnum != true",
        name: "default",
        type: "input-text",
        label: "Default",
        required: false,
      },
      {
        $when: "values.type == 'string' && values.isEnum == true",
        name: "default",
        type: "select",
        label: "Default",
        clearable: false,
        options: "${enumValueOptions}",
        required: false,
      },
      {
        $when: "values.type == 'number'",
        name: "default",
        type: "input-number",
        label: "Default",
        required: false,
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Add Variable",
        },
      ],
    },
  },
});

export const selectDefaultValues = ({ state }) => {
  return state.defaultValues;
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
};

export const closeDialog = ({ state }, _payload = {}) => {
  state.isDialogOpen = false;
  state.targetGroupId = null;
  state.dialogMode = "add";
  state.editingItemId = null;
  state.defaultValues = structuredClone(DEFAULT_FORM_VALUES);
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

export const selectViewData = ({ state, props }) => {
  const readonly = props.readonly === true;
  const rawSearchQuery = state.searchQuery ?? "";
  const searchQuery = rawSearchQuery.toLowerCase();
  const activeTagIds = props.selectedTagFilterValues ?? [];
  const hasActiveTagFilter = activeTagIds.length > 0;
  const searchInFilterPopover = parseBooleanProp(props.searchInFilterPopover);
  const hasActiveSearch = rawSearchQuery.trim().length > 0;
  const hasActiveFilter =
    hasActiveTagFilter || (searchInFilterPopover && hasActiveSearch);
  const tagFilterPopoverViewData = buildTagFilterPopoverViewData({
    state,
    props,
  });
  const mobileLayout = parseBooleanProp(props.mobileLayout);

  // Helper function to check if an item matches the search query
  const matchesSearch = (item) => {
    if (!searchQuery) {
      return true;
    }

    if (matchesTagAwareSearch(item, searchQuery)) {
      return true;
    }

    const scope = (item.scope || "").toLowerCase();
    const type = (item.type || "").toLowerCase();
    const defaultValue = String(item.default ?? "").toLowerCase();

    return (
      scope.includes(searchQuery) ||
      type.includes(searchQuery) ||
      defaultValue.includes(searchQuery)
    );
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
      const children = isCollapsed
        ? []
        : filteredChildren.map((item) => {
            let defaultValue = item.default ?? "";
            if (typeof defaultValue === "boolean") {
              defaultValue = defaultValue ? "true" : "false";
            }
            return {
              id: item.id,
              name: item.name,
              description: item.description ?? "",
              scope: item.scope || "context",
              type: item.type || "string",
              default: defaultValue,
              isEnum: isVariableEnumEnabled(item),
              isSelected: item.id === props.selectedItemId,
            };
          });

      return {
        ...group,
        isCollapsed,
        headerBackgroundColor:
          group.id === props.selectedFolderId ? "mu" : "bg",
        children,
        hasChildren: filteredChildren.length > 0,
        shouldDisplay: shouldShowGroup,
      };
    })
    .filter((group) => group.shouldDisplay);

  const defaultValues = structuredClone(state.defaultValues);
  const form = structuredClone(state.form);
  const submitButton = form.actions?.buttons?.find(
    (button) => button.id === "submit",
  );

  if (state.dialogMode === "edit") {
    form.title = "Edit Variable";
    form.description = "Update variable";
    form.fields = (form.fields || []).map((field) => {
      if (field?.name !== "type") {
        return field;
      }
      const { options: _options, ...restField } = field;
      return {
        ...restField,
        type: "read-only-text",
        required: false,
        content: "${values.type}",
      };
    });
    if (submitButton) {
      submitButton.label = "Update Variable";
    }
  } else {
    form.title = "Add Variable";
    form.description = "Create a new variable";
    if (submitButton) {
      submitButton.label = "Add Variable";
    }
  }

  const enumValueOptions = buildVariableEnumOptions(defaultValues.enumValues);
  const dialogKey = [
    state.dialogMode,
    state.editingItemId || "new",
    defaultValues.type,
    defaultValues.isEnum ? "enum" : "plain",
    normalizeVariableEnumValues(defaultValues.enumValues).join("|"),
    String(defaultValues.default),
  ].join("-");

  return {
    flatGroups,
    navTitle: props.navTitle ?? "",
    selectedItemId: props.selectedItemId,
    readonly,
    searchQuery: rawSearchQuery,
    tagFilterOptions: props.tagFilterOptions ?? [],
    selectedTagFilterValues: activeTagIds,
    tagFilterPlaceholder: props.tagFilterPlaceholder ?? "Filter tags",
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
    showMenuButton: parseBooleanProp(props.showMenuButton),
    mobileLayout,
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
    context: {
      values: defaultValues,
      enumValueOptions,
    },
    dropdownMenu: state.dropdownMenu,
  };
};
