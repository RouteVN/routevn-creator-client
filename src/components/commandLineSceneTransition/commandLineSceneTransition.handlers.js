export const handleBeforeMount = (deps) => {
  const { repository, store, render, props } = deps;
  const { scenes } = repository.getState();

  store.setItems({
    items: scenes,
  });

  // Use sections from props (current scene's sections only)
  const sections = props?.sections || [];
  store.setSections({
    sections: sections,
  });

  // Initialize from existing line data if available
  if (props?.line?.presentation?.sectionTransition) {
    const transition = props.line.presentation.sectionTransition;

    if (transition.sceneId) {
      // Scene transition
      store.setSelectedSceneId({
        sceneId: transition.sceneId,
      });
      store.setTab({ tab: "scene" });
    } else if (transition.sectionId) {
      // Section transition
      store.setSelectedSectionId({
        sectionId: transition.sectionId,
      });
      store.setTab({ tab: "section" });
    }

    store.setSelectedAnimation({
      animation: transition.animation || "fade",
    });
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

export const handleSectionItemClick = (e, deps) => {
  const { store, render } = deps;
  const sectionId = e.currentTarget.id.replace("section-item-", "");

  store.setSelectedSectionId({
    sectionId: sectionId,
  });

  store.setMode({
    mode: "current",
  });

  render();
};

export const handleTabClick = (e, deps) => {
  const { store, render } = deps;

  store.setTab({
    tab: e.detail.id,
  });

  render();
};

export const handleTabClickOld = (payload, deps) => {
  const { store, render } = deps;

  // Handle clicks on both the tab container and its children
  const element = payload.target.id
    ? payload.target
    : payload.target.closest('[id^="tab-"]');
  const tabValue = element?.id?.replace("tab-", "");

  if (tabValue) {
    store.setTab({
      tab: tabValue,
    });

    render();
  }
};

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const { selectedSceneId, selectedSectionId, selectedAnimation, tab } =
    store.getState();

  if (tab === "scene") {
    if (!selectedSceneId) {
      return;
    }

    dispatchEvent(
      new CustomEvent("submit", {
        detail: {
          presentation: {
            sectionTransition: {
              sceneId: selectedSceneId,
            },
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  } else if (tab === "section") {
    if (!selectedSectionId) {
      return;
    }

    dispatchEvent(
      new CustomEvent("submit", {
        detail: {
          presentation: {
            sectionTransition: {
              sectionId: selectedSectionId,
            },
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
};

export const handleTransitionSelectorClick = (payload, deps) => {
  const { store, render } = deps;

  store.setMode({
    mode: "gallery",
  });

  render();
};

export const handleBreadcumbClick = (e, deps) => {
  const { dispatchEvent, store, render } = deps;

  if (e.detail.id === "actions") {
    dispatchEvent(
      new CustomEvent("back-to-actions", {
        detail: {},
      }),
    );
  } else if (e.detail.id === "current") {
    store.setMode({
      mode: "current",
    });
    render();
  }
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
  const tab = store.selectTab();

  if (tab === "scene") {
    store.setSelectedSceneId({
      sceneId: undefined,
    });
  } else if (tab === "section") {
    store.setSelectedSectionId({
      sectionId: undefined,
    });
  }

  store.setSelectedAnimation({
    animation: "fade",
  });
  render();
};
