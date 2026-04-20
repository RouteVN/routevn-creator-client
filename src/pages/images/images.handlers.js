import { generateId } from "../../internal/id.js";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { processPendingUploads } from "../../internal/ui/resourcePages/media/processPendingUploads.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { buildImageResourcePatchFromUploadResult } from "../../deps/services/shared/resourceImports.js";

const MAX_PARALLEL_UPLOADS = 1;
const IMAGE_FILE_PATTERN = /\.(jpg|jpeg|png|webp)$/i;
const IMAGE_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp";
const INVALID_IMAGE_FORMAT_MESSAGE =
  "Only JPG/JPEG, PNG, and WEBP images are supported.";

const showInvalidFormatToast = (appService) => {
  appService.showAlert({
    message: INVALID_IMAGE_FORMAT_MESSAGE,
    title: "Warning",
  });
};

const validateImageFiles = ({ appService, files } = {}) => {
  const invalidFiles = Array.from(files ?? []).filter(
    (file) => !file.name.match(IMAGE_FILE_PATTERN),
  );

  if (invalidFiles.length === 0) {
    return true;
  }

  showInvalidFormatToast(appService);
  return false;
};

const pickAndUploadImage = async ({ appService, projectService } = {}) => {
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

  if (!validateImageFiles({ appService, files: [file] })) {
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

const {
  openEditDialogWithValues,
  refreshData: handleDataChanged,
  handleBeforeMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleBaseImageItemClick,
  handleItemEdit: handleImageItemEdit,
} = createMediaPageHandlers({
  resourceType: "images",
  selectItemById: (store, { itemId }) => store.selectImageItemById({ itemId }),
  getEditPreviewFileId: (item) => item?.thumbnailFileId ?? item?.fileId,
});

export {
  handleBeforeMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleDataChanged,
  handleSearchInput,
  handleImageItemEdit,
};

const isTextEntryKeyEvent = (event) => {
  const target = event?.composedPath?.()?.[0] ?? event?.target;
  const tagName = String(target?.tagName ?? "").toLowerCase();
  return tagName === "input" || tagName === "textarea";
};

const focusGroupView = ({ refs } = {}) => {
  requestAnimationFrame(() => {
    refs.groupviewKeyboardScope?.focus?.();
  });
};

const focusPreviewOverlay = ({ refs } = {}) => {
  requestAnimationFrame(() => {
    refs.previewOverlay?.focus?.();
  });
};

const openImagePreviewById = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, store, render } = deps;
  const item = store.selectImageItemById({ itemId });
  if (!itemId || !item) {
    return;
  }

  store.setSelectedItemId({ itemId });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.showFullImagePreview({ itemId });
  render();
  refs.groupview?.scrollItemIntoView?.({ itemId });
  focusPreviewOverlay(deps);
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openImagePreviewById({ deps, itemId });
};

export const handleImageItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openImagePreviewById({ deps, itemId, syncExplorer: true });
};

export const handleImageItemClick = (deps, payload) => {
  handleBaseImageItemClick(deps, payload);
  focusGroupView(deps);
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

const createImagesFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService, store } = deps;

  if (!validateImageFiles({ appService, files })) {
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
        fallbackMessage: "Failed to create image.",
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
        fallbackMessage: "Failed to upload images.",
      });
    },
    onNoSuccessfulUploads: ({ fileCount }) => {
      console.error("Failed to upload images: no successful uploads", {
        fileCount,
      });
      appService.showAlert({
        message: "Failed to upload images.",
        title: "Error",
      });
    },
  });
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
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
      fallbackMessage: "Failed to select files.",
    });
    return;
  }

  if (!files?.length) {
    return;
  }

  if (!validateImageFiles({ appService, files })) {
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
  const { files, rejectedFiles, targetGroupId } = payload._event.detail;

  if ((!files || files.length === 0) && (rejectedFiles?.length ?? 0) > 0) {
    showInvalidFormatToast(appService);
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
  const rejectedFiles = payload._event.detail?.rejectedFiles ?? [];

  if (rejectedFiles.length === 0) {
    return;
  }

  showInvalidFormatToast(appService);
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store } = deps;
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const result = await pickAndUploadImage({ appService, projectService });
  if (result.cancelled) {
    return;
  }

  if (result.errorType === "pick-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: "Failed to select file.",
    });
    return;
  }

  if (result.errorType === "validation-failed") {
    return;
  }

  if (result.errorType === "upload-failed") {
    appService.showAlert({
      message: "Failed to upload image.",
      title: "Error",
    });
    return;
  }

  const { uploadResult } = result;
  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update image.",
    action: () =>
      projectService.updateImage({
        imageId: selectedItem.id,
        fileRecords: uploadResult.fileRecords,
        data: buildImageResourcePatchFromUploadResult(uploadResult),
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  await handleDataChanged(deps);
};

export const handleImageItemPreview = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openImagePreviewById({ deps, itemId, syncExplorer: true });
};

