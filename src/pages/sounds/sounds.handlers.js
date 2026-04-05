import { nanoid } from "nanoid";
import { filter, tap } from "rxjs";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { processPendingUploads } from "../../internal/ui/resourcePages/media/processPendingUploads.js";
import {
  getResourcePageErrorMessage,
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";

const UNSUPPORTED_FORMAT_TITLE = "Unsupported Format";
const UNSUPPORTED_FORMAT_MESSAGE =
  "The audio file format is not supported. Please use MP3, WAV, or OGG (Windows only) files.";

const showUnsupportedFormatDialog = async (
  appService,
  message = UNSUPPORTED_FORMAT_MESSAGE,
) => {
  await appService.showDialog({
    title: UNSUPPORTED_FORMAT_TITLE,
    message,
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

const createSoundsFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService } = deps;

  await processPendingUploads({
    deps,
    files,
    parentId,
    pendingIdPrefix: "pending-sound",
    refresh: handleDataChanged,
    createItem: async ({ uploadResult }) => {
      const createAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: "Failed to create sound.",
        action: () =>
          projectService.createSound({
            soundId: nanoid(),
            fileRecords: uploadResult.fileRecords,
            data: {
              type: "sound",
              fileId: uploadResult.fileId,
              name: uploadResult.displayName,
              description: "",
              fileType: uploadResult.file.type,
              fileSize: uploadResult.file.size,
              waveformDataFileId: uploadResult.waveformDataFileId,
              duration: uploadResult.duration,
            },
            parentId,
            position: "last",
          }),
      });

      return createAttempt.ok;
    },
    onUploadError: async ({ error }) => {
      await showUnsupportedFormatDialog(
        appService,
        getResourcePageErrorMessage(error, UNSUPPORTED_FORMAT_MESSAGE),
      );
    },
    onNoSuccessfulUploads: () => {
      appService.showToast("Failed to upload sound.", { title: "Error" });
    },
  });
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
  openEditDialogWithValues,
  handleBeforeMount: handleMediaBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleSoundItemClick,
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
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleSoundItemClick,
  handleSoundItemEdit,
};

const openSoundPreviewById = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, store, render } = deps;
  if (!itemId) {
    return;
  }

  const soundItem = store.selectSoundItemById({ itemId });
  if (!soundItem?.fileId) {
    return;
  }

  store.setSelectedItemId({ itemId });

  if (syncExplorer) {
    refs.fileExplorer.selectItem({ itemId });
  }

  store.openAudioPlayer({
    fileId: soundItem.fileId,
    fileName: soundItem.name,
  });
  render();
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openSoundPreviewById({ deps, itemId });
};

export const handleSoundItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openSoundPreviewById({ deps, itemId, syncExplorer: true });
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

export const handleSoundItemPreview = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openSoundPreviewById({ deps, itemId });
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

  if (result.errorType === "pick-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: "Failed to select file.",
    });
    return;
  }

  if (result.errorType === "upload-failed") {
    await showUnsupportedFormatDialog(
      appService,
      getResourcePageErrorMessage(result.error, UNSUPPORTED_FORMAT_MESSAGE),
    );
    return;
  }

  const { uploadResult } = result;
  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update sound.",
    action: () =>
      projectService.updateSound({
        soundId: selectedItem.id,
        fileRecords: uploadResult.fileRecords,
        data: {
          fileId: uploadResult.fileId,
          fileType: uploadResult.file.type,
          fileSize: uploadResult.file.size,
          waveformDataFileId: uploadResult.waveformDataFileId,
          duration: uploadResult.duration,
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

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

  if (result.errorType === "pick-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: "Failed to select file.",
    });
    return;
  }

  if (result.errorType === "upload-failed") {
    await showUnsupportedFormatDialog(
      appService,
      getResourcePageErrorMessage(result.error, UNSUPPORTED_FORMAT_MESSAGE),
    );
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

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update sound.",
    action: () =>
      projectService.updateSound({
        soundId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          name,
          description: values?.description ?? "",
          ...soundPatch,
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

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

  const result = await projectService.deleteSoundIfUnused({
    soundId: itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (!result.deleted) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await handleDataChanged(deps);
};
