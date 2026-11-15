import { filterImageUploadFiles } from "../../internal/ui/imageUploadValidation.js";
import { nameFromFileName } from "../../internal/files.js";
import { generateId, generatePrefixedId } from "../../internal/id.js";
import { processWithConcurrency } from "../../internal/processWithConcurrency.js";
import { createCharacterSpritesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { forwardFormSubmitOnEnter } from "../../internal/ui/resourcePages/formSubmitKeyDown.js";
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
  resolveImagePreviewDisplayMode as resolvePreviewDisplayMode,
  resolveImagePreviewNavigationDirection as resolvePreviewNavigationDirection,
} from "../../internal/ui/resourcePages/imagePreviewOverlay.js";
import {
  createFileExplorerKeyboardScopeHandlers,
  isTextEntryKeyEvent,
} from "../../internal/ui/fileExplorerKeyboardScope.js";
import {
  handleResourceZoomShortcutKeyDown,
  isResourceZoomShortcutKeyEvent,
} from "../../internal/ui/resourcePages/zoomShortcuts.js";
import { resolveResourceParentId } from "../../internal/ui/resourcePages/media/mediaPageShared.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import {
  buildImageResourceDataFromUploadResult,
  buildImageResourcePatchFromUploadResult,
} from "../../deps/services/shared/resourceImports.js";
import {
  FALLBACK_SPRITESHEET_CLIP_FPS,
  normalizeSpritesheetAnimationsFps,
  normalizeSpritesheetFps,
} from "../../internal/spritesheets.js";
import {
  getSpritesheetDisplayName,
  normalizeSizeInput,
} from "../../internal/spritesheetAtlas.js";
import { tap } from "rxjs";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { withResolvedCollectionFileMetadata } from "../../internal/resourceFileMetadata.js";
import {
  SPRITESHEET_EDITOR_PATH,
  createSpritesheetEditorPayload,
} from "../../internal/spritesheetEditorRoute.js";
import {
  SPRITESHEET_CREATE_SOURCES,
  confirmReplaceSpritesheetFrames,
  readSpritesheetSourceFiles,
  resolveSpritesheetImportFiles,
  showSpritesheetSourceFilesError,
} from "../../internal/ui/spritesheetFramesSave.js";
import { selectCharacterSpritesPageCopy } from "./support/characterSpritesPageCopy.js";
import { clearResourcePageSelection } from "../../internal/ui/resourcePages/resourceViewBackground.js";

const EMPTY_TREE = { items: {}, tree: [] };
const IMAGE_FILE_PATTERN = /\.(jpg|jpeg|png|webp)$/i;
const IMAGE_FILE_ACCEPT = ".jpg,.jpeg,.png,.webp";
const SPRITESHEET_IMAGE_FILE_ACCEPT = ".png";
const SPRITESHEET_ATLAS_FILE_ACCEPT = ".json";
const JSON_FILE_PATTERN = /\.json$/i;
const MAX_PARALLEL_UPLOADS = 1;
const CREATE_SPRITE_ABORT_ERROR = "create-sprite-abort";
const CHARACTER_SPRITE_TAG_SCOPE_PREFIX = "characterSprites:";

const selectCopy = (deps = {}) => selectCharacterSpritesPageCopy(deps.i18n);

const createPendingUploads = ({ files, parentId } = {}) => {
  if (!parentId) {
    return [];
  }

  return (Array.isArray(files) ? files : []).map((file) => ({
    id: generatePrefixedId("pending-sprite-"),
    file,
    parentId,
    name: nameFromFileName(file.name),
  }));
};

const resolveCharacterSpriteUploadTarget = ({
  appService,
  copy,
  store,
  groupId,
} = {}) => {
  const parentId = resolveResourceParentId(groupId);
  if (!parentId) {
    return {
      ok: true,
      parentId: undefined,
    };
  }

  const folder = store.selectFolderById({ folderId: parentId });
  const folderInTree = store.selectSpriteTreeContainsItem({ itemId: parentId });
  if (!folder || !folderInTree) {
    console.error("Character sprite upload target is invalid", {
      groupId,
      parentId,
      folderExists: Boolean(folder),
      folderInTree,
    });
    appService.showAlert({
      message: copy.uploadTargetMissing,
      title: copy.errorTitle,
    });
    return {
      ok: false,
      parentId: undefined,
    };
  }

  return {
    ok: true,
    parentId,
  };
};

const createSpriteAbortError = () => {
  const error = new Error(CREATE_SPRITE_ABORT_ERROR);
  error.code = CREATE_SPRITE_ABORT_ERROR;
  return error;
};

const getPreviewFileId = (item) => item?.thumbnailFileId ?? item?.fileId;

const getCharacterIdFromPayload = ({ appService }) => {
  return appService.getPayload().characterId;
};

const resolveCharacterSpriteTagScopeKey = (characterId) =>
  `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${characterId}`;

const showInvalidImportFormatToast = (appService, copy) => {
  appService.showAlert({
    message: copy.invalidImportFormatMessage,
    title: copy.warningTitle,
  });
};

const showInvalidImportPairToast = (appService, copy) => {
  appService.showAlert({
    message: copy.invalidImportPairMessage,
    title: copy.warningTitle,
  });
};

const showInvalidImageFormatToast = (appService, copy) => {
  appService.showAlert({
    message: copy.invalidImageFormatMessage,
    title: copy.warningTitle,
  });
};

