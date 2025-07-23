export const handleBeforeMount = (deps) => {
  const { store, props } = deps;

  // Use sections from props (current scene's sections only)
  const sections = props?.sections || [];

  store.setSections({
    sections: sections,
  });

  // Initialize from existing line data if available
  if (props?.line?.presentation?.sectionTransition) {
    const sectionTransition = props.line.presentation.sectionTransition;

    store.setSelectedSectionId({
      sectionId: sectionTransition.sectionId,
    });

    store.setSelectedAnimation({
      animation: sectionTransition.animation || "fade",
    });
  }
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

export const handleSubmitClick = (payload, deps) => {
  const { dispatchEvent, store } = deps;
  const { selectedSectionId, selectedAnimation } = store.getState();

  if (!selectedSectionId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("submit", {
      detail: {
        sectionTransition: {
          sectionId: selectedSectionId,
          animation: selectedAnimation,
        },
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSectionSelectorClick = (payload, deps) => {
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

export const handleBreadcumbSectionTransitionClick = (payload, deps) => {
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
  store.setSelectedSectionId({
    sectionId: undefined,
  });
  store.setSelectedAnimation({
    animation: "fade",
  });
  render();
};

export const handlePropsChanged = (deps) => {
  const { store, render, props } = deps;

  // Update sections when props change
  const sections = props?.sections || [];
  store.setSections({
    sections: sections,
  });

  // Re-initialize if section transition data exists
  if (props?.line?.presentation?.sectionTransition) {
    const sectionTransition = props.line.presentation.sectionTransition;

    store.setSelectedSectionId({
      sectionId: sectionTransition.sectionId,
    });

    store.setSelectedAnimation({
      animation: sectionTransition.animation || "fade",
    });
  }

  render();
};
