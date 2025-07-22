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
  const property = e.currentTarget.id.replace("add-keyframe-", "");

  // Dispatch event to parent to add keyframe - let the parent get the context
  dispatchEvent(
    new CustomEvent("add-keyframe", {
      detail: {
        property,
        x: e.clientX,
        y: e.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleKeyframeRightClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const id = e.currentTarget.id.replace("keyframe-", "");

  e.preventDefault();

  // Dispatch event to parent to add keyframe - let the parent get the context
  dispatchEvent(
    new CustomEvent("keyframe-right-click", {
      detail: {
        id,
        x: e.clientX,
        y: e.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};
