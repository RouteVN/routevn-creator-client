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

export const handleGroupClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const groupId = payload._event.currentTarget.id.replace("group-", "");

  // Forward group toggle to parent
  dispatchEvent(
    new CustomEvent("group-toggle", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
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

export const handleDragDropFileSelected = async (deps, payload) => {
  const { dispatchEvent, fontManager, props = {} } = deps;
  const { files } = payload._event.detail;
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
        targetGroupId,
        originalEvent: e,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleSpritesButtonClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent item click
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

export const handleAddCharacterClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent group click
  const groupId = payload._event.currentTarget.id.replace("add-character-button-", "");

  // Forward add character click to parent
  dispatchEvent(
    new CustomEvent("add-character-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddColorClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent group click
  const groupId = payload._event.currentTarget.id.replace("add-color-button-", "");

  // Forward add color click to parent
  dispatchEvent(
    new CustomEvent("add-color-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddTypographyClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent group click
  const groupId = payload._event.currentTarget.id.replace("add-typography-button-", "");

  // Forward add typography click to parent
  dispatchEvent(
    new CustomEvent("add-typography-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddLayoutClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent group click
  const groupId = payload._event.currentTarget.id.replace("add-layout-button-", "");

  // Forward add layout click to parent
  dispatchEvent(
    new CustomEvent("add-layout-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddTransformClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent group click
  const groupId = payload._event.currentTarget.id.replace("add-transform-button-", "");

  // Forward add transform click to parent
  dispatchEvent(
    new CustomEvent("add-transform-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddVariableClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent group click
  const groupId = payload._event.currentTarget.id.replace("add-variable-button-", "");

  // Forward add variable click to parent
  dispatchEvent(
    new CustomEvent("add-variable-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleAddAnimationClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  payload._event.stopPropagation(); // Prevent group click
  const groupId = payload._event.currentTarget.id.replace("add-animation-button-", "");

  // Forward add animation click to parent
  dispatchEvent(
    new CustomEvent("add-animation-click", {
      detail: { groupId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleZoomChange = async (deps, payload) => {
  const { store, render, userConfig } = deps;
  const zoomLevel = parseFloat(payload._event.detail?.value || payload._event.target?.value);

  // Update internal state
  store.setZoomLevel(zoomLevel);
  await userConfig.set("images.zoomLevel", zoomLevel);
  render();
};

export const handleZoomIn = async (deps, payload) => {
  const { store, render, userConfig } = deps;

  // Increase zoom by 0.1, max 4.0
  const currentZoom = store.state.zoomLevel || 1.0;
  const newZoom = Math.min(4.0, currentZoom + 0.1);

  // Update internal state
  store.setZoomLevel(newZoom);
  await userConfig.set("images.zoomLevel", newZoom);
  render();
};

export const handleZoomOut = async (deps, payload) => {
  const { store, render, userConfig } = deps;

  // Decrease zoom by 0.1, min 0.5
  const currentZoom = store.state.zoomLevel || 1.0;
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
