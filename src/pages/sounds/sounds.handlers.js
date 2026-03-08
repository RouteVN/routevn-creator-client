import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";
import { createMediaPageHandlers } from "../../deps/features/resourcePages/media/createMediaPageHandlers.js";
import { resolveResourceParentId } from "../../deps/features/resourcePages/media/mediaPageShared.js";

const UNSUPPORTED_FORMAT_TITLE = "Unsupported Format";
const UNSUPPORTED_FORMAT_MESSAGE =
  "The audio file format is not supported. Please use MP3, WAV, or OGG (Windows only) files.";

const showUnsupportedFormatDialog = async (appService) => {
  await appService.showDialog({
    title: UNSUPPORTED_FORMAT_TITLE,
    message: UNSUPPORTED_FORMAT_MESSAGE,
    confirmText: "OK",
  });
};

const pickAndUploadSound = async ({ appService, projectService } = {}) => {
  let file;

  try {
    file = await appService.pickFiles({
      accept: ".mp3,.wav,.ogg",
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

const createSoundsFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService } = deps;
  let successfulUploads;

  try {
    successfulUploads = await projectService.uploadFiles(files);
  } catch {
    await showUnsupportedFormatDialog(appService);
    return;
  }

  if (!successfulUploads.length) {
    appService.showToast("Failed to upload sound.", { title: "Error" });
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
      parentId,
      position: "last",
    });
  }

  await handleDataChanged(deps);
};

const handlePanelResize = (deps, payload) => {
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

const {
  handleBeforeMount: handleMediaBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerDoubleClick,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleSoundItemClick,
  handleItemDoubleClick: handleSoundItemDoubleClick,
  handleItemEdit: handleSoundItemEdit,
} = createMediaPageHandlers({
  resourceType: "sounds",
  subscriptions: (deps) => {
    const { subject } = deps;

    return [
      subject.pipe(
        filter(({ action }) => action === "panel-resize"),
        tap(({ payload }) => {
          handlePanelResize(deps, payload);
        }),
      ),
    ];
  },
  selectItemById: (store, { itemId }) => store.selectSoundItemById({ itemId }),
  getEditPreviewFileId: (item) => item?.waveformDataFileId,
});

export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;
  const cleanup = handleMediaBeforeMount(deps);

  const defaultLeft = parseInt(
    appService.getUserConfig("resizablePanel.file-explorerWidth"),
  );
  const defaultRight = parseInt(
    appService.getUserConfig("resizablePanel.detail-panelWidth"),
  );
  store.updateAudioPlayerLeft({ width: defaultLeft });
  store.updateAudioPlayerRight({ width: defaultRight });

  return cleanup;
};

export {
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerDoubleClick,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleSoundItemClick,
  handleSoundItemDoubleClick,
  handleSoundItemEdit,
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

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: ".mp3,.wav,.ogg",
      multiple: true,
    });
  } catch {
    appService.showToast("Failed to select files.", { title: "Error" });
    return;
  }

  if (!files?.length) {
    return;
  }

  await createSoundsFromFiles({
    deps,
    files,
    parentId: resolveResourceParentId(groupId),
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { files, targetGroupId } = payload._event.detail;

  await createSoundsFromFiles({
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

  await handleDataChanged(deps);
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

  store.setEditUpload({
    uploadResult: result.uploadResult,
    previewFileId: result.uploadResult.waveformDataFileId,
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
    appService.showToast("Sound name is required.", { title: "Warning" });
    return;
  }

  const { editItemId, editUploadResult } = store.getState();
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const soundPatch = editUploadResult
    ? {
        fileId: editUploadResult.fileId,
        fileType: editUploadResult.file.type,
        fileSize: editUploadResult.file.size,
        waveformDataFileId: editUploadResult.waveformDataFileId,
        duration: editUploadResult.duration,
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

  store.closeEditDialog();
  await handleDataChanged(deps);
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;
  store.closeAudioPlayer();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

  const result = await projectService.deleteResourceItemIfUnused({
    resourceType: "sounds",
    resourceId: itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (!result.deleted) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await handleDataChanged(deps);
};
