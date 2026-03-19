import { nanoid } from "nanoid";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";

const pickAndUploadVideo = async ({ appService, projectService } = {}) => {
  let file;

  try {
    file = await appService.pickFiles({
      accept: ".mp4",
      multiple: false,
    });
  } catch (error) {
    return { error, errorType: "pick-failed" };
  }

  if (!file) {
    return { cancelled: true };
  }

  let uploadedFiles;
  try {
    uploadedFiles = await projectService.uploadFiles([file]);
  } catch (error) {
    return { error, errorType: "upload-failed" };
  }

  const uploadResult = uploadedFiles?.[0];
  if (!uploadResult) {
    return { error: "upload-failed" };
  }

  return { uploadResult };
};

const createVideosFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService } = deps;
  let successfulUploads;

  try {
    successfulUploads = await projectService.uploadFiles(files);
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload video.",
    });
    return;
  }

  if (!successfulUploads.length) {
    appService.showToast("Failed to upload video.", { title: "Error" });
    return;
  }

  for (const result of successfulUploads) {
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create video.",
      action: () =>
        projectService.createVideo({
          videoId: nanoid(),
          fileRecords: result.fileRecords,
          data: {
            type: "video",
            fileId: result.fileId,
            thumbnailFileId: result.thumbnailFileId,
            name: result.displayName,
            description: "",
            fileType: result.file.type,
            fileSize: result.file.size,
            width: result.dimensions?.width,
            height: result.dimensions?.height,
          },
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

const openVideoPreviewById = async ({ deps, itemId } = {}) => {
  const { store, render, projectService } = deps;
  if (!itemId) {
    return;
  }

  const videoItem = store.selectVideoItemById({ itemId });
  if (!videoItem?.fileId) {
    return;
  }

  const { url } = await projectService.getFileContent(videoItem.fileId);
  store.setVideoVisible({
    video: {
      url,
      fileType: videoItem.fileType,
    },
  });
  render();
};

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerDoubleClick,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleVideoItemClick,
  handleItemDoubleClick: handleVideoItemDoubleClick,
  handleItemEdit: handleVideoItemEdit,
} = createMediaPageHandlers({
  resourceType: "videos",
  selectItemById: (store, { itemId }) => store.selectVideoItemById({ itemId }),
  getEditPreviewFileId: (item) => item?.thumbnailFileId,
});

export {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerDoubleClick,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleVideoItemClick,
  handleVideoItemDoubleClick,
  handleVideoItemEdit,
};

export const handleVideoItemPreview = async (deps, payload) => {
  const { itemId } = payload._event.detail;
  await openVideoPreviewById({ deps, itemId });
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: ".mp4",
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

  await createVideosFromFiles({
    deps,
    files,
    parentId: resolveResourceParentId(groupId),
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { files, targetGroupId } = payload._event.detail;

  await createVideosFromFiles({
    deps,
    files,
    parentId: targetGroupId ?? undefined,
  });
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store } = deps;
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const result = await pickAndUploadVideo({ appService, projectService });
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

  if (result.errorType === "upload-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: "Failed to upload video.",
    });
    return;
  }

  const { uploadResult } = result;
  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update video.",
    action: () =>
      projectService.updateVideo({
        videoId: selectedItem.id,
        fileRecords: uploadResult.fileRecords,
        data: {
          fileId: uploadResult.fileId,
          thumbnailFileId: uploadResult.thumbnailFileId,
          name: uploadResult.displayName,
          fileType: uploadResult.file.type,
          fileSize: uploadResult.file.size,
          width: uploadResult.dimensions?.width,
          height: uploadResult.dimensions?.height,
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  await handleDataChanged(deps);
};

export const handleOutsideVideoClick = (deps) => {
  const { store, render } = deps;
  store.setVideoNotVisible();
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditDialogVideoClick = async (deps) => {
  const { appService, projectService, store, render } = deps;

  const result = await pickAndUploadVideo({ appService, projectService });
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

  if (result.errorType === "upload-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: "Failed to upload video.",
    });
    return;
  }

  store.setEditUpload({
    uploadResult: result.uploadResult,
    previewFileId: result.uploadResult.thumbnailFileId,
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
    appService.showToast("Video name is required.", { title: "Warning" });
    return;
  }

  const { editItemId, editUploadResult } = store.getState();
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const videoPatch = editUploadResult
    ? {
        fileId: editUploadResult.fileId,
        thumbnailFileId: editUploadResult.thumbnailFileId,
        fileType: editUploadResult.file.type,
        fileSize: editUploadResult.file.size,
        width: editUploadResult.dimensions?.width,
        height: editUploadResult.dimensions?.height,
      }
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update video.",
    action: () =>
      projectService.updateVideo({
        videoId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          name,
          description: values?.description ?? "",
          ...videoPatch,
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

  const result = await projectService.deleteVideoIfUnused({
    videoId: itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (!result.deleted) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await handleDataChanged(deps);
};