const filterImageFilesByExtension = ({ appService, copy, files } = {}) => {
  const normalizedFiles = Array.from(files ?? []).filter(Boolean);
  const imageFiles = normalizedFiles.filter((file) =>
    IMAGE_FILE_PATTERN.test(file?.name ?? ""),
  );

  if (imageFiles.length !== normalizedFiles.length) {
    showInvalidImageFormatToast(appService, copy);
  }

  return imageFiles;
};

const validateImageFileExtension = ({ appService, copy, file } = {}) => {
  if (!file) {
    return false;
  }

  if (IMAGE_FILE_PATTERN.test(file.name ?? "")) {
    return true;
  }

  showInvalidImageFormatToast(appService, copy);
  return false;
};

const uploadImageFile = async (deps, { copy, file } = {}) => {
  const { appService, projectService } = deps;
  if ((await filterImageUploadFiles(deps, [file])).length === 0) return null;

  try {
    const uploadResults = await projectService.uploadFiles([file]);
    return uploadResults?.[0];
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedUploadSprite,
    });
    return null;
  }
};

const {
  focusKeyboardScope: focusGroupView,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  isNavigationBlocked: ({ deps }) => deps.store.selectFullImagePreviewVisible(),
  onBackKey: ({ deps }) => {
    void deps.appService.back();
  },
  onEnterKey: ({ deps, selectedItemId }) => {
    const item = deps.store.selectSpriteItemById({ itemId: selectedItemId });
    if (item?.type === "spritesheet") {
      navigateToSpritesheetEditor({ deps, itemId: selectedItemId });
      return;
    }

    openSpritePreviewById({ deps, itemId: selectedItemId, syncExplorer: true });
  },
  onEditKey: ({ deps, selectedItemId, selectedExplorerItem }) => {
    if (selectedExplorerItem?.isFolder) {
      openFolderNameDialogForFolder({ deps, folderId: selectedItemId });
      return;
    }

    const item = deps.store.selectSpriteItemById({ itemId: selectedItemId });
    if (item?.type === "spritesheet") {
      navigateToSpritesheetEditor({ deps, itemId: selectedItemId });
      return;
    }

    openEditDialogForSprite({ deps, itemId: selectedItemId });
  },
  resolveSelectedItemId: ({ deps, selectedExplorerItem }) => {
    return selectedExplorerItem?.isFolder
      ? undefined
      : (selectedExplorerItem?.itemId ?? deps.store.selectSelectedItemId());
  },
});

const focusPreviewOverlay = ({ refs } = {}) => {
  requestAnimationFrame(() => {
    refs.previewOverlay?.focus?.();
  });
};

const syncCharacterSpritesData = ({ deps, repositoryState } = {}) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const characterId =
    store.selectCharacterId() ?? getCharacterIdFromPayload(deps);
  const state =
    repositoryState ??
    projectService.getRepositoryState?.() ??
    projectService.getState();

  if (!characterId) {
    appService.showAlert({
      message: copy.characterMissing,
      title: copy.errorTitle,
    });
    return false;
  }

  const character = state?.characters?.items?.[characterId];
  if (!character) {
    appService.showAlert({
      message: copy.characterNotFound,
      title: copy.errorTitle,
    });
    return false;
  }

  const tagsData = getTagsCollection(
    state,
    resolveCharacterSpriteTagScopeKey(characterId),
  );
  const taggedImageSprites = resolveCollectionWithTags({
    collection: character.sprites ?? EMPTY_TREE,
    tagsCollection: tagsData,
    itemType: "image",
  });
  const taggedSpritesData = resolveCollectionWithTags({
    collection: taggedImageSprites,
    tagsCollection: tagsData,
    itemType: "spritesheet",
  });
  const spritesData = withResolvedCollectionFileMetadata({
    collection: taggedSpritesData,
    files: state?.files,
    resourceTypes: ["image", "spritesheet"],
  });

  store.setCharacterId({ characterId });
  store.setCharacterName({ characterName: character.name });
  store.setCharacterSpriteGroups({ spriteGroups: character.spriteGroups });
  store.setTagsData({ tagsData });
  store.setItems({ spritesData });
  store.setProjectResolution({
    projectResolution: state?.project?.resolution,
  });

  if (store.selectSelectedItemId() && !store.selectSelectedItem()) {
    store.setSelectedItemId({ itemId: undefined });
  }

  return true;
};

const refreshCharacterSpritesData = async (deps) => {
  const { render } = deps;
  const synced = syncCharacterSpritesData({ deps });
  if (!synced) {
    return;
  }

  render();
};

const selectSprite = ({
  deps,
  itemId,
  syncExplorer = false,
  suppressMobileDetailSheet = false,
} = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  store.setSelectedItemId({ itemId, suppressMobileDetailSheet });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  render();
  refs.groupview?.scrollItemIntoView?.({ itemId });
};

const openSpritePreviewById = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || item?.type !== "image") {
    return;
  }

  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });
  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.showFullImagePreview({ itemId });
  render();
  refs.groupview?.scrollItemIntoView?.({ itemId });
  focusPreviewOverlay(deps);
};

const closeSpritePreview = (deps) => {
  const { store, render } = deps;

  store.hideFullImagePreview();
  render();
  focusGroupView(deps);
};

const navigateSpritePreview = (deps, { direction, distance, clamp } = {}) => {
  const { store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId || !direction) {
    return false;
  }

  const adjacentPayload = {
    itemId: selectedItemId,
    direction,
  };
  if (distance !== undefined) {
    adjacentPayload.distance = distance;
  }
  if (clamp !== undefined) {
    adjacentPayload.clamp = clamp;
  }

  const nextItemId = store.selectAdjacentSpriteItemId(adjacentPayload);
  if (!nextItemId) {
    return false;
  }

  openSpritePreviewById({ deps, itemId: nextItemId, syncExplorer: true });
  return true;
};

