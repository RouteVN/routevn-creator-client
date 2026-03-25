import {
  getAcceptAttribute,
  isFileTypeAccepted,
} from "../../internal/fileTypes.js";

const getDataAttribute = (event, name) => {
  return event?.currentTarget?.getAttribute?.(name) ?? undefined;
};

export const handleSearchInput = (deps, payload) => {
  const { dispatchEvent } = deps;
  const value = payload._event.detail.value ?? "";

  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBackClick = (deps) => {
  const { dispatchEvent } = deps;

  dispatchEvent(
    new CustomEvent("back-click", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDragEnter = (deps, payload) => {
  const { store, render, props } = deps;
  if (props.canUpload === false) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();

  const groupId = getDataAttribute(payload._event, "data-group-id");
  if (!groupId) {
    return;
  }

  store.setDraggingGroupId({ groupId });
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

  const relatedTarget = payload._event.relatedTarget;
  const currentTarget = payload._event.currentTarget;

  if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
    store.setDraggingGroupId({ groupId: undefined });
    render();
  }
};

export const handleDrop = (deps, payload) => {
  const { dispatchEvent, store, render, props } = deps;
  if (props.canUpload === false) {
    return;
  }

  payload._event.preventDefault();
  payload._event.stopPropagation();

  const targetGroupId = store.selectDraggingGroupId();
  store.setDraggingGroupId({ groupId: undefined });
  render();

  const droppedFiles = Array.from(payload._event.dataTransfer?.files ?? []);
  const files = droppedFiles.filter((file) =>
    isFileTypeAccepted(file, props.acceptedFileTypes),
  );
  const rejectedFiles = droppedFiles.filter(
    (file) => !isFileTypeAccepted(file, props.acceptedFileTypes),
  );

  if (rejectedFiles.length > 0) {
    dispatchEvent(
      new CustomEvent("files-drop-rejected", {
        detail: {
          rejectedFiles,
          targetGroupId,
          accept: getAcceptAttribute(props.acceptedFileTypes),
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  if (!files.length) {
    return;
  }

  dispatchEvent(
    new CustomEvent("files-dropped", {
      detail: {
        files,
        targetGroupId,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = getDataAttribute(payload._event, "data-group-id");
  if (!groupId) {
    return;
  }

  store.toggleGroupCollapse({ groupId });
  render();
};

export const handleItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemMouseEnter = (deps, payload) => {
  const { store, render } = deps;
  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId || store.selectHoveredItemId() === itemId) {
    return;
  }

  store.setHoveredItemId({ itemId });
  render();
};

export const handleItemMouseLeave = (deps) => {
  const { store, render } = deps;
  if (store.selectHoveredItemId() === undefined) {
    return;
  }

  store.setHoveredItemId({ itemId: undefined });
  render();
};

export const handleItemDoubleClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-dblclick", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePreviewActionClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  dispatchEvent(
    new CustomEvent("item-preview", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleUploadButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();

  dispatchEvent(
    new CustomEvent("upload-click", {
      detail: {
        groupId: getDataAttribute(payload._event, "data-group-id"),
        accept: getAcceptAttribute(deps.props.acceptedFileTypes),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomChange = (deps, payload) => {
  const { store, render } = deps;
  const zoomLevel = parseFloat(
    payload._event.detail?.value ?? payload._event.target?.value ?? 1,
  );

  store.setZoomLevel({ zoomLevel });
  render();
};

export const handleZoomIn = (deps) => {
  const { store, render } = deps;
  const zoomLevel = Math.min(4, store.selectZoomLevel() + 0.1);
  store.setZoomLevel({ zoomLevel });
  render();
};

export const handleZoomOut = (deps) => {
  const { store, render } = deps;
  const zoomLevel = Math.max(0.5, store.selectZoomLevel() - 0.1);
  store.setZoomLevel({ zoomLevel });
  render();
};

export const handleItemContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();

  const itemId = getDataAttribute(payload._event, "data-item-id");
  if (!itemId) {
    return;
  }

  store.showContextMenu({
    itemId,
    x: payload._event.clientX,
    y: payload._event.clientY,
  });
  render();
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;
  store.hideContextMenu();
  render();
};

export const handleContextMenuClickItem = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const action = payload._event.detail.item?.value;
  const itemId = store.selectDropdownMenu().targetItemId;

  if (!itemId) {
    store.hideContextMenu();
    render();
    return;
  }

  if (action === "edit-item") {
    dispatchEvent(
      new CustomEvent("item-edit", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  if (action === "preview-item") {
    dispatchEvent(
      new CustomEvent("item-preview", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  if (action === "delete-item") {
    dispatchEvent(
      new CustomEvent("item-delete", {
        detail: { itemId },
        bubbles: true,
        composed: true,
      }),
    );
  }

  store.hideContextMenu();
  render();
};
