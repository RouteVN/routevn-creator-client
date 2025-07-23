export const handleBeforeMount = (deps) => {
  const { repository, store, render, props } = deps;
  const { scenes } = repository.getState();
  
  console.log("commandLineSceneTransition handleBeforeMount called with props:", props);
  console.log("props.line:", props?.line);
  console.log("props.line?.presentation:", props?.line?.presentation);
  console.log("props.line?.presentation?.sceneTransition:", props?.line?.presentation?.sceneTransition);
  
  store.setItems({
    items: scenes,
  });

  // Initialize from existing line data if available
  if (props?.line?.presentation?.sceneTransition) {
    const sceneTransition = props.line.presentation.sceneTransition;
    console.log("Initializing scene transition with existing data:", sceneTransition);
    
    store.setSelectedSceneId({
      sceneId: sceneTransition.sceneId,
    });
    
    store.setSelectedAnimation({
      animation: sceneTransition.animation || "fade",
    });
    
    console.log("Scene transition initialized - selectedSceneId:", sceneTransition.sceneId, "animation:", sceneTransition.animation);
  } else {
    console.log("No existing scene transition data found, starting with defaults");
  }
};

export const handleSceneItemClick = (e, deps) => {
  const { store, render } = deps;
  const sceneId = e.currentTarget.id.replace("scene-item-", "");

  store.setSelectedSceneId({
    sceneId: sceneId,
  });

  store.setMode({
    mode: "current",
  });

  render();
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const { selectedSceneId, selectedAnimation } = store.getState();

  console.log("Scene transition submit clicked:", { selectedSceneId, selectedAnimation });

  if (!selectedSceneId) {
    console.warn("No scene selected for transition");
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sceneTransition: {
          sceneId: selectedSceneId,
          animation: selectedAnimation,
        },
      },
      bubbles: true,
      composed: true,
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
    animation: e.currentTarget.value,
  });
  render();
};

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  store.setSearchQuery({
    query: e.currentTarget.value,
  });
  render();
};

export const handleResetClick = (e, deps) => {
  const { store, render } = deps;
  store.setSelectedSceneId({
    sceneId: undefined,
  });
  store.setSelectedAnimation({
    animation: "fade",
  });
  render();
};
