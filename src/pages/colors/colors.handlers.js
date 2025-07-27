import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { colors } = repository.getState();
  store.setItems(colors);

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};

export const handleColorItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleColorCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, hex } = e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "colors",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "color",
        name: name,
        hex: hex,
      },
    },
  });

  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};

export const handleColorEdited = (e, deps) => {
  const { store, render, repository, subject } = deps;
  const { itemId, name, hex } = e.detail;

  // Dispatch to app handlers for repository update
  subject.dispatch("update-color", {
    itemId,
    updates: {
      name,
      hex,
    },
  });
};



export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "colors",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { colors } = repository.getState();
  store.setItems(colors);
  render();
};
