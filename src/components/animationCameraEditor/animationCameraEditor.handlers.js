export const handleZoomIn = (deps) => {
  const { refs } = deps;
  refs.viewport.zoom(1.1);
};
export const handleZoomOut = (deps) => {
  const { refs } = deps;
  refs.viewport.zoom(1 / 1.1);
};
export const handleReset = (deps) => {
  const { refs } = deps;
  refs.viewport.reset();
};
export const handleDone = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("done"));
};
