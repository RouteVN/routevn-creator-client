import { generateId } from "../../internal/id.js";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { processPendingUploads } from "../../internal/ui/resourcePages/media/processPendingUploads.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  handleResourceZoomShortcutKeyDown,
  isResourceZoomShortcutKeyEvent,
} from "../../internal/ui/resourcePages/zoomShortcuts.js";
import {
  createFileExplorerKeyboardScopeHandlers,
  isTextEntryKeyEvent,
} from "../../internal/ui/fileExplorerKeyboardScope.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  resolveImagePreviewDisplayMode as resolvePreviewDisplayMode,
  resolveImagePreviewNavigationDirection as resolvePreviewNavigationDirection,
} from "../../internal/ui/resourcePages/imagePreviewOverlay.js";
import { buildImageResourcePatchFromUploadResult } from "../../deps/services/shared/resourceImports.js";
import { withResolvedCollectionFileMetadata } from "../../internal/resourceFileMetadata.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { IMAGE_TAG_SCOPE_KEY } from "./images.store.js";
import { selectImagesPageCopy } from "./support/imagesPageCopy.js";

const MAX_PARALLEL_UPLOADS = 1;
const IMAGE_FILE_PATTERN = /\.(jpg|jpeg|png|webp)$/i;
const IMAGE_FILE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const IMAGE_FILE_ACCEPT = [
  ...IMAGE_FILE_MIME_TYPES,
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
].join(",");
const FULL_IMAGE_PREVIEW_SWIPE_MIN_DISTANCE_PX = 48;
const FULL_IMAGE_PREVIEW_SWIPE_MAX_VERTICAL_RATIO = 0.75;

const selectCopy = (deps = {}) => selectImagesPageCopy(deps.i18n);

const showInvalidFormatToast = (appService, copy) => {
  appService.showAlert({
    message: copy.invalidFormatMessage,
    title: copy.warningTitle,
  });
};

const validateImageFiles = ({ appService, files, copy } = {}) => {
  const invalidFiles = Array.from(files ?? []).filter((file) => {
    return (
      !IMAGE_FILE_MIME_TYPES.has(file?.type) &&
      !file?.name?.match(IMAGE_FILE_PATTERN)
    );
  });

  if (invalidFiles.length === 0) {
    return true;
  }

  showInvalidFormatToast(appService, copy);
  return false;
};

const pickAndUploadImage = async ({
  appService,
  projectService,
  copy,
} = {}) => {
  let file;

  try {
    file = await appService.pickFiles({
      accept: IMAGE_FILE_ACCEPT,
      multiple: false,
    });
  } catch (error) {
    return { error, errorType: "pick-failed" };
  }

  if (!file) {
    return { cancelled: true };
  }

  if (!validateImageFiles({ appService, files: [file], copy })) {
    return { errorType: "validation-failed" };
  }

  let uploadedFiles;
  try {
    uploadedFiles = await projectService.uploadFiles([file]);
  } catch (error) {
    return { error, errorType: "upload-failed" };
  }

  const uploadResult = uploadedFiles?.[0];
  if (!uploadResult) {
    return { error: "upload-failed", errorType: "upload-failed" };
  }

  return { uploadResult };
};

const syncImagePageData = ({ store, repositoryState } = {}) => {
  const tagsData = getTagsCollection(repositoryState, IMAGE_TAG_SCOPE_KEY);
  const collectionWithFileMetadata = withResolvedCollectionFileMetadata({
    collection: repositoryState?.images,
    files: repositoryState?.files,
    resourceTypes: ["image"],
  });

  store.setTagsData({ tagsData });
  store.setItems({
    data: resolveCollectionWithTags({
      collection: collectionWithFileMetadata,
      tagsCollection: tagsData,
      itemType: "image",
    }),
  });
  store.setProjectResolution({
    projectResolution: repositoryState?.project?.resolution,
  });
};

