import {
  getAcceptAttribute,
  isFileTypeAccepted,
} from "../../utils/fileTypeUtils.js";

const getDataId = (event, attrName, fallbackPrefix = "") => {
  const value = event?.currentTarget?.getAttribute?.(attrName);
  if (value) {
    return value;
  }
  if (!fallbackPrefix) {
    return "";
  }
  return event?.currentTarget?.id?.replace(fallbackPrefix, "") || "";
};

export const handleSearchInput = (deps, payload) => {
  const { dispatchEvent } = deps;
  const searchQuery = payload._event.detail.value || "";

  // Forward search input to parent
  dispatchEvent(
    new CustomEvent("search-input", {
      detail: { value: searchQuery },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleDragEnter = (deps, payload) => {
  const { store, render, props } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();
  const draggingGroupId = getDataId(
    payload._event,
    "data-group-id",
    "groupDragDrop",
  );
  if (!draggingGroupId) {
    return;
  }

  if (
    !["images", "videos", "sounds", "characterSprites", "fonts"].includes(
      props.resourceType,
    )
  ) {
    return;
  }

  store.setDraggingGroupId({ groupId: draggingGroupId });
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

  // Check if we're actually leaving the drop zone
  // event.relatedTarget is the element we're entering, or null if leaving the window
  const relatedTarget = payload._event.relatedTarget;
  const currentTarget = payload._event.currentTarget;

  // Only clear dragging if we're actually leaving the drop zone entirely
  // Check if relatedTarget is null or not contained within the current target
  if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
    store.setDraggingGroupId({ groupId: null });
    render();
  }
};

export const handleDrop = async (deps, payload) => {
  const { dispatchEvent, store, render, props, appService } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();
  const targetGroupId = store.selectDraggingGroupId();

  store.setDraggingGroupId({ groupId: null });
  render();

  // Filter for accepted file types only
  const files = Array.from(payload._event.dataTransfer.files).filter((file) =>
    isFileTypeAccepted(file, props.acceptedFileTypes),
  );

  if (files.length > 0) {
    // For fonts, load them for preview
    if (props.resourceType === "fonts") {
      for (const file of files) {
        const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
        const fontUrl = URL.createObjectURL(file);
        await appService.loadFont(fontName, fontUrl);
      }
    }

    // Forward file uploads to parent (parent will handle the actual upload logic)
    dispatchEvent(
      new CustomEvent("files-uploaded", {
        detail: {
          files,
          originalEvent: payload._event,
          targetGroupId,
        },
        bubbles: true,
        composed: true,
      }),
    );
  } else {
    // Show feedback if files were dropped but none were accepted
    console.warn(
      "No files match the accepted file types:",
      props.acceptedFileTypes,
    );
  }
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = getDataId(payload._event, "data-group-id", "group");
  if (!groupId) {
    return;
  }

  // Handle group toggle locally
  store.toggleGroupCollapse({ groupId });
  render();
};

export const handleItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataId(payload._event, "data-item-id", "item");
  if (!itemId) {
    return;
  }

  // Forward item selection to parent
  dispatchEvent(
    new CustomEvent("item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleItemDoubleClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = getDataId(payload._event, "data-item-id", "item");
  if (!itemId) {
    return;
  }

  // Forward double-click event to parent
  dispatchEvent(
    new CustomEvent("item-dblclick", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleUploadButtonClick = (deps, payload) => {
  // Copy the logic in dragDrop.handlers.js
  const { props, dispatchEvent, appService } = deps;
  payload._event.stopPropagation();
  const targetGroupId = getDataId(payload._event, "data-group-id", "uploadBtn");
  if (!targetGroupId) {
    return;
  }
  const input = document.createElement("input");
  input.type = "file";
  input.accept = getAcceptAttribute(props.acceptedFileTypes);
  input.multiple = true;
  input.onchange = async (e) => {
    if (e.target && e.target.files) {
      const files = Array.from(e.target.files).filter((file) =>
        isFileTypeAccepted(file, props.acceptedFileTypes),
      );

      if (files.length > 0) {
        // For fonts, load them for preview
        if (props.resourceType === "fonts") {
          for (const file of files) {
            const fontName = file.name.replace(
              /\.(ttf|otf|woff|woff2|ttc)$/i,
              "",
            );
            const fontUrl = URL.createObjectURL(file);
            await appService.loadFont(fontName, fontUrl);
          }
        }

        // Forward file uploads to parent (parent will handle the actual upload logic)
        dispatchEvent(
          new CustomEvent("files-uploaded", {
            detail: {
              files,
              originalEvent: e,
              targetGroupId,
            },
            bubbles: true,
            composed: true,
          }),
        );
      }
    }
    input.remove();
  };

  input.click();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { dispatchEvent, appService, props = {} } = deps;
  const { _event: event } = payload;
  const { files } = event.detail;
  const targetGroupId =
    getDataId(payload._event, "data-group-id") ||
    payload._event.currentTarget.id
      .replace("dragDropBar", "")
      .replace("dragDropItem", "");

  // For fonts, load them for preview
  if (props.resourceType === "fonts") {
    for (const file of files) {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
      const fontUrl = URL.createObjectURL(file);
      await appService.loadFont(fontName, fontUrl);
    }
  }

  // Forward file uploads to parent (parent will handle the actual upload logic)
  dispatchEvent(
    new CustomEvent("files-uploaded", {
      detail: {
        files,
        originalEvent: event,
        targetGroupId,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation();
  const groupId = getDataId(payload._event, "data-group-id", "addBtn");
  if (!groupId) {
    return;
  }

  dispatchEvent(
    new CustomEvent(`add-click`, {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSpritesButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  if (payload._event.stopPropagation) {
    payload._event.stopPropagation(); // Prevent group click
  }
  const itemId = getDataId(payload._event, "data-item-id", "spritesButton");
  if (!itemId) {
    return;
  }

  // Forward sprites button click to parent
  dispatchEvent(
    new CustomEvent("sprites-button-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomChange = (deps, payload) => {
  const { store, render, appService } = deps;
  const zoomLevel = parseFloat(
    payload._event.detail?.value || payload._event.target?.value,
  );

  // Update internal state
  store.setZoomLevel({ zoomLevel: zoomLevel });
  appService.setUserConfig("images.zoomLevel", zoomLevel);
  render();
};

export const handleZoomIn = (deps) => {
  const { store, render, appService } = deps;

  // Increase zoom by 0.1, max 4.0
  const currentZoom = store.selectZoomLevel();
  const newZoom = Math.min(4.0, currentZoom + 0.1);

  // Update internal state
  store.setZoomLevel({ zoomLevel: newZoom });
  appService.setUserConfig("images.zoomLevel", newZoom);
  render();
};

export const handleZoomOut = (deps) => {
  const { store, render, appService } = deps;

  // Decrease zoom by 0.1, min 0.5
  const currentZoom = store.selectZoomLevel();
  const newZoom = Math.max(0.5, currentZoom - 0.1);

  // Update internal state
  store.setZoomLevel({ zoomLevel: newZoom });
  appService.setUserConfig("images.zoomLevel", newZoom);
  render();
};

export const handleAfterMount = (deps) => {
  const { store, render, appService } = deps;
  const savedZoom = appService.getUserConfig("images.zoomLevel");
  if (savedZoom !== null && savedZoom !== undefined) {
    store.setZoomLevel({ zoomLevel: savedZoom });
    render();
  }
};

export const handleItemContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  const itemId =
    getDataId(payload._event, "data-item-id") ||
    payload._event.currentTarget.id
      .replace("item", "")
      .replace("transformItem", "")
      .replace("spritesButton", "");
  if (!itemId) {
    return;
  }
  const { clientX: x, clientY: y } = payload._event;

  store.showContextMenu({ itemId, x, y });
  render();
};

export const handleCloseContextMenu = (deps) => {
  const { store, render } = deps;

  // Hide context menu
  store.hideContextMenu();
  render();
};

export const handleContextMenuClickItem = async (deps, payload) => {
  const { store, render, dispatchEvent, props } = deps;
  const detail = payload._event.detail;
  // Extract the actual item (rtgl-dropdown-menu wraps it)
  const item = detail.item;
  const dropdownMenu = store.selectDropdownMenu();
  const itemId = dropdownMenu.targetItemId;

  // Only handle delete actions
  if (item && item.value === "delete-item") {
    // Dispatch item-delete event to let parent page handle repository delete operation
    dispatchEvent(
      new CustomEvent("item-delete", {
        detail: {
          resourceType: props.resourceType,
          itemId,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  // Hide context menu
  store.hideContextMenu();
  render();
};

export const handleBackClick = (deps) => {
  const { appService, props } = deps;

  const currentPayload = appService.getPayload();
  appService.navigate(props.backUrl, currentPayload);
};
