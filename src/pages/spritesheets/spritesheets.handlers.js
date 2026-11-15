import { filterImageUploadFiles } from "../../internal/ui/imageUploadValidation.js";
import { generateId } from "../../internal/id.js";
import { tap } from "rxjs";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { forwardFormSubmitOnEnter } from "../../internal/ui/resourcePages/formSubmitKeyDown.js";
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
  mountMobileResourceWindowLayout,
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
  FALLBACK_SPRITESHEET_CLIP_FPS,
  normalizeSpritesheetAnimationsFps,
  normalizeSpritesheetFps,
} from "../../internal/spritesheets.js";
import {
  getSpritesheetDisplayName,
  normalizeSizeInput,
} from "../../internal/spritesheetAtlas.js";
import { withResolvedCollectionFileMetadata } from "../../internal/resourceFileMetadata.js";
import {
  SPRITESHEET_EDITOR_PATH,
  createSpritesheetEditorPayload,
} from "../../internal/spritesheetEditorRoute.js";
import {
  SPRITESHEET_CREATE_SOURCES,
  confirmReplaceSpritesheetFrames,
  getAwaitedSpritesheetImages,
  getEmptySpritesheetMissingSource,
  readSpritesheetSourceFiles,
  resolveSpritesheetImportFiles,
  showMissingSpritesheetImages,
  showSpritesheetSourceFilesError,
} from "../../internal/ui/spritesheetFramesSave.js";
import { SPRITESHEET_TAG_SCOPE_KEY } from "./spritesheets.store.js";
import { selectSpritesheetsPageCopy } from "./support/spritesheetsPageCopy.js";
import { clearResourcePageSelection } from "../../internal/ui/resourcePages/resourceViewBackground.js";

const EMPTY_TREE = { items: {}, tree: [] };
const SPRITESHEET_IMAGE_FILE_ACCEPT = ".png";
const SPRITESHEET_ATLAS_FILE_ACCEPT = ".json";
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

const navigateToEditor = ({ appService, spritesheetId } = {}) => {
  if (!spritesheetId) {
    return;
  }

  appService.navigate(
    SPRITESHEET_EDITOR_PATH,
    createSpritesheetEditorPayload({
      payload: appService.getPayload() ?? {},
      spritesheetId,
    }),
  );
};

// Adding and editing each have their own dialog and form.
const selectDialogFormRef = ({ refs, store }) =>
  store.selectDialogMode() === "create" ? refs.addForm : refs.dialogForm;

