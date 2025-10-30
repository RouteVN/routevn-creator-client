import {
  getAcceptAttribute,
  isFileTypeAccepted,
} from "../../utils/fileTypeUtils.js";

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
  const draggingGroupId = payload._event.currentTarget.id.replace(
    "group-dragDrop-",
    "",
  );

  if (
    !["images", "videos", "audio", "characterSprites", "fonts"].includes(
      props.resourceType,
    )
  ) {
    return;
  }

  store.setDraggingGroupId(draggingGroupId);
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
    store.setDraggingGroupId(null);
    render();
  }
};

export const handleDrop = async (deps, payload) => {
  const { dispatchEvent, store, render, props } = deps;
  payload._event.preventDefault();
  payload._event.stopPropagation();
  const targetGroupId = store.selectDraggingGroupId();

  store.setDraggingGroupId(null);
  render();

  // Filter for accepted file types only
  const files = Array.from(payload._event.dataTransfer.files).filter((file) =>
    isFileTypeAccepted(file, props.acceptedFileTypes),
  );

  if (files.length > 0) {
    // For fonts, load them for preview
    if (props.resourceType === "fonts" && fontManager) {
      for (const file of files) {
        const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
        const fontUrl = URL.createObjectURL(file);
        await fontManager.load(fontName, fontUrl);
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
  const groupId = payload._event.currentTarget.id.replace("group-", "");

  // Handle group toggle locally
  store.toggleGroupCollapse({ groupId });
  render();
};

export const handleItemClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const itemId = payload._event.currentTarget.id.replace("item-", "");

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
  const itemId = payload._event.currentTarget.id.replace("item-", "");

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
  const { props, dispatchEvent, fontManager } = deps;
  payload._event.stopPropagation();
  const targetGroupId = payload._event.currentTarget.id.replace(
    "upload-btn-",
    "",
  );
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
        if (props.resourceType === "fonts" && fontManager) {
          for (const file of files) {
            const fontName = file.name.replace(
              /\.(ttf|otf|woff|woff2|ttc)$/i,
              "",
            );
            const fontUrl = URL.createObjectURL(file);
            await fontManager.load(fontName, fontUrl);
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
      }
    }
    input.remove();
  };

  input.click();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { dispatchEvent, fontManager, props = {} } = deps;
  const { _event: event } = payload;
  const { files } = event.detail;
  const targetGroupId = payload._event.currentTarget.id
    .replace("drag-drop-bar-", "")
    .replace("drag-drop-item-", "");

  // For fonts, load them for preview
  if (props.resourceType === "fonts" && fontManager) {
    for (const file of files) {
      const fontName = file.name.replace(/\.(ttf|otf|woff|woff2|ttc)$/i, "");
      const fontUrl = URL.createObjectURL(file);
      await fontManager.load(fontName, fontUrl);
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
  const groupId = payload._event.currentTarget.id.replace("add-btn-", "");

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
  const itemId = payload._event.currentTarget.id.replace("sprites-button-", "");

  // Forward sprites button click to parent
  dispatchEvent(
    new CustomEvent("sprites-button-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomChange = async (deps, payload) => {
  const { store, render, userConfig } = deps;
  const zoomLevel = parseFloat(
    payload._event.detail?.value || payload._event.target?.value,
  );

  // Update internal state
  store.setZoomLevel(zoomLevel);
  await userConfig.set("images.zoomLevel", zoomLevel);
  render();
};

export const handleZoomIn = async (deps) => {
  const { store, render, userConfig } = deps;

  // Increase zoom by 0.1, max 4.0
  const currentZoom = store.selectZoomLevel();
  const newZoom = Math.min(4.0, currentZoom + 0.1);

  // Update internal state
  store.setZoomLevel(newZoom);
  await userConfig.set("images.zoomLevel", newZoom);
  render();
};

export const handleZoomOut = async (deps) => {
  const { store, render, userConfig } = deps;

  // Decrease zoom by 0.1, min 0.5
  const currentZoom = store.selectZoomLevel();
  const newZoom = Math.max(0.5, currentZoom - 0.1);

  // Update internal state
  store.setZoomLevel(newZoom);
  await userConfig.set("images.zoomLevel", newZoom);
  render();
};

export const handleAfterMount = async (deps) => {
  const { store, render, userConfig } = deps;
  const savedZoom = await userConfig.get("images.zoomLevel");
  if (savedZoom !== null && savedZoom !== undefined) {
    store.setZoomLevel(savedZoom);
    render();
  }
};

export const handleItemContextMenu = (deps, payload) => {
  const { store, render } = deps;
  payload._event.preventDefault();
  const itemId = payload._event.currentTarget.id
    .replace("item-", "")
    .replace("transform-item-", "")
    .replace("sprites-button-", "");
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
  const { subject, router } = deps;

  const currentPayload = router.getPayload();
  subject.dispatch("redirect", {
    path: "/project/resources/characters",
    payload: currentPayload,
  });
};
