import {
  getAcceptAttribute,
  isFileTypeAccepted,
} from "../../utils/fileTypeUtils.js";

export const handleClick = (deps) => {
  const { dispatchEvent, props } = deps;
  const input = document.createElement("input");
  input.type = "file";
  input.accept = getAcceptAttribute(props.acceptedFileTypes);
  input.multiple = true;

  input.onchange = (e) => {
    if (e.target && e.target.files) {
      const validFiles = Array.from(e.target.files).filter((file) =>
        isFileTypeAccepted(file, props.acceptedFileTypes),
      );

      if (validFiles.length > 0) {
        dispatchEvent(
          new CustomEvent("file-selected", { detail: { files: validFiles } }),
        );
      }
    }
    input.remove();
  };

  input.click();
};

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
  const { dispatchEvent, store, render, props } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();

  store.stopDragging();
  render();

  const files = payload._event.dataTransfer.files;

  // Filter for accepted file types only
  const validFiles = Array.from(files).filter((file) =>
    isFileTypeAccepted(file, props.acceptedFileTypes),
  );

  if (validFiles.length > 0) {
    dispatchEvent(
      new CustomEvent("file-selected", { detail: { files: validFiles } }),
    );
  } else if (files.length > 0) {
    // Show feedback if files were dropped but none were accepted
    console.warn(
      "No files match the accepted file types:",
      props.acceptedFileTypes,
    );
  }
};
