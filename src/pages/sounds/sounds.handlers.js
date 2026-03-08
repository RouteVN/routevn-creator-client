import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";
import { createResourceFileExplorerHandlers } from "../shared/fileExplorerHandlers.js";

const UNSUPPORTED_FORMAT_TITLE = "Unsupported Format";
const UNSUPPORTED_FORMAT_MESSAGE =
  "The audio file format is not supported. Please use MP3, WAV, or OGG (Windows only) files.";

const mountSubscriptions = (deps) => {
  const streams = subscriptions(deps) ?? [];
  const active = streams.map((stream) => stream.subscribe());
  return () => active.forEach((subscription) => subscription?.unsubscribe?.());
};

const showUnsupportedFormatDialog = async (appService) => {
  await appService.showDialog({
    title: UNSUPPORTED_FORMAT_TITLE,
    message: UNSUPPORTED_FORMAT_MESSAGE,
    confirmText: "OK",
  });
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  const { store, refs, render } = deps;
  const { fileExplorer, editForm } = refs;
  if (!itemId) {
    return;
  }

  const soundItem = store.selectSoundItemById({ itemId });
  if (!soundItem) {
    return;
  }

  const editValues = {
    name: soundItem.name ?? "",
    description: soundItem.description ?? "",
  };

  store.setSelectedItemId({ itemId });
  fileExplorer.selectItem({ itemId });
  store.openEditDialog({
    itemId,
    defaultValues: editValues,
    waveformDataFileId: soundItem.waveformDataFileId,
  });

  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

const pickAndUploadSound = async ({ appService, projectService } = {}) => {
  let file;
  try {
    file = await appService.pickFiles({
      accept: "audio/*",
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
    return { error: "unsupported-format" };
  }

  const uploadResult = uploadedFiles?.[0];
  if (!uploadResult) {
    return { error: "upload-failed" };
  }

  return { uploadResult };
};

export const handleBeforeMount = (deps) => {
  const { store, projectService, appService } = deps;
  const { sounds } = projectService.getState();
  store.setItems({ soundData: sounds ?? { tree: [], items: {} } });

  const defaultLeft = parseInt(
    appService.getUserConfig("resizablePanel.file-explorerWidth"),
  );
  const defaultRight = parseInt(
    appService.getUserConfig("resizablePanel.detail-panelWidth"),
  );
  store.updateAudioPlayerLeft({ width: defaultLeft, appService });
  store.updateAudioPlayerRight({ width: defaultRight, appService });

  return mountSubscriptions(deps);
};

const refreshSoundsData = async (deps) => {
  const { store, render, projectService } = deps;
  const { sounds } = projectService.getState();
  store.setItems({ soundData: sounds ?? { tree: [], items: {} } });
  render();
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "sounds",
    refresh: refreshSoundsData,
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export const handleDataChanged = refreshSoundsData;

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

export const handleSoundItemClick = (deps, payload) => {
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

export const handleSoundItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogWithValues({ deps, itemId });
};

export const handleSoundItemPreview = (deps, payload) => {
  const { store, render } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const soundItem = store.selectSoundItemById({ itemId });
  if (!soundItem?.fileId) {
    return;
  }

  store.openAudioPlayer({
    fileId: soundItem.fileId,
    fileName: soundItem.name,
  });
  render();
};

export const handleSoundItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogWithValues({ deps, itemId });
};

export const handleDragDropFileSelected = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { files, targetGroupId } = payload._event.detail;

  let successfulUploads;
  try {
    successfulUploads = await projectService.uploadFiles(files);
  } catch {
    await showUnsupportedFormatDialog(appService);
    return;
  }

  for (const result of successfulUploads) {
    await projectService.createResourceItem({
      resourceType: "sounds",
      resourceId: nanoid(),
      data: {
        type: "sound",
        fileId: result.fileId,
        name: result.displayName,
        description: "",
        fileType: result.file.type,
        fileSize: result.file.size,
        waveformDataFileId: result.waveformDataFileId,
        duration: result.duration,
      },
      parentId: targetGroupId,
      position: "last",
    });
  }

  if (successfulUploads.length > 0) {
    const { sounds } = projectService.getState();
    store.setItems({ soundData: sounds ?? { tree: [], items: {} } });
  }

  render();
};

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store, render } = deps;

  const selectedItem = store.selectSelectedItem();
  if (!selectedItem) {
    return;
  }

  const result = await pickAndUploadSound({ appService, projectService });
  if (result.cancelled) {
    return;
  }

  if (result.error === "pick-failed") {
    appService.showToast("Failed to select file.", { title: "Error" });
    return;
  }

  if (result.error === "unsupported-format") {
    await showUnsupportedFormatDialog(appService);
    return;
  }

  if (result.error) {
    appService.showToast("Failed to upload sound.", { title: "Error" });
    return;
  }

  const { uploadResult } = result;
  await projectService.updateResourceItem({
    resourceType: "sounds",
    resourceId: selectedItem.id,
    patch: {
      fileId: uploadResult.fileId,
      fileType: uploadResult.file.type,
      fileSize: uploadResult.file.size,
      waveformDataFileId: uploadResult.waveformDataFileId,
      duration: uploadResult.duration,
    },
  });

  const { sounds } = projectService.getState();
  store.setItems({ soundData: sounds ?? { tree: [], items: {} } });
  render();
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditDialogSoundClick = async (deps) => {
  const { appService, projectService, store, render } = deps;

  const result = await pickAndUploadSound({ appService, projectService });
  if (result.cancelled) {
    return;
  }

  if (result.error === "pick-failed") {
    appService.showToast("Failed to select file.", { title: "Error" });
    return;
  }

  if (result.error === "unsupported-format") {
    await showUnsupportedFormatDialog(appService);
    return;
  }

  if (result.error) {
    appService.showToast("Failed to upload sound.", { title: "Error" });
    return;
  }

  store.setEditSoundUpload({ uploadResult: result.uploadResult });
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
    appService.showToast("Sound name is required.", { title: "Warning" });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const editSoundUploadResult = store.getState().editSoundUploadResult;
  const soundPatch = editSoundUploadResult
    ? {
        fileId: editSoundUploadResult.fileId,
        fileType: editSoundUploadResult.file.type,
        fileSize: editSoundUploadResult.file.size,
        waveformDataFileId: editSoundUploadResult.waveformDataFileId,
        duration: editSoundUploadResult.duration,
      }
    : {};

  await projectService.updateResourceItem({
    resourceType: "sounds",
    resourceId: editItemId,
    patch: {
      name,
      description: values?.description ?? "",
      ...soundPatch,
    },
  });

  const { sounds } = projectService.getState();
  store.setItems({ soundData: sounds ?? { tree: [], items: {} } });
  store.closeEditDialog();
  render();
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;

  store.closeAudioPlayer();
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
  store.setItems({ soundData: data ?? { tree: [], items: {} } });
  render();
};

export const handlePanelResize = (deps, payload) => {
  const { store, render } = deps;
  const { panelType, width } = payload;
  if (panelType === "file-explorer") {
    store.updateAudioPlayerLeft({ width });
    render();
  }

  if (panelType === "detail-panel") {
    store.updateAudioPlayerRight({ width });
    render();
  }
};

const subscriptions = (deps) => {
  const { subject } = deps;
  return [
    subject.pipe(
      filter(({ action }) => action === "panel-resize"),
      tap(({ payload }) => {
        handlePanelResize(deps, payload);
      }),
    ),
  ];
};
