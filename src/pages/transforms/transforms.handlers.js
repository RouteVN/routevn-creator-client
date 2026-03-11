import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";

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
    animations: [],
  };
};

const createTransformPayload = (values = {}) => {
  const anchor = values.anchor ?? {
    anchorX: values.anchorX,
    anchorY: values.anchorY,
  };

  return {
    name: values.name?.trim() ?? "",
    x: parseInt(values.x ?? 0, 10),
    y: parseInt(values.y ?? 0, 10),
    scaleX: parseFloat(values.scaleX ?? 1),
    scaleY: parseFloat(values.scaleY ?? 1),
    anchorX: parseFloat(anchor.anchorX ?? 0),
    anchorY: parseFloat(anchor.anchorY ?? 0),
    rotation: parseInt(values.rotation ?? 0, 10) || 0,
  };
};

const renderTransformPreview = ({ graphicsService, values } = {}) => {
  if (!graphicsService) {
    return;
  }

  const transformData = createTransformPayload(values);
  graphicsService.render(
    createRenderState({
      x: transformData.x,
      y: transformData.y,
      rotation: transformData.rotation,
      scaleX: transformData.scaleX,
      scaleY: transformData.scaleY,
      anchorX: transformData.anchorX,
      anchorY: transformData.anchorY,
    }),
  );
};

const openTransformDialog = async ({
  deps,
  editMode = false,
  itemId,
  itemData,
  targetGroupId,
} = {}) => {
  const { graphicsService, refs, render, store } = deps;

  store.openTransformFormDialog({
    editMode,
    itemId,
    itemData,
    targetGroupId,
  });
  render();

  const { canvas } = refs;
  if (!canvas || !graphicsService) {
    return;
  }

  await graphicsService.init({
    canvas,
  });

  renderTransformPreview({
    graphicsService,
    values: createTransformPayload(
      itemData ?? {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        anchor: { anchorX: 0, anchorY: 0 },
      },
    ),
  });
};

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleTransformItemClick,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "transforms",
});

export {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleTransformItemClick,
  handleSearchInput,
};

export const handleTransformItemDoubleClick = async (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  const itemData = deps.store.selectTransformItemById({ itemId });
  if (!itemData) {
    return;
  }

  await openTransformDialog({
    deps,
    editMode: true,
    itemId,
    itemData,
  });
};

export const handleAddTransformClick = async (deps, payload) => {
  const { groupId } = payload._event.detail;

  await openTransformDialog({
    deps,
    targetGroupId: groupId,
  });
};

export const handleTransformDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeTransformFormDialog();
  render();
};

export const handleTransformFormActionClick = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const transformData = createTransformPayload(values);
  if (!transformData.name) {
    appService.showToast("Transform name is required.", { title: "Warning" });
    return;
  }

  const editMode = store.selectEditMode();
  const editItemId = store.selectEditItemId();
  const targetGroupId = store.selectTargetGroupId();

  if (editMode && editItemId) {
    await projectService.updateResourceItem({
      resourceType: "transforms",
      resourceId: editItemId,
      patch: transformData,
    });
  } else {
    await projectService.createResourceItem({
      resourceType: "transforms",
      resourceId: nanoid(),
      data: {
        type: "transform",
        ...transformData,
      },
      parentId: targetGroupId,
      position: "last",
    });
  }

  store.closeTransformFormDialog();
  await handleDataChanged(deps);
};

export const handleTransformFormChange = (deps, payload) => {
  const { graphicsService, render } = deps;

  renderTransformPreview({
    graphicsService,
    values: createTransformPayload(payload._event.detail.values),
  });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    return;
  }

  await projectService.deleteResourceItem({
    resourceType: "transforms",
    resourceId: itemId,
  });

  await handleDataChanged(deps);
};
