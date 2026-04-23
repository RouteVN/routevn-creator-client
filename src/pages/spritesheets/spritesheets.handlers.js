import { generateId } from "../../internal/id.js";
import { tap } from "rxjs";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import {
  appendTagIdToForm,
  createResourcePageTagHandlers,
} from "../../internal/ui/resourcePages/tags.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import {
  getSpritesheetDisplayName,
  normalizeSizeInput,
  parseSpritesheetAtlasFile,
  parseSpritesheetImport,
} from "./support/spritesheetAtlas.js";
import { withResolvedCollectionFileMetadata } from "../../internal/resourceFileMetadata.js";
import { SPRITESHEET_TAG_SCOPE_KEY } from "./spritesheets.store.js";

const EMPTY_TREE = { items: {}, tree: [] };
const SPRITESHEET_IMAGE_FILE_ACCEPT = ".png";
const SPRITESHEET_ATLAS_FILE_ACCEPT = ".json";
const PNG_FILE_PATTERN = /\.png$/i;
const JSON_FILE_PATTERN = /\.json$/i;
const INVALID_IMPORT_FORMAT_MESSAGE =
  "Only PNG spritesheets and JSON atlas files are supported.";
const INVALID_IMPORT_PAIR_MESSAGE =
  "Spritesheet import requires exactly one PNG image and one JSON atlas.";

const showInvalidImportFormatToast = (appService) => {
  appService.showAlert({
    message: INVALID_IMPORT_FORMAT_MESSAGE,
    title: "Warning",
  });
};

const showInvalidImportPairToast = (appService) => {
  appService.showAlert({
    message: INVALID_IMPORT_PAIR_MESSAGE,
    title: "Warning",
  });
};

const revokeDialogPreviewUrl = (store) => {
  const dialogPreviewUrl = store.selectDialogPreviewUrl?.();
  if (
    typeof dialogPreviewUrl === "string" &&
    dialogPreviewUrl.startsWith("blob:")
  ) {
    URL.revokeObjectURL(dialogPreviewUrl);
  }
};

const syncDialogFormValues = ({ refs, values } = {}) => {
  refs.dialogForm?.reset?.();
  refs.dialogForm?.setValues?.({ values });
};

const syncSpritesheetData = ({ store, repositoryState } = {}) => {
  const tagsData = getTagsCollection(repositoryState, SPRITESHEET_TAG_SCOPE_KEY);
  store.setItems({
    data: resolveCollectionWithTags({
      collection: withResolvedCollectionFileMetadata({
        collection: repositoryState?.spritesheets ?? EMPTY_TREE,
        files: repositoryState?.files,
        resourceTypes: ["spritesheet"],
      }),
      tagsCollection: tagsData,
      itemType: "spritesheet",
    }),
  });
  store.setTagsData({ tagsData });

  const selectedItemId = store.selectSelectedItemId();
  if (selectedItemId && !store.selectItemById({ itemId: selectedItemId })) {
    store.setSelectedItemId({ itemId: undefined });
  }
};

const refreshSpritesheetData = async (deps, { selectedItemId } = {}) => {
  const { projectService, refs, render, store } = deps;
  syncSpritesheetData({
    store,
    repositoryState: projectService.getRepositoryState(),
  });

  if (selectedItemId && store.selectItemById({ itemId: selectedItemId })) {
    store.setSelectedItemId({ itemId: selectedItemId });
  }

  render();

  if (selectedItemId && store.selectItemById({ itemId: selectedItemId })) {
    refs.fileExplorer?.selectItem?.({ itemId: selectedItemId });
    refs.groupview?.scrollItemIntoView?.({ itemId: selectedItemId });
  }
};

const resolveImportPair = (files = []) => {
  const normalizedFiles = Array.from(files ?? []).filter(Boolean);

  if (normalizedFiles.length !== 2) {
    return undefined;
  }

  const pngFiles = normalizedFiles.filter((file) =>
    PNG_FILE_PATTERN.test(file?.name ?? ""),
  );
  const atlasFiles = normalizedFiles.filter((file) =>
    JSON_FILE_PATTERN.test(file?.name ?? ""),
  );

  if (pngFiles.length !== 1 || atlasFiles.length !== 1) {
    return undefined;
  }

  return {
    pngFile: pngFiles[0],
    atlasFile: atlasFiles[0],
  };
};

const parseImportSelection = async ({ appService, files } = {}) => {
  const importPair = resolveImportPair(files);
  if (!importPair) {
    showInvalidImportPairToast(appService);
    return undefined;
  }

  try {
    const importData = await parseSpritesheetImport(importPair);
    return {
      ...importData,
      pngFile: importPair.pngFile,
      atlasFile: importPair.atlasFile,
    };
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to import spritesheet atlas.",
    });
    return undefined;
  }
};

