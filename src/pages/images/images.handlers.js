import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";
import { recursivelyCheckResource } from "../../utils/resourceUsageChecker.js";

const COLLAB_IMAGES_REFRESH_ACTION = "collab.images.refresh";

const mountLegacySubscriptions = (deps) => {
  const streams = subscriptions(deps) || [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => mountLegacySubscriptions(deps);

export const handleAfterMount = async (deps) => {
  const { store, projectService, render } = deps;
  await projectService.ensureRepository();
  const { images } = projectService.getState();
  store.setItems({ imagesData: images });
  render();
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { id, item, isFolder } = payload._event.detail;

  // If this is a folder, clear selection and context
  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    store.setContext({
      fileId: {
        src: null,
      },
    });
    render();
    return;
  }

  store.setSelectedItemId({ itemId: id });

  // If we have item data with fileId, set up media context for preview
  if (item && item.fileId) {
    const { url } = await projectService.getFileContent(item.fileId);

    store.setContext({
      fileId: {
        src: url,
      },
    });
  }

  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;
  store.showFullImagePreview({ itemId });
  render();
};

export const handleFileExplorerDataChanged = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const state = repository.getState();
  store.setItems({ imagesData: state.images });
  render();
};

const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === COLLAB_IMAGES_REFRESH_ACTION),
      tap(() => {
        void deps.handlers.handleFileExplorerDataChanged(deps);
      }),
    ),
  ];
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;

  // Get the currently selected item
  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const files = await appService.pickFiles({
    accept: "image/*",
    multiple: false,
  });

  if (files.length === 0) {
    return; // User cancelled
  }

  const file = files[0];

  const uploadedFiles = await projectService.uploadFiles([file]);

  // TODO improve error handling
  if (uploadedFiles.length === 0) {
    console.error("File upload failed, no files uploaded");
    return;
  }

  const uploadResult = uploadedFiles[0];
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "images",
      value: {
        fileId: uploadResult.fileId,
        name: uploadResult.displayName,
        fileType: uploadResult.file.type,
        fileSize: uploadResult.file.size,
        width: uploadResult.dimensions.width,
        height: uploadResult.dimensions.height,
      },
      options: {
        id: selectedItem.id,
        replace: false,
      },
    },
  });

  // Update the store with the new repository state
  const { images } = projectService.getState();
  store.setContext({
    fileId: {
      src: uploadResult.downloadUrl,
    },
  });
  store.setItems({ imagesData: images });
  render();
};

export const handleImageItemClick = async (deps, payload) => {
  const { store, render, projectService, refs } = deps;
  const { itemId } = payload._event.detail; // Extract from forwarded event

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.transformedHandlers.handlePageItemClick({
    _event: { detail: { itemId } },
  });

  const selectedItem = store.selectSelectedItem();

  const { url } = await projectService.getFileContent(selectedItem.fileId);
  store.setContext({
    fileId: {
      src: url,
    },
  });

  render();
};

export const handleImageItemDoubleClick = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload?._event?.detail || {};
  const itemId = detail.itemId || detail.id;

  if (!itemId) {
    return;
  }

  store.showFullImagePreview({ itemId });
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail;
  const id = targetGroupId;

  const successfulUploads = await projectService.uploadFiles(files);
  for (const result of successfulUploads) {
    await projectService.appendEvent({
      type: "treePush",
      payload: {
        target: "images",
        value: {
          id: nanoid(),
          type: "image",
          fileId: result.fileId,
          name: result.displayName,
          fileType: result.file.type,
          fileSize: result.file.size,
          width: result.dimensions.width,
          height: result.dimensions.height,
        },
        options: {
          parent: id,
          position: "last",
        },
      },
    });
  }

  if (successfulUploads.length > 0) {
    const { images } = projectService.getState();
    store.setItems({ imagesData: images });
  }

  render();
};

export const handleFormChange = async (deps, payload) => {
  const { projectService, render, store } = deps;
  await projectService.appendEvent({
    type: "treeUpdate",
    payload: {
      target: "images",
      value: {
        [payload._event.detail.name]: payload._event.detail.value,
      },
      options: {
        id: store.selectSelectedItemId(),
        replace: false,
      },
    },
  });

  const { images } = projectService.getState();
  store.setItems({ imagesData: images });
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

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ imagesData: data });
  render();
};
