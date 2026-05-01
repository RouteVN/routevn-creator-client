const dispatchClose = ({ dispatchEvent }) => {
  dispatchEvent(new CustomEvent("close", { detail: {}, bubbles: true }));
};

export const handleSurfaceClose = (deps, payload = {}) => {
  payload._event?.stopPropagation?.();
  payload._event?.preventDefault?.();
  dispatchClose(deps);
};

export const handleDocumentKeyDown = (deps, payload = {}) => {
  const { props } = deps;
  const event = payload._event;

  if (props.open !== true || event?.key !== "Escape") {
    return;
  }

  event.preventDefault?.();
  event.stopPropagation?.();
  dispatchClose(deps);
};
