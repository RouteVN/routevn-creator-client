import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "./support/fontInfoExtractor.js";
import { getFileType } from "../../internal/fileTypes.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { processWithConcurrency } from "../../internal/processWithConcurrency.js";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";

const FONT_FILE_PATTERN = /\.(ttf|otf|woff|woff2|ttc|eot)$/i;
const FONT_FILE_ACCEPT = ".ttf,.otf,.woff,.woff2,.ttc,.eot";
const MAX_PARALLEL_UPLOADS = 1;
const CREATE_FONT_ABORT_ERROR = "create-font-abort";

const showInvalidFormatToast = (appService) => {
  appService.showToast(
    "Invalid file format. Please upload a font file (.ttf, .otf, .woff, .woff2, .ttc, or .eot)",
    { title: "Warning" },
  );
};

const validateFontFiles = ({ appService, files } = {}) => {
  const invalidFiles = Array.from(files ?? []).filter(
    (file) => !file.name.match(FONT_FILE_PATTERN),
  );

  if (invalidFiles.length > 0) {
    showInvalidFormatToast(appService);
    return false;
  }

  return true;
};

const pickAndUploadFont = async ({ appService, projectService } = {}) => {
  let file;

  try {
    file = await appService.pickFiles({
      accept: FONT_FILE_ACCEPT,
      multiple: false,
    });
  } catch (error) {
    return { error, errorType: "pick-failed" };
  }

  if (!file) {
    return { cancelled: true };
  }

  if (!validateFontFiles({ appService, files: [file] })) {
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

const createPendingUploads = ({ files, parentId } = {}) => {
  if (!parentId) {
    return [];
  }

  return (Array.isArray(files) ? files : []).map((file) => ({
    id: `pending-font-${nanoid()}`,
    file,
    parentId,
    name: file.name.replace(/\.[^.]+$/, ""),
  }));
};

const createFontAbortError = () => {
  const error = new Error(CREATE_FONT_ABORT_ERROR);
  error.code = CREATE_FONT_ABORT_ERROR;
  return error;
};

const createFontsFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService, store, render } = deps;
  if (!validateFontFiles({ appService, files })) {
    return;
  }

  const pendingUploads = createPendingUploads({ files, parentId });
  const remainingPendingUploadIds = new Set(
    pendingUploads.map((item) => item.id),
  );
  const pendingUploadIdByFile = new Map(
    pendingUploads.map((item) => [item.file, item.id]),
  );
  const removePendingUploads = (itemIds) => {
    const normalizedItemIds = (itemIds ?? []).filter((itemId) =>
      remainingPendingUploadIds.has(itemId),
    );
    if (normalizedItemIds.length === 0) {
      return;
    }

    store.removePendingUploads({ itemIds: normalizedItemIds });
    normalizedItemIds.forEach((itemId) =>
      remainingPendingUploadIds.delete(itemId),
    );
    render();
  };

  if (pendingUploads.length > 0) {
    store.addPendingUploads({
      items: pendingUploads.map((item) => ({
        id: item.id,
        parentId: item.parentId,
        name: item.name,
      })),
    });
    render();
  }

  let successfulUploadCount = 0;
  let createdCount = 0;

  try {
    await processWithConcurrency(
      Array.isArray(files) ? files : [],
      async (file) => {
        const pendingUploadId = pendingUploadIdByFile.get(file);
        const uploadResults = await projectService.uploadFiles([file]);
        const uploadResult = uploadResults?.[0];

        if (!uploadResult) {
          removePendingUploads([pendingUploadId]);
          return { ok: false, reason: "upload-failed" };
        }

        successfulUploadCount += 1;

        const createAttempt = await runResourcePageMutation({
          appService,
          fallbackMessage: "Failed to create font.",
          action: () =>
            projectService.createFont({
              fontId: nanoid(),
              fileRecords: uploadResult.fileRecords,
              data: {
                type: "font",
                fileId: uploadResult.fileId,
                name: uploadResult.displayName,
                description: "",
                fontFamily: uploadResult.fontName,
                fileType: getFileType(uploadResult),
                fileSize: uploadResult.file.size,
              },
              parentId,
              position: "last",
            }),
        });

        removePendingUploads([pendingUploadId]);

        if (!createAttempt.ok) {
          throw createFontAbortError();
        }

        createdCount += 1;
        await handleDataChanged(deps);
        return { ok: true };
      },
      {
        concurrency: MAX_PARALLEL_UPLOADS,
        stopOnError: true,
      },
    );
  } catch (error) {
    removePendingUploads([...remainingPendingUploadIds]);
    if (error?.code === CREATE_FONT_ABORT_ERROR) {
      return;
    }

    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload font.",
    });
    return;
  }

  if (successfulUploadCount === 0) {
    appService.showToast("Failed to upload font.", { title: "Error" });
    return;
  }

  if (createdCount > 0) {
    await handleDataChanged(deps);
  }
};

