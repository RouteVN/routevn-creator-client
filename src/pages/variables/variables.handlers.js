import { nanoid } from "nanoid";

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const resolveVariableDefaultValue = (value) => {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return value ?? "";
};

const createDetailFormValues = (item) => {
  if (!item || item.itemType !== "variable") {
    return {
      name: "",
      scope: "",
      type: "",
      default: "",
    };
  }

  return {
    name: item.name || "",
    scope: item.scope || "",
    type: item.type || "",
    default: resolveVariableDefaultValue(item.default),
  };
};

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { variables } = projectService.getState();
  store.setItems({ variablesData: variables || { tree: [], items: {} } });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { variables } = projectService.getState();

  const variableData = variables || { tree: [], items: {} };

  store.setItems({ variablesData: variableData });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItemId && selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleVariableItemClick = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  const isFolder = detail.isFolder === true || detail.item?.type === "folder";

  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    render();
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  syncDetailFormValues({
    deps,
    values: detailValues,
    selectedItemId: itemId,
  });
};

export const handleVariableCreated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const {
    groupId,
    name,
    scope,
    type,
    default: defaultValue,
  } = payload._event.detail;

  await projectService.createVariableItem({
    variableId: nanoid(),
    name,
    scope,
    type,
    defaultValue,
    parentId: groupId,
    position: "last",
  });

  const { variables } = projectService.getState();
  store.setItems({ variablesData: variables });
  render();
};

export const handleVariableUpdated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId, name, scope, default: defaultValue } = payload._event.detail;

  if (!itemId) {
    return;
  }

  await projectService.updateVariableItem({
    variableId: itemId,
    patch: {
      name,
      scope,
      default: defaultValue,
    },
  });

  store.setSelectedItemId({ itemId });

  const { variables } = projectService.getState();
  store.setItems({ variablesData: variables });
  const shouldReseedDetail = store.selectSelectedItemId() === itemId;
  const selectedItem = shouldReseedDetail ? store.selectSelectedItem() : null;
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (shouldReseedDetail && selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
};

export const handleVariableDelete = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId } = payload._event.detail;

  await projectService.deleteVariableItem({
    variableId: itemId,
  });

  // Clear selection if deleted item was selected
  if (store.selectSelectedItemId() === itemId) {
    store.setSelectedItemId({ itemId: null });
  }

  const { variables } = projectService.getState();
  store.setItems({ variablesData: variables });
  const currentSelectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: currentSelectedItemId,
    });
  }
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  const fieldName = payload._event.detail.name;
  const fieldValue = payload._event.detail.value;

  if (fieldName === "type" || fieldName === "variableType") {
    return;
  }

  const updateValue = {
    [fieldName]: fieldValue,
  };

  await projectService.updateVariableItem({
    variableId: selectedItemId,
    patch: updateValue,
  });

  const { variables } = projectService.getState();
  store.setItems({ variablesData: variables });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};
