import { buildUniqueTagIds } from "../../internal/resourceTags.js";
import {
  isVariableEnumEnabled,
  normalizeVariableEnumValues,
} from "../../internal/variableEnums.js";
import {
  applyTagFilterPopoverSelection,
  clearTagFilterPopoverSelection,
  closeTagFilterPopoverFromOverlay,
  openTagFilterPopoverFromButton,
  toggleTagFilterPopoverOption,
} from "../../internal/ui/tagFilterPopover.handlers.js";

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

export const handleTagFilterButtonClick = openTagFilterPopoverFromButton;
export const handleTagFilterPopoverClose = closeTagFilterPopoverFromOverlay;
export const handleTagFilterOptionClick = toggleTagFilterPopoverOption;
export const handleTagFilterClearClick = (deps, payload) => {
  const { props, store, render } = deps;
  clearTagFilterPopoverSelection(deps, payload);

  if (!parseBooleanProp(props.searchInFilterPopover)) {
    return;
  }

  store.setSearchQuery({ query: "" });
  render();
};
export const handleTagFilterApplyClick = applyTagFilterPopoverSelection;

export const handleMenuClick = ({ dispatchEvent }) => {
  dispatchEvent(
    new CustomEvent("menu-click", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleTagFilterChange = (deps, payload) => {
  const { dispatchEvent } = deps;
  const detail = payload._event.detail ?? {};

  dispatchEvent(
    new CustomEvent("tag-filter-change", {
      detail: {
        tagIds: Array.isArray(detail.tagIds)
          ? detail.tagIds
          : Array.isArray(detail.value)
            ? detail.value
            : [],
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const getDataId = (event, attrName, fallbackPrefix = "") => {
  const value = event?.currentTarget?.getAttribute?.(attrName);
  if (value) {
    return value;
  }
  if (!fallbackPrefix) {
    return "";
  }
  return event?.currentTarget?.id?.replace(fallbackPrefix, "") || "";
};

const getDefaultValueByType = (type) => {
  if (type === "number") {
    return 0;
  }
  if (type === "boolean") {
    return false;
  }
  return "";
};

const mergeVariableFormValues = ({
  storedValues = {},
  formValues = {},
} = {}) => {
  const hasFormEnumValues = Object.prototype.hasOwnProperty.call(
    formValues,
    "enumValues",
  );
  const enumValues = hasFormEnumValues
    ? formValues.enumValues
    : (storedValues.enumValues ?? []);
  const shouldPreserveEnum =
    !hasFormEnumValues &&
    storedValues.isEnum === true &&
    normalizeVariableEnumValues(storedValues.enumValues).length > 0;

  return {
    ...storedValues,
    ...formValues,
    isEnum: shouldPreserveEnum
      ? true
      : (formValues.isEnum ?? storedValues.isEnum),
    enumValues,
  };
};

const getVariableFormValues = ({ refs, store } = {}) => {
  return mergeVariableFormValues({
    storedValues: store.selectDefaultValues(),
    formValues: refs?.variableForm?.getValues?.(),
  });
};

const setVariableFormValues = ({ refs, render, store }, values = {}) => {
  refs?.variableForm?.setValues?.({
    values,
  });
  store.updateFormValues(values);
  render();
};

const getFormFieldNameFromEvent = (event) => {
  const directFieldName = event?.target?.dataset?.fieldName;
  if (directFieldName) {
    return directFieldName;
  }

  const path =
    typeof event?.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    const fieldName = node?.dataset?.fieldName;
    if (fieldName) {
      return fieldName;
    }
  }

  return event?.detail?.fieldName ?? event?.detail?.name ?? "";
};

const resolveVariableFormValues = ({
  prevValues = {},
  newValues = {},
  isEditMode = false,
} = {}) => {
  const nextValues = {
    ...prevValues,
    ...newValues,
  };
  const variableType = nextValues.variableType ?? "string";
  const variableTypeChanged = variableType !== prevValues.variableType;
  let isEnum = variableType === "string" && nextValues.isEnum === true;
  let enumValues = isEnum
    ? normalizeVariableEnumValues(nextValues.enumValues)
    : [];
  let defaultValue = nextValues.default;

  if (!isEditMode && variableTypeChanged) {
    defaultValue = getDefaultValueByType(variableType);
    if (variableType === "string") {
      isEnum = false;
      enumValues = [];
    }
  }

  if (variableType !== "string") {
    isEnum = false;
    enumValues = [];
  }

  if (isEnum && !enumValues.includes(defaultValue)) {
    defaultValue = enumValues[0] ?? "";
  }

  return {
    ...nextValues,
    variableType,
    isEnum,
    enumValues,
    default: defaultValue,
  };
};

const findVariableWithGroup = (flatGroups = [], itemId) => {
  for (const group of flatGroups) {
    for (const item of group.children || []) {
      if (item.id === itemId) {
        return { group, item };
      }
    }
  }
  return null;
};

const openEditDialogForItem = ({ deps, itemId } = {}) => {
  const { store, render, dispatchEvent, props } = deps;
  if (!itemId) {
    return;
  }

  const found = findVariableWithGroup(props.flatGroups, itemId);
  if (!found) {
    return;
  }

  const { group, item } = found;
  const variableType = item.variableType || "string";
  const defaultValue =
    item.default === undefined
      ? getDefaultValueByType(variableType)
      : item.default;

  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );

  store.openEditDialog({
    groupId: group.id,
    itemId,
    defaultValues: {
      name: item.name || "",
      description: item.description || "",
      tagIds: item.tagIds ?? [],
      scope: item.scope || "context",
      variableType,
      isEnum: isVariableEnumEnabled(item),
      enumValues: normalizeVariableEnumValues(item.enumValues),
      default: defaultValue,
    },
  });
  render();
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = getDataId(payload._event, "data-group-id", "group");
  if (!groupId) {
    return;
  }

  // Handle group collapse internally
  store.toggleGroupCollapse({ groupId: groupId });
  render();
};

export const handleVariableItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.id.replace("variableItem", "");

  // Forward variable item selection to parent
  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDialogFormChange = (deps, payload) => {
  const { store, render } = deps;
  const prevValues = store.selectDefaultValues();
  const newValues = payload._event.detail.values;
  const storeState = store.getState
    ? store.getState()
    : store._state || store.state;
  const isEditMode = storeState?.dialogMode === "edit";

  store.updateFormValues({
    ...resolveVariableFormValues({
      prevValues,
      newValues,
      isEditMode,
    }),
  });
  render();
};

export const handleAddVariableClick = (deps, payload) => {
  if (deps.props.readonly === true) {
    return;
  }

  const { store, render } = deps;
  payload._event.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button (handles both button and empty state)
  const groupId =
    getDataId(payload._event, "data-group-id") ||
    payload._event.currentTarget.id
      .replace("addVariableButton", "")
      .replace("addVariableEmpty", "");
  if (!groupId) {
    return;
  }

  store.openAddDialog({ groupId: groupId });
  render();
};

export const handleCloseDialog = (deps) => {
  const { store, render } = deps;

  store.closeDialog();
  render();
};

export const handleFormAddOptionClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const fieldName = getFormFieldNameFromEvent(payload?._event);

  dispatchEvent(
    new CustomEvent("form-add-option-click", {
      detail: {
        ...payload?._event?.detail,
        fieldName,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleEnumAddValueClick = (deps, payload) => {
  const { store, render } = deps;
  payload._event.stopPropagation();

  const rect = payload._event.currentTarget.getBoundingClientRect();
  store.openEnumValuePopover({
    x: rect.left,
    y: rect.bottom,
  });
  render();
};

export const handleEnumValuePopoverClose = (deps) => {
  const { store, render } = deps;
  store.closeEnumValuePopover();
  render();
};

export const handleEnumValueFormAction = (deps, payload) => {
  const { appService, store } = deps;
  const actionId = payload._event.detail.actionId;
  if (actionId !== "submit") {
    return;
  }

  const currentValues = getVariableFormValues(deps);
  const value = String(payload._event.detail.values?.value ?? "").trim();

  if (!value) {
    appService.showAlert({
      message: "Enum value is required.",
      title: "Warning",
    });
    return;
  }

  const enumValues = normalizeVariableEnumValues(currentValues.enumValues);
  if (enumValues.includes(value)) {
    appService.showAlert({
      message: "Enum value must be unique.",
      title: "Warning",
    });
    return;
  }

  const nextEnumValues = [...enumValues, value];
  const nextValues = {
    ...currentValues,
    isEnum: true,
    enumValues: nextEnumValues,
    default: nextEnumValues.includes(currentValues.default)
      ? currentValues.default
      : value,
  };

  store.closeEnumValuePopover();
  setVariableFormValues(deps, nextValues);
};

export const handleEnumValueContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const index = Number(payload._event.currentTarget.dataset.index);
  if (Number.isNaN(index)) {
    return;
  }

  store.showEnumValueMenu({
    index,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleEnumValueMenuClose = (deps) => {
  const { store, render } = deps;
  store.hideEnumValueMenu();
  render();
};

export const handleEnumValueMenuClick = (deps, payload) => {
  const { render, store } = deps;
  const item = payload._event.detail.item || payload._event.detail;
  if (item?.value !== "remove") {
    store.hideEnumValueMenu();
    render();
    return;
  }

  const targetIndex = store.selectEnumValueMenuTargetIndex();
  const currentValues = getVariableFormValues(deps);
  const enumValues = normalizeVariableEnumValues(currentValues.enumValues);
  const nextEnumValues = enumValues.filter((_, index) => index !== targetIndex);
  const nextDefault = nextEnumValues.includes(currentValues.default)
    ? currentValues.default
    : (nextEnumValues[0] ?? "");
  const nextValues = {
    ...currentValues,
    enumValues: nextEnumValues,
    default: nextDefault,
  };

  store.hideEnumValueMenu();
  setVariableFormValues(deps, nextValues);
};

export const handleRowClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("variable-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleRowDoubleClick = (deps, payload) => {
  if (deps.props.readonly === true) {
    return;
  }

  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }

  openEditDialogForItem({ deps, itemId });
};

export const handleOpenEditDialog = (deps, payload) => {
  const itemId = payload?.itemId ?? "";
  openEditDialogForItem({ deps, itemId });
};

export const handleRowContextMenu = (deps, payload) => {
  if (deps.props.readonly === true) {
    return;
  }

  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  const itemId = getDataId(payload._event, "data-item-id", "row");
  if (!itemId) {
    return;
  }
  const x = payload._event.clientX;
  const y = payload._event.clientY;

  store.showContextMenu({ itemId, x, y });
  render();
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const item = payload._event.detail.item;
  const itemId = store.selectTargetItemId();

  store.hideContextMenu();

  if (item && item.value === "edit-item") {
    openEditDialogForItem({ deps, itemId });
    return;
  }

  if (item && item.value === "delete-item") {
    dispatchEvent(
      new CustomEvent("variable-delete", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  render();
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleAppendTagIdToForm = (deps, payload = {}) => {
  const { refs, render, store } = deps;
  const tagId = payload?.tagId;
  if (!tagId) {
    return;
  }

  const currentValues = getVariableFormValues(deps);
  const nextValues = {
    ...currentValues,
    tagIds: buildUniqueTagIds(currentValues?.tagIds ?? [], [tagId]),
  };

  refs.variableForm?.setValues?.({
    values: nextValues,
  });
  store.updateFormValues(nextValues);
  render();
};

export const handleFormActionClick = (deps, payload) => {
  if (deps.props.readonly === true) {
    return;
  }

  const { store, render, dispatchEvent, props, appService } = deps;
  const storeState = store.getState
    ? store.getState()
    : store._state || store.state;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    const formData = mergeVariableFormValues({
      storedValues: storeState.defaultValues,
      formValues: payload._event.detail.values,
    });
    const name = formData.name?.trim();

    // Don't submit if name is not set
    if (!name) {
      appService.showAlert({
        message: "Variable name is required.",
        title: "Warning",
      });
      return;
    }

    const targetGroupId = storeState.targetGroupId;
    const isEditMode = storeState.dialogMode === "edit";
    const editingItemId = storeState.editingItemId;
    const scope =
      formData.scope ?? storeState.defaultValues?.scope ?? "context";
    const variableType =
      formData.variableType ??
      storeState.defaultValues?.variableType ??
      "string";
    const isEnum = variableType === "string" && formData.isEnum === true;
    const enumValues = isEnum
      ? normalizeVariableEnumValues(formData.enumValues)
      : [];
    if (isEditMode && !editingItemId) {
      appService.showAlert({
        message:
          "Unable to update variable. Please reopen the editor and try again.",
        title: "Warning",
      });
      return;
    }
    if (!isEditMode && !targetGroupId) {
      appService.showAlert({
        message: "Unable to add variable. Please select a group and try again.",
        title: "Warning",
      });
      return;
    }
    if (isEnum && enumValues.length === 0) {
      appService.showAlert({
        message: "Enum variables need at least one value.",
        title: "Warning",
      });
      return;
    }
    if (isEnum && !enumValues.includes(formData.default)) {
      appService.showAlert({
        message: "Choose a default value from the enum list.",
        title: "Warning",
      });
      return;
    }

    // Don't submit if name already exists
    const isDuplicateName = (props.flatGroups || [])
      .flatMap((group) => group.children || [])
      .some(
        (item) =>
          item.name === name && (!isEditMode || item.id !== editingItemId),
      );
    if (isDuplicateName) {
      appService.showAlert({
        message: "Variable name must be unique.",
        title: "Warning",
      });
      return;
    }

    // Set default value based on type if not provided
    let defaultValue = formData.default;
    if (defaultValue === undefined || defaultValue === "") {
      defaultValue = getDefaultValueByType(variableType);
    }
    if (isEnum) {
      defaultValue = formData.default;
    }

    if (isEditMode) {
      dispatchEvent(
        new CustomEvent("variable-updated", {
          detail: {
            itemId: editingItemId,
            name,
            description: formData.description ?? "",
            tagIds: Array.isArray(formData.tagIds) ? formData.tagIds : [],
            scope,
            variableType,
            isEnum,
            enumValues,
            default: defaultValue,
          },
          bubbles: true,
          composed: true,
        }),
      );
    } else {
      // Forward variable creation to parent
      dispatchEvent(
        new CustomEvent("variable-created", {
          detail: {
            groupId: targetGroupId,
            name,
            description: formData.description ?? "",
            tagIds: Array.isArray(formData.tagIds) ? formData.tagIds : [],
            scope,
            variableType,
            isEnum,
            enumValues,
            default: defaultValue,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog
    store.closeDialog();
    render();
  }
};
