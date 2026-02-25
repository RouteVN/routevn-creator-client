import { nanoid } from "nanoid";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { videos } = projectService.getState();
  store.setItems({ videosData: videos });
  render();
};

export const handleDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const state = repository.getState();
  store.setItems({ videosData: state.videos });
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      thumbnailFileId: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });

  // If we have item data with thumbnailFileId, set up media context for preview
  if (item && item.thumbnailFileId) {
    const { url } = await projectService.getFileContent(item.thumbnailFileId);
    store.setContext({
      thumbnailFileId: {
        src: url,
      },
    });
  }

  render();
};

export const handleFileExplorerDoubleClick = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;

  store.setSelectedItemId({ itemId: itemId });

  const selectedItem = store.selectSelectedItem();
  if (selectedItem) {
    const { url } = await projectService.getFileContent(selectedItem.fileId);

    store.setVideoVisible({
      video: {
        url,
        fileType: selectedItem.fileType,
      },
    });
  }
  render();
};

export const handleVideoItemClick = async (deps, payload) => {
  const { store, render, projectService, refs } = deps;
  const { itemId } = payload._event.detail;
  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  if (selectedItem && selectedItem.thumbnailFileId) {
    const { url } = await projectService.getFileContent(
      selectedItem.thumbnailFileId,
    );
    store.setContext({
      thumbnailFileId: {
        src: url,
      },
    });
  }
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail;
  // "root" means no parent (root level), convert to undefined
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
    store.setItems({ videosData: videos });
  }

  render();
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const files = await appService.pickFiles({
    accept: "video/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const uploadedFiles = await projectService.uploadFiles([file]);

  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
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

  // Update the store with the new repository state
  const { videos } = projectService.getState();
  store.setContext({
    thumbnailFileId: {
      src: uploadResult.downloadUrl,
    },
  });
  store.setItems({ videosData: videos });
  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.updateResourceItem({
    resourceType: "videos",
    resourceId: store.selectSelectedItemId(),
    patch: {
      [payload._event.detail.name]: payload._event.detail.value,
    },
  });

  const { videos } = projectService.getState();
  store.setItems({ videosData: videos });
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { store, render } = deps;
  const searchQuery = payload._event.detail.value || "";

  store.setSearchQuery({ query: searchQuery });
  render();
};

export const handleVideoItemDoubleClick = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { itemId } = payload._event.detail;

  // Find the video item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    store.setSelectedItemId({ itemId: itemId });
  }

  const item = store.selectSelectedItem();
  if (!item) {
    console.warn("Video item not found:", itemId);
    return;
  }

  // Get video URL
  const { url } = await projectService.getFileContent(item.fileId);

  store.setVideoVisible({
    video: {
      url,
      fileType: item.fileType,
    },
  });
  render();
};

export const handleOutsideVideoClick = (deps) => {
  const { store, render } = deps;

  store.setVideoNotVisible();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, store, render } = deps;
  const { resourceType, itemId } = payload._event.detail;
  await projectService.ensureRepository();
  const state = projectService.getState();

  const usage = recursivelyCheckResource({
    state,
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  // Perform the delete operation
  await projectService.deleteResourceItem({
    resourceType,
    resourceId: itemId,
  });

  // Refresh data and update store
  const data = projectService.getState()[resourceType];
  store.setItems({ videosData: data });
  render();
};