const syncDialogFormValues = ({ refs, store, values } = {}) => {
  const form = selectDialogFormRef({ refs, store });
  form.reset();
  form.setValues({ values });
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

const parseImportSelection = async ({ deps, files, copy } = {}) => {
  const { appService, i18n, projectService } = deps;
  const importFiles = resolveSpritesheetImportFiles(Array.from(files ?? []));
  if (!importFiles) {
    showInvalidImportPairToast(appService, copy);
    return undefined;
  }

  try {
    const { importData, pngFile } = await readSpritesheetSourceFiles({
      projectService,
      pngFiles: importFiles.pngFiles,
      atlasFile: importFiles.atlasFile,
    });
    return {
      importData,
      sourceFiles: {
        pngFiles: importFiles.pngFiles,
        pngFile,
        atlasFile: importFiles.atlasFile,
      },
    };
  } catch (error) {
    showSpritesheetSourceFilesError({
      appService,
      i18n,
      error,
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
    source: currentValues?.source,
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
  // Dropped spritesheet files start the spritesheet from them.
  values.source = importData
    ? SPRITESHEET_CREATE_SOURCES.FILE
    : SPRITESHEET_CREATE_SOURCES.EMPTY;
  store.openCreateDialog({
    parentId,
    values,
    importData,
    previewUrl,
    sourceFiles,
  });
  render();
  syncDialogFormValues({ refs, store, values });
};

const openEditDialogForItem = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  revokeDialogPreviewUrl(store);

  const values = buildDialogValues({ item });
  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.openEditDialog({
    itemId,
    values,
    animations: item.animations,
  });
  render();
  syncDialogFormValues({ refs, store, values });
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

const pickSourceFile = async ({
  appService,
  accept,
  multiple = false,
} = {}) => {
  return appService.pickFiles({
    accept,
    multiple,
  });
};

const applyDialogSourceFiles = async ({
  deps,
  nextPngFiles,
  nextAtlasFile,
} = {}) => {
  const { appService, i18n, projectService, refs, render, store } = deps;
  const copy = selectCopy(deps);
  const currentSourceFiles = store.selectDialogSourceFiles();
  const pngFiles = nextPngFiles ?? currentSourceFiles?.pngFiles ?? [];
  const atlasFile = nextAtlasFile ?? currentSourceFiles?.atlasFile;
  const existingItem = store.selectItemById({
    itemId: store.selectDialogItemId(),
  });

  let importData;
  let pngFile;
  let missingImages;
  try {
    ({ importData, pngFile } = await readSpritesheetSourceFiles({
      projectService,
      pngFiles,
      atlasFile,
    }));
  } catch (error) {
    showSpritesheetSourceFilesError({
      appService,
      i18n,
      error,
      fallbackMessage:
        copy.failedReadSpritesheetSourceFiles ??
        "Failed to read spritesheet source files.",
      title: copy.errorTitle ?? "Error",
    });
    // A JSON for several images stays picked while its PNG files are chosen.
    missingImages = getAwaitedSpritesheetImages({ error, pngFiles });
    if (!missingImages) {
      return;
    }
  }

  const sourceFiles = { pngFiles, pngFile, atlasFile, missingImages };

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
  syncDialogFormValues({ refs, store, values });
};

const buildSpritesheetPayload = ({
  dialogAnimations,
  existingItem,
  importData,
  uploadResult,
  values,
} = {}) => {
  const width = normalizeSizeInput(values?.width ?? importData?.defaultWidth);
  const height = normalizeSizeInput(
    values?.height ?? importData?.defaultHeight,
  );
  const sourceAnimations =
    Object.keys(dialogAnimations ?? {}).length > 0
      ? dialogAnimations
      : (importData?.animations ?? existingItem?.animations ?? {});
  const animations = normalizeSpritesheetAnimationsFps(
    sourceAnimations,
    FALLBACK_SPRITESHEET_CLIP_FPS,
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

const uploadSpritesheetSource = async (deps, { copy, pngFile } = {}) => {
  const { appService, projectService } = deps;
  if (!pngFile) {
    return undefined;
  }

  if ((await filterImageUploadFiles(deps, [pngFile])).length === 0) return null;

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

const {
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged,
} = createResourceFileExplorerHandlers({
  resourceType: "spritesheets",
  refresh: refreshSpritesheetData,
});
const {
  focusKeyboardScope: focusFileExplorerKeyboardScope,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  onEditKey: ({ deps, selectedItemId, selectedExplorerItem }) => {
    if (selectedExplorerItem?.isFolder) {
      openFolderNameDialogForFolder({ deps, folderId: selectedItemId });
      return;
    }

    navigateToEditor({
      appService: deps.appService,
      spritesheetId: selectedItemId,
    });
  },
  resolveSelectedItemId: ({ deps, selectedExplorerItem }) =>
    selectedExplorerItem?.isFolder
      ? undefined
      : (selectedExplorerItem?.itemId ?? deps.store.selectSelectedItemId()),
});

export {
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleMobileResourceFileExplorerOpen as handleMobileFileExplorerOpen,
  handleMobileResourceFileExplorerClose as handleMobileFileExplorerClose,
  handleMobileResourceDetailSheetClose as handleMobileDetailSheetClose,
};

export const handleFileExplorerAction = async (deps, payload) => {
  const { itemId, item } = payload._event.detail;
  if (item?.value === "edit-item") {
    navigateToEditor({ appService: deps.appService, spritesheetId: itemId });
    return;
  }

  await handleBaseFileExplorerAction(deps, payload);
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
  const cleanupWindowLayout = mountMobileResourceWindowLayout(deps);

  return () => {
    subscription.unsubscribe();
    cleanupWindowLayout?.();
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
    store.setSelectedFolderId({ folderId: undefined });
    store.setSelectedItemId({ itemId: undefined });
    render();
    focusFileExplorerKeyboardScope(deps);
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

  navigateToEditor({ appService: deps.appService, spritesheetId: itemId });
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

export const handleResourceViewBackgroundClick = (deps) => {
  clearResourcePageSelection(deps);
};

export const handleSpritesheetItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;
  navigateToEditor({ appService: deps.appService, spritesheetId: itemId });
};

export const handleMobileDetailOpenClick = (deps) => {
  const { appService, store } = deps;
  navigateToEditor({
    appService,
    spritesheetId: store.selectSelectedItemId(),
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
  navigateToEditor({ appService: deps.appService, spritesheetId: itemId });
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

  const folderId = store.selectFolderNameDialogItemId();
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

  const selection = await parseImportSelection({
    deps,
    copy,
    files,
  });
  if (!selection) {
    return;
  }

  openCreateDialog({
    deps,
    importData: selection.importData,
    parentId: resolveResourceParentId(targetGroupId),
    previewUrl: URL.createObjectURL(selection.sourceFiles.pngFile),
    sourceFiles: selection.sourceFiles,
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
  let files;

  try {
    // A sheet split over several images needs all of them.
    files = await pickSourceFile({
      appService,
      accept: SPRITESHEET_IMAGE_FILE_ACCEPT,
      multiple: true,
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

  if (!files?.length) {
    return;
  }

  await applyDialogSourceFiles({
    deps,
    nextPngFiles: files,
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

const closeDialogAndSelect = async (deps, { itemId } = {}) => {
  const { render, store } = deps;
  revokeDialogPreviewUrl(store);
  store.closeDialog();
  render();
  await refreshSpritesheetData(deps, {
    selectedItemId: itemId,
  });
};

// An empty spritesheet has no sheet yet; the spritesheet editor fills it.
const createEmptySpritesheet = async (deps, { values } = {}) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const data = {
    type: "spritesheet",
    name: values.name.trim(),
    description: values.description ?? "",
    tagIds: Array.isArray(values.tagIds) ? values.tagIds : [],
    jsonData: {},
    animations: {},
  };

  const spritesheetId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedCreateSpritesheet ?? "Failed to create spritesheet.",
    title: copy.errorTitle ?? "Error",
    action: () =>
      projectService.createSpritesheet({
        spritesheetId,
        data,
        parentId: store.selectDialogParentId(),
        position: "last",
      }),
  });

  if (createAttempt.ok) {
    await closeDialogAndSelect(deps, { itemId: spritesheetId });
  }
};

export const handleDialogFormAction = async (deps, payload) => {
  const { appService, render, store } = deps;
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

  if (store.selectIsDialogSubmitting()) {
    return;
  }

  store.setDialogSubmitting({ value: true });
  render();
  try {
    if (store.selectDialogCreatesEmpty()) {
      await createEmptySpritesheet(deps, { values });
      return;
    }

    await submitFileDialog(deps, { values });
  } finally {
    store.setDialogSubmitting({ value: false });
    render();
  }
};

const submitFileDialog = async (deps, { values } = {}) => {
  const { appService, i18n, projectService, store } = deps;
  const copy = selectCopy(deps);
  const dialogMode = store.selectDialogMode();
  const dialogItemId = store.selectDialogItemId();
  const dialogParentId = store.selectDialogParentId();
  const importData = store.selectDialogImportData();
  const dialogAnimations = store.selectDialogDraftAnimations();
  const dialogSourceFiles = store.selectDialogSourceFiles();
  const existingItem = dialogItemId
    ? store.selectItemById({ itemId: dialogItemId })
    : undefined;

  // A JSON for several images cannot be saved without its PNG files.
  if (dialogSourceFiles?.missingImages) {
    showMissingSpritesheetImages({
      appService,
      i18n,
      missingImages: dialogSourceFiles.missingImages,
    });
    return;
  }

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
      message: copy.spritesheetJsonRequired ?? "Spritesheet JSON is required.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  // An empty spritesheet needs its PNG and JSON together.
  const missingSource = getEmptySpritesheetMissingSource({
    existingItem,
    sourceFiles: dialogSourceFiles,
  });
  if (missingSource) {
    appService.showAlert({
      message:
        missingSource === "png"
          ? copy.spritesheetImageRequired
          : copy.spritesheetJsonRequired,
      title: copy.warningTitle,
    });
    return;
  }

  // A new sheet file or JSON no longer matches frames made in the editor.
  const replacesSheet = Boolean(
    dialogSourceFiles?.pngFile || dialogSourceFiles?.atlasFile,
  );
  if (
    existingItem?.frameSource &&
    replacesSheet &&
    !(await confirmReplaceSpritesheetFrames({ appService, i18n }))
  ) {
    return;
  }

  const uploadResult = await uploadSpritesheetSource(deps, {
    copy,
    pngFile: dialogSourceFiles?.pngFile,
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

    if (createAttempt.ok) {
      await closeDialogAndSelect(deps, { itemId: spritesheetId });
    }
    return;
  }

  if (!dialogItemId || !existingItem) {
    appService.showAlert({
      message: copy.spritesheetNotFound ?? "Spritesheet not found.",
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  // An empty size field removes a default frame size the item has.
  for (const key of ["width", "height"]) {
    if (spritesheetData[key] === undefined && existingItem[key] !== undefined) {
      spritesheetData[key] = null;
    }
  }

  // Without a new sheet, an edit keeps the frames; a new sheet clears them.
  if (existingItem.frameSource) {
    spritesheetData.frameSource = replacesSheet
      ? null
      : existingItem.frameSource;
  }

  // A spritesheet still empty has no sheet or atlas to send.
  if (!spritesheetData.fileId) {
    delete spritesheetData.fileId;
    delete spritesheetData.jsonData;
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

  if (updateAttempt.ok) {
    await closeDialogAndSelect(deps, { itemId: dialogItemId });
  }
};

export const handleDialogSubmitClick = async (deps) => {
  const { dialogForm } = deps.refs;
  await handleDialogFormAction(deps, {
    _event: {
      detail: {
        actionId: "submit",
        values: dialogForm.getValues(),
      },
    },
  });
};

export const handleDialogFormSubmitKeyDown = (deps, payload) =>
  forwardFormSubmitOnEnter({ deps, payload, submit: handleDialogSubmitClick });

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
      form: selectDialogFormRef(deps),
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
