import { generateId } from "../../internal/id.js";
import { isVisualTestMode } from "../../internal/visualTestMode.js";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import {
  getMediaPageData,
  resolveResourceParentId,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { processPendingUploads } from "../../internal/ui/resourcePages/media/processPendingUploads.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  buildVideoResourceDataFromUploadResult,
  buildVideoResourcePatchFromUploadResult,
} from "../../deps/services/shared/resourceImports.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { VIDEO_TAG_SCOPE_KEY } from "./videos.store.js";
import { selectVideosPageCopy } from "./support/videosPageCopy.js";

const VIDEO_FILE_PATTERN = /\.(mp4)$/i;
const VT_VIDEO_PREVIEW_TIME_S = 0.75;

const isVideoElement = (value) => value?.tagName === "VIDEO";

const resolveVtVideoPreviewTime = (videoElement) => {
  const duration = Number(videoElement?.duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(VT_VIDEO_PREVIEW_TIME_S, duration - 0.1));
};

const isNearVideoTime = (videoElement, targetTime) => {
  return Math.abs(Number(videoElement?.currentTime) - targetTime) <= 0.05;
};

const selectCopy = (deps = {}) => selectVideosPageCopy(deps.i18n);

const showInvalidFormatToast = (appService, copy) => {
  appService.showAlert({
    message: copy.invalidFormatMessage,
    title: copy.warningTitle,
  });
};

const validateVideoFiles = ({ appService, files, copy } = {}) => {
  const invalidFiles = Array.from(files ?? []).filter(
    (file) => !file.name.match(VIDEO_FILE_PATTERN),
  );

  if (invalidFiles.length > 0) {
    showInvalidFormatToast(appService, copy);
    return false;
  }

  return true;
};

const pickAndUploadVideo = async ({
  appService,
  projectService,
  copy,
} = {}) => {
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

  if (!validateVideoFiles({ appService, files: [file], copy })) {
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

const createVideosFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);

  if (!validateVideoFiles({ appService, files, copy })) {
    return;
  }

  await processPendingUploads({
    deps,
    files,
    parentId,
    pendingIdPrefix: "pending-video",
    refresh: handleDataChanged,
    processFile: async ({ file, pendingUploadId, removePendingUpload }) => {
      const uploadResults = await projectService.uploadFiles([file]);
      const uploadResult = uploadResults?.[0];

      if (!uploadResult) {
        return false;
      }

      const videoId = generateId();
      store.updatePendingUpload({
        itemId: pendingUploadId,
        updates: {
          resolvedItemId: videoId,
        },
      });

      const createAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: copy.failedCreateVideo,
        action: () =>
          projectService.createVideo({
            videoId,
            fileRecords: uploadResult.fileRecords,
            data: buildVideoResourceDataFromUploadResult(uploadResult),
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
      showResourcePageError({
        appService,
        errorOrResult: error,
        fallbackMessage: copy.failedUploadVideo,
      });
    },
    onNoSuccessfulUploads: () => {
      appService.showAlert({
        message: copy.failedUploadVideo,
        title: copy.errorTitle,
      });
    },
  });
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
  const isVtMode = isVisualTestMode();
  store.setVideoVisible({
    video: {
      url,
      fileType: videoItem.fileType,
      autoplay: !isVtMode,
      muted: isVtMode,
    },
  });
  render();
};

const syncVideoPageData = ({ store, repositoryState } = {}) => {
  const tagsData = getTagsCollection(repositoryState, VIDEO_TAG_SCOPE_KEY);
  const mediaData = getMediaPageData({
    repositoryState,
    resourceType: "videos",
  });

  store.setTagsData({ tagsData });
  store.setItems({
    data: resolveCollectionWithTags({
      collection: mediaData,
      tagsCollection: tagsData,
      itemType: "video",
    }),
  });
};

const {
  openEditDialogWithValues,
  openFolderNameDialogWithValues,
  openCreateTagDialogForMode,
  handleBeforeMount,
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
  handleItemClick: handleVideoItemClick,
  handleItemEdit: handleVideoItemEdit,
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
  resourceType: "videos",
  syncData: syncVideoPageData,
  selectItemById: (store, { itemId }) => store.selectVideoItemById({ itemId }),
  getEditValues: (item) => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
    tagIds: item?.tagIds ?? [],
  }),
  getEditPreviewFileId: (item) => item?.thumbnailFileId,
  copy: ({ i18n }) => selectVideosPageCopy(i18n),
  onEnterKey: ({ deps, selectedItemId }) => {
    void openVideoPreviewById({ deps, itemId: selectedItemId });
  },
  tagging: {
    scopeKey: VIDEO_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateVideo({
        videoId: itemId,
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

export {
  handleBeforeMount,
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
  handleVideoItemClick,
  handleVideoItemEdit,
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

export const handleFileExplorerDoubleClick = async (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }

  await openVideoPreviewById({ deps, itemId });
};

export const handleVideoItemDoubleClick = async (deps, payload) => {
  const { itemId } = payload._event.detail;
  const { refs, store } = deps;
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer?.selectItem?.({ itemId });
  await openVideoPreviewById({ deps, itemId });
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

export const handleVideoPreviewLoadedData = (deps) => {
  const { refs, render, store } = deps;
  const { videoPreviewElement } = refs;

  if (!isVideoElement(videoPreviewElement)) {
    return;
  }

  if (!isVisualTestMode()) {
    store.setVideoPreviewReady({ isVideoPreviewReady: true });
    render();
    return;
  }

  const previewTime = resolveVtVideoPreviewTime(videoPreviewElement);
  videoPreviewElement.pause();

  if (previewTime <= 0 || isNearVideoTime(videoPreviewElement, previewTime)) {
    store.setVideoPreviewReady({ isVideoPreviewReady: true });
    render();
    return;
  }

  try {
    videoPreviewElement.currentTime = previewTime;
  } catch {
    store.setVideoPreviewReady({ isVideoPreviewReady: true });
    render();
  }
};

export const handleVideoPreviewSeeked = (deps) => {
  const { refs, render, store } = deps;
  const { videoPreviewElement } = refs;

  if (isVideoElement(videoPreviewElement)) {
    videoPreviewElement.pause();
  }

  store.setVideoPreviewReady({ isVideoPreviewReady: true });
  render();
};

export const handleVideoItemPreview = async (deps, payload) => {
  const { itemId } = payload._event.detail;
  await openVideoPreviewById({ deps, itemId });
};

export const handleMobileDetailPreviewClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleVideoItemDoubleClick(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

export const handleMobileDetailDeleteClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
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
      accept: ".mp4",
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

  await createVideosFromFiles({
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
    showInvalidFormatToast(appService, copy);
    return;
  }

  await createVideosFromFiles({
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

  showInvalidFormatToast(appService, copy);
};

export const handleOutsideVideoClick = (deps) => {
  const { store, render } = deps;
  store.setVideoNotVisible();
  render();
};

export const handleEditDialogVideoClick = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);

  const result = await pickAndUploadVideo({ appService, projectService, copy });
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
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: copy.failedUploadVideo,
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

  const videoPatch = editUploadResult
    ? buildVideoResourcePatchFromUploadResult(editUploadResult)
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateVideo,
    action: () =>
      projectService.updateVideo({
        videoId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          name,
          description: values?.description ?? "",
          tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
          ...videoPatch,
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  handleEditDialogClose(deps);
  await handleDataChanged(deps);
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;

  const result = await projectService.deleteVideoIfUnused({
    videoId: itemId,
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

  await handleDataChanged(deps);
};