export const handlePreviewOverlayClick = (deps) => {
  const { store, render } = deps;
  store.hideFullImagePreview();
  render();
  focusGroupView(deps);
};

export const handlePreviewOverlayKeyDown = (deps, payload) => {
  const { store } = deps;
  const event = payload._event;

  if (!store.getState().fullImagePreviewVisible) {
    return;
  }

  if (event.key === "Escape" || event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    store.hideFullImagePreview();
    deps.render();
    focusGroupView(deps);
    return;
  }

  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  let direction;
  if (event.key === "ArrowDown") {
    direction = "next";
  } else if (event.key === "ArrowUp") {
    direction = "previous";
  }

  if (!direction) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const nextItemId = store.selectAdjacentImageItemId({
    itemId: selectedItemId,
    direction,
  });
  if (!nextItemId) {
    return;
  }

  openImagePreviewById({ deps, itemId: nextItemId, syncExplorer: true });
};

export const handleGroupViewKeyDown = (deps, payload) => {
  const { refs, store } = deps;
  const event = payload._event;

  if (store.getState().fullImagePreviewVisible || isTextEntryKeyEvent(event)) {
    return;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }

  const selectedExplorerItem = refs.fileExplorer?.getSelectedItem?.();
  const selectedItemId = selectedExplorerItem?.isFolder
    ? undefined
    : (selectedExplorerItem?.itemId ?? store.selectSelectedItemId());

  if (event.key === "Enter") {
    if (!selectedItemId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    openImagePreviewById({ deps, itemId: selectedItemId, syncExplorer: true });
    return;
  }

  let direction;
  if (event.key === "ArrowDown") {
    direction = "next";
  } else if (event.key === "ArrowUp") {
    direction = "previous";
  } else if (event.key === "ArrowRight") {
    event.preventDefault();
    event.stopPropagation();
    refs.fileExplorer?.setSelectedFolderExpanded?.({ expanded: true });
    return;
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    event.stopPropagation();
    refs.fileExplorer?.setSelectedFolderExpanded?.({ expanded: false });
    return;
  }

  if (!direction) {
    return;
  }

  const nextSelection = refs.fileExplorer?.navigateSelection?.({
    direction,
  });
  if (!nextSelection?.itemId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  focusGroupView(deps);
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditDialogImageClick = async (deps) => {
  const { appService, projectService, store, render } = deps;

  const result = await pickAndUploadImage({ appService, projectService });
  if (result.cancelled) {
    return;
  }

  if (result.errorType === "pick-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: "Failed to select file.",
    });
    return;
  }

  if (result.errorType === "validation-failed") {
    return;
  }

  if (result.errorType === "upload-failed") {
    appService.showAlert({
      message: "Failed to upload image.",
      title: "Error",
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
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Image name is required.",
      title: "Warning",
    });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const editUploadResult = store.getState().editUploadResult;
  const imagePatch = editUploadResult
    ? buildImageResourcePatchFromUploadResult(editUploadResult)
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update image.",
    action: () =>
      projectService.updateImage({
        imageId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          ...imagePatch,
          name,
          description: values?.description ?? "",
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
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;
  const result = await projectService.deleteImageIfUnused({
    imageId: itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (!result.deleted) {
    appService.showAlert({
      message: result.usage?.isUsed
        ? "Cannot delete resource, it is currently in use."
        : "Failed to delete resource.",
    });
    render();
    return;
  }

  await handleDataChanged(deps);
};
