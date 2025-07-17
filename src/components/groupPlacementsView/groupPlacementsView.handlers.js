// Constants
const BASE_WIDTH = 300;
const BASE_HEIGHT = 300;
const MARKER_SIZE = 50;
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const BG_COLOR = "#4a4a4a";

// Helper functions
const calculateAnchorOffset = (anchor, scaledWidth, scaledHeight) => {
  let anchorOffsetX = 0;
  let anchorOffsetY = 0;

  switch (anchor) {
    case "top-left":
      anchorOffsetX = 0;
      anchorOffsetY = 0;
      break;
    case "top-center":
      anchorOffsetX = -scaledWidth / 2;
      anchorOffsetY = 0;
      break;
    case "top-right":
      anchorOffsetX = -scaledWidth;
      anchorOffsetY = 0;
      break;
    case "center-left":
      anchorOffsetX = 0;
      anchorOffsetY = -scaledHeight / 2;
      break;
    case "center-center":
      anchorOffsetX = -scaledWidth / 2;
      anchorOffsetY = -scaledHeight / 2;
      break;
    case "center-right":
      anchorOffsetX = -scaledWidth;
      anchorOffsetY = -scaledHeight / 2;
      break;
    case "bottom-left":
      anchorOffsetX = 0;
      anchorOffsetY = -scaledHeight;
      break;
    case "bottom-center":
      anchorOffsetX = -scaledWidth / 2;
      anchorOffsetY = -scaledHeight;
      break;
    case "bottom-right":
      anchorOffsetX = -scaledWidth;
      anchorOffsetY = -scaledHeight;
      break;
  }

  return { anchorOffsetX, anchorOffsetY };
};

const createRenderState = (x, y, r, scale, anchor) => {
  const scaledWidth = BASE_WIDTH * scale;
  const scaledHeight = BASE_HEIGHT * scale;
  const { anchorOffsetX, anchorOffsetY } = calculateAnchorOffset(anchor, scaledWidth, scaledHeight);

  return {
    elements: [
      {
        id: "bg",
        type: "rect",
        x: 0,
        y: 0,
        width: CANVAS_WIDTH,
        height: CANVAS_HEIGHT,
        fill: BG_COLOR,
      },
      {
        id: "id0",
        type: "rect",
        x: x + anchorOffsetX,
        y: y + anchorOffsetY,
        r,
        width: scaledWidth,
        height: scaledHeight,
        fill: "white",
      },
      {
        id: "id1",
        type: "rect",
        x: x - MARKER_SIZE / 2,
        y: y - MARKER_SIZE / 2,
        width: MARKER_SIZE,
        height: MARKER_SIZE,
        fill: "red",
      },
    ],
    transitions: [],
  };
};

export const handleSearchInput = (e, deps) => {
  const { store, render } = deps;
  const searchQuery = e.detail.value || "";

  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupClick = (e, deps) => {
  const { store, render } = deps;
  const groupId = e.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handlePlacementItemClick = (e, deps) => {
  const { dispatchEvent } = deps;
  const itemId = e.currentTarget.id.replace("placement-item-", "");

  // Forward placement item selection to parent
  dispatchEvent(
    new CustomEvent("placement-item-click", {
      detail: { itemId },
      bubbles: true,
      composed: true,
    }),
  );
};

export const handlePlacementItemDoubleClick = async (e, deps) => {
  const { store, render, props, drenderer, getRefIds } = deps;
  const itemId = e.currentTarget.id.replace("placement-item-", "");

  // Find the item data from props
  const flatGroups = props.flatGroups || [];
  let itemData = null;

  for (const group of flatGroups) {
    const foundItem = group.children?.find((child) => child.id === itemId);
    if (foundItem) {
      itemData = foundItem;
      break;
    }
  }

  if (itemData) {
    // Set edit mode with item data using separate store functions
    store.setEditMode(true);
    store.setEditItemId(itemId);
    store.setDefaultValues(itemData);
    // Open dialog
    store.toggleDialog();
    render();

    // Initialize drenderer after dialog is opened and canvas is in DOM
    const { canvas } = getRefIds();
    if (canvas && canvas.elm) {
      await drenderer.init({
        canvas: canvas.elm,
      });
    }

    // Render initial state with item's current position
    const x = parseInt(itemData.x || 0);
    const y = parseInt(itemData.y || 0);
    const r = parseInt(itemData.rotation || 0);
    const scale = parseFloat(itemData.scale || 1);
    const anchor = itemData.anchor || "center-center";

    const renderState = createRenderState(x, y, r, scale, anchor);
    drenderer.render(renderState);
  }
};

export const handleAddPlacementClick = async (e, deps) => {
  const { store, render, drenderer, getRefIds } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-placement-button-", "");
  store.setTargetGroupId(groupId);

  // Set add mode (not edit mode)
  store.setEditMode(false);
  store.setEditItemId(null);
  store.setDefaultValues(null);

  // Toggle dialog open
  store.toggleDialog();
  render();

  const { canvas } = getRefIds();
  if (!canvas?.elm || drenderer.initialized) {
    return;
  }
  await drenderer.init({
    canvas: canvas.elm,
  });
  drenderer.initialized = true;

  // Render initial state with default values (scale=1, anchor=center-center)
  const renderState = createRenderState(0, 0, 0, 1, "center-center");
  drenderer.render(renderState);
};

export const handleCloseDialog = (_, deps) => {
  const { store, render } = deps;

  // Close dialog first
  store.toggleDialog();

  // Reset edit mode and clear all form state after closing
  store.setEditMode(false);
  store.setEditItemId(null);
  store.setDefaultValues(null);
  store.setTargetGroupId(null);

  render();
};

export const handleFormActionClick = (e, deps) => {
  const { store, render, dispatchEvent } = deps;

  // Check which button was clicked
  const actionId = e.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = e.detail.formValues;

    // Get state values using selector functions
    const targetGroupId = store.selectTargetGroupId();
    const editMode = store.selectEditMode();
    const editItemId = store.selectEditItemId();

    if (editMode && editItemId) {
      // Forward placement edit to parent
      dispatchEvent(new CustomEvent("placement-edited", {
        detail: {
          itemId: editItemId,
          name: formData.name,
          x: formData.x,
          y: formData.y,
          scale: formData.scale,
          anchor: formData.anchor,
          rotation: formData.rotation
        },
        bubbles: true,
        composed: true
      }));

      // Force immediate render to update thumbnails
      render();
    } else {
      // Forward placement creation to parent
      dispatchEvent(
        new CustomEvent("placement-created", {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            x: formData.x,
            y: formData.y,
            scale: formData.scale,
            anchor: formData.anchor,
            rotation: formData.rotation,
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog first, then reset all state
    store.toggleDialog();
    store.setEditMode(false);
    store.setEditItemId(null);
    store.setDefaultValues(null);
    store.setTargetGroupId(null);

    // Force a render after the event dispatch completes
    render();
  }
};

export const handlePreviewButtonClick = () => {
  //
};

export const handleFormChange = async (e, deps) => {
  const { render, drenderer } = deps;

  const formValues = e.detail.formValues;

  const x = parseInt(formValues.x || 0);
  const y = parseInt(formValues.y || 0);
  const r = parseInt(formValues.rotation || 0);
  const scale = parseFloat(formValues.scale || 1);
  const anchor = formValues.anchor || "center-center";

  const renderState = createRenderState(x, y, r, scale, anchor);

  drenderer.render(renderState);

  render();
};
