import { nanoid } from "nanoid";
import { toFlatItems } from "../../deps/repository.js";

// Constants for drenderer integration (moved from groupTransformsView)
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

export const handleAfterMount = async (deps) => {
  const { store, repositoryFactory, router, render } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { transforms } = repository.getState();
  store.setItems(transforms || { tree: [], items: {} });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);

  const repositoryState = repository.getState();
  const { transforms } = repositoryState;

  const transformData = transforms || { tree: [], items: {} };

  store.setItems(transformData);
  render();
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { id } = payload._event.detail;

  store.setSelectedItemId(id);
  render();
};

export const handleTransformItemClick = (deps, payload) => {
  const { store, render, getRefIds } = deps;
  const { itemId } = payload._event.detail;

  const { fileExplorer } = getRefIds();
  fileExplorer.elm.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  store.setSelectedItemId(itemId);
  render();
};

export const handleTransformItemDoubleClick = async (deps, payload) => {
  const { store, render, drenderer, getRefIds } = deps;
  const { itemId } = payload._event.detail;
  console.log("Double click transform item:", itemId);

  // Find the item data using the same approach as fonts page
  const state = store.getState();
  const flatItems = toFlatItems(state.transformData);
  const itemData = flatItems.find((item) => item.id === itemId);

  if (!itemData) {
    console.warn("Transform item not found:", itemId);
    return;
  }

  // Open dialog in edit mode with item data
  store.openTransformFormDialog({
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
};

export const handleAddTransformClick = async (deps, payload) => {
  const { store, render, drenderer, getRefIds } = deps;
  payload._event.stopPropagation(); // Prevent group click

  // Extract group ID from the clicked button
  const groupId = payload._event.detail.groupId;

  // Open dialog in add mode
  store.openTransformFormDialog({
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

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = payload._event.currentTarget.id.replace("group-", "");

  // Handle group collapse internally
  store.toggleGroupCollapse(groupId);
  render();
};

export const handleTransformCreated = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { groupId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    payload._event.detail;

  console.log("22222222222222 created", payload._event.detail);

  repository.addAction({
    actionType: "treePush",
    target: "transforms",
    value: {
      parent: groupId,
      position: "last",
      item: {
        id: nanoid(),
        type: "transform",
        name: name,
        x,
        y,
        scaleX: scaleX,
        scaleY: scaleY,
        anchorX: anchorX,
        anchorY: anchorY,
        rotation: rotation,
      },
    },
  });

  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { repositoryFactory, router, render, store } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  repository.addAction({
    actionType: "treeUpdate",
    target: "transforms",
    value: {
      id: store.selectSelectedItemId(),
      replace: false,
      item: {
        [payload._event.detail.name]: payload._event.detail.fieldValue,
      },
    },
  });

  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};

export const handleTransformEdited = async (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;
  const { p } = router.getPayload();
  const repository = await repositoryFactory.getByProject(p);
  const { itemId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    payload._event.detail;

  // Update repository directly
  repository.addAction({
    actionType: "treeUpdate",
    target: "transforms",
    value: {
      id: itemId,
      replace: false,
      item: {
        name,
        x,
        y,
        scaleX,
        scaleY,
        anchorX,
        anchorY,
        rotation,
      },
    },
  });

  // Update local state and render immediately
  const { transforms } = repository.getState();
  store.setItems(transforms);
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery(searchQuery);
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.toggleGroupCollapse(groupId);
  render();
};

// Transform dialog and canvas handlers (moved from groupTransformsView)
export const handleTransformDialogClose = (deps) => {
  const { store, render } = deps;

  // Close dialog and reset all state
  store.closeTransformFormDialog();
  render();
};

export const handleTransformFormActionClick = (deps, payload) => {
  const { store, render, repositoryFactory, router } = deps;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = payload._event.detail.formValues;

    // Get state values using selector functions
    const targetGroupId = store.selectTargetGroupId();
    const editMode = store.selectEditMode();
    const editItemId = store.selectEditItemId();

    if (editMode && editItemId) {
      // Call the existing transform edit handler directly
      const editEvent = {
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
      };
      handleTransformEdited(editEvent, {
        store,
        render,
        repositoryFactory,
        router,
      });

      // Force immediate render to update thumbnails
      render();
    } else {
      // Call the existing transform creation handler directly
      const createEvent = {
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
      };
      handleTransformCreated(createEvent, {
        store,
        render,
        repositoryFactory,
        router,
      });
    }

    // Close dialog and reset all state
    store.closeTransformFormDialog();

    // Force a render after the event dispatch completes
    render();
  }
};

export const handleTransformFormChange = async (deps, payload) => {
  const { render, drenderer } = deps;

  const formValues = payload._event.detail.formValues;

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

export const handleItemDelete = async (deps, payload) => {
  const { repositoryFactory, router, store, render } = deps;
  const { p: projectId } = router.getPayload();
  const repository = await repositoryFactory.getByProject(projectId);
  const { resourceType, itemId } = payload._event.detail;

  // Perform the delete operation
  repository.addAction({
    actionType: "treeDelete",
    target: resourceType,
    value: {
      id: itemId,
    },
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = repository.getState()[resourceType];
  store.setItems(data);
  render();
};