const openEditDialogForSprite = ({
  deps,
  itemId,
  syncExplorer = false,
} = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || item?.type !== "image") {
    return;
  }

  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });
  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.openEditDialog({
    itemId,
    defaultValues: {
      name: item.name ?? "",
      description: item.description ?? "",
      tagIds: item.tagIds ?? [],
    },
    previewFileId: getPreviewFileId(item),
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

const navigateToSpritesheetEditor = ({ deps, itemId } = {}) => {
  const { appService, store } = deps;
  const characterId = store.selectCharacterId();
  if (!characterId || !itemId) {
    return;
  }

  appService.navigate(
    SPRITESHEET_EDITOR_PATH,
    createSpritesheetEditorPayload({
      payload: appService.getPayload() ?? {},
      characterId,
      spriteId: itemId,
    }),
  );
};

const revokeSpritesheetDialogPreviewUrl = (store) => {
  const dialogPreviewUrl = store.selectSpritesheetDialogPreviewUrl?.();
  if (
    typeof dialogPreviewUrl === "string" &&
    dialogPreviewUrl.startsWith("blob:")
  ) {
    URL.revokeObjectURL(dialogPreviewUrl);
  }
};

// Adding and editing a spritesheet each have their own dialog and form.
const selectSpritesheetDialogFormRef = ({ refs, store }) =>
  store.selectSpritesheetDialogMode() === "create"
    ? refs.spritesheetAddForm
    : refs.spritesheetDialogForm;

const syncSpritesheetDialogFormValues = ({ refs, store, values } = {}) => {
  const form = selectSpritesheetDialogFormRef({ refs, store });
  form?.reset?.();
  form?.setValues?.({ values });
};

const parseImportSelection = async ({ deps, copy, files } = {}) => {
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
      fallbackMessage: copy.failedImportSpritesheetJson,
    });
    return undefined;
  }
};

const resolveDialogValue = (...values) => {
  return values.find((value) => value !== undefined && value !== "");
};

const buildSpritesheetDialogValues = ({
  item,
  importData,
  currentValues,
} = {}) => {
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

const openSpritesheetCreateDialog = ({
  deps,
  importData,
  parentId,
  previewUrl,
  sourceFiles,
} = {}) => {
  const { appService, refs, render, store } = deps;
  const copy = selectCopy(deps);
  const uploadTarget = resolveCharacterSpriteUploadTarget({
    appService,
    copy,
    store,
    groupId: parentId,
  });
  if (!uploadTarget.ok) {
    return false;
  }

  revokeSpritesheetDialogPreviewUrl(store);

  const values = buildSpritesheetDialogValues({
    importData,
    currentValues: {
      pngFileName: sourceFiles?.pngFile?.name,
    },
  });
  // Dropped spritesheet files start the spritesheet from them.
  values.source = importData
    ? SPRITESHEET_CREATE_SOURCES.FILE
    : SPRITESHEET_CREATE_SOURCES.EMPTY;
  store.openSpritesheetCreateDialog({
    parentId: uploadTarget.parentId,
    values,
    importData,
    previewUrl,
    sourceFiles,
  });
  render();
  syncSpritesheetDialogFormValues({ refs, store, values });
  return true;
};

const openSpritesheetEditDialogForItem = ({
  deps,
  itemId,
  syncExplorer = false,
} = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || item?.type !== "spritesheet") {
    return;
  }

  revokeSpritesheetDialogPreviewUrl(store);

  const values = buildSpritesheetDialogValues({ item });
  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.openSpritesheetEditDialog({
    itemId,
    values,
    animations: item.animations,
  });
  render();
  syncSpritesheetDialogFormValues({ refs, store, values });
};

const openSpritesheetPreviewDialogForItem = ({
  deps,
  itemId,
  syncExplorer = false,
} = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || item?.type !== "spritesheet") {
    return;
  }

  revokeSpritesheetDialogPreviewUrl(store);

  const values = buildSpritesheetDialogValues({ item });
  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.openSpritesheetPreviewDialog({
    itemId,
    values,
  });
  render();
};

const pickSpritesheetSourceFile = async ({
  appService,
  accept,
  multiple = false,
} = {}) => {
  return appService.pickFiles({
    accept,
    multiple,
  });
};

const applySpritesheetDialogSourceFiles = async ({
  deps,
  nextPngFiles,
  nextAtlasFile,
} = {}) => {
  const { appService, i18n, projectService, refs, render, store } = deps;
  const copy = selectCopy(deps);
  const currentSourceFiles = store.selectSpritesheetDialogSourceFiles();
  const pngFiles = nextPngFiles ?? currentSourceFiles?.pngFiles ?? [];
  const atlasFile = nextAtlasFile ?? currentSourceFiles?.atlasFile;
  const existingItem = store.selectSpriteItemById({
    itemId: store.selectSpritesheetDialogItemId(),
  });

  let importData;
  let pngFile;
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
      fallbackMessage: copy.failedReadSpritesheetSourceFiles,
    });
    return;
  }

  const sourceFiles = { pngFiles, pngFile, atlasFile };

  revokeSpritesheetDialogPreviewUrl(store);

  const previewUrl = sourceFiles.pngFile
    ? URL.createObjectURL(sourceFiles.pngFile)
    : undefined;
  const values = buildSpritesheetDialogValues({
    item: existingItem,
    importData,
    currentValues: {
      ...store.selectSpritesheetDialogValues(),
      pngFileName: sourceFiles.pngFile?.name,
    },
  });

  store.setSpritesheetDialogImport({
    importData,
    previewUrl,
    values,
    sourceFiles,
  });
  render();
  syncSpritesheetDialogFormValues({ refs, store, values });
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
      fallbackMessage: copy.failedUploadSpritesheetImage,
    });
    return null;
  }
};