const resolveDialogValue = (...values) => {
  return values.find((value) => value !== undefined && value !== "");
};

const buildDialogValues = ({ item, importData, currentValues } = {}) => {
  const name = resolveDialogValue(
    currentValues?.name,
    item?.name,
    importData?.suggestedName,
    currentValues?.pngFileName
      ? getSpritesheetDisplayName(currentValues.pngFileName)
      : undefined,
    "",
  );
  const description = currentValues?.description ?? item?.description ?? "";

  return {
    name,
    description,
    tagIds: currentValues?.tagIds ?? item?.tagIds ?? [],
    width: resolveDialogValue(
      importData?.defaultWidth,
      currentValues?.width,
      item?.width,
      "",
    ),
    height: resolveDialogValue(
      importData?.defaultHeight,
      currentValues?.height,
      item?.height,
      "",
    ),
  };
};

const openCreateDialog = ({
  deps,
  importData,
  parentId,
  previewUrl,
  sourceFiles,
} = {}) => {
  const { refs, render, store } = deps;
  revokeDialogPreviewUrl(store);

  const values = buildDialogValues({
    importData,
    currentValues: {
      pngFileName: sourceFiles?.pngFile?.name,
    },
  });
  store.openCreateDialog({
    parentId,
    values,
    importData,
    previewUrl,
    sourceFiles,
  });
  render();
  syncDialogFormValues({ refs, values });
};

const openEditDialogForItem = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  revokeDialogPreviewUrl(store);

  const values = buildDialogValues({ item });
  store.setSelectedItemId({ itemId });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.openEditDialog({
    itemId,
    values,
  });
  render();
  syncDialogFormValues({ refs, values });
};

const openPreviewDialogForItem = ({
  deps,
  itemId,
  syncExplorer = false,
} = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  revokeDialogPreviewUrl(store);

  const values = buildDialogValues({ item });
  store.setSelectedItemId({ itemId });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.openPreviewDialog({
    itemId,
    values,
  });
  render();
};

const pickSourceFile = async ({ appService, accept } = {}) => {
  return appService.pickFiles({
    accept,
    multiple: false,
  });
};

const applyDialogSourceFiles = async ({
  deps,
  nextPngFile,
  nextAtlasFile,
} = {}) => {
  const { appService, refs, render, store } = deps;
  const currentSourceFiles = store.selectDialogSourceFiles();
  const sourceFiles = {
    pngFile:
      nextPngFile !== undefined ? nextPngFile : currentSourceFiles?.pngFile,
    atlasFile:
      nextAtlasFile !== undefined
        ? nextAtlasFile
        : currentSourceFiles?.atlasFile,
  };
  const existingItem = store.selectItemById({
    itemId: store.selectDialogItemId(),
  });

  let importData;
  try {
    if (sourceFiles.atlasFile) {
      importData = sourceFiles.pngFile
        ? await parseSpritesheetImport({
            pngFile: sourceFiles.pngFile,
            atlasFile: sourceFiles.atlasFile,
          })
        : await parseSpritesheetAtlasFile({
            atlasFile: sourceFiles.atlasFile,
          });
    }
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to read spritesheet source files.",
    });
    return;
  }

  revokeDialogPreviewUrl(store);

  const previewUrl = sourceFiles.pngFile
    ? URL.createObjectURL(sourceFiles.pngFile)
    : undefined;
  const values = buildDialogValues({
    item: existingItem,
    importData,
    currentValues: {
      ...store.selectDialogValues(),
      pngFileName: sourceFiles.pngFile?.name,
    },
  });

  store.setDialogImport({
    importData,
    previewUrl,
    values,
    sourceFiles,
  });
  render();
  syncDialogFormValues({ refs, values });
};

const buildSpritesheetPayload = ({
  existingItem,
  importData,
  uploadResult,
  values,
} = {}) => {
  const width = normalizeSizeInput(values?.width);
  const height = normalizeSizeInput(values?.height);
  const payload = {
    name: values?.name?.trim() ?? "",
    description: values?.description ?? "",
    tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
    fileId: uploadResult?.fileId ?? existingItem?.fileId,
    width,
    height,
    jsonData: importData?.jsonData ?? existingItem?.jsonData ?? {},
    animations: importData?.animations ?? existingItem?.animations ?? {},
  };

  const thumbnailFileId =
    uploadResult?.thumbnailFileId ?? existingItem?.thumbnailFileId;
  if (thumbnailFileId !== undefined) {
    payload.thumbnailFileId = thumbnailFileId;
  }

  const sheetWidth =
    importData?.sheetWidth ??
    uploadResult?.dimensions?.width ??
    existingItem?.sheetWidth ??
    existingItem?.jsonData?.meta?.size?.w;
  if (sheetWidth !== undefined) {
    payload.sheetWidth = sheetWidth;
  }

  const sheetHeight =
    importData?.sheetHeight ??
    uploadResult?.dimensions?.height ??
    existingItem?.sheetHeight ??
    existingItem?.jsonData?.meta?.size?.h;
  if (sheetHeight !== undefined) {
    payload.sheetHeight = sheetHeight;
  }

  const frameCount =
    importData?.frameCount ??
    existingItem?.frameCount ??
    Object.keys(existingItem?.jsonData?.frames ?? {}).length;
  if (frameCount !== undefined) {
    payload.frameCount = frameCount;
  }

  return payload;
};