const {
  openEditDialogWithValues,
  openFolderNameDialogWithValues,
  openCreateTagDialogForMode,
  refreshData: handleDataChanged,
  handleBeforeMount: handleMediaBeforeMount,
  handleAfterMount,
  handleFileExplorerSelectionChanged: handleBaseFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleEditDialogClose,
  handleSearchInput,
  handleItemClick: handleBaseImageItemClick,
  handleItemEdit: handleImageItemEdit,
  handleCreateTagDialogClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createMediaPageHandlers({
  resourceType: "images",
  syncData: syncImagePageData,
  selectItemById: (store, { itemId }) => store.selectImageItemById({ itemId }),
  getEditValues: (item) => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
    tagIds: item?.tagIds ?? [],
  }),
  getEditPreviewFileId: (item) => item?.thumbnailFileId ?? item?.fileId,
  copy: ({ i18n }) => selectImagesPageCopy(i18n),
  tagging: {
    scopeKey: IMAGE_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateImage({
        imageId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags,
    appendCreatedTagByMode: ({ deps, mode, tagId }) => {
      if (mode !== "edit-form") {
        return;
      }

      appendTagIdToForm({
        form: deps.refs.editForm,
        tagId,
      });
    },
  },
});

const handleFileExplorerSelectionChanged = (deps, payload) => {
  handleBaseFileExplorerSelectionChanged(deps, payload);

  const { itemId, isFolder } = payload._event.detail;
  if (
    deps.store.selectIsTouchMode() &&
    deps.store.selectIsMobileFileExplorerOpen() &&
    itemId &&
    !isFolder
  ) {
    deps.store.closeMobileFileExplorer();
    deps.render();
    focusGroupView(deps);
  }
};

export {
  handleAfterMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleEditDialogClose,
  handleDataChanged,
  handleSearchInput,
  handleImageItemEdit,
  handleCreateTagDialogClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

export const handleBeforeMount = (deps) => {
  const { store, uiConfig } = deps;

  store.setUiConfig({ uiConfig });
  return handleMediaBeforeMount(deps);
};

export const handleMobileFileExplorerOpen = (deps) => {
  const { store, render, refs } = deps;
  const selectedItemId = store.selectSelectedItemId();

  store.openMobileFileExplorer();
  render();

  if (selectedItemId) {
    requestAnimationFrame(() => {
      refs.fileExplorer?.selectItem?.({ itemId: selectedItemId });
    });
  }
};

export const handleMobileFileExplorerClose = (deps) => {
  const { store, render } = deps;

  store.closeMobileFileExplorer();
  render();
  focusGroupView(deps);
};

export const handleMobileDetailSheetClose = (deps) => {
  const { store, render } = deps;

  if (!store.selectSelectedItemId()) {
    return;
  }

  store.setSelectedItemId({ itemId: undefined });
  render();
  focusGroupView(deps);
};

export const handleMobileDetailPreviewClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const selectedItemId = deps.store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  openImagePreviewById({
    deps,
    itemId: selectedItemId,
    syncExplorer: true,
    suppressMobileDetailSheet: true,
  });
};

export const handleMobileDetailDeleteClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { store, render } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  store.openMobileDeleteDialog({ itemId: selectedItemId });
  render();
};

export const handleMobileDeleteDialogClose = (deps) => {
  const { store, render } = deps;

  store.closeMobileDeleteDialog();
  render();
};

export const handleMobileDeleteDialogCancel = (deps) => {
  handleMobileDeleteDialogClose(deps);
};

export const handleMobileDeleteDialogConfirm = async (deps) => {
  const { store, render } = deps;
  const itemId = store.selectMobileDeleteDialogItemId();

  store.closeMobileDeleteDialog();
  render();

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

const {
  focusKeyboardScope: focusGroupView,
  handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  isNavigationBlocked: ({ deps }) => deps.store.selectFullImagePreviewVisible(),
  onEnterKey: ({ deps, selectedItemId }) => {
    openImagePreviewById({ deps, itemId: selectedItemId, syncExplorer: true });
  },
  onEditKey: ({ deps, selectedItemId, selectedExplorerItem }) => {
    if (selectedExplorerItem?.isFolder) {
      openFolderNameDialogWithValues({ deps, folderId: selectedItemId });
      return;
    }

    openEditDialogWithValues({ deps, itemId: selectedItemId });
  },
  resolveSelectedItemId: ({ deps, selectedExplorerItem }) => {
    return selectedExplorerItem?.isFolder
      ? undefined
      : (selectedExplorerItem?.itemId ?? deps.store.selectSelectedItemId());
  },
});

