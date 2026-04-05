import { nanoid } from "nanoid";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { processWithConcurrency } from "../../internal/processWithConcurrency.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";

const MAX_PARALLEL_UPLOADS = 1;
const CREATE_IMAGE_ABORT_ERROR = "create-image-abort";
const IMAGE_FILE_PATTERN = /\.(jpg|jpeg|png|webp)$/i;
const IMAGE_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp";
const INVALID_IMAGE_FORMAT_MESSAGE =
  "Only JPG/JPEG, PNG, and WEBP images are supported.";

const showInvalidFormatToast = (appService) => {
  appService.showToast(INVALID_IMAGE_FORMAT_MESSAGE, { title: "Warning" });
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

const createPendingUploads = ({ files, parentId } = {}) => {
  if (!parentId) {
    return [];
  }

  return (Array.isArray(files) ? files : []).map((file) => ({
    id: `pending-image-${nanoid()}`,
    file,
    parentId,
    name: file.name.replace(/\.[^.]+$/, ""),
  }));
};

const createImageAbortError = () => {
  const error = new Error(CREATE_IMAGE_ABORT_ERROR);
  error.code = CREATE_IMAGE_ABORT_ERROR;
  return error;
};

const {
  openEditDialogWithValues,
  refreshData: handleDataChanged,
  handleBeforeMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleImageItemClick,
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
  handleImageItemClick,
  handleImageItemEdit,
};

const openImagePreviewById = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, store, render } = deps;
  const item = store.selectImageItemById({ itemId });
  if (!itemId || !item) {
    return;
  }

  store.setSelectedItemId({ itemId });

  if (syncExplorer) {
    refs.fileExplorer.selectItem({ itemId });
  }

  store.showFullImagePreview({ itemId });
  render();
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

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

const createImagesFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService, store, render } = deps;

  if (!validateImageFiles({ appService, files })) {
    return;
  }

  const pendingUploads = createPendingUploads({ files, parentId });
  const remainingPendingUploadIds = new Set(
    pendingUploads.map((item) => item.id),
  );
  const pendingUploadIdByFile = new Map(
    pendingUploads.map((item) => [item.file, item.id]),
  );
  const removePendingUploads = (itemIds) => {
    const normalizedItemIds = (itemIds ?? []).filter((itemId) =>
      remainingPendingUploadIds.has(itemId),
    );
    if (normalizedItemIds.length === 0) {
      return;
    }

    store.removePendingUploads({ itemIds: normalizedItemIds });
    normalizedItemIds.forEach((itemId) =>
      remainingPendingUploadIds.delete(itemId),
    );
    render();
  };

  if (pendingUploads.length > 0) {
    store.addPendingUploads({
      items: pendingUploads.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        name: item.name,
      })),
    });
    render();
  }

  let successfulUploadCount = 0;
  let createdCount = 0;

  try {
    await processWithConcurrency(
      Array.isArray(files) ? files : [],
      async (file) => {
        const pendingUploadId = pendingUploadIdByFile.get(file);
        const uploadResults = await projectService.uploadFiles([file]);
        const uploadResult = uploadResults?.[0];

        if (!uploadResult) {
          removePendingUploads([pendingUploadId]);
          return { ok: false, reason: "upload-failed" };
        }

        successfulUploadCount += 1;

        const createAttempt = await runResourcePageMutation({
          appService,
          fallbackMessage: "Failed to create image.",
          action: () =>
            projectService.createImage({
              imageId: nanoid(),
              fileRecords: uploadResult.fileRecords,
              data: {
                type: "image",
                fileId: uploadResult.fileId,
                thumbnailFileId: uploadResult.thumbnailFileId,
                name: uploadResult.displayName,
                fileType: uploadResult.file.type,
                fileSize: uploadResult.file.size,
                width: uploadResult.dimensions.width,
                height: uploadResult.dimensions.height,
              },
              parentId,
              position: "last",
            }),
        });

        removePendingUploads([pendingUploadId]);

        if (!createAttempt.ok) {
          throw createImageAbortError();
        }

        createdCount += 1;
        await handleDataChanged(deps);
        return { ok: true };
      },
      {
        concurrency: MAX_PARALLEL_UPLOADS,
        stopOnError: true,
      },
    );
  } catch (error) {
    removePendingUploads([...remainingPendingUploadIds]);
    if (error?.code === CREATE_IMAGE_ABORT_ERROR) {
      return;
    }

    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload images.",
    });
    return;
  }

  if (successfulUploadCount === 0) {
    console.error("Failed to upload images: no successful uploads", {
      fileCount: Array.isArray(files) ? files.length : 0,
    });
    appService.showToast("Failed to upload images.", { title: "Error" });
    return;
  }

  if (createdCount > 0) {
    await handleDataChanged(deps);
  }
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
    appService.showToast("Failed to upload image.", { title: "Error" });
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
        data: {
          fileId: uploadResult.fileId,
          thumbnailFileId: uploadResult.thumbnailFileId,
          name: uploadResult.displayName,
          fileType: uploadResult.file.type,
          fileSize: uploadResult.file.size,
          width: uploadResult.dimensions.width,
          height: uploadResult.dimensions.height,
        },
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  await handleDataChanged(deps);
};

export const handleImageItemPreview = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;
  store.showFullImagePreview({ itemId });
  render();
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
    appService.showToast("Failed to upload image.", { title: "Error" });
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
    appService.showToast("Image name is required.", { title: "Warning" });
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
    ? {
        fileId: editUploadResult.fileId,
        thumbnailFileId: editUploadResult.thumbnailFileId,
        fileType: editUploadResult.file.type,
        fileSize: editUploadResult.file.size,
        width: editUploadResult.dimensions.width,
        height: editUploadResult.dimensions.height,
      }
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update image.",
    action: () =>
      projectService.updateImage({
        imageId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          name,
          description: values?.description ?? "",
          ...imagePatch,
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
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await handleDataChanged(deps);
};
