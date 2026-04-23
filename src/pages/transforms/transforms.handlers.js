import { generateId } from "../../internal/id.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { TRANSFORM_TAG_SCOPE_KEY } from "./transforms.store.js";

const MARKER_SIZE = 30;
const BG_COLOR = "#4a4a4a";

const createRenderState = ({
  projectResolution,
  x,
  y,
  rotation,
  scaleX,
  scaleY,
  anchorX,
  anchorY,
}) => {
  const { width, height } = projectResolution;

  return {
    elements: [
      {
        id: "bg",
        type: "rect",
        x: 0,
        y: 0,
        width,
        height,
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
    description: values.description ?? "",
    tagIds: Array.isArray(values.tagIds) ? values.tagIds : [],
    x: parseInt(values.x ?? 0, 10),
    y: parseInt(values.y ?? 0, 10),
    scaleX: parseFloat(values.scaleX ?? 1),
    scaleY: parseFloat(values.scaleY ?? 1),
    anchorX: parseFloat(anchor.anchorX ?? 0),
    anchorY: parseFloat(anchor.anchorY ?? 0),
    rotation: parseInt(values.rotation ?? 0, 10) || 0,
  };
};

const renderTransformPreview = ({
  graphicsService,
  values,
  projectResolution,
} = {}) => {
  if (!graphicsService) {
    return;
  }

  const transformData = createTransformPayload(values);
  graphicsService.render(
    createRenderState({
      projectResolution,
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
  previewOnly = false,
  itemId,
  itemData,
  targetGroupId,
} = {}) => {
  const { graphicsService, refs, render, store } = deps;
  const projectResolution = store.selectProjectResolution();

  if (previewOnly) {
    store.openTransformPreviewDialog({
      itemId,
      itemData,
    });
  } else {
    store.openTransformFormDialog({
      editMode,
      itemId,
      itemData,
      targetGroupId,
    });
  }
  render();

  const { canvas } = refs;
  if (!canvas || !graphicsService) {
    return;
  }

  await graphicsService.init({
    canvas,
    width: projectResolution.width,
    height: projectResolution.height,
  });

  renderTransformPreview({
    graphicsService,
    projectResolution,
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
  handleBeforeMount: handleBeforeMountBase,
  handleAfterMount: handleAfterMountBase,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleItemClick: handleTransformItemClick,
  handleSearchInput,
  openCreateTagDialogForMode,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createCatalogPageHandlers({
  resourceType: "transforms",
  selectData: (repositoryState) => {
    const tagsData = getTagsCollection(repositoryState, TRANSFORM_TAG_SCOPE_KEY);

    return resolveCollectionWithTags({
      collection: repositoryState?.transforms,
      tagsCollection: tagsData,
      itemType: "transform",
    });
  },
  onProjectStateChanged: ({ deps, repositoryState }) => {
    deps.store.setTagsData({
      tagsData: getTagsCollection(repositoryState, TRANSFORM_TAG_SCOPE_KEY),
    });
    deps.store.setProjectResolution({
      projectResolution: repositoryState?.project?.resolution,
    });
  },
  tagging: {
    scopeKey: TRANSFORM_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateTransform({
        transformId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: "Failed to update transform tags.",
    appendCreatedTagByMode: ({ deps, mode, tagId }) => {
      if (mode !== "form") {
        return;
      }

      appendTagIdToForm({
        form: deps.refs.transformForm,
        tagId,
      });
    },
  },
});

export {
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleTransformItemClick,
  handleSearchInput,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

export const handleBeforeMount = (deps) => {
  return handleBeforeMountBase(deps);
};

export const handleAfterMount = (deps) => {
  handleAfterMountBase(deps);
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
    previewOnly: true,
    itemId,
    itemData,
  });
};

export const handleTransformItemEdit = async (deps, payload) => {
  const { itemId } = payload._event.detail;
  if (!itemId) {
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

export const handleDetailHeaderClick = async (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  const itemData = store.selectTransformItemById({ itemId });
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

export const handleTransformFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "form",
    itemId: deps.store.selectEditItemId(),
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
    appService.showAlert({
      message: "Transform name is required.",
      title: "Warning",
    });
    return;
  }

  const editMode = store.selectEditMode();
  const editItemId = store.selectEditItemId();
  const targetGroupId = store.selectTargetGroupId();

  if (editMode && editItemId) {
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update transform.",
      action: () =>
        projectService.updateTransform({
          transformId: editItemId,
          data: transformData,
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }
  } else {
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create transform.",
      action: () =>
        projectService.createTransform({
          transformId: generateId(),
          data: {
            type: "transform",
            ...transformData,
          },
          parentId: targetGroupId,
          position: "last",
        }),
    });

    if (!createAttempt.ok) {
      return;
    }
  }

  store.closeTransformFormDialog();
  await handleDataChanged(deps);
};

export const handleTransformFormChange = (deps, payload) => {
  const { graphicsService, render, store } = deps;

  renderTransformPreview({
    graphicsService,
    projectResolution: store.selectProjectResolution(),
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

  const usage = await projectService.checkResourceUsage({
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showAlert({
      message: "Cannot delete resource, it is currently in use.",
    });
    return;
  }

  await projectService.deleteTransforms({
    transformIds: [itemId],
  });

  await handleDataChanged(deps);
};

export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const itemData = store.selectTransformItemById({ itemId });
  if (!itemData) {
    return;
  }

  const duplicateTransformId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to duplicate transform.",
    action: () =>
      projectService.createTransform({
        transformId: duplicateTransformId,
        data: {
          type: "transform",
          ...createTransformPayload(itemData),
        },
        parentId: itemData.parentId ?? null,
        position: "after",
        positionTargetId: itemId,
      }),
  });

  if (!createAttempt.ok) {
    return;
  }

  await handleDataChanged(deps, {
    selectedItemId: duplicateTransformId,
  });
};