const focusPreviewOverlay = ({ refs } = {}) => {
  requestAnimationFrame(() => {
    refs.previewOverlay?.focus?.();
  });
};

const handleZoomShortcutKeyDown = (deps, payload) => {
  const event = payload?._event;
  if (
    deps.store.selectFullImagePreviewVisible() &&
    isResourceZoomShortcutKeyEvent(event)
  ) {
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  return handleResourceZoomShortcutKeyDown(deps, payload);
};

export const handleFileExplorerFolderCollapseChange = (deps, payload) => {
  const { refs } = deps;
  const { folderId, collapsed } = payload._event.detail ?? {};
  if (!folderId) {
    return;
  }

  refs.groupview?.setGroupCollapsed?.({
    groupId: folderId,
    collapsed,
  });
};

export const handleCenterGroupCollapseChange = (deps, payload) => {
  const { refs } = deps;
  const { groupId, collapsed } = payload._event.detail ?? {};
  if (!groupId) {
    return;
  }

  refs.fileExplorer?.setFolderCollapsed?.({
    folderId: groupId,
    collapsed,
  });
};

const openImagePreviewById = ({
  deps,
  itemId,
  syncExplorer = false,
  suppressMobileDetailSheet = false,
} = {}) => {
  const { refs, store, render } = deps;
  const item = store.selectImageItemById({ itemId });
  if (!itemId || !item) {
    return;
  }

  const selectionPayload = { itemId };
  if (suppressMobileDetailSheet) {
    selectionPayload.suppressMobileDetailSheet = true;
  }
  store.setSelectedItemId(selectionPayload);

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.showFullImagePreview({ itemId });
  render();
  refs.groupview?.scrollItemIntoView?.({ itemId });
  focusPreviewOverlay(deps);
};

const closeImagePreview = (deps) => {
  const { store, render } = deps;

  store.hideFullImagePreview();
  render();
  focusGroupView(deps);
};

const navigateImagePreview = (deps, { direction, distance, clamp } = {}) => {
  const { store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId || !direction) {
    return false;
  }

  const adjacentPayload = {
    itemId: selectedItemId,
    direction,
  };
  if (distance !== undefined) {
    adjacentPayload.distance = distance;
  }
  if (clamp !== undefined) {
    adjacentPayload.clamp = clamp;
  }

  const nextItemId = store.selectAdjacentImageItemId(adjacentPayload);
  if (!nextItemId) {
    return false;
  }

  openImagePreviewById({
    deps,
    itemId: nextItemId,
    syncExplorer: true,
    suppressMobileDetailSheet: true,
  });
  return true;
};

const getTouchPoint = (event, source = "changed") => {
  if (source === "touches") {
    return event?.touches?.[0] ?? event?.changedTouches?.[0];
  }

  return event?.changedTouches?.[0] ?? event?.touches?.[0];
};

const resolvePreviewSwipeNavigation = ({ startPoint, endPoint } = {}) => {
  if (!startPoint || !endPoint) {
    return undefined;
  }

  const horizontalDistance = endPoint.x - startPoint.x;
  const verticalDistance = endPoint.y - startPoint.y;
  const absoluteHorizontalDistance = Math.abs(horizontalDistance);
  const absoluteVerticalDistance = Math.abs(verticalDistance);

  if (
    absoluteHorizontalDistance < FULL_IMAGE_PREVIEW_SWIPE_MIN_DISTANCE_PX ||
    absoluteVerticalDistance >
      absoluteHorizontalDistance * FULL_IMAGE_PREVIEW_SWIPE_MAX_VERTICAL_RATIO
  ) {
    return undefined;
  }

  return horizontalDistance < 0
    ? { direction: "next" }
    : { direction: "previous" };
};

const consumeSuppressedPreviewClick = (deps, payload) => {
  const { store } = deps;
  if (!store.selectFullImagePreviewSuppressNextClick?.()) {
    return false;
  }

  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  store.clearFullImagePreviewSuppressNextClick?.();
  return true;
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openImagePreviewById({ deps, itemId });
};

export const handleImageItemDoubleClick = (deps, payload) => {
  const { itemId, source } = payload._event.detail;
  openImagePreviewById({
    deps,
    itemId,
    syncExplorer: true,
    suppressMobileDetailSheet: source === "mobile-context-menu",
  });
};

export const handleImageItemClick = (deps, payload) => {
  handleBaseImageItemClick(deps, payload);
  focusGroupView(deps);
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  if (selectedItemId) {
    openEditDialogWithValues({ deps, itemId: selectedItemId });
    return;
  }

  const selectedFolderId = deps.store.selectSelectedFolderId();
  openFolderNameDialogWithValues({ deps, folderId: selectedFolderId });
};

export const handleEditFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "edit-form",
    itemId: deps.store.selectEditItemId(),
  });
};

const createImagesFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);

  if (!validateImageFiles({ appService, files, copy })) {
    return;
  }

  await processPendingUploads({
    deps,
    files,
    parentId,
    pendingIdPrefix: "pending-image",
    concurrency: MAX_PARALLEL_UPLOADS,
    refresh: handleDataChanged,
    processFile: async ({ file, pendingUploadId, removePendingUpload }) => {
      const imageId = generateId();
      store.updatePendingUpload({
        itemId: pendingUploadId,
        updates: {
          resolvedItemId: imageId,
        },
      });

      const createAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: copy.failedCreateImage,
        action: () =>
          projectService.importImageFile({
            file,
            parentId,
            imageId,
          }),
      });

      if (createAttempt.ok) {
        await handleDataChanged(deps);
        removePendingUpload();
      }

      return createAttempt.ok;
    },
    onUploadError: ({ error }) => {
      showResourcePageError({
        appService,
        errorOrResult: error,
        fallbackMessage: copy.failedUploadImages,
      });
    },
    onNoSuccessfulUploads: ({ fileCount }) => {
      console.error("Failed to upload images: no successful uploads", {
        fileCount,
      });
      appService.showAlert({
        message: copy.failedUploadImages,
        title: copy.errorTitle,
      });
    },
  });
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: IMAGE_FILE_ACCEPT,
      multiple: true,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedSelectFiles,
    });
    return;
  }

  if (!files?.length) {
    return;
  }

  if (!validateImageFiles({ appService, files, copy })) {
    return;
  }

  await createImagesFromFiles({
    deps,
    files,
    parentId: resolveResourceParentId(groupId),
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const { files, rejectedFiles, targetGroupId } = payload._event.detail;

  if ((!files || files.length === 0) && (rejectedFiles?.length ?? 0) > 0) {
    showInvalidFormatToast(appService, copy);
    return;
  }

  await createImagesFromFiles({
    deps,
    files,
    parentId: targetGroupId ?? undefined,
  });
};

export const handleFilesDropRejected = (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const rejectedFiles = payload._event.detail?.rejectedFiles ?? [];

  if (rejectedFiles.length === 0) {
    return;
  }

  showInvalidFormatToast(appService, copy);
};

export const handleImageItemPreview = (deps, payload) => {
  const { itemId, source } = payload._event.detail;
  openImagePreviewById({
    deps,
    itemId,
    syncExplorer: true,
    suppressMobileDetailSheet: source === "mobile-context-menu",
  });
};

export const handlePreviewOverlayClick = (deps, payload) => {
  if (consumeSuppressedPreviewClick(deps, payload)) {
    return;
  }

  closeImagePreview(deps);
};

export const handlePreviewImageFrameClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  if (consumeSuppressedPreviewClick(deps, payload)) {
    return;
  }

  closeImagePreview(deps);
};

export const handlePreviewOverlayTouchStart = (deps, payload) => {
  const { store } = deps;
  if (!store.selectFullImagePreviewVisible()) {
    store.clearFullImagePreviewTouchStartPoint?.();
    return;
  }

  const touchPoint = getTouchPoint(payload?._event, "touches");
  if (!touchPoint) {
    store.clearFullImagePreviewTouchStartPoint?.();
    return;
  }

  store.clearFullImagePreviewSuppressNextClick?.();
  store.setFullImagePreviewTouchStartPoint?.({
    x: touchPoint.clientX,
    y: touchPoint.clientY,
  });
};

