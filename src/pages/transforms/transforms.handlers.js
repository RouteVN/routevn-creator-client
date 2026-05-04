import { generateId } from "../../internal/id.js";
import {
  captureCanvasImage,
  captureCanvasThumbnailImage,
} from "../../internal/runtime/graphicsEngineRuntime.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
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
const FALLBACK_TARGET_SIZE = 200;

const createEmptyPreviewState = () => ({
  elements: [],
  animations: [],
  audio: [],
});

const toPositiveNumber = (value, fallback) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0
    ? numberValue
    : fallback;
};

const dataUrlToBlob = async (value) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Thumbnail image is missing");
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Thumbnail image is not a valid data URL");
  }

  const header = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;,]+)?(?:;base64)?$/);
  if (!mimeMatch) {
    throw new Error("Thumbnail image is not a valid data URL");
  }

  const mimeType = mimeMatch[1] || "application/octet-stream";
  const isBase64 = header.includes(";base64");

  if (!isBase64) {
    return new Blob([decodeURIComponent(body)], { type: mimeType });
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

const waitForPreviewPaint = () =>
  new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame !== "function") {
      resolve();
      return;
    }

    globalThis.requestAnimationFrame(() => {
      if (typeof globalThis.requestAnimationFrame !== "function") {
        resolve();
        return;
      }

      globalThis.requestAnimationFrame(resolve);
    });
  });

const {
  focusKeyboardScope: focusImageSelectorKeyboardScope,
  handleKeyboardScopeClick:
    handleTransformPreviewImageSelectorKeyboardScopeClick,
  handleKeyboardScopeKeyDown:
    handleTransformPreviewImageSelectorKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  fileExplorerRefName: "transformPreviewImageSelectorFileExplorer",
  keyboardScopeRefName: "transformPreviewImageSelectorKeyboardScope",
});

const attachTransformPreviewCanvas = async ({ graphicsService, refs } = {}) => {
  if (!graphicsService || !refs?.canvas) {
    return;
  }

  if (typeof graphicsService.attachCanvas === "function") {
    await graphicsService.attachCanvas(refs.canvas);
  }
};

