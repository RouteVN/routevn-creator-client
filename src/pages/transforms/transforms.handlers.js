import { generateId } from "../../internal/id.js";
import {
  IMPORT_PACK_SCHEMA,
  downloadImportFile,
  fetchImportPackageJson,
  isImportPackageValidationError,
  isPlainObject,
  isValidHttpUrl,
  normalizeImportParentId,
  validateImportFileDescriptor,
  validateImportPackageObject,
} from "../../internal/importPackages.js";
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
import { selectTransformsPageCopy } from "./support/transformsPageCopy.js";

const MARKER_SIZE = 30;
const BG_COLOR = "#4a4a4a";
const FALLBACK_TARGET_SIZE = 200;
const selectCopy = (deps = {}) => selectTransformsPageCopy(deps.i18n);

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

const toFiniteNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const rewritePreviewImageRefs = (preview, imageIdMap = new Map()) => {
  if (!isPlainObject(preview)) {
    return undefined;
  }

  const nextPreview = {};
  for (const [slotKey, slotValue] of Object.entries(preview)) {
    if (!isPlainObject(slotValue) || !slotValue.imageId) {
      continue;
    }

    const mappedImageId = imageIdMap.get(slotValue.imageId);
    if (!mappedImageId) {
      continue;
    }

    nextPreview[slotKey] = {
      ...slotValue,
      imageId: mappedImageId,
    };
  }

  return Object.keys(nextPreview).length > 0 ? nextPreview : undefined;
};

const normalizeImportedTransformData = (
  item = {},
  { imageIdMap, copy } = {},
) => {
  const anchor = isPlainObject(item.anchor) ? item.anchor : {};
  const transformData = {
    name: `${item.name ?? ""}`.trim() || copy.importedTransformName,
    description: item.description ?? "",
    x: Math.round(toFiniteNumber(item.x, 0)),
    y: Math.round(toFiniteNumber(item.y, 0)),
    scaleX: toFiniteNumber(item.scaleX, 1),
    scaleY: toFiniteNumber(item.scaleY, 1),
    anchorX: toFiniteNumber(item.anchorX ?? anchor.anchorX, 0),
    anchorY: toFiniteNumber(item.anchorY ?? anchor.anchorY, 0),
    rotation: toFiniteNumber(item.rotation, 0),
  };

  const preview = rewritePreviewImageRefs(item.preview, imageIdMap);
  if (preview) {
    transformData.preview = preview;
  }

  const tagIds = Array.isArray(item.tagIds)
    ? item.tagIds.filter((tagId) => typeof tagId === "string" && tagId)
    : [];
  if (tagIds.length > 0) {
    transformData.tagIds = tagIds;
  }

  return transformData;
};

const findTransformItemInTree = (collection = {}) => {
  const items = collection?.items ?? {};
  const visit = (nodes = []) => {
    for (const node of nodes) {
      const item = items[node?.id];
      if (item?.type === "transform") {
        return item;
      }

      const childItem = visit(node?.children ?? []);
      if (childItem) {
        return childItem;
      }
    }

    return undefined;
  };

  return (
    visit(collection?.tree ?? []) ??
    Object.values(items).find((item) => item?.type === "transform")
  );
};

const resolvePrimaryTransformImportItem = (input) => {
  const primary = input?.primary;
  if (primary?.resourceType !== "transforms" || !primary.id) {
    return undefined;
  }

  const item = input.repository?.transforms?.items?.[primary.id];
  return item?.type === "transform" ? item : undefined;
};

const resolveTransformImportItem = (input) => {
  if (!isPlainObject(input)) {
    return undefined;
  }

  const primaryItem = resolvePrimaryTransformImportItem(input);
  if (primaryItem) {
    return primaryItem;
  }

  if (input.schema === IMPORT_PACK_SCHEMA) {
    return findTransformItemInTree(input.repository?.transforms);
  }

  if (input.items || input.tree) {
    return findTransformItemInTree(input);
  }

  if (input.repository?.transforms) {
    return findTransformItemInTree(input.repository.transforms);
  }

  return input.type === "transform" ? input : undefined;
};

