import { nanoid } from "nanoid";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";

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
  const { appService, projectService } = deps;
  let successfulUploads;

  try {
    successfulUploads = await projectService.uploadFiles(files);
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload images.",
    });
    return;
  }

  if (!successfulUploads.length) {
    console.error("Failed to upload images: no successful uploads", {
      fileCount: Array.isArray(files) ? files.length : 0,
    });
    appService.showToast("Failed to upload images.", { title: "Error" });
    return;
  }

  for (const result of successfulUploads) {
    const imageData = {
      type: "image",
      fileId: result.fileId,
      thumbnailFileId: result.thumbnailFileId,
      name: result.displayName,
      fileType: result.file.type,
      fileSize: result.file.size,
      width: result.dimensions.width,
      height: result.dimensions.height,
    };
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create image.",
      action: () =>
        projectService.createImage({
          imageId: nanoid(),
          fileRecords: result.fileRecords,
          data: imageData,
          parentId,
          position: "last",
        }),
    });
    if (!createAttempt.ok) {
      return;
    }
  }

  await handleDataChanged(deps);
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
