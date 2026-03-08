import { nanoid } from "nanoid";
import { createResourceFileExplorerHandlers } from "../../deps/features/fileExplorerHandlers.js";

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  const { store, refs, render } = deps;
  const { fileExplorer, editForm } = refs;
  if (!itemId) {
    return;
  }

  const videoItem = store.selectVideoItemById({ itemId });
  if (!videoItem) {
    return;
  }

  const editValues = {
    name: videoItem.name ?? "",
    description: videoItem.description ?? "",
  };

  store.setSelectedItemId({ itemId });
  fileExplorer.selectItem({ itemId });
  store.openEditDialog({
    itemId,
    defaultValues: editValues,
    thumbnailFileId: videoItem.thumbnailFileId,
  });

  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
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

const pickAndUploadVideo = async ({ appService, projectService } = {}) => {
  let file;
  try {
    file = await appService.pickFiles({
      accept: "video/*",
      multiple: false,
    });
  } catch {
    return { error: "pick-failed" };
  }

  if (!file) {
    return { cancelled: true };
  }

  let uploadedFiles;
  try {
    uploadedFiles = await projectService.uploadFiles([file]);
  } catch {
    return { error: "upload-failed" };
  }

  const uploadResult = uploadedFiles?.[0];
  if (!uploadResult) {
    return { error: "upload-failed" };
  }

  return { uploadResult };
};

export const handleBeforeMount = (deps) => {
  const { store, projectService } = deps;
  const { videos } = projectService.getState();
  store.setItems({ videosData: videos ?? { tree: [], items: {} } });
};

const refreshVideosData = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const state = repository.getState();
  store.setItems({ videosData: state.videos ?? { tree: [], items: {} } });
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "videos",
    refresh: refreshVideosData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshVideosData;

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openEditDialogWithValues({ deps, itemId });
};

export const handleVideoItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });
  render();
};

export const handleVideoItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogWithValues({ deps, itemId });
};

export const handleVideoItemPreview = async (deps, payload) => {
  const { itemId } = payload._event.detail;
  await openVideoPreviewById({ deps, itemId });
};

export const handleVideoItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogWithValues({ deps, itemId });
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail;
  const id = targetGroupId === "root" ? undefined : targetGroupId;

  const successfulUploads = await projectService.uploadFiles(files);

  for (const result of successfulUploads) {
    await projectService.createResourceItem({
      resourceType: "videos",
      resourceId: nanoid(),
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
      parentId: id,
      position: "last",
    });
  }

  if (successfulUploads.length > 0) {
    const { videos } = projectService.getState();
    store.setItems({ videosData: videos ?? { tree: [], items: {} } });
  }

  render();
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;

  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const result = await pickAndUploadVideo({ appService, projectService });
  if (result.cancelled) {
    return;
  }

  if (result.error === "pick-failed") {
    appService.showToast("Failed to select file.", { title: "Error" });
    return;
  }

  if (result.error) {
    appService.showToast("Failed to upload video.", { title: "Error" });
    return;
  }

  const { uploadResult } = result;
  await projectService.updateResourceItem({
    resourceType: "videos",
    resourceId: selectedItem.id,
    patch: {
      fileId: uploadResult.fileId,
      thumbnailFileId: uploadResult.thumbnailFileId,
      name: uploadResult.displayName,
      fileType: uploadResult.file.type,
      fileSize: uploadResult.file.size,
      width: uploadResult.dimensions?.width,
      height: uploadResult.dimensions?.height,
    },
  });

  const { videos } = projectService.getState();
  store.setItems({ videosData: videos ?? { tree: [], items: {} } });
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value ?? "";

  store.setSearchQuery({ value: searchQuery });
  render();
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

  if (result.error === "pick-failed") {
    appService.showToast("Failed to select file.", { title: "Error" });
    return;
  }

  if (result.error) {
    appService.showToast("Failed to upload video.", { title: "Error" });
    return;
  }

  store.setEditVideoUpload({ uploadResult: result.uploadResult });
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

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const editVideoUploadResult = store.getState().editVideoUploadResult;
  const videoPatch = editVideoUploadResult
    ? {
        fileId: editVideoUploadResult.fileId,
        thumbnailFileId: editVideoUploadResult.thumbnailFileId,
        fileType: editVideoUploadResult.file.type,
        fileSize: editVideoUploadResult.file.size,
        width: editVideoUploadResult.dimensions?.width,
        height: editVideoUploadResult.dimensions?.height,
      }
    : {};

  await projectService.updateResourceItem({
    resourceType: "videos",
    resourceId: editItemId,
    patch: {
      name,
      description: values?.description ?? "",
      ...videoPatch,
    },
  });

  const { videos } = projectService.getState();
  store.setItems({ videosData: videos ?? { tree: [], items: {} } });
  store.closeEditDialog();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;
  const result = await projectService.deleteResourceItemIfUnused({
    resourceType,
    resourceId: itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (!result.deleted) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  const data = projectService.getState()[resourceType];
  store.setItems({ videosData: data ?? { tree: [], items: {} } });
  render();
};