const getImportImageItemsById = (importInput) => {
  return isPlainObject(importInput?.repository?.images?.items)
    ? importInput.repository.images.items
    : {};
};

const getImportImageItems = (importInput, imageIds) => {
  const items = getImportImageItemsById(importInput);
  if (imageIds.size === 0) {
    return [];
  }

  return [...imageIds]
    .map((imageId) => items[imageId])
    .filter((item) => item?.type === "image");
};

const hasImportImageDependencies = (transformItem) => {
  return collectTransformPreviewImageIds(transformItem?.preview).size > 0;
};

const collectTransformPreviewImageIds = (preview) => {
  const imageIds = new Set();
  if (!isPlainObject(preview)) {
    return imageIds;
  }

  for (const slotValue of Object.values(preview)) {
    if (slotValue?.imageId) {
      imageIds.add(slotValue.imageId);
    }
  }

  return imageIds;
};

const getImportItemLabel = (item, fallback) => {
  return item?.name ?? item?.id ?? fallback;
};

const getTransformItemValidationMessage = (item, copy) => {
  if (!isPlainObject(item) || item.type !== "transform") {
    return copy.noTransformFoundToImport;
  }

  const label = getImportItemLabel(item, copy.importedTransformName);
  if (item.name !== undefined && typeof item.name !== "string") {
    return copy.transformNameMustBeText.replace("{label}", label);
  }

  if (item.description !== undefined && typeof item.description !== "string") {
    return copy.transformDescriptionMustBeText.replace("{label}", label);
  }

  if (
    item.tagIds !== undefined &&
    (!Array.isArray(item.tagIds) ||
      item.tagIds.some((tagId) => typeof tagId !== "string"))
  ) {
    return copy.transformTagsMustBeTextIds.replace("{label}", label);
  }

  const numberFields = [
    ["x", "x"],
    ["y", "y"],
    ["scaleX", "scale X"],
    ["scaleY", "scale Y"],
    ["anchorX", "anchor X"],
    ["anchorY", "anchor Y"],
    ["rotation", "rotation"],
  ];
  for (const [field, fieldLabel] of numberFields) {
    if (item[field] !== undefined && !Number.isFinite(Number(item[field]))) {
      return copy.transformFieldMustBeNumber
        .replace("{label}", label)
        .replace("{fieldLabel}", fieldLabel);
    }
  }

  if (item.preview !== undefined && !isPlainObject(item.preview)) {
    return copy.transformPreviewMustBeObject.replace("{label}", label);
  }

  return undefined;
};

const getTransformImageDependencyValidationMessage = ({
  importInput,
  transformItem,
  copy,
} = {}) => {
  const imageItemsById = getImportImageItemsById(importInput);
  const previewImageIds = collectTransformPreviewImageIds(
    transformItem?.preview,
  );

  for (const imageId of previewImageIds) {
    const imageItem = imageItemsById[imageId];
    if (!isPlainObject(imageItem) || imageItem.type !== "image") {
      return copy.imageDependencyMissing.replace("{imageId}", imageId);
    }

    const label = copy.imageDependencyLabel.replace(
      "{label}",
      getImportItemLabel(imageItem, imageItem.id),
    );
    try {
      validateImportFileDescriptor({
        importInput,
        fileId: imageItem.fileId,
        label,
      });
    } catch (error) {
      return getImportErrorMessage(
        error,
        copy.imageDependencyInvalidFileMetadata.replace("{label}", label),
      );
    }
  }

  return undefined;
};

const getTransformImportValidationMessage = ({
  importInput,
  transformItem,
  copy,
}) => {
  try {
    validateImportPackageObject(importInput);
  } catch (error) {
    return getImportErrorMessage(error, copy.importPackageInvalid);
  }

  const itemMessage = getTransformItemValidationMessage(transformItem, copy);
  if (itemMessage) {
    return itemMessage;
  }

  return getTransformImageDependencyValidationMessage({
    importInput,
    transformItem,
    copy,
  });
};

