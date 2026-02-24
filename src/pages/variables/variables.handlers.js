import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, projectService, appService, render } = deps;
  const { p } = appService.getPayload();
  const repository = await projectService.getRepositoryById(p);
  const { variables } = repository.getState();
  store.setItems({ variablesData: variables || { order: [], items: {} } });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService, appService } = deps;
  const { p } = appService.getPayload();
  const repository = await projectService.getRepositoryById(p);

  const repositoryState = repository.getState();
  const { variables } = repositoryState;

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
  const { store, render, projectService, appService } = deps;
  const { p } = appService.getPayload();
  const {
    groupId,
    name,
    scope,
    type,
    default: defaultValue,
  } = payload._event.detail;

  // Add new variable to repository
  await projectService.appendEvent({
    type: "nodeInsert",
    payload: {
      target: "variables",
      value: {
        id: nanoid(),
        itemType: "variable",
        name: name,
        scope: scope,
        type: type,
        default: defaultValue,
      },
      options: {
        parent: groupId,
        position: "last",
      },
    },
  });

  // Update store with new variables data
  const repository = await projectService.getRepositoryById(p);
  const { variables } = repository.getState();
  store.setItems({ variablesData: variables });
  render();
};

export const handleVariableDelete = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { p } = appService.getPayload();
  const { itemId } = payload._event.detail;

  await projectService.appendEvent({
    type: "nodeDelete",
    payload: {
      target: "variables",
      options: {
        id: itemId,
      },
    },
  });

  // Clear selection if deleted item was selected
  if (store.selectSelectedItemId() === itemId) {
    store.setSelectedItemId({ itemId: null });
  }

  const repository = await projectService.getRepositoryById(p);
  const { variables } = repository.getState();
  store.setItems({ variablesData: variables });
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, appService, render, store } = deps;
  const { p } = appService.getPayload();
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

  await projectService.appendEvent({
    type: "nodeUpdate",
    payload: {
      target: "variables",
      value: updateValue,
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const repository = await projectService.getRepositoryById(p);
  const { variables } = repository.getState();
  store.setItems({ variablesData: variables });
  render();
};
