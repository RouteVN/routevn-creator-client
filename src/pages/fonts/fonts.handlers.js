import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "../../deps/fontInfoExtractor.js";
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

const {
  handleBeforeMount,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleSearchInput,
  handleItemClick: handleFontItemClick,
} = createMediaPageHandlers({
  resourceType: "fonts",
  selectItemById: (store, { itemId }) => store.selectFontItemById({ itemId }),
});

export { handleFileExplorerAction, handleFileExplorerTargetChanged };

export {
  handleBeforeMount,
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleSearchInput,
  handleFontItemClick,
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: ".ttf,.otf,.woff,.woff2,.ttc,.eot",
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

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store } = deps;
  const selectedItem = store.selectSelectedItem();

  if (!selectedItem) {
    return;
  }

  let file;
  try {
    file = await appService.pickFiles({
      accept: ".ttf,.otf,.woff,.woff2,.ttc,.eot",
      multiple: false,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to select file.",
    });
    return;
  }

  if (!file) {
    return;
  }

  if (!validateFontFiles({ appService, files: [file] })) {
    return;
  }

  let uploadedFiles;
  try {
    uploadedFiles = await projectService.uploadFiles([file]);
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload font.",
    });
    return;
  }

  const uploadResult = uploadedFiles?.[0];

  if (!uploadResult) {
    appService.showToast("Failed to upload font.", { title: "Error" });
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update font.",
    action: () =>
      projectService.updateFont({
        fontId: selectedItem.id,
        fileRecords: uploadResult.fileRecords,
        data: {
          fileId: uploadResult.fileId,
          name: uploadResult.file.name,
          fontFamily: uploadResult.fontName,
          fileType: getFileType(uploadResult),
          fileSize: uploadResult.file.size,
        },
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

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

  const fontInfoExtractor = createFontInfoExtractor({
    getFileContent: (fileId) => projectService.getFileContent(fileId),
    loadFont: (fontName, fontUrl) => appService.loadFont(fontName, fontUrl),
  });
  const fontInfo = await fontInfoExtractor.extractFontInfo(fontItem);

  store.setSelectedFontInfo({ fontInfo });
  store.setModalOpen({ isOpen: true });
  render();
};

export const handleCloseModal = (deps) => {
  const { store, render } = deps;
  store.setModalOpen({ isOpen: false });
  store.setSelectedFontInfo({ fontInfo: undefined });
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
