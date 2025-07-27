import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { preset } = repository.getState();
  store.setItems(preset || { tree: [], items: {} });

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;

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

export const handlePresetCreated = (e, deps) => {
  const { store, render, repository } = deps;
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

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
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
