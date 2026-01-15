export const handleClose = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(
    new CustomEvent("close-delete-warning-popup", {
      detail: {},
      bubbles: true,
      composed: true,
    }),
  );
};