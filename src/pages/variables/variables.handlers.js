import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { variables } = repository.getState();
  store.setItems(variables || { tree: [], items: {} });

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;

  const repositoryState = repository.getState();
  const { variables } = repositoryState;

  const variableData = variables || { tree: [], items: {} };

  store.setItems(variableData);
  render();
};

export const handleVariableItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleVariableCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, type, defaultValue, readonly } = e.detail;

  // Add new variable to repository
  repository.addAction({
    actionType: "treePush",
    target: "variables",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "variable",
        name: name,
        variableType: type,
        defaultValue: defaultValue,
        readonly: readonly,
      },
    },
  });

  // Update store with new variables data
  const { variables } = repository.getState();
  store.setItems(variables);
  render();
};

export const handleDetailPanelItemUpdate = (e, deps) => {
  const { repository, store, render } = deps;

  repository.addAction({
    actionType: "treeUpdate",
    target: "variables",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  const { variables } = repository.getState();
  store.setItems(variables);
  render();
};