export const handlePreviewOverlayTouchEnd = (deps, payload) => {
  const { store } = deps;
  const startPoint = store.selectFullImagePreviewTouchStartPoint?.();
  store.clearFullImagePreviewTouchStartPoint?.();

  if (!store.selectFullImagePreviewVisible() || !startPoint) {
    return;
  }

  const touchPoint = getTouchPoint(payload?._event, "changed");
  const navigation = resolvePreviewSwipeNavigation({
    startPoint,
    endPoint: touchPoint
      ? {
          x: touchPoint.clientX,
          y: touchPoint.clientY,
        }
      : undefined,
  });
  if (!navigation?.direction) {
    return;
  }

  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  navigateImagePreview(deps, navigation);
  store.suppressNextFullImagePreviewClick?.();
};

export const handlePreviewOverlayTouchCancel = (deps) => {
  const { store } = deps;
  store.clearFullImagePreviewTouchStartPoint?.();
};

export const handlePreviewPreviousClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  navigateImagePreview(deps, { direction: "previous" });
};

export const handlePreviewNextClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  navigateImagePreview(deps, { direction: "next" });
};

export const handlePreviewFitModeClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { store, render } = deps;
  store.setFullImagePreviewDisplayMode({ displayMode: "fit" });
  render();
  focusPreviewOverlay(deps);
};

export const handlePreviewCanvasModeClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { store, render } = deps;
  store.setFullImagePreviewDisplayMode({ displayMode: "canvas" });
  render();
  focusPreviewOverlay(deps);
};

export const handlePreviewOverlayKeyDown = (deps, payload) => {
  const { store } = deps;
  const event = payload._event;

  if (!store.selectFullImagePreviewVisible()) {
    return;
  }

  if (isTextEntryKeyEvent(event)) {
    return;
  }

  if (event.key === "Escape" || event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    closeImagePreview(deps);
    return;
  }

  const displayMode = resolvePreviewDisplayMode(event);
  if (displayMode) {
    event.preventDefault();
    event.stopPropagation();
    store.setFullImagePreviewDisplayMode({ displayMode });
    deps.render();
    focusPreviewOverlay(deps);
    return;
  }

  const navigation = resolvePreviewNavigationDirection(event);
  if (!navigation?.direction) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  navigateImagePreview(deps, navigation);
};

export const handleFileExplorerKeyboardScopeKeyDown = (deps, payload) => {
  if (handleZoomShortcutKeyDown(deps, payload)) {
    return;
  }

  handleBaseFileExplorerKeyboardScopeKeyDown(deps, payload);
};

export const handleEditDialogImageClick = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);

  const result = await pickAndUploadImage({ appService, projectService, copy });
  if (result.cancelled) {
    return;
  }

  if (result.errorType === "pick-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: copy.failedSelectFile,
    });
    return;
  }

  if (result.errorType === "validation-failed") {
    return;
  }

  if (result.errorType === "upload-failed") {
    appService.showAlert({
      message: copy.failedUploadImage,
      title: copy.errorTitle,
    });
    return;
  }

  store.setEditUpload({
    uploadResult: result.uploadResult,
    previewFileId:
      result.uploadResult.thumbnailFileId ?? result.uploadResult.fileId,
  });
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.nameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const editUploadResult = store.selectEditUploadResult();
  const imagePatch = editUploadResult
    ? buildImageResourcePatchFromUploadResult(editUploadResult)
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateImage,
    action: () =>
      projectService.updateImage({
        imageId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          ...imagePatch,
          name,
          description: values?.description ?? "",
          tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await handleDataChanged(deps);
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render, store } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  const result = await projectService.deleteImageIfUnused({
    imageId: itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (!result.deleted) {
    appService.showAlert({
      message: result.usage?.isUsed
        ? copy.cannotDeleteResourceInUse
        : copy.failedDeleteResource,
    });
    render();
    return;
  }

  if (store?.selectSelectedItemId?.() === itemId) {
    store.setSelectedItemId({ itemId: undefined });
  }

  await handleDataChanged(deps);
};
