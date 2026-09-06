export const handleZoomIn = (deps, { _event }) => {
  const { refs } = deps;
  refs.viewport.zoomBy(1, _event.shiftKey);
};
export const handleZoomOut = (deps, { _event }) => {
  const { refs } = deps;
  refs.viewport.zoomBy(-1, _event.shiftKey);
};
export const handleReset = (deps) => {
  const { refs } = deps;
  refs.viewport.reset();
};
export const handleDone = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("done"));
};

export const handleEditValue = (deps, { _event }) => {
  const { store, render } = deps;
  const { field } = _event.currentTarget.dataset;
  const rect = _event.currentTarget.getBoundingClientRect();
  store.openValueEditor({ field, x: rect.left, y: rect.top });
  render();
};

export const handleValueEditorPositioned = (deps) => {
  const { refs } = deps;
  refs.valueInput.focus();
};

export const handleCloseValueEditor = (deps) => {
  const { refs, store, render } = deps;
  store.closeValueEditor();
  render();
  refs.viewport.focus();
};

export const handleApplyValue = (deps) => {
  const { refs, store } = deps;
  const value = store.selectEditedValue();
  if (value === undefined) return;
  const { field, originalValue } = store.selectValueEditor();
  const { viewport } = refs;
  if (value !== Number(originalValue)) {
    if (field === "zoom") {
      viewport.setZoom(value / 100);
    } else {
      viewport.changePose({ ...viewport.pose, [field]: value });
    }
  }
  handleCloseValueEditor(deps);
};

export const handleValueKeyDown = (deps, { _event }) => {
  if (_event.key !== "Enter" && _event.key !== "Escape") return;
  _event.preventDefault();
  _event.stopPropagation();
  if (_event.key === "Enter") handleApplyValue(deps);
  else handleCloseValueEditor(deps);
};
