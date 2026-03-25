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
  refreshData: handleDataChanged,
  handleBeforeMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerDoubleClick,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleImageItemClick,
  handleItemDoubleClick: handleImageItemDoubleClick,
  handleItemEdit: handleImageItemEdit,
} = createMediaPageHandlers({
  resourceType: "images",
  selectItemById: (store, { itemId }) => store.selectImageItemById({ itemId }),
  getEditPreviewFileId: (item) => item?.thumbnailFileId ?? item?.fileId,
});

export {
  handleBeforeMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerDoubleClick,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleDataChanged,
  handleSearchInput,
  handleImageItemClick,
  handleImageItemDoubleClick,
  handleImageItemEdit,
};

const createImagesFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService, store, render } = deps;
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
      accept: ".jpg,.jpeg,.png,.webp",
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

  await createImagesFromFiles({
    deps,
    files,
    parentId: resolveResourceParentId(groupId),
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { files, targetGroupId } = payload._event.detail;
  await createImagesFromFiles({
    deps,
    files,
    parentId: targetGroupId ?? undefined,
  });
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store } = deps;
  let file;

  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  try {
    file = await appService.pickFiles({
      accept: ".jpg,.jpeg,.png,.webp",
      multiple: false,
      upload: true,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to select file.",
    });
    return;
  }

  if (!file) {
    return;
  }

  if (!(file.uploadSucessful && file.uploadResult)) {
    console.error("Failed to upload image:", file);
    appService.showToast("Failed to upload image.", { title: "Error" });
    return;
  }

  const uploadResult = file.uploadResult;
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
  const { appService, store, render } = deps;
  let file;

  try {
    file = await appService.pickFiles({
      accept: ".jpg,.jpeg,.png,.webp",
      multiple: false,
      upload: true,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to select file.",
    });
    return;
  }

  if (!file) {
    return;
  }

  if (!(file.uploadSucessful && file.uploadResult)) {
    console.error("Failed to upload image:", file);
    appService.showToast("Failed to upload image.", { title: "Error" });
    return;
  }

  store.setEditUpload({
    uploadResult: file.uploadResult,
    previewFileId:
      file.uploadResult.thumbnailFileId ?? file.uploadResult.fileId,
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
