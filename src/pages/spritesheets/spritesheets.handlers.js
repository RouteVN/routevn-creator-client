import { generateId } from "../../internal/id.js";
import { tap } from "rxjs";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { handleResourceZoomShortcutKeyDown } from "../../internal/ui/resourcePages/zoomShortcuts.js";
import {
  appendTagIdToForm,
  createResourcePageTagHandlers,
} from "../../internal/ui/resourcePages/tags.js";
import {
  closeMobileResourceFileExplorerAfterSelection,
  handleMobileResourceDetailSheetClose,
  handleMobileResourceFileExplorerClose,
  handleMobileResourceFileExplorerOpen,
  shouldSuppressMobileDetailSheetForFileExplorerSelection,
  syncMobileResourcePageUiConfig,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import {
  INITIAL_SPRITESHEET_CLIP_FPS,
  normalizeSpritesheetAnimationsFps,
  normalizeSpritesheetFps,
} from "../../internal/spritesheets.js";
import {
  getSpritesheetDisplayName,
  normalizeSizeInput,
  parseSpritesheetAtlasFile,
  parseSpritesheetImport,
} from "../../internal/spritesheetAtlas.js";
import { withResolvedCollectionFileMetadata } from "../../internal/resourceFileMetadata.js";
import { SPRITESHEET_TAG_SCOPE_KEY } from "./spritesheets.store.js";
import { selectSpritesheetsPageCopy } from "./support/spritesheetsPageCopy.js";

const EMPTY_TREE = { items: {}, tree: [] };
const SPRITESHEET_IMAGE_FILE_ACCEPT = ".png";
const SPRITESHEET_ATLAS_FILE_ACCEPT = ".json";
const PNG_FILE_PATTERN = /\.png$/i;
const JSON_FILE_PATTERN = /\.json$/i;
const selectCopy = (deps = {}) => selectSpritesheetsPageCopy(deps.i18n);

const showInvalidImportFormatToast = (appService, copy = {}) => {
  appService.showAlert({
    message:
      copy.invalidImportFormatMessage ??
      "Only PNG spritesheets and spritesheet JSON files are supported.",
    title: copy.warningTitle ?? "Warning",
  });
};

const showInvalidImportPairToast = (appService, copy = {}) => {
  appService.showAlert({
    message:
      copy.invalidImportPairMessage ??
      "Spritesheet import requires exactly one PNG image and one spritesheet JSON file.",
    title: copy.warningTitle ?? "Warning",
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
  const tagsData = getTagsCollection(
    repositoryState,
    SPRITESHEET_TAG_SCOPE_KEY,
  );
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

const parseImportSelection = async ({ appService, files, copy } = {}) => {
  const importPair = resolveImportPair(files);
  if (!importPair) {
    showInvalidImportPairToast(appService, copy);
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
      fallbackMessage:
        copy.failedImportSpritesheetJson ??
        "Failed to import spritesheet JSON.",
      title: copy.errorTitle ?? "Error",
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
    animations: item.animations,
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

const openFolderNameDialogForFolder = ({ deps, folderId } = {}) => {
  const { refs, render, store } = deps;
  const folder = store.selectFolderById({ folderId });
  if (!folderId || !folder) {
    return;
  }

  const values = {
    name: folder.name ?? "",
    description: folder.description ?? "",
  };

  store.setSelectedFolderId({ folderId });
  refs.fileExplorer?.selectItem?.({ itemId: folderId });
  store.openFolderNameDialog({
    folderId,
    defaultValues: values,
  });
  render();
  refs.folderNameForm?.reset?.();
  refs.folderNameForm?.setValues?.({ values });
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
  const copy = selectCopy(deps);
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
      fallbackMessage:
        copy.failedReadSpritesheetSourceFiles ??
        "Failed to read spritesheet source files.",
      title: copy.errorTitle ?? "Error",
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
  dialogAnimations,
  existingItem,
  importData,
  uploadResult,
  values,
} = {}) => {
  const width = normalizeSizeInput(values?.width);
  const height = normalizeSizeInput(values?.height);
  const sourceAnimations =
    Object.keys(dialogAnimations ?? {}).length > 0
      ? dialogAnimations
      : (importData?.animations ?? existingItem?.animations ?? {});
  const animations = normalizeSpritesheetAnimationsFps(
    sourceAnimations,
    INITIAL_SPRITESHEET_CLIP_FPS,
  );
  const payload = {
    name: values?.name?.trim() ?? "",
    description: values?.description ?? "",
    tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
    fileId: uploadResult?.fileId ?? existingItem?.fileId,
    width,
    height,
    jsonData: importData?.jsonData ?? existingItem?.jsonData ?? {},
    animations,
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
  copy,
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
      fallbackMessage:
        copy.failedUploadSpritesheetImage ??
        "Failed to upload spritesheet image.",
      title: copy.errorTitle ?? "Error",
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
  handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers();

export {
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleMobileResourceFileExplorerOpen as handleMobileFileExplorerOpen,
  handleMobileResourceFileExplorerClose as handleMobileFileExplorerClose,
  handleMobileResourceDetailSheetClose as handleMobileDetailSheetClose,
};

export const handleFileExplorerKeyboardScopeKeyDown = (deps, payload) => {
  if (handleResourceZoomShortcutKeyDown(deps, payload)) {
    return;
  }

  handleBaseFileExplorerKeyboardScopeKeyDown(deps, payload);
};

export const handleBeforeMount = (deps) => {
  const { projectService, store } = deps;
  syncMobileResourcePageUiConfig(deps);
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
    store.setSelectedFolderId({ folderId: itemId });
    render();
    focusFileExplorerKeyboardScope(deps);
    return;
  }

  if (!itemId) {
    return;
  }

  const selectionPayload = { itemId };
  if (shouldSuppressMobileDetailSheetForFileExplorerSelection(deps)) {
    selectionPayload.suppressMobileDetailSheet = true;
  }
  store.setSelectedItemId(selectionPayload);
  closeMobileResourceFileExplorerAfterSelection(deps);
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

export const handleMobileDetailPreviewClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  handleSpritesheetItemDoubleClick(deps, {
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

export const handleSpritesheetItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;
  openEditDialogForItem({
    deps,
    itemId,
    syncExplorer: true,
  });
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  if (selectedItemId) {
    openEditDialogForItem({
      deps,
      itemId: selectedItemId,
    });
    return;
  }

  const selectedFolderId = deps.store.selectSelectedFolderId();
  openFolderNameDialogForFolder({ deps, folderId: selectedFolderId });
};

export const handleFolderNameDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeFolderNameDialog();
  render();
};

export const handleFolderNameFormAction = async (deps, payload) => {
  const { appService, store, render } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  const description = values?.description?.trim() ?? "";
  if (!name) {
    appService.showAlert({
      message: copy.folderNameRequired ?? "Folder name is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const folderId = store.getState().folderNameDialogItemId;
  if (!folderId) {
    store.closeFolderNameDialog();
    render();
    return;
  }

  await handleFileExplorerAction(deps, {
    _event: {
      detail: {
        value: "rename-item-confirmed",
        itemId: folderId,
        newName: name,
        description,
      },
    },
  });
  store.closeFolderNameDialog();
  render();
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
  const copy = selectCopy(deps);
  const { files, rejectedFiles, targetGroupId } = payload._event.detail;

  if ((rejectedFiles?.length ?? 0) > 0) {
    showInvalidImportFormatToast(appService, copy);
    return;
  }

  const importData = await parseImportSelection({
    appService,
    copy,
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
  const copy = selectCopy(deps);
  if ((payload._event.detail?.rejectedFiles?.length ?? 0) === 0) {
    return;
  }

  showInvalidImportFormatToast(appService, copy);
};

export const handleDialogClose = (deps) => {
  const { render, store } = deps;
  revokeDialogPreviewUrl(store);
  store.closeDialog();
  render();
};

export const handleDialogImageSourceClick = async (deps) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
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
      fallbackMessage: copy.failedSelectImage ?? "Failed to select image.",
      title: copy.errorTitle ?? "Error",
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
  const copy = selectCopy(deps);
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
      fallbackMessage:
        copy.failedSelectJsonFile ?? "Failed to select JSON file.",
      title: copy.errorTitle ?? "Error",
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
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.spritesheetNameRequired ?? "Spritesheet name is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const dialogMode = store.selectDialogMode();
  const dialogItemId = store.selectDialogItemId();
  const dialogParentId = store.selectDialogParentId();
  const importData = store.selectDialogImportData();
  const dialogAnimations = store.selectDialogDraftAnimations();
  const dialogSourceFiles = store.selectDialogSourceFiles();
  const existingItem = dialogItemId
    ? store.selectItemById({ itemId: dialogItemId })
    : undefined;

  if (dialogMode === "create" && !dialogSourceFiles?.pngFile) {
    appService.showAlert({
      message:
        copy.spritesheetImageRequired ?? "Spritesheet image is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  if (dialogMode === "create" && !dialogSourceFiles?.atlasFile) {
    appService.showAlert({
      message:
        copy.spritesheetJsonRequired ?? "Spritesheet JSON is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const uploadResult = await uploadSpritesheetSource({
    appService,
    copy,
    pngFile: dialogSourceFiles?.pngFile,
    projectService,
  });
  if (uploadResult === null) {
    return;
  }

  if (dialogMode === "create" && !uploadResult) {
    appService.showAlert({
      message:
        copy.failedUploadSpritesheetImage ??
        "Failed to upload spritesheet image.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const spritesheetData = buildSpritesheetPayload({
    dialogAnimations,
    existingItem,
    importData,
    uploadResult,
    values,
  });

  if (dialogMode === "create") {
    const spritesheetId = generateId();
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage:
        copy.failedCreateSpritesheet ?? "Failed to create spritesheet.",
      title: copy.errorTitle ?? "Error",
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
    appService.showAlert({
      message: copy.spritesheetNotFound ?? "Spritesheet not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedUpdateSpritesheet ?? "Failed to update spritesheet.",
    title: copy.errorTitle ?? "Error",
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

export const handleDialogClipDoubleClick = (deps, payload) => {
  const clipName = payload._event.currentTarget.dataset.clipName;
  if (!clipName) {
    return;
  }

  const { render, store } = deps;
  if (store.selectDialogMode() === "preview") {
    return;
  }

  store.openClipFpsDialog({ clipName });
  render();
};

export const handleClipFpsDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeClipFpsDialog();
  render();
};

export const handleClipFpsFormAction = (deps, payload) => {
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const { appService, render, store } = deps;
  const copy = selectCopy(deps);
  const fps = normalizeSpritesheetFps(values?.fps);
  if (fps === undefined) {
    appService.showAlert({
      message: copy.clipFpsRequired ?? "Clip FPS must be greater than 0.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  store.setDialogClipFps({
    clipName: store.selectClipFpsDialogClipName(),
    fps,
  });
  store.closeClipFpsDialog();
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
  refreshAfterItemTagUpdate: ({ deps, itemId, itemStillSelected }) =>
    refreshSpritesheetData(deps, {
      selectedItemId: itemStillSelected ? itemId : undefined,
    }),
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    if (mode !== "form") {
      return;
    }

    appendTagIdToForm({
      form: deps.refs.dialogForm,
      tagId,
    });
  },
  updateItemTagFallbackMessage: ({ deps }) =>
    selectCopy(deps).failedUpdateSpritesheetTags ??
    "Failed to update spritesheet tags.",
  copy: ({ i18n }) => selectSpritesheetsPageCopy(i18n),
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
  const copy = selectCopy(deps);
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
      message:
        copy.cannotDeleteResourceInUse ??
        "Cannot delete resource, it is currently in use.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const deleteAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedDeleteSpritesheet ?? "Failed to delete spritesheet.",
    title: copy.errorTitle ?? "Error",
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