const uploadSpritesheetSource = async ({
  appService,
  pngFile,
  projectService,
} = {}) => {
  if (!pngFile) {
    return undefined;
  }

  try {
    const uploadedFiles = await projectService.uploadFiles([pngFile]);
    return uploadedFiles?.[0];
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to upload spritesheet image.",
    });
    return null;
  }
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createResourceFileExplorerHandlers({
    resourceType: "spritesheets",
    refresh: refreshSpritesheetData,
  });
const {
  focusKeyboardScope: focusFileExplorerKeyboardScope,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers();

export {
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
};

export const handleBeforeMount = (deps) => {
  const { projectService, store } = deps;
  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        const { render } = deps;
        syncSpritesheetData({
          store,
          repositoryState,
        });
        render();
      }),
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
    revokeDialogPreviewUrl(store);
  };
};

export const handleAfterMount = (deps) => {
  focusFileExplorerKeyboardScope(deps);
};

export const handleDataChanged = refreshSpritesheetData;

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  const { refs, render, store } = deps;
  const { isFolder, itemId } = payload._event.detail;

  if (isFolder) {
    store.setSelectedItemId({ itemId: undefined });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  render();
  refs.groupview?.scrollItemIntoView?.({ itemId });
  focusFileExplorerKeyboardScope(deps);
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { isFolder, itemId } = payload._event.detail;
  if (isFolder) {
    return;
  }

  openPreviewDialogForItem({ deps, itemId });
};

export const handleSpritesheetItemClick = (deps, payload) => {
  const { refs, render, store } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  store.setSelectedItemId({ itemId });
  refs.fileExplorer?.selectItem?.({ itemId });
  render();
};

export const handleSpritesheetItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openPreviewDialogForItem({
    deps,
    itemId,
    syncExplorer: true,
  });
};

export const handleSpritesheetItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogForItem({
    deps,
    itemId,
    syncExplorer: true,
  });
};

export const handleDetailHeaderClick = (deps) => {
  openEditDialogForItem({
    deps,
    itemId: deps.store.selectSelectedItemId(),
  });
};

export const handleSearchInput = (deps, payload) => {
  const { render, store } = deps;
  store.setSearchQuery({ value: payload._event.detail.value ?? "" });
  render();
};

export const handleAddClick = (deps, payload) => {
  const { groupId } = payload._event.detail;
  openCreateDialog({
    deps,
    parentId: resolveResourceParentId(groupId),
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { appService } = deps;
  const { files, rejectedFiles, targetGroupId } = payload._event.detail;

  if ((rejectedFiles?.length ?? 0) > 0) {
    showInvalidImportFormatToast(appService);
    return;
  }

  const importData = await parseImportSelection({
    appService,
    files,
  });
  if (!importData) {
    return;
  }

  openCreateDialog({
    deps,
    importData,
    parentId: resolveResourceParentId(targetGroupId),
    previewUrl: URL.createObjectURL(importData.pngFile),
    sourceFiles: {
      pngFile: importData.pngFile,
      atlasFile: importData.atlasFile,
    },
  });
};

export const handleFilesDropRejected = (deps, payload) => {
  const { appService } = deps;
  if ((payload._event.detail?.rejectedFiles?.length ?? 0) === 0) {
    return;
  }

  showInvalidImportFormatToast(appService);
};

export const handleDialogClose = (deps) => {
  const { render, store } = deps;
  revokeDialogPreviewUrl(store);
  store.closeDialog();
  render();
};

export const handleDialogImageSourceClick = async (deps) => {
  const { appService } = deps;
  let file;

  try {
    file = await pickSourceFile({
      appService,
      accept: SPRITESHEET_IMAGE_FILE_ACCEPT,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to select image.",
    });
    return;
  }

  if (!file) {
    return;
  }

  await applyDialogSourceFiles({
    deps,
    nextPngFile: file,
  });
};

export const handleDialogAtlasSourceClick = async (deps) => {
  const { appService } = deps;
  let file;

  try {
    file = await pickSourceFile({
      appService,
      accept: SPRITESHEET_ATLAS_FILE_ACCEPT,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: "Failed to select JSON file.",
    });
    return;
  }

  if (!file) {
    return;
  }

  await applyDialogSourceFiles({
    deps,
    nextAtlasFile: file,
  });
};

export const handleDialogFormChange = (deps, payload) => {
  const { render, store } = deps;
  const { name, value, values } = payload._event.detail;
  const nextValues = {
    ...values,
  };

  if (name) {
    nextValues[name] = value ?? "";
  }

  store.setDialogValues({
    values: nextValues,
  });
  render();
};

export const handleDialogFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "form",
    itemId: deps.store.selectDialogItemId(),
  });
};

