export const handleMouseMove = (deps, payload) => {
  const { store, render } = deps;
  const rect = payload._event.currentTarget.getBoundingClientRect();
  const x = payload._event.clientX - rect.left;

  store.setMousePosition({ x: x });
  render();
};

export const handleMouseLeave = (deps, payload) => {
  const { store, render } = deps;
  store.hideTimelineLine({});
  render();
};

export const handleAddKeyframe = (deps, payload) => {
  const { dispatchEvent } = deps;
  const target = payload._event.currentTarget;
  const property =
    target?.dataset?.property || target?.id?.replace("addKeyframe", "") || "";

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
  const property = payload._event.currentTarget.dataset.property;
  const index = payload._event.currentTarget.dataset.index;

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
  const target = payload._event.currentTarget;
  const property =
    target?.dataset?.property || target?.id?.replace("propertyName", "") || "";

  payload._event.preventDefault();

  // Dispatch event to parent to handle property right-click
  dispatchEvent(
    new CustomEvent("propertyNameright-click", {
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
  const target = payload._event.currentTarget;
  const property =
    target?.dataset?.property || target?.id?.replace("initialValue", "") || "";

  dispatchEvent(
    new CustomEvent("initialValueclick", {
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