const createRenderState = ({
  projectResolution,
  x,
  y,
  rotation,
  scaleX,
  scaleY,
  anchorX,
  anchorY,
  backgroundImage,
  targetImage,
}) => {
  const { width, height } = projectResolution;
  const backgroundElement = backgroundImage?.fileId
    ? {
        id: "bg",
        type: "sprite",
        src: backgroundImage.fileId,
        fileType: backgroundImage.fileType ?? "image/png",
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        width,
        height,
        anchorX: 0.5,
        anchorY: 0.5,
      }
    : {
        id: "bg",
        type: "rect",
        x: 0,
        y: 0,
        width,
        height,
        fill: BG_COLOR,
      };
  const targetElement = targetImage?.fileId
    ? {
        id: "id0",
        type: "sprite",
        src: targetImage.fileId,
        fileType: targetImage.fileType ?? "image/png",
        x,
        y,
        rotation,
        width: toPositiveNumber(targetImage.width, FALLBACK_TARGET_SIZE),
        height: toPositiveNumber(targetImage.height, FALLBACK_TARGET_SIZE),
        scaleX,
        scaleY,
        anchorX,
        anchorY,
      }
    : {
        id: "id0",
        type: "rect",
        x,
        y,
        rotation,
        width: FALLBACK_TARGET_SIZE,
        height: FALLBACK_TARGET_SIZE,
        scaleX,
        scaleY,
        anchorX,
        anchorY,
        fill: "white",
      };

  return {
    elements: [
      backgroundElement,
      targetElement,
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

const loadTransformPreviewAssets = async ({
  graphicsService,
  projectService,
  images,
} = {}) => {
  if (!graphicsService || !projectService) {
    return;
  }

  const assets = {};
  for (const image of images ?? []) {
    if (!image?.fileId) {
      continue;
    }

    const fileResult = await projectService.getFileContent(image.fileId);
    assets[image.fileId] = {
      url: fileResult.url,
      type: image.fileType ?? fileResult.type ?? "image/png",
    };
  }

  if (Object.keys(assets).length > 0) {
    await graphicsService.loadAssets(assets);
  }
};

const renderTransformPreview = async ({ deps, values } = {}) => {
  const { graphicsService, projectService, refs, store } = deps;
  if (!graphicsService) {
    return;
  }

  await attachTransformPreviewCanvas({
    graphicsService,
    refs,
  });

  const transformData = createTransformPayload(values);
  const projectResolution = store.selectProjectResolution();
  const backgroundImage = store.selectDialogPreviewBackgroundImage();
  const targetImage = store.selectDialogPreviewTargetImage();
  await loadTransformPreviewAssets({
    graphicsService,
    projectService,
    images: [backgroundImage, targetImage],
  });
  await graphicsService.render(createEmptyPreviewState());
  await graphicsService.render(
    createRenderState({
      projectResolution,
      x: transformData.x,
      y: transformData.y,
      rotation: transformData.rotation,
      scaleX: transformData.scaleX,
      scaleY: transformData.scaleY,
      anchorX: transformData.anchorX,
      anchorY: transformData.anchorY,
      backgroundImage,
      targetImage,
    }),
  );
};

const captureTransformPreviewFiles = async ({ deps, values } = {}) => {
  const { appService, graphicsService, projectService, refs } = deps;

  if (!graphicsService || !refs.canvas) {
    appService.showAlert({
      message: "Failed to capture transform thumbnail.",
      title: "Error",
    });
    return;
  }

  try {
    await renderTransformPreview({
      deps,
      values,
    });
    await waitForPreviewPaint();

    const previewImage = await captureCanvasImage(graphicsService, refs.canvas);
    if (!previewImage) {
      appService.showAlert({
        message: "Failed to capture transform preview.",
        title: "Error",
      });
      return;
    }

    const thumbnailImage = await captureCanvasThumbnailImage(
      graphicsService,
      refs.canvas,
    );
    if (!thumbnailImage) {
      appService.showAlert({
        message: "Failed to capture transform thumbnail.",
        title: "Error",
      });
      return;
    }

    const previewBlob = await dataUrlToBlob(previewImage);
    const previewFile = await projectService.storeFile({
      file: previewBlob,
    });
    const thumbnailBlob = await dataUrlToBlob(thumbnailImage);
    const thumbnailFile = await projectService.storeFile({
      file: thumbnailBlob,
    });

    return {
      previewFileId: previewFile.fileId,
      thumbnailFileId: thumbnailFile.fileId,
      fileRecords: [
        ...(previewFile.fileRecords ?? []),
        ...(thumbnailFile.fileRecords ?? []),
      ],
    };
  } catch (error) {
    console.error("[transforms] Failed to capture transform preview", error);
    appService.showAlert({
      message: "Failed to save transform thumbnail.",
      title: "Error",
    });
  }
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

  await renderTransformPreview({
    deps,
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
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  openFolderNameDialogWithValues,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
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
    const tagsData = getTagsCollection(
      repositoryState,
      TRANSFORM_TAG_SCOPE_KEY,
    );

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
    deps.store.setImagesData({
      imagesData: repositoryState?.images,
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
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

export {
  handleTransformPreviewImageSelectorKeyboardScopeClick,
  handleTransformPreviewImageSelectorKeyboardScopeKeyDown,
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
    openFolderNameDialogWithValues({
      deps,
      folderId: store.selectSelectedFolderId(),
    });
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
  store.setDialogValues({ values });

  const previewFileResult = await captureTransformPreviewFiles({
    deps,
    values,
  });
  if (!previewFileResult) {
    return;
  }
  transformData.thumbnailFileId = previewFileResult.thumbnailFileId;
  transformData.previewFileId = previewFileResult.previewFileId;
  const preview = store.selectDialogPreviewData();
  if (preview) {
    transformData.preview = preview;
  }

  if (editMode && editItemId) {
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update transform.",
      action: () =>
        projectService.updateTransform({
          transformId: editItemId,
          data: transformData,
          fileRecords: previewFileResult.fileRecords,
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
          fileRecords: previewFileResult.fileRecords,
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

export const handleTransformFormChange = async (deps, payload) => {
  const { store } = deps;
  const values = payload._event.detail.values;

  store.setDialogValues({ values });

  await renderTransformPreview({
    deps,
    values,
  });
};

const renderDialogPreviewFromStore = async (deps) => {
  await renderTransformPreview({
    deps,
    values: deps.store.selectDialogValues(),
  });
};

export const handleTransformPreviewImageClick = (deps, payload) => {
  const { render, store } = deps;
  const target = payload._event.currentTarget?.dataset?.target;

  store.openPreviewImageSelectorDialog({
    target,
  });
  render();
};

export const handleTransformPreviewImageSelected = async (deps, payload) => {
  const imageId = payload._event.detail?.imageId;
  if (!imageId) {
    return;
  }

  deps.store.applyPreviewImageSelectorSelection({ imageId });
  deps.render();
  await renderDialogPreviewFromStore(deps);
};

export const handleTransformPreviewImageSelectorCancel = (deps) => {
  deps.store.closePreviewImageSelectorDialog();
  deps.render();
};

export const handleTransformPreviewImageSelectorSubmit = async (deps) => {
  deps.store.commitPreviewImageSelectorSelection();
  deps.render();
  await renderDialogPreviewFromStore(deps);
};

export const handleTransformPreviewImageDoubleClick = async (deps, payload) => {
  const imageId = payload?._event?.detail?.imageId;
  if (!imageId) {
    return;
  }

  deps.store.showFullImagePreview({ imageId });
  deps.render();
};

export const handleTransformPreviewImageSelectorFileExplorerClick = (
  deps,
  payload,
) => {
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  deps.refs.transformPreviewImageSelector?.transformedHandlers?.handleScrollToItem?.(
    {
      itemId,
    },
  );
  focusImageSelectorKeyboardScope(deps);
};

export const handleTransformPreviewImagePreviewOverlayClick = (deps) => {
  deps.store.hideFullImagePreview();
  deps.render();
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
  const duplicateData = {
    type: "transform",
    ...createTransformPayload(itemData),
  };
  if (itemData.thumbnailFileId) {
    duplicateData.thumbnailFileId = itemData.thumbnailFileId;
  }
  if (itemData.previewFileId) {
    duplicateData.previewFileId = itemData.previewFileId;
  }
  if (itemData.preview) {
    duplicateData.preview = structuredClone(itemData.preview);
  }

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to duplicate transform.",
    action: () =>
      projectService.createTransform({
        transformId: duplicateTransformId,
        data: duplicateData,
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
