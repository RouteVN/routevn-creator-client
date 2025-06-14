export const handleDragEnter = (event, deps) => {
  const { store, render } = deps;
  event.preventDefault();
  event.stopPropagation();
  store.startDragging();
  render();
};

export const handleDragOver = (event, deps) => {
  event.preventDefault();
  event.stopPropagation();
};

export const handleDragLeave = (event, deps) => {
  const { store, render } = deps;
  event.preventDefault();
  event.stopPropagation();
  
  // Only set isDragging to false if we're leaving the drop zone entirely
  if (event.currentTarget === event.target) {
    store.stopDragging();
    render();
  }
};

export const handleDrop = (event, deps) => {
  const { dispatchEvent, store, render } = deps;
  event.preventDefault();
  event.stopPropagation();
  
  store.stopDragging();
  render();
  
  const files = event.dataTransfer.files;
  
  // Filter for image files only
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
  
  if (imageFiles.length > 0) {
    dispatchEvent(new CustomEvent('file-selected', { detail: { files: imageFiles } }));
  }
};