const createImageSpritesFromFiles = async ({
  deps,
  files,
  parentId = undefined,
} = {}) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);
  const uploadTarget = resolveCharacterSpriteUploadTarget({
    appService,
    copy,
    store,
    groupId: parentId,
  });
  if (!uploadTarget.ok) {
    return;
  }

  const selectedFiles = filterImageFilesByExtension({
    appService,
    copy,
    files,
  });
  if (selectedFiles.length === 0) return;
  const imageFiles = await filterImageUploadFiles(deps, selectedFiles);
  if (imageFiles.length === 0) {
    return;
  }

  const characterId = store.selectCharacterId();
  if (!characterId) {
    appService.showAlert({
      message: copy.characterMissing,
      title: copy.errorTitle,
    });
    return;
  }

  const pendingUploads = createPendingUploads({
    files: imageFiles,
    parentId: uploadTarget.parentId,
  });
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
      imageFiles,
      async (file) => {
        const pendingUploadId = pendingUploadIdByFile.get(file);
        const uploadResults = await projectService.uploadFiles([file]);
        const uploadResult = uploadResults?.[0];

        if (!uploadResult) {
          removePendingUploads([pendingUploadId]);
          return { ok: false, reason: "upload-failed" };
        }

        successfulUploadCount += 1;
        const spriteId = generateId();
        store.updatePendingUpload({
          itemId: pendingUploadId,
          updates: {
            resolvedItemId: spriteId,
          },
        });

        const createAttempt = await runResourcePageMutation({
          appService,
          fallbackMessage: copy.failedCreateSprite,
          action: () =>
            projectService.createCharacterSpriteItem({
              characterId,
              spriteId,
              fileRecords: uploadResult.fileRecords,
              parentId: uploadTarget.parentId,
              position: "last",
              data: buildImageResourceDataFromUploadResult(uploadResult),
            }),
        });

        removePendingUploads([pendingUploadId]);

        if (!createAttempt.ok) {
          throw createSpriteAbortError();
        }

        createdCount += 1;
        await refreshCharacterSpritesData(deps);
        return { ok: true };
      },
      {
        concurrency: MAX_PARALLEL_UPLOADS,
        stopOnError: true,
      },
    );
  } catch (error) {
    removePendingUploads([...remainingPendingUploadIds]);
    if (error?.code === CREATE_SPRITE_ABORT_ERROR) {
      return;
    }

    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedUploadSprites,
    });
    return;
  }

  if (successfulUploadCount === 0) {
    appService.showAlert({
      message: copy.failedUploadSprites,
      title: copy.errorTitle,
    });
    return;
  }

  if (createdCount > 0) {
    await refreshCharacterSpritesData(deps);
  }
};

export const handleBeforeMount = (deps) => {
  const { projectService, store } = deps;
  syncMobileResourcePageUiConfig(deps);
  let scheduledRenderFrameId;
  let scheduledFallbackTimeoutId;

  const flushRender = () => {
    scheduledRenderFrameId = undefined;
    scheduledFallbackTimeoutId = undefined;
    deps.render();
  };

  const scheduleRender = () => {
    if (
      scheduledRenderFrameId !== undefined ||
      scheduledFallbackTimeoutId !== undefined
    ) {
      return;
    }

    if (typeof globalThis.requestAnimationFrame === "function") {
      scheduledRenderFrameId = globalThis.requestAnimationFrame(() => {
        flushRender();
      });
      return;
    }

    scheduledFallbackTimeoutId = globalThis.setTimeout(() => {
      flushRender();
    }, 0);
  };

  const subscription = createProjectStateStream({ projectService })
    .pipe(
      tap(({ repositoryState }) => {
        const { store } = deps;
        const synced = syncCharacterSpritesData({ deps, repositoryState });
        if (!synced) {
          store.clearCharacterSpritesView();
        }
        scheduleRender();
      }),
    )
    .subscribe();
  const cleanupWindowLayout = mountMobileResourceWindowLayout(deps);

  return () => {
    if (
      scheduledRenderFrameId !== undefined &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(scheduledRenderFrameId);
    }

    if (scheduledFallbackTimeoutId !== undefined) {
      globalThis.clearTimeout(scheduledFallbackTimeoutId);
    }

    subscription.unsubscribe();
    cleanupWindowLayout?.();
    revokeSpritesheetDialogPreviewUrl(store);
  };
};

export const handleAfterMount = (deps) => {
  focusGroupView(deps);
};

const { handleFileExplorerAction, handleFileExplorerTargetChanged } =
  createCharacterSpritesFileExplorerHandlers({
    getCharacterId: (deps) =>
      deps.store.selectCharacterId() ?? getCharacterIdFromPayload(deps),
    refresh: refreshCharacterSpritesData,
    copy: ({ i18n }) => selectCharacterSpritesPageCopy(i18n),
  });

