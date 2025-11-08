import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { variables } = repository.getState();
  store.setItems(variables || { tree: [], items: {} });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

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
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, type, initialValue, readonly } = payload._event.detail;

  // Add new variable to repository
  await repository.addEvent({
    type: "treePush",
    payload: {
      target: "variables",
      value: {
        id: nanoid(),
        type: "variable",
        name: name,
        variableType: type,
        initialValue: initialValue,
        readonly: readonly,
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
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
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
