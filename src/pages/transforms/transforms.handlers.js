import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { transforms } = repository.getState();
  store.setItems(transforms || { tree: [], items: {} });

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;

  const repositoryState = repository.getState();
  const { transforms } = repositoryState;

  const transformData = transforms || { tree: [], items: {} };

  store.setItems(transformData);
  render();
};

export const handleTransformItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleTransformCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    e.detail;

  console.log("22222222222222 created", e.detail);

  repository.addAction({
    actionType: "treePush",
    target: "transforms",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "transform",
        name: name,
        x,
        y,
        scaleX: scaleX,
        scaleY: scaleY,
        anchorX: anchorX,
        anchorY: anchorY,
        rotation: rotation,
      },
    },
  });

  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "transforms",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};

export const handleTransformEdited = (e, deps) => {
  const { store, render, repository } = deps;
  const { itemId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    e.detail;

  // Update repository directly
  repository.addAction({
    actionType: "treeUpdate",
    target: "transforms",
    value: {
      id: itemId,
      replace: false,
      item: {
        name,
        x,
        y,
        scaleX,
        scaleY,
        anchorX,
        anchorY,
        rotation,
      },
    },
  });

  // Update local state and render immediately
  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};
