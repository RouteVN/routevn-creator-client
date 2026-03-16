import { nanoid } from "nanoid";
import { createFontInfoExtractor } from "../../deps/fontInfoExtractor.js";
import { getFileType } from "../../internal/fileTypes.js";
import { recursivelyCheckResource } from "../../internal/project/projection.js";
import { createMediaPageHandlers } from "../../internal/ui/resourcePages/media/createMediaPageHandlers.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";

const FONT_FILE_PATTERN = /\.(ttf|otf|woff|woff2|ttc|eot)$/i;

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

const createFontsFromFiles = async ({ deps, files, parentId } = {}) => {
  const { appService, projectService } = deps;
  if (!validateFontFiles({ appService, files })) {
    return;
  }

  let successfulUploads;
  try {
    successfulUploads = await projectService.uploadFiles(files);
  } catch {
    appService.showToast("Failed to upload font.", { title: "Error" });
    return;
  }

  if (!successfulUploads.length) {
    appService.showToast("Failed to upload font.", { title: "Error" });
    return;
  }

  for (const result of successfulUploads) {
    await projectService.createResourceItem({
      resourceType: "fonts",
      resourceId: nanoid(),
      data: {
        type: "font",
        fileId: result.fileId,
        name: result.displayName,
        fontFamily: result.fontName,
        fileType: getFileType(result),
        fileSize: result.file.size,
      },
      parentId,
      position: "last",
    });
  }

  await handleDataChanged(deps);
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
  } catch {
    appService.showToast("Failed to select files.", { title: "Error" });
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
  } catch {
    appService.showToast("Failed to select file.", { title: "Error" });
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
  } catch {
    appService.showToast("Failed to upload font.", { title: "Error" });
    return;
  }

  const uploadResult = uploadedFiles?.[0];

  if (!uploadResult) {
    appService.showToast("Failed to upload font.", { title: "Error" });
    return;
  }

  await projectService.updateResourceItem({
    resourceType: "fonts",
    resourceId: selectedItem.id,
    data: {
      fileId: uploadResult.fileId,
      name: uploadResult.file.name,
      fontFamily: uploadResult.fontName,
      fileType: getFileType(uploadResult),
      fileSize: uploadResult.file.size,
    },
  });

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
    checkTargets: ["typography"],
  });

  if (usage.isUsed) {
    appService.showToast("Cannot delete resource, it is currently in use.");
    render();
    return;
  }

  await projectService.deleteResourceItem({
    resourceType: "fonts",
    resourceIds: [itemId],
  });

  await handleDataChanged(deps);
};