export { handleFileExplorerAction, handleFileExplorerTargetChanged };
export {
  handleFileExplorerKeyboardScopeClick,
  handleMobileResourceFileExplorerOpen as handleMobileFileExplorerOpen,
  handleMobileResourceFileExplorerClose as handleMobileFileExplorerClose,
  handleMobileResourceDetailSheetClose as handleMobileDetailSheetClose,
};

export const handleDataChanged = refreshCharacterSpritesData;

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  const { refs, render, store } = deps;
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder) {
    store.setSelectedFolderId({ folderId: itemId });
    render();
    focusGroupView(deps);
    return;
  }

  if (!itemId) {
    store.setSelectedFolderId({ folderId: undefined });
    store.setSelectedItemId({ itemId: undefined });
    render();
    focusGroupView(deps);
    return;
  }

  const selectionPayload = {
    deps,
    itemId,
  };
  if (shouldSuppressMobileDetailSheetForFileExplorerSelection(deps)) {
    selectionPayload.suppressMobileDetailSheet = true;
  }
  selectSprite(selectionPayload);
  closeMobileResourceFileExplorerAfterSelection(deps);
  refs.groupview?.scrollItemIntoView?.({ itemId });
  focusGroupView(deps);
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

  if (isFolder || !itemId) {
    return;
  }

  const item = deps.store.selectSpriteItemById({ itemId });
  if (item?.type === "spritesheet") {
    navigateToSpritesheetEditor({ deps, itemId });
    return;
  }

  openSpritePreviewById({ deps, itemId });
};

export const handleSpriteItemClick = async (deps, payload) => {
  const { itemId } = payload._event.detail;

  selectSprite({
    deps,
    itemId,
    syncExplorer: true,
  });
  focusGroupView(deps);
};

export const handleResourceViewBackgroundClick = (deps) => {
  clearResourcePageSelection(deps);
};

export const handleSpriteItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;

  if (!itemId) {
    return;
  }

  const item = deps.store.selectSpriteItemById({ itemId });
  if (item?.type === "spritesheet") {
    navigateToSpritesheetEditor({ deps, itemId });
    return;
  }

  openSpritePreviewById({ deps, itemId, syncExplorer: true });
};

export const handleMobileDetailPreviewClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  handleSpriteItemDoubleClick(deps, {
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

export const handleSpriteItemPreview = (deps, payload) => {
  const { itemId } = payload._event.detail;

  if (!itemId) {
    return;
  }

  const item = deps.store.selectSpriteItemById({ itemId });
  if (item?.type === "spritesheet") {
    openSpritesheetPreviewDialogForItem({
      deps,
      itemId,
      syncExplorer: true,
    });
    return;
  }

  openSpritePreviewById({ deps, itemId, syncExplorer: true });
};

export const handlePreviewOverlayClick = (deps) => {
  closeSpritePreview(deps);
};

export const handlePreviewImageFrameClick = (deps, payload) => {
  payload?._event?.stopPropagation?.();
  closeSpritePreview(deps);
};

export const handlePreviewPreviousClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  navigateSpritePreview(deps, { direction: "previous" });
};

export const handlePreviewNextClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  navigateSpritePreview(deps, { direction: "next" });
};

export const handlePreviewFitModeClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { store, render } = deps;
  store.setFullImagePreviewDisplayMode({ displayMode: "fit" });
  render();
  focusPreviewOverlay(deps);
};

export const handlePreviewCanvasModeClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const { store, render } = deps;
  store.setFullImagePreviewDisplayMode({ displayMode: "canvas" });
  render();
  focusPreviewOverlay(deps);
};

export const handlePreviewOverlayKeyDown = (deps, payload) => {
  const { store } = deps;
  const event = payload._event;

  if (!store.selectFullImagePreviewVisible()) {
    return;
  }

  if (isTextEntryKeyEvent(event)) {
    return;
  }

  if (event.key === "Escape" || event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    closeSpritePreview(deps);
    return;
  }

  const displayMode = resolvePreviewDisplayMode(event);
  if (displayMode) {
    event.preventDefault();
    event.stopPropagation();
    store.setFullImagePreviewDisplayMode({ displayMode });
    deps.render();
    focusPreviewOverlay(deps);
    return;
  }

  const navigation = resolvePreviewNavigationDirection(event);
  if (!navigation?.direction) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  navigateSpritePreview(deps, navigation);
};

export const handleFileExplorerKeyboardScopeKeyDown = (deps, payload) => {
  const event = payload?._event;
  if (
    deps.store.selectFullImagePreviewVisible() &&
    isResourceZoomShortcutKeyEvent(event)
  ) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (handleResourceZoomShortcutKeyDown(deps, payload)) {
    return;
  }

  handleBaseFileExplorerKeyboardScopeKeyDown(deps, payload);
};

