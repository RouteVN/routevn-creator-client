import { generateId } from "../../internal/id.js";
import { createFontInfoExtractor } from "./support/fontInfoExtractor.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { processPendingUploads } from "../../internal/ui/resourcePages/media/processPendingUploads.js";
import {
  buildFontResourceDataFromUploadResult,
  buildFontResourcePatchFromUploadResult,
} from "../../deps/services/shared/resourceImports.js";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import {
  getMediaPageData,
  resolveResourceParentId,
} from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { FONT_TAG_SCOPE_KEY } from "./fonts.store.js";
import { selectFontsPageCopy } from "./support/fontsPageCopy.js";
import {
  inspectNewFontFile,
  NEW_FONT_FILE_ACCEPT,
} from "../../internal/fontCapabilities.js";

const MAX_PARALLEL_UPLOADS = 1;

const selectCopy = (deps = {}) => selectFontsPageCopy(deps.i18n);

const showInvalidFormatToast = (appService, copy = {}) => {
  appService.showAlert({
    message:
      copy.invalidFormatMessage ??
      "Invalid file format. Please upload a TTF, OTF, or WOFF2 font file.",
    title: copy.warningTitle ?? "Warning",
  });
};

const showInvalidFontToast = (appService, copy = {}) => {
  appService.showAlert({
    message:
      copy.invalidFontMessage ??
      "Could not read the font's supported weights. Please choose a valid TTF, OTF, or WOFF2 font.",
    title: copy.warningTitle ?? "Warning",
  });
};

const inspectFontFiles = async ({ appService, files, copy } = {}) => {
  const capabilitiesByFile = new Map();
  for (const file of Array.from(files ?? [])) {
    try {
      capabilitiesByFile.set(file, await inspectNewFontFile(file));
    } catch (error) {
      if (error?.code === "unsupported_font_format") {
        showInvalidFormatToast(appService, copy);
      } else {
        showInvalidFontToast(appService, copy);
      }
      return undefined;
    }
  }

  return capabilitiesByFile;
};

