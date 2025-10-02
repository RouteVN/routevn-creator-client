export const handleDragEnter = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();
  store.startDragging();
  render();
};

export const handleDragOver = (deps, payload) => {
  payload._event.preventDefault();
  payload._event.stopPropagation();
};

export const handleDragLeave = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  // Only set isDragging to false if we're leaving the drop zone entirely
  if (payload._event.currentTarget === payload._event.target) {
    store.stopDragging();
    render();
  }
};

export const handleDrop = (deps, payload) => {
  const { dispatchEvent, store, render } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  store.stopDragging();
  render();

  const files = payload._event.dataTransfer.files;

  // Filter for image files only
  const imageFiles = Array.from(files).filter((file) =>
    file.type.startsWith("image/"),
  );

  if (imageFiles.length > 0) {
    dispatchEvent(
      new CustomEvent("file-selected", { detail: { files: imageFiles } }),
    );
  }
};
