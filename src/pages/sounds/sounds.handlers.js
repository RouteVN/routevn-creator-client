import { generateId } from "../../internal/id.js";
import { filter, tap } from "rxjs";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import {
  getMediaPageData,
  resolveResourceParentId,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { processPendingUploads } from "../../internal/ui/resourcePages/media/processPendingUploads.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import {
  getResourcePageErrorMessage,
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  buildSoundResourceDataFromUploadResult,
  buildSoundResourcePatchFromUploadResult,
} from "../../deps/services/shared/resourceImports.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { SOUND_TAG_SCOPE_KEY } from "./sounds.store.js";
import { selectSoundsPageCopy } from "./support/soundsPageCopy.js";

const SOUND_FILE_PATTERN = /\.(mp3|wav|ogg)$/i;
const SOUND_FILE_ACCEPT = ".mp3,.wav,.ogg";

const selectCopy = (deps = {}) => selectSoundsPageCopy(deps.i18n);

const showUnsupportedFormatToast = (appService, copy, message) => {
  appService.showAlert({
    message: message ?? copy.unsupportedFormatMessage,
    title: copy.unsupportedFormatTitle,
  });
};

const validateSoundFiles = ({ appService, files, copy } = {}) => {
  const invalidFiles = Array.from(files ?? []).filter(
    (file) => !file.name.match(SOUND_FILE_PATTERN),
  );

  if (invalidFiles.length === 0) {
    return true;
  }

  showUnsupportedFormatToast(appService, copy);
  return false;
};

const pickAndUploadSound = async ({
  appService,
  projectService,
  copy,
} = {}) => {
  let file;

  try {
    file = await appService.pickFiles({
      accept: SOUND_FILE_ACCEPT,
      multiple: false,
    });
  } catch (error) {
    return { error, errorType: "pick-failed" };
  }

  if (!file) {
    return { cancelled: true };
  }

  if (!validateSoundFiles({ appService, files: [file], copy })) {
    return { errorType: "validation-failed" };
  }

  let uploadedFiles;
  try {
    uploadedFiles = await projectService.uploadFiles([file]);
  } catch (error) {
    return { error, errorType: "upload-failed" };
  }

  const uploadResult = uploadedFiles?.[0];
  if (!uploadResult) {
    return { error: "upload-failed", errorType: "upload-failed" };
  }

  return { uploadResult };
};

const createSoundsFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);

  await processPendingUploads({
    deps,
    files,
    parentId,
    pendingIdPrefix: "pending-sound",
    refresh: handleDataChanged,
    processFile: async ({ file, pendingUploadId, removePendingUpload }) => {
      const uploadResults = await projectService.uploadFiles([file]);
      const uploadResult = uploadResults?.[0];

      if (!uploadResult) {
        return false;
      }

      const soundId = generateId();
      store.updatePendingUpload({
        itemId: pendingUploadId,
        updates: {
          resolvedItemId: soundId,
        },
      });

      const createAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: copy.failedCreateSound,
        action: () =>
          projectService.createSound({
            soundId,
            fileRecords: uploadResult.fileRecords,
            data: buildSoundResourceDataFromUploadResult(uploadResult),
            parentId,
            position: "last",
          }),
      });

      if (createAttempt.ok) {
        await handleDataChanged(deps);
        removePendingUpload();
      }

      return createAttempt.ok;
    },
    onUploadError: ({ error }) => {
      showUnsupportedFormatToast(
        appService,
        copy,
        getResourcePageErrorMessage(error, copy.unsupportedFormatMessage),
      );
    },
    onNoSuccessfulUploads: () => {
      appService.showAlert({
        message: copy.failedUploadSound,
        title: copy.errorTitle,
      });
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

const syncSoundPageData = ({ store, repositoryState } = {}) => {
  const tagsData = getTagsCollection(repositoryState, SOUND_TAG_SCOPE_KEY);
  const mediaData = getMediaPageData({
    repositoryState,
    resourceType: "sounds",
  });

  store.setTagsData({ tagsData });
  store.setItems({
    data: resolveCollectionWithTags({
      collection: mediaData,
      tagsCollection: tagsData,
      itemType: "sound",
    }),
  });
};

const openSoundPreviewById = ({
  deps,
  itemId,
  syncExplorer = false,
  suppressMobileDetailSheet = false,
} = {}) => {
  const { appService, refs, store, render } = deps;
  if (!itemId) {
    return;
  }

  const soundItem = store.selectSoundItemById({ itemId });
  if (!soundItem?.fileId) {
    return;
  }

  void appService
    .getAudioService?.()
    ?.unlock?.()
    ?.catch?.(() => {});

  store.setSelectedItemId({
    itemId,
    suppressMobileDetailSheet,
  });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.openAudioPlayer({
    fileId: soundItem.fileId,
    fileName: soundItem.name,
  });
  render();
};

const toggleSoundPreviewById = ({ deps, itemId } = {}) => {
  const { appService, store } = deps;
  const soundItem = store.selectSoundItemById({ itemId });
  if (!soundItem?.fileId) {
    return;
  }

  if (store.selectPlayingSoundFileId() !== soundItem.fileId) {
    openSoundPreviewById({ deps, itemId, syncExplorer: true });
    return;
  }

  const audioService = appService.getAudioService?.();
  if (audioService?.isPlaying?.()) {
    audioService.pause();
    return;
  }

  void audioService?.play?.();
};

const {
  openEditDialogWithValues,
  openFolderNameDialogWithValues,
  openCreateTagDialogForMode,
  handleBeforeMount: handleMediaBeforeMount,
  handleAfterMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleEditDialogClose,
  handleSearchInput,
  handleItemClick: handleSoundItemClick,
  handleItemEdit: handleSoundItemEdit,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createMediaPageHandlers({
  resourceType: "sounds",
  syncData: syncSoundPageData,
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
  getEditValues: (item) => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
    tagIds: item?.tagIds ?? [],
  }),
  getEditPreviewFileId: (item) => item?.waveformDataFileId,
  onEnterKey: ({ deps, selectedItemId }) => {
    toggleSoundPreviewById({ deps, itemId: selectedItemId });
  },
  copy: ({ i18n }) => selectSoundsPageCopy(i18n),
  tagging: {
    scopeKey: SOUND_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateSound({
        soundId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags,
    appendCreatedTagByMode: ({ deps, mode, tagId }) => {
      if (mode !== "edit-form") {
        return;
      }

      appendTagIdToForm({
        form: deps.refs.editForm,
        tagId,
      });
    },
  },
});

export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;
  const cleanup = handleMediaBeforeMount(deps);

  const defaultLeft = Number.parseInt(
    appService.getUserConfig("resizablePanel.fileExplorerWidth"),
    10,
  );
  const defaultRight = Number.parseInt(
    appService.getUserConfig("resizablePanel.detailPanelWidth"),
    10,
  );
  store.updateAudioPlayerLeft({ width: defaultLeft });
  store.updateAudioPlayerRight({ width: defaultRight });

  return cleanup;
};

export {
  handleAfterMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleEditDialogClose,
  handleSearchInput,
  handleSoundItemClick,
  handleSoundItemEdit,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

export const handleFileExplorerFolderCollapseChange = (deps, payload) => {
  const { refs } = deps;
  const { folderId, collapsed } = payload._event.detail ?? {};
  if (!folderId) {
    return;
  }

  refs.groupview?.setGroupCollapsed?.({
    groupId: folderId,
    collapsed,
  });
};

export const handleCenterGroupCollapseChange = (deps, payload) => {
  const { refs } = deps;
  const { groupId, collapsed } = payload._event.detail ?? {};
  if (!groupId) {
    return;
  }

  refs.fileExplorer?.setFolderCollapsed?.({
    folderId: groupId,
    collapsed,
  });
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openSoundPreviewById({ deps, itemId });
};

export const handleSoundItemDoubleClick = (deps, payload) => {
  const { itemId, source } = payload._event.detail;
  openSoundPreviewById({
    deps,
    itemId,
    syncExplorer: true,
    suppressMobileDetailSheet: source === "mobile-context-menu",
  });
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  if (selectedItemId) {
    openEditDialogWithValues({ deps, itemId: selectedItemId });
    return;
  }

  const selectedFolderId = deps.store.selectSelectedFolderId();
  openFolderNameDialogWithValues({ deps, folderId: selectedFolderId });
};

export const handleEditFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "edit-form",
    itemId: deps.store.selectEditItemId(),
  });
};

