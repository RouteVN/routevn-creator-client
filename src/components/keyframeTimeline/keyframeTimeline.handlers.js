export const handleBeforeMount = (deps) => {
  // Component mounted
};

export const handleMouseMove = (e, deps) => {
  const { store, render } = deps;
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;

  store.setMousePosition(x);
  render();
};

export const handleMouseLeave = (e, deps) => {
  const { store, render } = deps;
  store.hideTimelineLine(e.clientX);
  render();
};

export const handleAddKeyframe = (e, deps) => {
  const { dispatchEvent } = deps;
  const propertyName = e.currentTarget.id.replace("add-keyframe-", "");

  // Dispatch event to parent to add keyframe - let the parent get the context
  dispatchEvent(
    new CustomEvent("add-keyframe", {
      detail: {
        propertyName,
      },
      bubbles: true,
      composed: true,
    }),
  );
};
