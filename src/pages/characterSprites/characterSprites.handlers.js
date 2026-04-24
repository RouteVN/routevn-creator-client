import { generateId, generatePrefixedId } from "../../internal/id.js";
import { processWithConcurrency } from "../../internal/processWithConcurrency.js";
import { createCharacterSpritesFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import {
  appendTagIdToForm,
  createResourcePageTagHandlers,
} from "../../internal/ui/resourcePages/tags.js";
import {
  closeMobileResourceFileExplorerAfterSelection,
  handleMobileResourceDetailSheetClose,
  handleMobileResourceFileExplorerClose,
  handleMobileResourceFileExplorerOpen,
  syncMobileResourcePageUiConfig,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  getResourcePageErrorMessage,
  runResourcePageMutation,
  showResourcePageError,
} from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import { createProjectStateStream } from "../../deps/services/shared/projectStateStream.js";
import {
  buildImageResourceDataFromUploadResult,
  buildImageResourcePatchFromUploadResult,
} from "../../deps/services/shared/resourceImports.js";
import { tap } from "rxjs";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { withResolvedCollectionFileMetadata } from "../../internal/resourceFileMetadata.js";

const EMPTY_TREE = { items: {}, tree: [] };
const ACCEPTED_FILE_TYPES = ".jpg,.jpeg,.png,.webp";
const MAX_PARALLEL_UPLOADS = 1;
const CREATE_SPRITE_ABORT_ERROR = "create-sprite-abort";
const CHARACTER_SPRITE_TAG_SCOPE_PREFIX = "characterSprites:";

const createPendingUploads = ({ files, parentId } = {}) => {
  if (!parentId) {
    return [];
  }

  return (Array.isArray(files) ? files : []).map((file) => ({
    id: generatePrefixedId("pending-sprite-"),
    file,
    parentId,
    name: file.name.replace(/\.[^.]+$/, ""),
  }));
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

const {
  focusKeyboardScope: focusGroupView,
  handleKeyboardScopeClick: handleFileExplorerKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleBaseFileExplorerKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  isNavigationBlocked: ({ deps }) =>
    deps.store.getState().fullImagePreviewVisible,
  onEnterKey: ({ deps, selectedItemId }) => {
    openSpritePreviewById({ deps, itemId: selectedItemId, syncExplorer: true });
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
  const characterId =
    store.selectCharacterId() ?? getCharacterIdFromPayload(deps);
  const state =
    repositoryState ??
    projectService.getRepositoryState?.() ??
    projectService.getState();

  if (!characterId) {
    appService.showAlert({ message: "Character is missing.", title: "Error" });
    return false;
  }

  const character = state?.characters?.items?.[characterId];
  if (!character) {
    appService.showAlert({ message: "Character not found.", title: "Error" });
    return false;
  }

  const tagsData = getTagsCollection(
    state,
    resolveCharacterSpriteTagScopeKey(characterId),
  );
  const spritesData = withResolvedCollectionFileMetadata({
    collection: resolveCollectionWithTags({
      collection: character.sprites ?? EMPTY_TREE,
      tagsCollection: tagsData,
      itemType: "image",
    }),
    files: state?.files,
    resourceTypes: ["image"],
  });

  store.setCharacterId({ characterId });
  store.setCharacterName({ characterName: character.name });
  store.setTagsData({ tagsData });
  store.setItems({ spritesData });

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

const selectSprite = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  store.setSelectedItemId({ itemId });

  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  render();
  refs.groupview?.scrollItemIntoView?.({ itemId });
};

const openSpritePreviewById = ({ deps, itemId, syncExplorer = false } = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  store.setSelectedItemId({ itemId });
  if (syncExplorer) {
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.showFullImagePreview({ itemId });
  render();
  refs.groupview?.scrollItemIntoView?.({ itemId });
  focusPreviewOverlay(deps);
};

const openEditDialogForSprite = ({
  deps,
  itemId,
  syncExplorer = false,
} = {}) => {
  const { refs, render, store } = deps;
  const item = store.selectSpriteItemById({ itemId });

  if (!itemId || !item) {
    return;
  }

  store.setSelectedItemId({ itemId });
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

const createSpritesFromFiles = async ({
  deps,
  files,
  parentId = undefined,
} = {}) => {
  const { appService, projectService, store, render } = deps;
  const characterId = store.selectCharacterId();
  if (!characterId) {
    appService.showAlert({ message: "Character is missing.", title: "Error" });
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
        const spriteId = generateId();
        store.updatePendingUpload({
          itemId: pendingUploadId,
          updates: {
            resolvedItemId: spriteId,
          },
        });

        const createAttempt = await runResourcePageMutation({
          appService,
          fallbackMessage: "Failed to create sprite.",
          action: () =>
            projectService.createCharacterSpriteItem({
              characterId,
              spriteId,
              fileRecords: uploadResult.fileRecords,
              parentId,
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
      fallbackMessage: "Failed to upload sprites.",
    });
    return;
  }

  if (successfulUploadCount === 0) {
    appService.showAlert({
      message: "Failed to upload sprites.",
      title: "Error",
    });
    return;
  }

  if (createdCount > 0) {
    await refreshCharacterSpritesData(deps);
  }
};

export const handleBeforeMount = (deps) => {
  const { projectService } = deps;
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
    store.setSelectedItemId({ itemId: undefined });
    render();
    focusGroupView(deps);
    return;
  }

  selectSprite({
    deps,
    itemId,
  });
  closeMobileResourceFileExplorerAfterSelection(deps);
  refs.groupview?.scrollItemIntoView?.({ itemId });
  focusGroupView(deps);
};

export const handleFileExplorerDoubleClick = (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;

  if (isFolder || !itemId) {
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

export const handleSpriteItemDoubleClick = (deps, payload) => {
  const { itemId } = payload._event.detail;

  if (!itemId) {
    return;
  }

  openSpritePreviewById({ deps, itemId, syncExplorer: true });
};

export const handleSpriteItemPreview = (deps, payload) => {
  const { itemId } = payload._event.detail;

  if (!itemId) {
    return;
  }

  openSpritePreviewById({ deps, itemId, syncExplorer: true });
};

export const handlePreviewOverlayClick = (deps) => {
  const { store, render } = deps;
  store.hideFullImagePreview();
  render();
  focusGroupView(deps);
};

export const handlePreviewOverlayKeyDown = (deps, payload) => {
  const { store } = deps;
  const event = payload._event;

  if (!store.getState().fullImagePreviewVisible) {
    return;
  }

  if (event.key === "Escape" || event.key === "Enter") {
    event.preventDefault();
    event.stopPropagation();
    store.hideFullImagePreview();
    deps.render();
    focusGroupView(deps);
    return;
  }

  let direction;
  if (event.key === "ArrowDown") {
    direction = "next";
  } else if (event.key === "ArrowUp") {
    direction = "previous";
  }

  if (!direction) {
    return;
  }

  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();

  const nextItemId = store.selectAdjacentSpriteItemId({
    itemId: selectedItemId,
    direction,
  });
  if (!nextItemId) {
    return;
  }

  openSpritePreviewById({ deps, itemId: nextItemId, syncExplorer: true });
};

export const handleFileExplorerKeyboardScopeKeyDown =
  handleBaseFileExplorerKeyboardScopeKeyDown;

export const handleSpriteItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;

  openEditDialogForSprite({
    deps,
    itemId,
    syncExplorer: true,
  });
};

export const handleDetailHeaderClick = (deps) => {
  const selectedItemId = deps.store.selectSelectedItemId();

  openEditDialogForSprite({
    deps,
    itemId: selectedItemId,
  });
};

export const handleUploadClick = async (deps, payload) => {
  const { appService } = deps;
  const { groupId } = payload._event.detail;
  let files;

  try {
    files = await appService.pickFiles({
      accept: ACCEPTED_FILE_TYPES,
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

  await createSpritesFromFiles({
    deps,
    files,
    parentId: groupId,
  });
};

export const handleFilesDropped = async (deps, payload) => {
  const { files, targetGroupId } = payload._event.detail;

  await createSpritesFromFiles({
    deps,
    files,
    parentId: targetGroupId,
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
      accept: ACCEPTED_FILE_TYPES,
      multiple: false,
      upload: true,
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

  if (!(file.uploadSucessful && file.uploadResult)) {
    appService.showAlert({
      message: "Failed to upload sprite.",
      title: "Error",
    });
    return;
  }

  const uploadResult = file.uploadResult;
  const characterId = store.selectCharacterId();
  if (!characterId) {
    appService.showAlert({ message: "Character is missing.", title: "Error" });
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update sprite.",
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
    itemId: deps.store.getState().editItemId,
  });
};

export const handleEditDialogImageClick = async (deps) => {
  const { appService, store, render } = deps;
  let file;

  try {
    file = await appService.pickFiles({
      accept: ACCEPTED_FILE_TYPES,
      multiple: false,
      upload: true,
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

  if (!(file.uploadSucessful && file.uploadResult)) {
    appService.showAlert({
      message: "Failed to upload sprite.",
      title: "Error",
    });
    return;
  }

  store.setEditUpload({
    uploadResult: file.uploadResult,
    previewFileId: getPreviewFileId(file.uploadResult),
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
    appService.showAlert({
      message: "Sprite name is required.",
      title: "Warning",
    });
    return;
  }

  const { editItemId, editUploadResult } = store.getState();
  if (!editItemId) {
    store.closeEditDialog();
    render();
    return;
  }

  const data = {
    name,
    description: values?.description ?? "",
    tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
  };

  if (editUploadResult) {
    Object.assign(
      data,
      buildImageResourcePatchFromUploadResult(editUploadResult),
    );
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update sprite.",
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

export const handleSearchInput = (deps, payload) => {
  const { render, store } = deps;
  store.setSearchQuery({ query: payload._event.detail.value ?? "" });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService, store } = deps;
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
      message: "Cannot delete resource, it is currently in use.",
    });
    return;
  }

  const deleteResult = await projectService.deleteCharacterSpriteItem({
    characterId,
    spriteIds: [itemId],
  });

  if (deleteResult?.valid === false) {
    appService.showAlert({
      message: getResourcePageErrorMessage(
        deleteResult,
        "Failed to delete sprite.",
      ),
      title: "Error",
    });
    return;
  }

  await refreshCharacterSpritesData(deps);
};

export const handleBackClick = (deps) => {
  const { appService } = deps;
  appService.navigate("/project/characters", appService.getPayload());
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
    if (mode !== "edit-form") {
      return;
    }

    appendTagIdToForm({
      form: deps.refs.editForm,
      tagId,
    });
  },
  updateItemTagFallbackMessage: "Failed to update sprite tags.",
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
