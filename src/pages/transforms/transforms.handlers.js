import { nanoid } from "nanoid";
import { toFlatItems } from "#v2-tree-helpers";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

// Constants for graphicsService integration (moved from groupTransformsView)
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

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      name: "",
      x: "",
      y: "",
      scaleX: "",
      scaleY: "",
      anchorX: "",
      anchorY: "",
    };
  }

  return {
    name: item.name || "",
    x: String(item.x ?? 0),
    y: String(item.y ?? 0),
    scaleX: String(item.scaleX ?? 1),
    scaleY: String(item.scaleY ?? 1),
    anchorX: String(item.anchorX ?? 0),
    anchorY: String(item.anchorY ?? 0),
  };
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { transforms } = projectService.getState();
  store.setItems({ transformData: transforms || { tree: [], items: {} } });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const { transforms } = projectService.getState();

  const transformData = transforms || { tree: [], items: {} };

  store.setItems({ transformData: transformData });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail || {};
  const id = resolveDetailItemId(detail);
  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: id,
    });
  }
};

export const handleTransformItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  if (!itemId) {
    return;
  }

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  store.setSelectedItemId({ itemId: itemId });
  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
};

export const handleTransformItemDoubleClick = async (deps, payload) => {
  const { store, render, graphicsService, refs } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

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

  // Initialize graphicsService after dialog is opened and canvas is in DOM
  const { canvas } = refs;
  if (canvas) {
    await graphicsService.init({
      canvas: canvas,
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
  graphicsService.render(renderState);
};

export const handleAddTransformClick = async (deps, payload) => {
  const { store, render, graphicsService, refs } = deps;
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

  const { canvas } = refs;
  if (canvas) {
    await graphicsService.init({
      canvas: canvas,
    });
  }

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
  graphicsService.render(renderState);
};

export const handleGroupClick = (deps, payload) => {
  const { store, render } = deps;
  const groupId = payload._event.currentTarget.id.replace("group", "");

  // Handle group collapse internally
  store.toggleGroupCollapse({ groupId: groupId });
  render();
};

export const handleTransformCreated = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { groupId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    payload._event.detail;

  await projectService.createResourceItem({
    resourceType: "transforms",
    resourceId: nanoid(),
    data: {
      type: "transform",
      name,
      x,
      y,
      scaleX,
      scaleY,
      anchorX,
      anchorY,
      rotation,
    },
    parentId: groupId,
    position: "last",
  });

  const { transforms } = projectService.getState();
  store.setItems({ transformData: transforms });
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  await projectService.updateResourceItem({
    resourceType: "transforms",
    resourceId: selectedItemId,
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { transforms } = projectService.getState();
  store.setItems({ transformData: transforms });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleTransformEdited = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId, name, x, y, scaleX, scaleY, anchorX, anchorY, rotation } =
    payload._event.detail;

  // Update repository directly
  await projectService.updateResourceItem({
    resourceType: "transforms",
    resourceId: itemId,
    patch: {
      name,
      x,
      y,
      scaleX,
      scaleY,
      anchorX,
      anchorY,
      rotation,
    },
  });

  // Update local state and render immediately
  const { transforms } = projectService.getState();
  store.setItems({ transformData: transforms });
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem && selectedItemId === itemId) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail?.value || "";
  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleGroupToggle = (deps, payload) => {
  const { store, render } = deps;
  const { groupId } = payload._event.detail;
  store.toggleGroupCollapse({ groupId: groupId });
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
  const { store, render, appService } = deps;

  // Check which button was clicked
  const actionId = payload._event.detail.actionId;

  if (actionId === "submit") {
    // Get form values from the event detail - it's in formValues
    const formData = payload._event.detail.values;

    if (!formData.name || !formData.name.trim()) {
      appService.showToast("Transform name is required", { title: "Warning" });
      return;
    }
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
          rotation: parseInt(formData.rotation) || 0, //quick fix for now have to remove when we add implemetataion in graphics
        },
      };
      handleTransformEdited(deps, { _event: editEvent });

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
          rotation: parseInt(formData.rotation) || 0,
        },
      };
      handleTransformCreated(deps, { _event: createEvent });
    }

    // Close dialog and reset all state
    store.closeTransformFormDialog();

    // Force a render after the event dispatch completes
    render();
  }
};

export const handleTransformFormChange = async (deps, payload) => {
  const { render, graphicsService } = deps;

  const formValues = payload._event.detail.values;

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

  graphicsService.render(renderState);

  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;

  const state = projectService.getState();
  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ transformData: data });
  render();
};
