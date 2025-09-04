import { nanoid } from "nanoid";

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { preset } = repository.getState();
  store.setItems(preset || { tree: [], items: {} });
  render();
};

export const handleDataChanged = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const repositoryState = repository.getState();
  const { preset } = repositoryState;

  const presetData = preset || { tree: [], items: {} };

  store.setItems(presetData);
  render();
};

export const handlePresetItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handlePresetCreated = async (e, deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, description } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "preset",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "preset",
        name: name,
        description: description,
      },
    },
  });

  const { preset } = repository.getState();
  store.setItems(preset);
  render();
};

export const handleFormChange = async (e, deps) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "preset",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { preset } = repository.getState();
  store.setItems(preset);
  render();
};
