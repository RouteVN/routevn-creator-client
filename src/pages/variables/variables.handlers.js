import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, projectService, appService, render } = deps;
  const { p } = appService.getPayload();
  const repository = await projectService.getRepositoryById(p);
  const { variables } = repository.getState();
  store.setItems(variables || { tree: [], items: {} });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService, appService } = deps;
  const { p } = appService.getPayload();
  const repository = await projectService.getRepositoryById(p);

  const repositoryState = repository.getState();
  const { variables } = repositoryState;

  const variableData = variables || { tree: [], items: {} };

  store.setItems(variableData);
  render();
};

export const handleVariableItemClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleVariableCreated = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { p } = appService.getPayload();
  const repository = await projectService.getRepositoryById(p);
  const {
    groupId,
    name,
    scope,
    type,
    default: defaultValue,
  } = payload._event.detail;

  // Add new variable to repository
  await repository.addEvent({
    type: "treePush",
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
  const { variables } = repository.getState();
  store.setItems(variables);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, appService, render, store } = deps;
  const { p } = appService.getPayload();
  const repository = await projectService.getRepositoryById(p);
  await repository.addEvent({
    type: "treeUpdate",
    payload: {
      target: "variables",
      value: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { variables } = repository.getState();
  store.setItems(variables);
  render();
};
