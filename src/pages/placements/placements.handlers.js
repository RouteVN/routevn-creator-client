import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { placements } = repository.getState();
  store.setItems(placements || { tree: [], items: {} })

  return () => {}
}

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
  const { groupId, name, positionX, positionY, scale, anchor, rotation } = e.detail;

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
        positionX: positionX,
        positionY: positionY,
        scale: scale,
        anchor: anchor,
        rotation: rotation,
      },
    },
  });

  const { placements } = repository.getState();
  store.setItems(placements);
  render();
};