export const handleSpriteItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;
  const item = deps.store.selectSpriteItemById({ itemId });

  if (item?.type === "spritesheet") {
    navigateToSpritesheetEditor({ deps, itemId });
    return;
  }

  openEditDialogForSprite({
    deps,
    itemId,
    syncExplorer: true,
  });
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();
  if (selectedItemId) {
    const item = deps.store.selectSpriteItemById({ itemId: selectedItemId });
    if (item?.type === "spritesheet") {
      openSpritesheetEditDialogForItem({
        deps,
        itemId: selectedItemId,
      });
      return;
    }

    openEditDialogForSprite({
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
      message: copy.folderNameRequired,
      title: copy.warningTitle,
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

const pickUploadKind = async ({ appService, copy, event } = {}) => {
  const result = await appService.showDropdownMenu({
    items: [
      { type: "item", key: "image", label: copy.imageUploadKind },
      { type: "item", key: "spritesheet", label: copy.spritesheetUploadKind },
    ],
    x: event?.detail?.x ?? event?.clientX ?? 0,
    y: event?.detail?.y ?? event?.clientY ?? 0,
    place: "bs",
  });

  return result?.item?.key;
};

export const handleUploadClick = async (deps, payload) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  const { groupId } = payload._event.detail;
  const uploadKind = await pickUploadKind({
    appService,
    copy,
    event: payload._event,
  });

  if (uploadKind !== "image" && uploadKind !== "spritesheet") {
    return;
  }

  const uploadTarget = resolveCharacterSpriteUploadTarget({
    appService,
    copy,
    store,
    groupId,
  });
  if (!uploadTarget.ok) {
    return;
  }

  if (uploadKind === "spritesheet") {
    openSpritesheetCreateDialog({
      deps,
      parentId: uploadTarget.parentId,
    });
    return;
  }

  let files;

  try {
    files = await appService.pickFiles({
      accept: IMAGE_FILE_ACCEPT,
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

  await createImageSpritesFromFiles({
    deps,
    files,
    parentId: uploadTarget.parentId,
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { appService, store } = deps;
  const copy = selectCopy(deps);
  const { files, rejectedFiles, targetGroupId } = payload._event.detail;

  if ((rejectedFiles?.length ?? 0) > 0) {
    showInvalidImportFormatToast(appService, copy);
    return;
  }

  const uploadTarget = resolveCharacterSpriteUploadTarget({
    appService,
    copy,
    store,
    groupId: targetGroupId,
  });
  if (!uploadTarget.ok) {
    return;
  }

  const hasJsonFile = (files ?? []).some((file) =>
    JSON_FILE_PATTERN.test(file?.name ?? ""),
  );
  if (hasJsonFile) {
    const selection = await parseImportSelection({
      deps,
      copy,
      files,
    });
    if (!selection) {
      return;
    }

    const previewUrl = URL.createObjectURL(selection.sourceFiles.pngFile);
    const dialogOpened = openSpritesheetCreateDialog({
      deps,
      importData: selection.importData,
      parentId: uploadTarget.parentId,
      previewUrl,
      sourceFiles: selection.sourceFiles,
    });
    if (!dialogOpened) {
      URL.revokeObjectURL(previewUrl);
    }
    return;
  }

  await createImageSpritesFromFiles({
    deps,
    files,
    parentId: uploadTarget.parentId,
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

export const handleFormExtraEvent = async (deps) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const selectedItem = store.selectSelectedItem();

  if (selectedItem?.type !== "image") {
    return;
  }

  let file;

  try {
    file = await appService.pickFiles({
      accept: IMAGE_FILE_ACCEPT,
      multiple: false,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedSelectFile,
    });
    return;
  }

  if (!file) {
    return;
  }

  if (!validateImageFileExtension({ appService, copy, file })) {
    return;
  }

  const uploadResult = await uploadImageFile(deps, {
    copy,
    file,
  });

  if (uploadResult === null) {
    return;
  }

  if (!uploadResult) {
    appService.showAlert({
      message: copy.failedUploadSprite,
      title: copy.errorTitle,
    });
    return;
  }

  const characterId = store.selectCharacterId();
  if (!characterId) {
    appService.showAlert({
      message: copy.characterMissing,
      title: copy.errorTitle,
    });
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateSprite,
    action: () =>
      projectService.updateCharacterSpriteItem({
        characterId,
        spriteId: selectedItem.id,
        fileRecords: uploadResult.fileRecords,
        data: buildImageResourcePatchFromUploadResult(uploadResult),
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  await refreshCharacterSpritesData(deps);
};

export const handleEditDialogClose = (deps) => {
  const { store, render } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "edit-form",
    itemId: deps.store.selectEditItemId(),
  });
};

export const handleEditDialogImageClick = async (deps) => {
  const { appService, store, render } = deps;
  const copy = selectCopy(deps);
  let file;

  try {
    file = await appService.pickFiles({
      accept: IMAGE_FILE_ACCEPT,
      multiple: false,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedSelectFile,
    });
    return;
  }

  if (!file) {
    return;
  }

  if (!validateImageFileExtension({ appService, copy, file })) {
    return;
  }

  const uploadResult = await uploadImageFile(deps, {
    copy,
    file,
  });

  if (uploadResult === null) {
    return;
  }

  if (!uploadResult) {
    appService.showAlert({
      message: copy.failedUploadSprite,
      title: copy.errorTitle,
    });
    return;
  }

  store.setEditUpload({
    uploadResult,
    previewFileId: getPreviewFileId(uploadResult),
  });
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;

  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.spriteNameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  const editUploadResult = store.selectEditUploadResult();
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  // The name typed in the dialog wins over the replaced file's name.
  const data = editUploadResult
    ? buildImageResourcePatchFromUploadResult(editUploadResult)
    : {};
  data.name = name;
  data.description = values?.description ?? "";
  data.tagIds = Array.isArray(values?.tagIds) ? values.tagIds : [];

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateSprite,
    action: () =>
      projectService.updateCharacterSpriteItem({
        characterId: store.selectCharacterId(),
        spriteId: editItemId,
        fileRecords: editUploadResult?.fileRecords,
        data,
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await refreshCharacterSpritesData(deps);
};

export const handleSpritesheetDialogClose = (deps) => {
  const { render, store } = deps;
  revokeSpritesheetDialogPreviewUrl(store);
  store.closeSpritesheetDialog();
  render();
};

export const handleSpritesheetDialogImageSourceClick = async (deps) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  let files;

  try {
    // A sheet split over several images needs all of them.
    files = await pickSpritesheetSourceFile({
      appService,
      accept: SPRITESHEET_IMAGE_FILE_ACCEPT,
      multiple: true,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedSelectImage,
    });
    return;
  }

  if (!files?.length) {
    return;
  }

  await applySpritesheetDialogSourceFiles({
    deps,
    nextPngFiles: files,
  });
};

export const handleSpritesheetDialogAtlasSourceClick = async (deps) => {
  const { appService } = deps;
  const copy = selectCopy(deps);
  let file;

  try {
    file = await pickSpritesheetSourceFile({
      appService,
      accept: SPRITESHEET_ATLAS_FILE_ACCEPT,
    });
  } catch (error) {
    showResourcePageError({
      appService,
      errorOrResult: error,
      fallbackMessage: copy.failedSelectJsonFile,
    });
    return;
  }

  if (!file) {
    return;
  }

  await applySpritesheetDialogSourceFiles({
    deps,
    nextAtlasFile: file,
  });
};

export const handleSpritesheetDialogFormChange = (deps, payload) => {
  const { render, store } = deps;
  const { name, value, values } = payload._event.detail;
  const nextValues = {
    ...values,
  };

  if (name) {
    nextValues[name] = value ?? "";
  }

  store.setSpritesheetDialogValues({
    values: nextValues,
  });
  render();
};

export const handleSpritesheetDialogFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "spritesheet-form",
    itemId: deps.store.selectSpritesheetDialogItemId(),
  });
};

const closeSpritesheetDialogAfterSave = async (
  deps,
  { createdItemId } = {},
) => {
  const { render, store } = deps;
  revokeSpritesheetDialogPreviewUrl(store);
  store.closeSpritesheetDialog();
  if (createdItemId) {
    store.setSelectedItemId({ itemId: createdItemId });
  }
  render();
  await refreshCharacterSpritesData(deps);
};

// An empty spritesheet has no sheet yet; the spritesheet editor fills it.
const createEmptySpritesheetSprite = async (
  deps,
  { values, characterId } = {},
) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const uploadTarget = resolveCharacterSpriteUploadTarget({
    appService,
    copy,
    store,
    groupId: store.selectSpritesheetDialogParentId(),
  });
  if (!uploadTarget.ok) {
    return;
  }

  const data = {
    type: "spritesheet",
    name: values.name.trim(),
    description: values.description ?? "",
    tagIds: Array.isArray(values.tagIds) ? values.tagIds : [],
    jsonData: {},
    animations: {},
  };

  const spriteId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedCreateSpritesheet,
    action: () =>
      projectService.createCharacterSpriteItem({
        characterId,
        spriteId,
        data,
        parentId: uploadTarget.parentId,
        position: "last",
      }),
  });

  if (createAttempt.ok) {
    await closeSpritesheetDialogAfterSave(deps, { createdItemId: spriteId });
  }
};

export const handleSpritesheetDialogFormAction = async (deps, payload) => {
  const { appService, render, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.spritesheetNameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const characterId = store.selectCharacterId();
  if (!characterId) {
    appService.showAlert({
      message: copy.characterMissing,
      title: copy.errorTitle,
    });
    return;
  }

  if (store.selectIsSpritesheetDialogSubmitting()) {
    return;
  }

  store.setSpritesheetDialogSubmitting({ value: true });
  render();
  try {
    if (store.selectSpritesheetDialogCreatesEmpty()) {
      await createEmptySpritesheetSprite(deps, { values, characterId });
      return;
    }

    await submitSpritesheetFileDialog(deps, { values, characterId });
  } finally {
    store.setSpritesheetDialogSubmitting({ value: false });
    render();
  }
};

const submitSpritesheetFileDialog = async (
  deps,
  { values, characterId } = {},
) => {
  const { appService, i18n, projectService, store } = deps;
  const copy = selectCopy(deps);
  const dialogMode = store.selectSpritesheetDialogMode();
  const dialogItemId = store.selectSpritesheetDialogItemId();
  const dialogParentId = store.selectSpritesheetDialogParentId();
  const importData = store.selectSpritesheetDialogImportData();
  const dialogAnimations = store.selectSpritesheetDialogDraftAnimations();
  const dialogSourceFiles = store.selectSpritesheetDialogSourceFiles();
  const existingItem = dialogItemId
    ? store.selectSpriteItemById({ itemId: dialogItemId })
    : undefined;

  if (dialogMode === "create" && !dialogSourceFiles?.pngFile) {
    appService.showAlert({
      message: copy.spritesheetImageRequired,
      title: copy.warningTitle,
    });
    return;
  }

  if (dialogMode === "create" && !dialogSourceFiles?.atlasFile) {
    appService.showAlert({
      message: copy.spritesheetJsonRequired,
      title: copy.warningTitle,
    });
    return;
  }

  // An empty spritesheet needs its image along with a JSON.
  if (
    existingItem &&
    !existingItem.fileId &&
    dialogSourceFiles?.atlasFile &&
    !dialogSourceFiles?.pngFile
  ) {
    appService.showAlert({
      message: copy.spritesheetImageRequired,
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

  let createParentId;
  if (dialogMode === "create") {
    const uploadTarget = resolveCharacterSpriteUploadTarget({
      appService,
      copy,
      store,
      groupId: dialogParentId,
    });
    if (!uploadTarget.ok) {
      return;
    }
    createParentId = uploadTarget.parentId;
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
      message: copy.failedUploadSpritesheetImage,
      title: copy.errorTitle,
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
    const spriteId = generateId();
    const createAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: copy.failedCreateSpritesheet,
      action: () =>
        projectService.createCharacterSpriteItem({
          characterId,
          spriteId,
          fileRecords: uploadResult?.fileRecords,
          data: {
            type: "spritesheet",
            ...spritesheetData,
          },
          parentId: createParentId,
          position: "last",
        }),
    });

    if (createAttempt.ok) {
      await closeSpritesheetDialogAfterSave(deps, { createdItemId: spriteId });
    }
    return;
  }

  if (!dialogItemId || existingItem?.type !== "spritesheet") {
    appService.showAlert({
      message: copy.spritesheetNotFound,
      title: copy.errorTitle,
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
    fallbackMessage: copy.failedUpdateSpritesheet,
    action: () =>
      projectService.updateCharacterSpriteItem({
        characterId,
        spriteId: dialogItemId,
        fileRecords: uploadResult?.fileRecords,
        data: spritesheetData,
      }),
  });

  if (updateAttempt.ok) {
    await closeSpritesheetDialogAfterSave(deps);
  }
};

export const handleSpritesheetDialogSubmitClick = async (deps) => {
  const { spritesheetDialogForm } = deps.refs;
  await handleSpritesheetDialogFormAction(deps, {
    _event: {
      detail: {
        actionId: "submit",
        values: spritesheetDialogForm.getValues(),
      },
    },
  });
};

export const handleSpritesheetDialogFormSubmitKeyDown = (deps, payload) =>
  forwardFormSubmitOnEnter({
    deps,
    payload,
    submit: handleSpritesheetDialogSubmitClick,
  });

export const handleDetailClipClick = (deps, payload) => {
  const clipName = payload._event.currentTarget.dataset.clipName;
  if (!clipName) {
    return;
  }

  const { render, store } = deps;
  store.setDetailSelectedClipName({ clipName });
  render();
};

export const handleSpritesheetDialogClipClick = (deps, payload) => {
  const clipName = payload._event.currentTarget.dataset.clipName;
  if (!clipName) {
    return;
  }

  const { render, store } = deps;
  store.setSpritesheetDialogSelectedClipName({ clipName });
  render();
};

export const handleSpritesheetDialogClipDoubleClick = (deps, payload) => {
  const clipName = payload._event.currentTarget.dataset.clipName;
  if (!clipName) {
    return;
  }

  const { render, store } = deps;
  if (store.selectSpritesheetDialogMode() === "preview") {
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
      message: copy.clipFpsRequired,
      title: copy.warningTitle,
    });
    return;
  }

  store.setSpritesheetDialogClipFps({
    clipName: store.selectClipFpsDialogClipName(),
    fps,
  });
  store.closeClipFpsDialog();
  render();
};

export const handleSearchInput = (deps, payload) => {
  const { render, store } = deps;
  store.setSearchQuery({ query: payload._event.detail.value ?? "" });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  const characterId = store.selectCharacterId();

  if (!characterId || !itemId) {
    return;
  }

  const usage = await projectService.checkResourceUsage({
    itemId,
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showAlert({
      message: copy.cannotDeleteResourceInUse,
    });
    return;
  }

  const deleteResult = await projectService.deleteCharacterSpriteItem({
    characterId,
    spriteIds: [itemId],
  });

  if (deleteResult?.valid === false) {
    showResourcePageError({
      appService,
      errorOrResult: deleteResult,
      fallbackMessage: copy.failedDeleteSprite,
      title: copy.errorTitle,
    });
    return;
  }

  await refreshCharacterSpritesData(deps);
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/project/characters", appService.getPayload(), {
    historyMode: "replace",
  });
};

const {
  openCreateTagDialogForMode,
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
} = createResourcePageTagHandlers({
  resolveScopeKey: ({ deps }) =>
    resolveCharacterSpriteTagScopeKey(deps.store.selectCharacterId()),
  copy: ({ i18n }) => selectCharacterSpritesPageCopy(i18n),
  updateItemTagIds: ({ deps, itemId, tagIds }) =>
    deps.projectService.updateCharacterSpriteItem({
      characterId: deps.store.selectCharacterId(),
      spriteId: itemId,
      data: {
        tagIds,
      },
    }),
  refreshAfterItemTagUpdate: ({ deps }) => refreshCharacterSpritesData(deps),
  getSelectedItemTagIds: ({ deps, itemId }) =>
    deps.store.selectSpriteItemById({
      itemId: itemId ?? deps.store.selectSelectedItemId(),
    })?.tagIds ?? [],
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    if (mode === "edit-form") {
      appendTagIdToForm({
        form: deps.refs.editForm,
        tagId,
      });
    }

    if (mode === "spritesheet-form") {
      appendTagIdToForm({
        form: selectSpritesheetDialogFormRef(deps),
        tagId,
      });
    }
  },
  updateItemTagFallbackMessage: ({ deps }) =>
    selectCopy(deps).failedUpdateSpriteTags,
});

export {
  handleCreateTagDialogClose,
  handleTagFilterChange,
  handleDetailTagAddOptionClick,
  handleDetailTagDraftValueChange,
  handleDetailTagOpenChange,
  handleDetailTagValueChange,
  handleCreateTagFormAction,
};
