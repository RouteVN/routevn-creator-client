// Constants
const MARKER_SIZE = 30;
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const BG_COLOR = "#4a4a4a";

const createRenderState = ({
  x,
  y,
  rotation,
  scaleX,
  scaleY,
  anchorX,
  anchorY,
}) => {
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
        x,
        y,
        rotation,
        width: 200,
        height: 200,
        scaleX,
        scaleY,
        anchorX,
        anchorY,
        fill: "white",
      },
      {
        id: "id1",
        type: "rect",
        x: x - MARKER_SIZE / 2,
        y: y - MARKER_SIZE / 2,
        width: MARKER_SIZE + 1,
        height: MARKER_SIZE + 1,
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
    // Open dialog in edit mode with item data
    store.openPlacementFormDialog({
      editMode: true,
      itemId: itemId,
      itemData: itemData,
    });
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
    const rotation = parseInt(itemData.rotation || 0);
    const scaleX = parseFloat(itemData.scaleX || 1);
    const scaleY = parseFloat(itemData.scaleY || 1);
    const anchor = { anchorX: itemData.anchorX, anchorY: itemData.anchorY };

    const renderState = createRenderState({
      x,
      y,
      rotation,
      scaleY,
      scaleX,
      anchorX: anchor.anchorX,
      anchorY: anchor.anchorY,
    });
    drenderer.render(renderState);
  }
};

export const handleAddPlacementClick = async (e, deps) => {
  const { store, render, drenderer, getRefIds } = deps;
  e.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = e.currentTarget.id.replace("add-placement-button-", "");

  // Open dialog in add mode
  store.openPlacementFormDialog({
    editMode: false,
    itemId: null,
    itemData: null,
    targetGroupId: groupId,
  });
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
  const renderState = createRenderState({
    x: 0,
    y: 0,
    rotation: 0,
    scaleY: 1,
    scaleX: 1,
    anchorX: 0,
    anchorY: 0,
  });
  drenderer.render(renderState);
};

export const handleCloseDialog = (_, deps) => {
  const { store, render } = deps;

  // Close dialog and reset all state
  store.closePlacementFormDialog();
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
      dispatchEvent(
        new CustomEvent("placement-edited", {
          detail: {
            itemId: editItemId,
            name: formData.name,
            x: parseInt(formData.x),
            y: parseInt(formData.y),
            scaleY: parseFloat(formData.scaleY),
            scaleX: parseFloat(formData.scaleX),
            anchorY: parseFloat(formData.anchor.anchorY),
            anchorX: parseFloat(formData.anchor.anchorX),
            rotation: parseInt(formData.rotation),
          },
          bubbles: true,
          composed: true,
        }),
      );

      // Force immediate render to update thumbnails
      render();
    } else {
      // Forward placement creation to parent
      dispatchEvent(
        new CustomEvent("placement-created", {
          detail: {
            groupId: targetGroupId,
            name: formData.name,
            x: parseInt(formData.x),
            y: parseInt(formData.y),
            scaleX: parseFloat(formData.scaleX),
            scaleY: parseFloat(formData.scaleY),
            anchorX: parseFloat(formData.anchor.anchorX),
            anchorY: parseFloat(formData.anchor.anchorY),
            rotation: parseInt(formData.rotation),
          },
          bubbles: true,
          composed: true,
        }),
      );
    }

    // Close dialog and reset all state
    store.closePlacementFormDialog();

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
  const rotation = parseInt(formValues.rotation || 0);
  const scaleX = parseFloat(
    formValues.scaleX === undefined ? 1 : formValues.scaleX,
  );
  const scaleY = parseFloat(
    formValues.scaleY === undefined ? 1 : formValues.scaleY,
  );
  const anchorX = formValues.anchor.anchorX;
  const anchorY = formValues.anchor.anchorY;

  const renderState = createRenderState({
    x,
    y,
    rotation,
    scaleX,
    scaleY,
    anchorX,
    anchorY,
  });

  drenderer.render(renderState);

  render();
};
