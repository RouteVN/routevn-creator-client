import { nanoid } from "nanoid";
import { formatFileSize } from "../../utils/index.js";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const resolveDetailItemId = (detail = {}) => {
  return detail.itemId || detail.id || detail.item?.id || "";
};

const callFormMethod = ({ formRef, methodName, payload } = {}) => {
  if (!formRef || !methodName) return false;

  if (typeof formRef[methodName] === "function") {
    formRef[methodName](payload);
    return true;
  }

  if (typeof formRef.transformedMethods?.[methodName] === "function") {
    formRef.transformedMethods[methodName](payload);
    return true;
  }

  return false;
};

const createDetailFormValues = (item) => {
  if (!item) {
    return {
      name: "",
      fileType: "",
      fileSize: "",
    };
  }

  return {
    name: item.name || "",
    fileType: item.fileType || "",
    fileSize: formatFileSize(item.fileSize),
  };
};

const syncDetailFormValues = ({
  deps,
  values,
  selectedItemId,
  attempt = 0,
} = {}) => {
  const formRef = deps?.refs?.detailForm;
  const currentSelectedItemId = deps?.store?.selectSelectedItemId?.();

  if (!selectedItemId || selectedItemId !== currentSelectedItemId) {
    return;
  }

  if (!formRef) {
    if (attempt < 6) {
      setTimeout(() => {
        syncDetailFormValues({
          deps,
          values,
          selectedItemId,
          attempt: attempt + 1,
        });
      }, 0);
    }
    return;
  }

  callFormMethod({ formRef, methodName: "reset" });

  const didSet = callFormMethod({
    formRef,
    methodName: "setValues",
    payload: { values },
  });

  if (!didSet && attempt < 6) {
    setTimeout(() => {
      syncDetailFormValues({
        deps,
        values,
        selectedItemId,
        attempt: attempt + 1,
      });
    }, 0);
  }
};

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
  const selectedItemId = store.selectSelectedItemId();
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const detail = payload?._event?.detail || {};
  const id = resolveDetailItemId(detail);
  const { item, isFolder } = detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      context: {
        thumbnailFileId: {
          src: null,
        },
      },
    });
    render();
    return;
  }

  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  const selectedItem = item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  let thumbnailSrc = null;

  // If we have item data with thumbnailFileId, set up media context for preview
  if (selectedItem?.thumbnailFileId) {
    const { url } = await projectService.getFileContent(
      selectedItem.thumbnailFileId,
    );
    thumbnailSrc = url;
  }

  store.setContext({
    context: {
      thumbnailFileId: {
        src: thumbnailSrc,
      },
    },
  });

  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: id,
    });
  }
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
  const detail = payload?._event?.detail || {};
  const itemId = resolveDetailItemId(detail);
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = detail.item || store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  let thumbnailSrc = null;

  if (selectedItem?.thumbnailFileId) {
    const { url } = await projectService.getFileContent(
      selectedItem.thumbnailFileId,
    );
    thumbnailSrc = url;
  }

  store.setContext({
    context: {
      thumbnailFileId: {
        src: thumbnailSrc,
      },
    },
  });
  render();
  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId: itemId,
    });
  }
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail;
  // "root" means no parent (root level), convert to undefined
  const id = targetGroupId === "root" ? undefined : targetGroupId;

  const successfulUploads = await projectService.uploadFiles(files);

  for (const result of successfulUploads) {
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "videos",
        value: {
          id: nanoid(),
          type: "video",
          fileId: result.fileId,
          thumbnailFileId: result.thumbnailFileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          width: result.dimensions?.width,
          height: result.dimensions?.height,
        },
        options: {
          parent: id,
          position: "last",
        },
      },
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
  const selectedItemId = store.selectSelectedItemId();
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "videos",
      value: {
        fileId: uploadResult.fileId,
        thumbnailFileId: uploadResult.thumbnailFileId,
        name: uploadResult.displayName,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        width: uploadResult.dimensions?.width,
        height: uploadResult.dimensions?.height,
      },
      options: {
        id: selectedItem.id,
        replace: false,
      },
    },
  });

  // Update the store with the new repository state
  const { videos } = projectService.getState();
  store.setContext({
    context: {
      thumbnailFileId: {
        src: uploadResult.downloadUrl,
      },
    },
  });
  store.setItems({ videosData: videos });
  const updatedSelectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(updatedSelectedItem);
  render();

  if (updatedSelectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "videos",
      value: {
        [payload._event.detail.name]: payload._event.detail.value,
      },
      options: {
        id: selectedItemId,
        replace: false,
      },
    },
  });

  const { videos } = projectService.getState();
  store.setItems({ videosData: videos });
  const selectedItem = store.selectSelectedItem();
  const detailValues = createDetailFormValues(selectedItem);
  render();

  if (selectedItem) {
    syncDetailFormValues({
      deps,
      values: detailValues,
      selectedItemId,
    });
  }
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
  await projectService.appendEvent({
    type: "treeDelete",
    payload: {
      target: resourceType,
      options: {
        id: itemId,
      },
    },
  });

  // Refresh data and update store
  const data = projectService.getState()[resourceType];
  store.setItems({ videosData: data });
  render();
};