export const handleSoundItemPreview = (deps, payload) => {
  const { itemId, source } = payload._event.detail;
  openSoundPreviewById({
    deps,
    itemId,
    syncExplorer: true,
    suppressMobileDetailSheet: source === "mobile-context-menu",
  });
};

export const handleMobileDetailPlayClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const selectedItemId = deps.store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  openSoundPreviewById({
    deps,
    itemId: selectedItemId,
    syncExplorer: true,
    suppressMobileDetailSheet: true,
  });
};

export const handleMobileDetailDeleteClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { store, render } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  store.openMobileDeleteDialog({ itemId: selectedItemId });
  render();
};

export const handleMobileDeleteDialogClose = (deps) => {
  const { store, render } = deps;

  store.closeMobileDeleteDialog();
  render();
};

export const handleMobileDeleteDialogCancel = (deps) => {
  handleMobileDeleteDialogClose(deps);
};

export const handleMobileDeleteDialogConfirm = async (deps) => {
  const { store, render } = deps;
  const itemId = store.selectMobileDeleteDialogItemId();

  store.closeMobileDeleteDialog();
  render();

  if (!itemId) {
    return;
  }

  await handleItemDelete(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: SOUND_FILE_ACCEPT,
      multiple: true,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedSelectFiles,
    });
    return;
  }

  if (!files?.length) {
    return;
  }

  if (!validateSoundFiles({ appService, files, copy })) {
    return;
  }

  await createSoundsFromFiles({
    deps,
    files,
    parentId: resolveResourceParentId(groupId),
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const { files, rejectedFiles, targetGroupId } = payload._event.detail;

  if ((!files || files.length === 0) && (rejectedFiles?.length ?? 0) > 0) {
    showUnsupportedFormatToast(appService, copy);
    return;
  }

  await createSoundsFromFiles({
    deps,
    files,
    parentId: targetGroupId ?? undefined,
  });
};

export const handleFilesDropRejected = (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const rejectedFiles = payload._event.detail?.rejectedFiles ?? [];

  if (rejectedFiles.length === 0) {
    return;
  }

  showUnsupportedFormatToast(appService, copy);
};

export const handleEditDialogSoundClick = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);

  const result = await pickAndUploadSound({ appService, projectService, copy });
  if (result.cancelled) {
    return;
  }

  if (result.errorType === "pick-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: copy.failedSelectFile,
    });
    return;
  }

  if (result.errorType === "validation-failed") {
    return;
  }

  if (result.errorType === "upload-failed") {
    showUnsupportedFormatToast(
      appService,
      copy,
      getResourcePageErrorMessage(result.error, copy.unsupportedFormatMessage),
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
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.nameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  const editUploadResult = store.selectEditUploadResult();
  if (!editItemId) {
    handleEditDialogClose(deps);
    return;
  }

  const soundPatch = editUploadResult
    ? buildSoundResourcePatchFromUploadResult(editUploadResult)
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateSound,
    action: () =>
      projectService.updateSound({
        soundId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          name,
          description: values?.description ?? "",
          tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
          ...soundPatch,
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  handleEditDialogClose(deps);
  await handleDataChanged(deps);
};

export const handleAudioPlayerClose = (deps) => {
  const { store, render } = deps;
  store.closeAudioPlayer();
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render, store } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;

  const result = await projectService.deleteSoundIfUnused({
    soundId: itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (!result.deleted) {
    appService.showAlert({
      message: result.usage?.isUsed
        ? copy.cannotDeleteResourceInUse
        : copy.failedDeleteResource,
    });
    render();
    return;
  }

  if (store?.selectSelectedItemId?.() === itemId) {
    store.setSelectedItemId({ itemId: undefined });
  }

  await handleDataChanged(deps);
};
