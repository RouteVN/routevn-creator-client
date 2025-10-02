export const handleMouseMove = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  const x = payload._event.clientX - rect.left;

  store.setMousePosition(x);
  render();
};

export const handleMouseLeave = (deps, payload) => {
  const { store, render } = deps;
  store.hideTimelineLine(payload._event.clientX);
  render();
};

export const handleAddKeyframe = (deps, payload) => {
  const { dispatchEvent } = deps;
  const property = payload._event.currentTarget.id.replace("add-keyframe-", "");

  // Dispatch event to parent to add keyframe - let the parent get the context
  dispatchEvent(
    new CustomEvent("add-keyframe", {
      detail: {
        property,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleKeyframeRightClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const [property, index] = payload._event.currentTarget.id
    .replace("keyframe-", "")
    .split("-");

  payload._event.preventDefault();

  // Dispatch event to parent to add keyframe - let the parent get the context
  dispatchEvent(
    new CustomEvent("keyframe-right-click", {
      detail: {
        property,
        index,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePropertyNameRightClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const property = payload._event.currentTarget.id.replace("property-name-", "");

  payload._event.preventDefault();

  // Dispatch event to parent to handle property right-click
  dispatchEvent(
    new CustomEvent("property-name-right-click", {
      detail: {
        property,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleInitialValueClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const property = payload._event.currentTarget.id.replace("initial-value-", "");

  dispatchEvent(
    new CustomEvent("initial-value-click", {
      detail: {
        property,
        x: payload._event.clientX,
        y: payload._event.clientY,
      },
      bubbles: true,
      composed: true,
    }),
  );
};
