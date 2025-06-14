export const handleClick = (event, deps) => {
  const { dispatchEvent } = deps;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;

  input.onchange = (e) => {
    if (e.target && e.target.files) {
      dispatchEvent(new CustomEvent('file-selected', { detail: { files: e.target.files } }));
    }
    input.remove();
  };
  
  input.click();
};

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