const importImageDependencies = async ({
  importInput,
  projectService,
  imageParentId,
  transformItem,
  copy,
} = {}) => {
  const imageIdMap = new Map();
  const imageItems = getImportImageItems(
    importInput,
    collectTransformPreviewImageIds(transformItem?.preview),
  );

  for (const imageItem of imageItems) {
    const fileDescriptor = validateImportFileDescriptor({
      importInput,
      fileId: imageItem.fileId,
      label: copy.imageDependencyLabel.replace(
        "{label}",
        imageItem.name ?? imageItem.id,
      ),
    });

    const file = await downloadImportFile(fileDescriptor);
    const imageId = generateId();
    const result = await projectService.importImageFile({
      file,
      imageId,
      parentId: imageParentId,
    });

    if (result?.valid === false) {
      throw result;
    }

    imageIdMap.set(imageItem.id, result?.imageId ?? imageId);
  }

  return imageIdMap;
};

const resolveTransformImportInput = async ({
  appService,
  values,
  copy,
} = {}) => {
  const url = `${values?.url ?? ""}`.trim();
  if (!url) {
    showImportError(appService, copy.importUrlRequired, copy);
    return;
  }

  if (!isValidHttpUrl(url)) {
    showImportError(appService, copy.invalidImportUrl, copy);
    return;
  }

  try {
    return await fetchImportPackageJson({ url });
  } catch (error) {
    showImportError(
      appService,
      isImportPackageValidationError(error)
        ? error.message
        : copy.packageLoadFailed,
      copy,
    );
    return;
  }
};

const showImportError = (appService, message, copy) => {
  if (typeof appService?.showAlert === "function") {
    appService.showAlert({
      message,
      title: copy.errorTitle,
    });
    return;
  }

  appService?.showToast?.({ message });
};

const showImportSuccess = (appService, copy) => {
  appService?.showToast?.({
    message: copy.transformImported,
  });
};

const clearImportVisibilityFilters = (store) => {
  store.setSearchQuery?.({ value: "" });
  store.setActiveTagIds?.({ tagIds: [] });
};

const getImportErrorMessage = (error, fallback) => {
  return error?.error?.message ?? error?.message ?? fallback;
};

