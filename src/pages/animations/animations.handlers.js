import { nanoid } from "nanoid";

export const handleOnMount = (deps) => {
  const { store, repository } = deps;
  const { animations } = repository.getState();
  store.setItems(animations || { tree: [], items: {} })

  return () => {}
}

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  console.log("🎬 Animations handleDataChanged received event:", e.detail);
  
  const repositoryState = repository.getState();
  const { animations } = repositoryState;
  
  console.log("🎬 Repository state:", {
    animations,
    fullState: repositoryState
  });
  
  const animationData = animations || { tree: [], items: {} };
  console.log("🎬 Setting animation data:", animationData);
  
  store.setItems(animationData);
  console.log("🎬 Animation store updated, triggering render");
  render();
  console.log("🎬 Animation render completed");
};

export const handleAnimationItemClick = (e, deps) => {
  const { store, render } = deps;
  const { itemId } = e.detail; // Extract from forwarded event
  store.setSelectedItemId(itemId);
  render();
};

export const handleAnimationCreated = (e, deps) => {
  const { store, render, repository } = deps;
  const { groupId, name } = e.detail;

  // Add new animation to repository
  repository.addAction({
    actionType: "treePush",
    target: "animations",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "animation",
        name: name,
        duration: "4s",
        keyframes: 3,
      },
    },
  });

  // Update store with new animations data
  const { animations } = repository.getState();
  store.setItems(animations);
  
  console.log(`Animation "${name}" created successfully in group ${groupId}`);
  render();
};

export const handleDetailPanelItemUpdate = (e, deps) => {
  const { repository, store, render } = deps;

  repository.addAction({
    actionType: "treeUpdate",
    target: "animations",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: e.detail.formValues,
    },
  });

  const { animations } = repository.getState();
  store.setItems(animations);
  render();
};