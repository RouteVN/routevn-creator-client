import { nanoid } from "nanoid";

export const handleBeforeMount = (deps) => {
  const { store, repository } = deps;
  const { animations } = repository.getState();
  store.setItems(animations || { tree: [], items: {} });

  return () => {};
};

export const handleDataChanged = (e, deps) => {
  const { store, render, repository } = deps;
  console.log("🎬 Animations handleDataChanged received event:", e.detail);

  const repositoryState = repository.getState();
  const { animations } = repositoryState;

  console.log("🎬 Repository state:", {
    animations,
    fullState: repositoryState,
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
  const { groupId, name, properties } = e.detail;

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
        properties,
      },
    },
  });

  // Update store with new animations data
  const { animations } = repository.getState();
  store.setItems(animations);

  console.log(
    `Animation "${name}" created successfully in group ${groupId} with properties:`,
    properties,
  );
  render();
};

export const handleAnimationUpdated = (e, deps) => {
  const { store, render, repository } = deps;
  const { itemId, name, properties } = e.detail;

  // Update existing animation in repository
  repository.addAction({
    actionType: "treeUpdate",
    target: "animations",
    value: {
      id: itemId,
      replace: false,
      item: {
        name: name,
        properties,
      },
    },
  });

  // Update store with updated animations data
  const { animations } = repository.getState();
  store.setItems(animations);

  console.log(
    `Animation "${name}" updated successfully with properties:`,
    properties,
  );
  render();
};

const getInitialValue = (property) => {
  const defaultValues = {
    x: 0,
    y: 0,
    alpha: 1,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
  };
  return defaultValues[property] || 0;
};

export const handleFormChange = (e, deps) => {
  const { repository, render, store } = deps;
  repository.addAction({
    actionType: "treeUpdate",
    target: "animations",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [e.detail.name]: e.detail.fieldValue,
      },
    },
  });

  const { animations } = repository.getState();
  store.setItems(animations);
  render();
};