const loadFontInfo = async (deps, { itemId } = {}) => {
  const { store, projectService, appService } = deps;
  if (!itemId) {
    return undefined;
  }

  const cachedFontInfo = store.getState().fontInfoById[itemId];
  if (cachedFontInfo) {
    return cachedFontInfo;
  }

  const fontItem = store.selectFontItemById({ itemId });
  if (!fontItem) {
    return undefined;
  }

  const fontInfoExtractor = createFontInfoExtractor({
    getFileContent: (fileId) => projectService.getFileContent(fileId),
    loadFont: (fontName, fontUrl) => appService.loadFont(fontName, fontUrl),
  });
  const fontInfo = await fontInfoExtractor.extractFontInfo(fontItem);

  store.cacheFontInfo({ itemId, fontInfo });
  return fontInfo;
};

const {
  handleBeforeMount,
  openEditDialogWithValues,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged: handleBaseFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleBaseFontItemClick,
  handleItemEdit: handleFontItemEdit,
} = createMediaPageHandlers({
  resourceType: "fonts",
  selectItemById: (store, { itemId }) => store.selectFontItemById({ itemId }),
  getEditValues: (item) => ({
    name: item?.name ?? "",
    description: item?.description ?? "",
  }),
  getEditPreviewFileId: (item) => item?.fileId,
});

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export {
  handleBeforeMount,
  handleDataChanged,
  handleSearchInput,
  handleFontItemEdit,
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
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: FONT_FILE_ACCEPT,
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

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  openEditDialogWithValues({ deps, itemId: selectedItemId });
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditDialogFontClick = async (deps) => {
  const { appService, projectService, store, render } = deps;

  const result = await pickAndUploadFont({ appService, projectService });
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

  if (result.errorType === "validation-failed") {
    return;
  }

  if (result.errorType === "upload-failed") {
    showResourcePageError({
      appService,
      errorOrResult: result.error,
      fallbackMessage: "Failed to upload font.",
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
  const { appService, projectService, store, render } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showToast("Font name is required.", { title: "Warning" });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const editUploadResult = store.getState().editUploadResult;
  const fontPatch = editUploadResult
    ? {
        fileId: editUploadResult.fileId,
        fontFamily: editUploadResult.fontName,
        fileType: getFileType(editUploadResult),
        fileSize: editUploadResult.file.size,
      }
    : {};

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update font.",
    action: () =>
      projectService.updateFont({
        fontId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data: {
          name,
          description: values?.description ?? "",
          ...fontPatch,
        },
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
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

export const handleCloseModal = (deps) => {
  const { store, render } = deps;
  store.setModalOpen({ isOpen: false });
  store.setPreviewFontItemId({ itemId: undefined });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService, appService, render } = deps;
  const { itemId } = payload._event.detail;

  const usage = recursivelyCheckResource({
    state: projectService.getState(),
    itemId,
    checkTargets: ["textStyles"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await projectService.deleteFonts({
    fontIds: [itemId],
  });

  await handleDataChanged(deps);
};