export const handleDialogFormAction = async (deps, payload) => {
  const { appService, projectService, render, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Spritesheet name is required.",
      title: "Warning",
    });
    return;
  }

  const dialogMode = store.selectDialogMode();
  const dialogItemId = store.selectDialogItemId();
  const dialogParentId = store.selectDialogParentId();
  const importData = store.selectDialogImportData();
  const dialogSourceFiles = store.selectDialogSourceFiles();
  const existingItem = dialogItemId
    ? store.selectItemById({ itemId: dialogItemId })
    : undefined;

  if (dialogMode === "create" && !dialogSourceFiles?.pngFile) {
    appService.showAlert({
      message: "Spritesheet image is required.",
      title: "Warning",
    });
    return;
  }

  if (dialogMode === "create" && !dialogSourceFiles?.atlasFile) {
    appService.showAlert({
      message: "Atlas JSON is required.",
      title: "Warning",
    });
    return;
  }

  const uploadResult = await uploadSpritesheetSource({
    appService,
    pngFile: dialogSourceFiles?.pngFile,
    projectService,
  });
  if (uploadResult === null) {
    return;
  }

  if (dialogMode === "create" && !uploadResult) {
    appService.showAlert({
      message: "Failed to upload spritesheet image.",
      title: "Error",
    });
    return;
  }

  const spritesheetData = buildSpritesheetPayload({
    existingItem,
    importData,
    uploadResult,
    values,
  });

  if (dialogMode === "create") {
    const spritesheetId = generateId();
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to create spritesheet.",
      action: () =>
        projectService.createSpritesheet({
          spritesheetId,
          fileRecords: uploadResult?.fileRecords,
          data: {
            type: "spritesheet",
            ...spritesheetData,
          },
          parentId: dialogParentId,
          position: "last",
        }),
    });

    if (!createAttempt.ok) {
      return;
    }

    revokeDialogPreviewUrl(store);
    store.closeDialog();
    render();
    await refreshSpritesheetData(deps, {
      selectedItemId: spritesheetId,
    });
    return;
  }

  if (!dialogItemId || !existingItem) {
    appService.showAlert({ message: "Spritesheet not found.", title: "Error" });
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update spritesheet.",
    action: () =>
      projectService.updateSpritesheet({
        spritesheetId: dialogItemId,
        fileRecords: uploadResult?.fileRecords,
        data: spritesheetData,
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  revokeDialogPreviewUrl(store);
  store.closeDialog();
  render();
  await refreshSpritesheetData(deps, {
    selectedItemId: dialogItemId,
  });
};

export const handleDetailClipClick = (deps, payload) => {
  const clipName = payload._event.currentTarget.dataset.clipName;
  if (!clipName) {
    return;
  }

  const { render, store } = deps;
  store.setDetailSelectedClipName({ clipName });
  render();
};

export const handleDialogClipClick = (deps, payload) => {
  const clipName = payload._event.currentTarget.dataset.clipName;
  if (!clipName) {
    return;
  }

  const { render, store } = deps;
  store.setDialogSelectedClipName({ clipName });
  render();
};

const {
  openCreateTagDialogForMode,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createResourcePageTagHandlers({
  resolveScopeKey: () => SPRITESHEET_TAG_SCOPE_KEY,
  updateItemTagIds: ({ deps, itemId, tagIds }) =>
    deps.projectService.updateSpritesheet({
      spritesheetId: itemId,
      data: {
        tagIds,
      },
    }),
  refreshAfterItemTagUpdate: ({ deps, itemId }) =>
    refreshSpritesheetData(deps, { selectedItemId: itemId }),
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    if (mode !== "form") {
      return;
    }

    appendTagIdToForm({
      form: deps.refs.dialogForm,
      tagId,
    });
  },
  updateItemTagFallbackMessage: "Failed to update spritesheet tags.",
});

export {
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleTagFilterAddOptionClick,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const usage = await projectService.checkResourceUsage({
    itemId,
    checkTargets: ["scenes", "layouts", "controls"],
  });

  if (usage.isUsed) {
    appService.showAlert({
      message: "Cannot delete resource, it is currently in use.",
    });
    return;
  }

  const deleteAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to delete spritesheet.",
    action: () =>
      projectService.deleteSpritesheets({
        spritesheetIds: [itemId],
      }),
  });

  if (!deleteAttempt.ok) {
    return;
  }

  await refreshSpritesheetData(deps);
};
