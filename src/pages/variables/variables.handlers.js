import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { variables } = projectService.getState();
  store.setItems({ variablesData: variables || { order: [], items: {} } });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { variables } = projectService.getState();

  const variableData = variables || { order: [], items: {} };

  store.setItems({ variablesData: variableData });
  render();
};

export const handleVariableItemClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId({ itemId: itemId });
  render();
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
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const fieldName = payload._event.detail.name;
  const fieldValue = payload._event.detail.value;

  const updateValue = {
    [fieldName]: fieldValue,
  };

  // Set predefined default when type changes
  if (fieldName === "type") {
    const typeDefaults = {
      string: "",
      number: 0,
      boolean: false,
    };
    updateValue.default = typeDefaults[fieldValue] ?? "";
  }

  await projectService.updateVariableItem({
    variableId: store.selectSelectedItemId(),
    patch: updateValue,
  });

  const { variables } = projectService.getState();
  store.setItems({ variablesData: variables });
  render();
};
