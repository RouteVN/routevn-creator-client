import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { placements } = repository.getState();
  store.setItems(placements || { tree: [], items: {} });

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;

  const repositoryState = repository.getState();
  const { placements } = repositoryState;

  const placementData = placements || { tree: [], items: {} };

  store.setItems(placementData);
  render();
};

export const handlePlacementItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handlePlacementCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    e.detail;

  repository.addAction({
    actionType: "treePush",
    target: "placements",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "placement",
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

  const { placements } = repository.getState();
  store.setItems(placements);
  render();
};

export const handleDetailPanelItemUpdate = (e, deps) => {
  const { repository, store, render } = deps;

  repository.addAction({
    actionType: "treeUpdate",
    target: "placements",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  const { placements } = repository.getState();
  store.setItems(placements);
  render();
};

export const handlePlacementEdited = (e, deps) => {
  const { store, render, repository } = deps;
  const { itemId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    e.detail;

  // Update repository directly
  repository.addAction({
    actionType: "treeUpdate",
    target: "placements",
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
  const { placements } = repository.getState();
  store.setItems(placements);
  render();
};
