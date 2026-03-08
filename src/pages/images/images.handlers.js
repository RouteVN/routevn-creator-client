import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";
import { createResourceFileExplorerHandlers } from "../../deps/features/fileExplorerHandlers.js";

const COLLAB_IMAGES_REFRESH_ACTION = "collab.images.refresh";

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  const { store, render, refs } = deps;
  const { fileExplorer, editForm } = refs;
  if (!itemId) {
    return;
  }

  const imageItem = store.selectImageItemById({ itemId });
  if (!imageItem) {
    return;
  }

  const editValues = {
    name: imageItem.name ?? "",
    description: imageItem.description ?? "",
  };

  store.setSelectedItemId({ itemId });
  fileExplorer.selectItem({ itemId });
  store.openEditDialog({
    itemId,
    defaultValues: editValues,
    fileId: imageItem.fileId,
  });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) ?? [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

export const handleBeforeMount = (deps) => {
  const { store, projectService } = deps;
  const { images } = projectService.getState();
  store.setItems({ imagesData: images });
  return mountSubscriptions(deps);
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { store, render } = deps;
  const detail = payload._event.detail;
  const { itemId: id } = detail;
  const { isFolder } = detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: null });
    render();
    return;
  }

  if (!id) {
    return;
  }

  store.setSelectedItemId({ itemId: id });
  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) return;
  openEditDialogWithValues({ deps, itemId });
};

const refreshImagesData = async (deps) => {
  const { store, render, projectService } = deps;
  const repository = await projectService.getRepository();
  const state = repository.getState();
  store.setItems({ imagesData: state.images });
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "images",
    refresh: refreshImagesData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleFileExplorerDataChanged = refreshImagesData;

const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === COLLAB_IMAGES_REFRESH_ACTION),
      tap(() => {
        deps.handlers.handleFileExplorerDataChanged(deps);
      }),
    ),
  ];
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;
  let file;

  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  try {
    file = await appService.pickFiles({
      accept: "image/*",
      multiple: false,
      upload: true,
    });
  } catch {
    appService.showToast("Failed to select file.", { title: "Error" });
    return;
  }

  if (!file) {
    return; // User cancelled
  }

  if (!(file.uploadSucessful && file.uploadResult)) {
    appService.showToast("Failed to upload image.", { title: "Error" });
    return;
  }

  const uploadResult = file.uploadResult;
  await projectService.updateResourceItem({
    resourceType: "images",
    resourceId: selectedItem.id,
    patch: {
      fileId: uploadResult.fileId,
      name: uploadResult.displayName,
      fileType: uploadResult.file.type,
      fileSize: uploadResult.file.size,
      width: uploadResult.dimensions.width,
      height: uploadResult.dimensions.height,
    },
  });

  // Update the store with the new repository state
  const { images } = projectService.getState();
  store.setItems({ imagesData: images });
  render();
};

export const handleImageItemClick = (deps, payload) => {
  const { store, render, refs } = deps;
  const { itemId } = payload._event.detail;

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId: itemId });

  const { fileExplorer } = refs;
  fileExplorer.selectItem({ itemId });

  render();
};

export const handleImageItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogWithValues({ deps, itemId });
};

export const handleImageItemPreview = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;
  store.showFullImagePreview({ itemId });
  render();
};

export const handleImageItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogWithValues({ deps, itemId });
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
      accept: "image/*",
      multiple: false,
      upload: true,
    });
  } catch {
    appService.showToast("Failed to select file.", { title: "Error" });
    return;
  }

  if (!file) {
    return;
  }

  if (!(file.uploadSucessful && file.uploadResult)) {
    appService.showToast("Failed to upload image.", { title: "Error" });
    return;
  }

  store.setEditImageUpload({ uploadResult: file.uploadResult });
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

  const editImageUploadResult = store.getState().editImageUploadResult;
  const imagePatch = editImageUploadResult
    ? {
        fileId: editImageUploadResult.fileId,
        fileType: editImageUploadResult.file.type,
        fileSize: editImageUploadResult.file.size,
        width: editImageUploadResult.dimensions.width,
        height: editImageUploadResult.dimensions.height,
      }
    : {};

  await projectService.updateResourceItem({
    resourceType: "images",
    resourceId: editItemId,
    patch: {
      name,
      description: values?.description ?? "",
      ...imagePatch,
    },
  });

  const { images } = projectService.getState();
  store.setItems({ imagesData: images });
  store.closeEditDialog();
  render();
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { files, targetGroupId } = payload._event.detail;
  const id = targetGroupId;

  const successfulUploads = await projectService.uploadFiles(files);
  for (const result of successfulUploads) {
    await projectService.createResourceItem({
      resourceType: "images",
      resourceId: nanoid(),
      data: {
        type: "image",
        fileId: result.fileId,
        name: result.displayName,
        fileType: result.file.type,
        fileSize: result.file.size,
        width: result.dimensions.width,
        height: result.dimensions.height,
      },
      parentId: id,
      position: "last",
    });
  }

  if (successfulUploads.length > 0) {
    const { images } = projectService.getState();
    store.setItems({ imagesData: images });
  }

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

  // Refresh data and update store (reuse existing logic from handleDataChanged)
  const data = projectService.getState()[resourceType];
  store.setItems({ imagesData: data });
  render();
};
