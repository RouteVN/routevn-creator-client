import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { variables } = repository.getState();
  store.setItems(variables || { tree: [], items: {} });

  return () => {};
};

export const handleDataChanged = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

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

export const handleVariableCreated = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "variables",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { variables } = repository.getState();
  store.setItems(variables);
  render();
};