const pickAndUploadFont = async ({ appService, projectService, copy } = {}) => {
  let file;

  try {
    file = await appService.pickFiles({
      accept: NEW_FONT_FILE_ACCEPT,
      multiple: false,
    });
  } catch (error) {
    return { error, errorType: "pick-failed" };
  }

  if (!file) {
    return { cancelled: true };
  }

  const capabilitiesByFile = await inspectFontFiles({
    appService,
    files: [file],
    copy,
  });
  if (!capabilitiesByFile) {
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

  uploadResult.fontCapabilities = capabilitiesByFile.get(file);
  return { uploadResult };
};

const createFontsFromFiles = async ({ deps, files, parentId } = {}) => {
  const copy = selectCopy(deps);
  const { appService, projectService, store } = deps;
  const capabilitiesByFile = await inspectFontFiles({
    appService,
    files,
    copy,
  });
  if (!capabilitiesByFile) {
    return;
  }

  await processPendingUploads({
    deps,
    files,
    parentId,
    pendingIdPrefix: "pending-font",
    concurrency: MAX_PARALLEL_UPLOADS,
    refresh: handleDataChanged,
    processFile: async ({ file, pendingUploadId, removePendingUpload }) => {
      const uploadResults = await projectService.uploadFiles([file]);
      const uploadResult = uploadResults?.[0];

      if (!uploadResult) {
        throw new Error("upload-failed");
      }
      uploadResult.fontCapabilities = capabilitiesByFile.get(file);

      const fontId = generateId();
      store.updatePendingUpload({
        itemId: pendingUploadId,
        updates: {
          resolvedItemId: fontId,
        },
      });

      const createAttempt = await runResourcePageMutation({
        appService,
        fallbackMessage: copy.failedCreateFont ?? "Failed to create font.",
        action: () =>
          projectService.createFont({
            fontId,
            fileRecords: uploadResult.fileRecords,
            data: buildFontResourceDataFromUploadResult({
              uploadResult,
              fontFamily: uploadResult.fontName,
            }),
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
        fallbackMessage: copy.failedUploadFont ?? "Failed to upload font.",
      });
    },
    onNoSuccessfulUploads: () => {
      appService.showAlert({
        message: copy.failedUploadFont ?? "Failed to upload font.",
        title: copy.errorTitle ?? "Error",
      });
    },
  });
};

const loadFontInfo = async (deps, { itemId } = {}) => {
  const { store, projectService, appService } = deps;
  if (!itemId) {
    return undefined;
  }

  const cachedFontInfo = store.selectCachedFontInfo({ itemId });
  if (cachedFontInfo) {
    return cachedFontInfo;
  }

  const fontItem = store.selectFontItemById({ itemId });
  if (!fontItem) {
    return undefined;
  }

  const fontInfoExtractor = createFontInfoExtractor({
    getFileContent: (fileId) => projectService.getFileContent(fileId),
    loadFont: (fontName, fontUrl, options) =>
      appService.loadFont(fontName, fontUrl, options),
  });
  const fontInfo = await fontInfoExtractor.extractFontInfo(fontItem);

  store.cacheFontInfo({ itemId, fontInfo });
  return fontInfo;
};

const syncFontPageData = ({ store, repositoryState } = {}) => {
  const tagsData = getTagsCollection(repositoryState, FONT_TAG_SCOPE_KEY);
  const mediaData = getMediaPageData({
    repositoryState,
    resourceType: "fonts",
  });

  store.setTagsData({ tagsData });
  store.setItems({
    data: resolveCollectionWithTags({
      collection: mediaData,
      tagsCollection: tagsData,
      itemType: "font",
    }),
  });
};

const {
  handleBeforeMount,
  handleAfterMount,
  openEditDialogWithValues,
  openFolderNameDialogWithValues,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged: handleBaseFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleEditDialogClose,
  handleSearchInput,
  handleItemClick: handleBaseFontItemClick,
  handleItemEdit: handleFontItemEdit,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
  openCreateTagDialogForMode,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createMediaPageHandlers({
  resourceType: "fonts",
  copy: ({ i18n }) => selectFontsPageCopy(i18n),
  syncData: syncFontPageData,
  selectItemById: (store, { itemId }) => store.selectFontItemById({ itemId }),
  getEditValues: (item) => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
    tagIds: item?.tagIds ?? [],
  }),
  getEditPreviewFileId: (item) => item?.fileId,
  tagging: {
    scopeKey: FONT_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateFont({
        fontId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags ?? "Failed to update font tags.",
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
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleEditDialogClose,
};

export {
  handleBeforeMount,
  handleAfterMount,
  handleDataChanged,
  handleSearchInput,
  handleFontItemEdit,
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

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  handleBaseFileExplorerSelectionChanged(deps, payload);

  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  await loadFontInfo(deps, { itemId });
  deps.render();
};

export const handleFontItemClick = async (deps, payload) => {
  handleBaseFontItemClick(deps, payload);

  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  await loadFontInfo(deps, { itemId });
  deps.render();
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: NEW_FONT_FILE_ACCEPT,
      multiple: true,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedSelectFiles ?? "Failed to select files.",
    });
    return;
  }

  if (!files?.length) {
    return;
  }

  await createFontsFromFiles({
    deps,
    files,
    parentId: resolveResourceParentId(groupId),
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { files, targetGroupId } = payload._event.detail;

  await createFontsFromFiles({
    deps,
    files,
    parentId: targetGroupId ?? undefined,
  });
};

export const handleFilesDropRejected = (deps, payload) => {
  const rejectedFiles = payload._event.detail?.rejectedFiles ?? [];
  if (rejectedFiles.length === 0) {
    return;
  }

  showInvalidFormatToast(deps.appService, selectCopy(deps));
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

export const handleEditDialogFontClick = async (deps) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);

  const result = await pickAndUploadFont({ appService, projectService, copy });
  if (result.cancelled) {
    return;
  }

  if (result.errorType === "pick-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: copy.failedSelectFile ?? "Failed to select file.",
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
      fallbackMessage: copy.failedUploadFont ?? "Failed to upload font.",
    });
    return;
  }

  store.setEditUpload({
    uploadResult: result.uploadResult,
    previewFileId: result.uploadResult.fileId,
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
      message: copy.nameRequired ?? "Font name is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  if (!editItemId) {
    handleEditDialogClose(deps);
    return;
  }

  const editUploadResult = store.selectEditUploadResult();
  if (editUploadResult?.fontCapabilities?.kind === "unrestricted") {
    const currentFont = store.selectFontItemById({ itemId: editItemId });
    const hasStoredWeightMetadata =
      currentFont?.minWeight !== undefined ||
      currentFont?.defaultWeight !== undefined ||
      currentFont?.maxWeight !== undefined;

    if (hasStoredWeightMetadata) {
      appService.showAlert({
        message:
          copy.unknownWeightReplacementMessage ??
          "This font cannot be replaced because the new file's supported weights could not be read.",
        title: copy.warningTitle ?? "Warning",
      });
      return;
    }
  }

  const fontPatch = editUploadResult
    ? buildFontResourcePatchFromUploadResult({
        uploadResult: editUploadResult,
        fontFamily: editUploadResult.fontName,
      })
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateFont ?? "Failed to update font.",
    action: () =>
      projectService.updateFont({
        fontId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          name,
          description: values?.description ?? "",
          tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
          ...fontPatch,
        },
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  handleEditDialogClose(deps);
  await handleDataChanged(deps);
};

export const handleFontItemDoubleClick = async (deps, payload) => {
  const { store, render, projectService, appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  const fontItem = store.selectFontItemById({ itemId });
  if (!fontItem) {
    return;
  }

  await loadFontInfo({ store, projectService, appService }, { itemId });
  store.setPreviewFontItemId({ itemId });
  store.setModalOpen({ isOpen: true });
  render();
};

export const handleMobileDetailPreviewClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleFontItemDoubleClick(deps, {
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

export const handleCloseModal = (deps) => {
  const { store, render } = deps;
  store.setModalOpen({ isOpen: false });
  store.setPreviewFontItemId({ itemId: undefined });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["textStyles"],
  });

  if (usage.isUsed) {
    appService.showAlert({
      message:
        copy.cannotDeleteResourceInUse ??
        "Cannot delete resource, it is currently in use.",
    });
    render();
    return;
  }

  await projectService.deleteFonts({
    fontIds: [itemId],
  });

  await handleDataChanged(deps);
};
