const dispatchClose = ({ dispatchEvent }) => {
  dispatchEvent(new CustomEvent("close", { detail: {}, bubbles: true }));
};

const isCloseSuppressed = ({ props = {}, store } = {}) => {
  return (
    props.suppressClose === true ||
    props.suppressClose === "true" ||
    store?.selectSuppressClose?.() === true
  );
};

export const handleSurfaceClose = (deps, payload = {}) => {
  payload._event?.stopPropagation?.();
  payload._event?.preventDefault?.();

  if (isCloseSuppressed(deps)) {
    return;
  }

  dispatchClose(deps);
};

export const handleSuppressClose = (deps, _payload = {}) => {
  deps.store?.setSuppressClose?.({ suppressClose: true });
};

export const handleOnUpdate = (deps, changes = {}) => {
  const { newProps } = changes;
  if (newProps?.suppressClose !== true && newProps?.suppressClose !== "true") {
    deps.store?.setSuppressClose?.({ suppressClose: false });
  }
};

export const handleDocumentKeyDown = (deps, payload = {}) => {
  const { props } = deps;
  const event = payload._event;

  if (props.open !== true || event?.key !== "Escape") {
    return;
  }

  event.preventDefault?.();
  event.stopPropagation?.();

  if (isCloseSuppressed(deps)) {
    return;
  }

  dispatchClose(deps);
};
