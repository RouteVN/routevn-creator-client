export const handleOnMount = (deps) => {
  const { repository, store, render } = deps;
  const { scenes } = repository.getState();
  store.setItems({
    items: scenes,
  });
};

export const handleSceneItemClick = (e, deps) => {
  const { store, render } = deps;
  const sceneId = e.currentTarget.id.replace('scene-item-', '');

  store.setSelectedSceneId({
    sceneId: sceneId
  });

  store.setMode({
    mode: "current",
  });

  render();
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const { selectedSceneId, selectedAnimation } = store.getState();
  
  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sceneTransition: {
          sceneId: selectedSceneId,
          animation: selectedAnimation,
        }
      },
      bubbles: true,
      composed: true
    }),
  );
};

export const handleSceneSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbActionsClick = (payload, deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-to-actions", {
      detail: {},
    }),
  );
};

export const handleBreadcumbSceneTransitionClick = (payload, deps) => {
  const { store, render } = deps;
  store.setMode({
    mode: "current",
  });
  render();
};

export const handleAnimationSelectChange = (e, deps) => {
  const { store, render } = deps;
  store.setSelectedAnimation({
    animation: e.currentTarget.value
  });
  render();
};