const getImportValidationMessage = (copy) => {
  return copy.importUrlRequired;
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
  const copy = selectCopy(deps);

  if (!graphicsService || !refs.canvas) {
    appService.showAlert({
      message: copy.failedCaptureThumbnail,
      title: copy.errorTitle,
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
        message: copy.failedCapturePreview,
        title: copy.errorTitle,
      });
      return;
    }

    const thumbnailImage = await captureCanvasThumbnailImage(
      graphicsService,
      refs.canvas,
    );
    if (!thumbnailImage) {
      appService.showAlert({
        message: copy.failedCaptureThumbnail,
        title: copy.errorTitle,
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
      message: copy.failedSaveThumbnail,
      title: copy.errorTitle,
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
  copy: ({ i18n }) => selectTransformsPageCopy(i18n),
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
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags,
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

const openTransformEditDialog = async ({ deps, itemId } = {}) => {
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

export const handleMobileDetailPreviewClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleTransformItemDoubleClick(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

export const handleMobileDetailEditClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { store } = deps;
  await openTransformEditDialog({
    deps,
    itemId: store.selectSelectedItemId(),
  });
};

export const handleMobileDetailDuplicateClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleItemDuplicate(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

export const handleMobileDetailDeleteClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleItemDelete(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

export const handleTransformItemEdit = async (deps, payload) => {
  const { itemId } = payload._event.detail;
  await openTransformEditDialog({
    deps,
    itemId,
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

  await openTransformEditDialog({
    deps,
    itemId,
  });
};

export const handleAddTransformClick = async (deps, payload) => {
  const { groupId } = payload._event.detail;

  await openTransformDialog({
    deps,
    targetGroupId: groupId,
  });
};

export const handleImportTransformClick = (deps) => {
  const { render, store } = deps;

  store.openImportDialog();
  render();
};

export const handleImportDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeImportDialog();
  render();
};

export const handleImportFormActionClick = async (deps, payload) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values, valid } = payload._event.detail;

  if (actionId === "cancel") {
    store.closeImportDialog();
    render();
    return;
  }

  if (actionId === "back") {
    store.openImportSourceStep();
    render();
    return;
  }

  if (actionId === "continue") {
    if (valid === false) {
      showImportError(appService, getImportValidationMessage(copy), copy);
      return;
    }

    const importInput = await resolveTransformImportInput({
      appService,
      values,
      copy,
    });
    if (!importInput) {
      return;
    }

    const importItem = resolveTransformImportItem(importInput);
    const validationMessage = getTransformImportValidationMessage({
      importInput,
      transformItem: importItem,
      copy,
    });
    if (validationMessage) {
      showImportError(appService, validationMessage, copy);
      return;
    }

    store.openImportDestinationStep({
      importInput,
      sourceValues: values,
      includeImages: hasImportImageDependencies(importItem),
    });
    render();
    return;
  }

  if (actionId !== "import") {
    return;
  }

  if (valid === false) {
    showImportError(appService, copy.chooseDestinationFolders, copy);
    return;
  }

  store.setImportDestinationValues?.({ values });
  const importInput = store.selectImportDialogPendingInput?.();
  if (!importInput) {
    showImportError(appService, copy.importPackageMissing, copy);
    return;
  }

  const importItem = resolveTransformImportItem(importInput);
  const validationMessage = getTransformImportValidationMessage({
    importInput,
    transformItem: importItem,
    copy,
  });
  if (validationMessage) {
    showImportError(appService, validationMessage, copy);
    return;
  }

  const imageParentId = normalizeImportParentId(
    values?.imageFolderId ?? store.selectImportDialogImageFolderId?.(),
  );
  let imageIdMap = new Map();
  try {
    imageIdMap = await importImageDependencies({
      importInput,
      projectService,
      imageParentId,
      transformItem: importItem,
      copy,
    });
  } catch (error) {
    showImportError(
      appService,
      error?.message ?? copy.imageDependenciesImportFailed,
      copy,
    );
    return;
  }

  const transformData = normalizeImportedTransformData(importItem, {
    imageIdMap,
    copy,
  });
  const transformId = generateId();
  const targetGroupId = normalizeImportParentId(
    values?.transformFolderId ?? store.selectImportDialogTargetGroupId?.(),
  );
  const importAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedImportTransform,
    action: () =>
      projectService.createTransform({
        transformId,
        data: {
          type: "transform",
          ...transformData,
        },
        parentId: targetGroupId,
        position: "last",
      }),
  });

  if (!importAttempt.ok) {
    return;
  }

  store.closeImportDialog();
  clearImportVisibilityFilters(store);
  showImportSuccess(appService, copy);
  await handleDataChanged(deps, {
    selectedItemId: transformId,
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
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const transformData = createTransformPayload(values);
  if (!transformData.name) {
    appService.showAlert({
      message: copy.nameRequired,
      title: copy.warningTitle,
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
      fallbackMessage: copy.failedUpdateTransform,
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
      fallbackMessage: copy.failedCreateTransform,
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

  store.closePreviewImageMenu();
  store.openPreviewImageSelectorDialog({
    target,
  });
  render();
};

export const handleTransformPreviewImageContextMenu = (deps, payload) => {
  const { render, store } = deps;
  const copy = selectCopy(deps);
  const event = payload._event;
  const target = event.currentTarget?.dataset?.target;

  event.preventDefault();
  event.stopPropagation();
  store.openPreviewImageMenu({
    target,
    x: event.clientX,
    y: event.clientY,
    items: [{ label: copy.removeMenuItem, type: "item", value: "remove" }],
  });
  render();
};

export const handleTransformPreviewImageMenuClose = (deps) => {
  const { render, store } = deps;
  store.closePreviewImageMenu();
  render();
};

export const handleTransformPreviewImageMenuItemClick = async (
  deps,
  payload,
) => {
  const { render, store } = deps;
  const detail = payload._event.detail;
  const item = detail?.item || detail;
  const target = store.selectPreviewImageMenuTarget();

  store.closePreviewImageMenu();

  if (item?.value !== "remove" || !target) {
    render();
    return;
  }

  store.clearPreviewImage({ target });
  render();
  await renderDialogPreviewFromStore(deps);
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
  const copy = selectCopy(deps);
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
      message: copy.cannotDeleteResourceInUse,
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
  const copy = selectCopy(deps);
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
    fallbackMessage: copy.failedDuplicateTransform,
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
