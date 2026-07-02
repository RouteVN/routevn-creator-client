import { generateId } from "../../internal/id.js";
import {
  IMPORT_PACK_SCHEMA,
  downloadImportFile,
  fetchImportPackageJson,
  isImportPackageValidationError,
  isPlainObject,
  isValidHttpUrl,
  normalizeImportParentId,
  validateImportFileDescriptor,
  validateImportPackageObject,
} from "../../internal/importPackages.js";
import { toFlatItems } from "../../internal/project/tree.js";
import { createAnimationEditorPayload } from "../../internal/animationEditorRoute.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { ANIMATION_TAG_SCOPE_KEY } from "./animations.store.js";
import {
  renderSelectedAnimationPreview,
  stopAnimationPreviewPlayback,
} from "./support/animationPreviewRuntime.js";
import { selectAnimationsPageCopy } from "./support/animationsPageCopy.js";

const DEFAULT_IMPORTED_ANIMATION_NAME = "Imported Animation";

const selectCopy = (deps = {}) => selectAnimationsPageCopy(deps.i18n);

const clonePlainData = (value) => {
  return isPlainObject(value) ? structuredClone(value) : {};
};

const getAnimationItemsFromCollection = (collection) => {
  if (!isPlainObject(collection)) {
    return [];
  }

  const treeItems = Array.isArray(collection.tree)
    ? toFlatItems(collection)
    : [];
  const sourceItems =
    treeItems.length > 0 ? treeItems : Object.values(collection.items ?? {});

  return sourceItems.filter((item) => item?.type === "animation");
};

const sortPrimaryAnimationFirst = (items, input) => {
  const primary = input?.primary;
  if (primary?.resourceType !== "animations" || !primary.id) {
    return items;
  }

  const primaryIndex = items.findIndex((item) => item.id === primary.id);
  if (primaryIndex <= 0) {
    return items;
  }

  const nextItems = [...items];
  const [primaryItem] = nextItems.splice(primaryIndex, 1);
  nextItems.unshift(primaryItem);
  return nextItems;
};

const resolveAnimationImportItems = (input) => {
  if (!isPlainObject(input)) {
    return [];
  }

  if (input.schema === IMPORT_PACK_SCHEMA && input.repository?.animations) {
    return sortPrimaryAnimationFirst(
      getAnimationItemsFromCollection(input.repository.animations),
      input,
    );
  }

  if (input.repository?.animations) {
    return getAnimationItemsFromCollection(input.repository.animations);
  }

  if (input.items || input.tree) {
    return getAnimationItemsFromCollection(input);
  }

  return input.type === "animation" ? [input] : [];
};

const collectMaskImageIds = (mask, imageIds) => {
  if (!isPlainObject(mask)) {
    return;
  }

  if (mask.imageId) {
    imageIds.add(mask.imageId);
  }

  for (const imageId of mask.imageIds ?? []) {
    if (imageId) {
      imageIds.add(imageId);
    }
  }

  for (const item of mask.items ?? []) {
    if (item?.imageId) {
      imageIds.add(item.imageId);
    }
  }
};

const collectAnimationImageIds = (animationItems = []) => {
  const imageIds = new Set();
  for (const item of animationItems) {
    collectMaskImageIds(item?.animation?.mask, imageIds);
  }
  return imageIds;
};

const getImportImageItems = (importInput, imageIds) => {
  const items = importInput?.repository?.images?.items;
  if (!isPlainObject(items) || imageIds.size === 0) {
    return [];
  }

  return Object.values(items).filter(
    (item) => item?.type === "image" && imageIds.has(item.id),
  );
};

const hasImportImageDependencies = (importInput, animationItems) => {
  const imageIds = collectAnimationImageIds(animationItems);
  return getImportImageItems(importInput, imageIds).length > 0;
};

const getImportImageItemsById = (importInput) => {
  return isPlainObject(importInput?.repository?.images?.items)
    ? importInput.repository.images.items
    : {};
};

const getImportItemLabel = (item, fallback) => {
  return item?.name ?? item?.id ?? fallback;
};

const getAnimationItemValidationMessage = (item, copy = {}) => {
  if (!isPlainObject(item) || item.type !== "animation") {
    return copy.noAnimationFoundToImport ?? "No animation found to import.";
  }

  const label = getImportItemLabel(
    item,
    copy.importedAnimationFallback ?? "Imported animation",
  );
  if (item.name !== undefined && typeof item.name !== "string") {
    return formatI18nCopy(
      copy.animationNameMustBeText ?? 'Animation "{label}" name must be text.',
      { label },
    );
  }

  if (item.description !== undefined && typeof item.description !== "string") {
    return formatI18nCopy(
      copy.animationDescriptionMustBeText ??
        'Animation "{label}" description must be text.',
      { label },
    );
  }

  if (
    item.tagIds !== undefined &&
    (!Array.isArray(item.tagIds) ||
      item.tagIds.some((tagId) => typeof tagId !== "string"))
  ) {
    return formatI18nCopy(
      copy.animationTagsMustBeTextIds ??
        'Animation "{label}" tags must be text ids.',
      { label },
    );
  }

  if (!isPlainObject(item.animation)) {
    return formatI18nCopy(
      copy.animationDataMissing ??
        'Animation "{label}" is missing animation data.',
      { label },
    );
  }

  if (!["update", "transition"].includes(item.animation.type)) {
    return formatI18nCopy(
      copy.unsupportedAnimationType ??
        'Animation "{label}" has an unsupported animation type.',
      { label },
    );
  }

  return undefined;
};

const getAnimationImageDependencyValidationMessage = ({
  importInput,
  animationItems,
  copy = {},
} = {}) => {
  const imageIds = collectAnimationImageIds(animationItems);
  if (imageIds.size === 0) {
    return undefined;
  }

  const imageItemsById = getImportImageItemsById(importInput);
  for (const imageId of imageIds) {
    const imageItem = imageItemsById[imageId];
    if (!isPlainObject(imageItem) || imageItem.type !== "image") {
      return formatI18nCopy(
        copy.imageDependencyMissing ??
          'Image dependency "{imageId}" is missing from the package.',
        { imageId },
      );
    }

    const label = formatI18nCopy(
      copy.imageDependencyLabel ?? 'Image dependency "{label}"',
      {
        label: getImportItemLabel(imageItem, imageId),
      },
    );
    try {
      validateImportFileDescriptor({
        importInput,
        fileId: imageItem.fileId,
        label,
      });
    } catch (error) {
      return getImportErrorMessage(
        error,
        formatI18nCopy(
          copy.imageDependencyInvalidFileMetadata ??
            "{label} has invalid file metadata.",
          { label },
        ),
      );
    }
  }

  return undefined;
};

const getAnimationImportValidationMessage = ({
  importInput,
  animationItems,
  copy = {},
} = {}) => {
  try {
    validateImportPackageObject(importInput);
  } catch (error) {
    return getImportErrorMessage(
      error,
      copy.importPackageInvalid ?? "Import package is invalid.",
    );
  }

  if (animationItems.length === 0) {
    return copy.noAnimationFoundToImport ?? "No animation found to import.";
  }

  for (const item of animationItems) {
    const itemMessage = getAnimationItemValidationMessage(item, copy);
    if (itemMessage) {
      return itemMessage;
    }
  }

  return getAnimationImageDependencyValidationMessage({
    importInput,
    animationItems,
    copy,
  });
};

const importImageDependencies = async ({
  importInput,
  projectService,
  imageParentId,
  animationItems,
  copy = {},
} = {}) => {
  const imageIdMap = new Map();
  const imageIds = collectAnimationImageIds(animationItems);
  const imageItems = getImportImageItems(importInput, imageIds);

  for (const imageItem of imageItems) {
    const fileDescriptor = validateImportFileDescriptor({
      importInput,
      fileId: imageItem.fileId,
      label: formatI18nCopy(
        copy.imageDependencyLabel ?? 'Image dependency "{label}"',
        {
          label: imageItem.name ?? imageItem.id,
        },
      ),
    });

    const file = await downloadImportFile(fileDescriptor);
    const imageId = generateId();
    const result = await projectService.importImageFile({
      file,
      imageId,
      parentId: imageParentId,
    });

    if (result?.valid === false) {
      throw result;
    }

    imageIdMap.set(imageItem.id, result?.imageId ?? imageId);
  }

  return imageIdMap;
};

const resolveImageId = (imageId, imageIdMap) => {
  return imageIdMap.get(imageId) ?? imageId;
};

const rewriteMaskImageRefs = (mask, imageIdMap) => {
  if (!isPlainObject(mask) || imageIdMap.size === 0) {
    return mask;
  }

  const nextMask = { ...mask };
  if (nextMask.imageId) {
    nextMask.imageId = resolveImageId(nextMask.imageId, imageIdMap);
  }

  if (Array.isArray(nextMask.imageIds)) {
    nextMask.imageIds = nextMask.imageIds.map((imageId) =>
      resolveImageId(imageId, imageIdMap),
    );
  }

  if (Array.isArray(nextMask.items)) {
    nextMask.items = nextMask.items.map((item) => {
      if (!item?.imageId) {
        return item;
      }

      return {
        ...item,
        imageId: resolveImageId(item.imageId, imageIdMap),
      };
    });
  }

  return nextMask;
};

const removeImportedResourceMetadata = (data) => {
  delete data.id;
  delete data.parentId;
  delete data._level;
  delete data.fullLabel;
  delete data.hasChildren;
  delete data.children;
};

const normalizeImportedAnimationData = (
  item,
  { imageIdMap, copy = {} } = {},
) => {
  const data = clonePlainData(item);
  removeImportedResourceMetadata(data);

  data.type = "animation";
  data.name =
    data.name ?? copy.importedAnimationName ?? DEFAULT_IMPORTED_ANIMATION_NAME;
  data.description = data.description ?? "";
  data.tagIds = Array.isArray(data.tagIds) ? data.tagIds : [];

  if (!isPlainObject(data.animation)) {
    data.animation = {
      type: "update",
      tween: {},
    };
  }

  if (data.animation.type === "transition" && data.animation.mask) {
    data.animation = {
      ...data.animation,
      mask: rewriteMaskImageRefs(data.animation.mask, imageIdMap ?? new Map()),
    };
  }

  return data;
};

const resolveAnimationImportInput = async ({
  appService,
  values,
  copy = {},
} = {}) => {
  const url = `${values?.url ?? ""}`.trim();
  if (!url) {
    showImportError(
      appService,
      copy.importUrlRequired ?? "Import URL is required.",
      copy,
    );
    return;
  }

  if (!isValidHttpUrl(url)) {
    showImportError(
      appService,
      copy.invalidImportUrl ?? "Enter a valid http(s) URL.",
      copy,
    );
    return;
  }

  try {
    return await fetchImportPackageJson({ url });
  } catch (error) {
    showImportError(
      appService,
      isImportPackageValidationError(error)
        ? error.message
        : (copy.packageLoadFailed ?? "Package could not be loaded."),
      copy,
    );
    return;
  }
};

const showImportError = (appService, message, copy = {}) => {
  if (typeof appService?.showAlert === "function") {
    appService.showAlert({
      message,
      title: copy.errorTitle ?? "Error",
    });
    return;
  }

  appService?.showToast?.({ message });
};

const showImportSuccess = (appService, count, copy = {}) => {
  appService?.showToast?.({
    message:
      count === 1
        ? (copy.animationImported ?? "Animation imported.")
        : (copy.animationsImported ?? "Animations imported."),
  });
};

const clearImportVisibilityFilters = (store) => {
  store.setSearchQuery?.({ value: "" });
  store.setActiveTagIds?.({ tagIds: [] });
};

const getImportErrorMessage = (error, fallback) => {
  return error?.error?.message ?? error?.message ?? fallback;
};

const getImportValidationMessage = (copy = {}) => {
  return copy.importUrlRequired ?? "Import URL is required.";
};

const navigateToAnimationEditor = ({
  appService,
  animationId,
  dialogType,
  targetGroupId,
  name,
  description,
} = {}) => {
  const currentPayload = appService.getPayload() || {};
  appService.navigate("/project/animation-editor", {
    ...createAnimationEditorPayload({
      payload: currentPayload,
      animationId,
      dialogType,
      targetGroupId,
      name,
      description,
    }),
  });
};

const normalizeSelectedAnimation = (deps) => {
  const { render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  const selectedAnimation = store.selectAnimationItemById({
    itemId: selectedItemId,
  });
  if (selectedAnimation) {
    return;
  }

  store.setSelectedItemId({
    itemId: undefined,
  });
  render();
};

const {
  handleBeforeMount: handleBeforeMountBase,
  handleAfterMount: handleAfterMountBase,
  refreshData: refreshDataBase,
  handleFileExplorerSelectionChanged: handleFileExplorerSelectionChangedBase,
  handleFileExplorerAction: handleFileExplorerActionBase,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleItemClick: handleAnimationItemClickBase,
  handleSearchInput,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  openFolderNameDialogWithValues,
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
} = createCatalogPageHandlers({
  resourceType: "animations",
  copy: ({ i18n }) => selectAnimationsPageCopy(i18n),
  selectData: (repositoryState) => {
    const tagsData = getTagsCollection(
      repositoryState,
      ANIMATION_TAG_SCOPE_KEY,
    );

    return resolveCollectionWithTags({
      collection: repositoryState?.animations,
      tagsCollection: tagsData,
      itemType: "animation",
    });
  },
  onProjectStateChanged: ({ deps, repositoryState }) => {
    deps.store.setTagsData({
      tagsData: getTagsCollection(repositoryState, ANIMATION_TAG_SCOPE_KEY),
    });
    deps.store.setProjectResolution({
      projectResolution: repositoryState?.project?.resolution,
    });
    deps.store.setImagesData({
      imagesData: repositoryState?.images,
    });
  },
  createExplorerHandlers: ({ refresh }) =>
    createResourceFileExplorerHandlers({
      resourceType: "animations",
      copy: ({ i18n }) => selectAnimationsPageCopy(i18n),
      refresh: async (deps, options) => {
        await refresh(deps, options);
        normalizeSelectedAnimation(deps);
        deps.store.clearPreviewRuntime();
        await renderSelectedAnimationPreview(deps, {
          forceInit: true,
        });
      },
    }),
  tagging: {
    scopeKey: ANIMATION_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateAnimation({
        animationId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags ?? "Failed to update animation tags.",
    appendCreatedTagByMode: ({ deps, mode, tagId }) => {
      if (mode === "add-form") {
        appendTagIdToForm({
          form: deps.refs.addForm,
          tagId,
        });
        return;
      }

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

const refreshAnimationData = async (deps, options = {}) => {
  deps.store.setAnimationPreviewVisible?.({
    visible: false,
  });
  await refreshDataBase(deps, options);
  normalizeSelectedAnimation(deps);
  deps.store.clearPreviewRuntime();
  await renderSelectedAnimationPreview(deps, {
    forceInit: true,
  });
};

export {
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleSearchInput,
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

export const handleDataChanged = refreshAnimationData;

export const handleBeforeMount = (deps) => {
  const cleanupBase = handleBeforeMountBase(deps);

  return () => {
    cleanupBase?.();
    stopAnimationPreviewPlayback({
      store: deps.store,
    });
    deps.store.setAnimationPreviewRequestId?.({
      requestId: undefined,
    });
    deps.store.clearPreviewRuntime();
    void deps.graphicsService?.destroy?.();
  };
};

export const handleAfterMount = (deps) => {
  handleAfterMountBase(deps);
  void renderSelectedAnimationPreview(deps, {
    forceInit: true,
  });
};

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  deps.store.setAnimationPreviewVisible?.({
    visible: false,
  });
  handleFileExplorerSelectionChangedBase(deps, payload);
  deps.store.clearPreviewRuntime();
  await renderSelectedAnimationPreview(deps, {
    forceInit: true,
  });
};

export const handleAnimationItemClick = async (deps, payload) => {
  deps.store.setAnimationPreviewVisible?.({
    visible: false,
  });
  handleAnimationItemClickBase(deps, payload);
  deps.store.clearPreviewRuntime();
  await renderSelectedAnimationPreview(deps, {
    forceInit: true,
  });
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { refs, render, store } = deps;
  const { editForm, fileExplorer } = refs;
  const item = store.selectAnimationItemById({ itemId });
  if (!item) {
    return;
  }

  const editValues = {
    name: item.name ?? "",
    description: item.description ?? "",
    tagIds: item.tagIds ?? [],
  };

  store.setSelectedItemId({ itemId });
  fileExplorer?.selectItem?.({ itemId });
  store.openEditDialog({
    itemId,
    defaultValues: editValues,
  });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

const openAnimationEditor = ({ appService, store, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const itemData = store.selectAnimationDisplayItemById({ itemId });
  if (!itemData) {
    return;
  }

  navigateToAnimationEditor({
    appService,
    animationId: itemId,
  });
};

const createInitialAnimationResourceData = ({
  name,
  description,
  dialogType,
  tagIds,
} = {}) => {
  if (dialogType === "transition") {
    return {
      type: "animation",
      name,
      description,
      tagIds,
      animation: {
        type: "transition",
      },
    };
  }

  return {
    type: "animation",
    name,
    description,
    tagIds,
    animation: {
      type: "update",
      tween: {},
    },
  };
};

export const handleFileExplorerAction = async (deps, payload) => {
  const detail = payload?._event?.detail ?? {};
  const action = (detail.item || detail)?.value;

  if (action === "edit-item") {
    openEditDialogWithValues({
      deps,
      itemId: detail.itemId,
    });
    return;
  }

  await handleFileExplorerActionBase(deps, payload);
};

export const handleAddAnimationClick = async (deps, payload) => {
  const { render, store } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId });
  render();
};

export const handleImportAnimationClick = (deps) => {
  const { render, store } = deps;

  store.openImportDialog();
  render();
};

export const handleImportDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeImportDialog();
  render();
};

export const handleImportFormActionClick = async (deps, payload) => {
  const { appService, projectService, store, render } = deps;
  const copy = selectCopy(deps);
  const { actionId, values, valid } = payload._event.detail;

  if (actionId === "cancel") {
    store.closeImportDialog();
    render();
    return;
  }

  if (actionId === "back") {
    store.openImportSourceStep();
    render();
    return;
  }

  if (actionId === "continue") {
    if (valid === false) {
      showImportError(appService, getImportValidationMessage(copy), copy);
      return;
    }

    const importInput = await resolveAnimationImportInput({
      appService,
      values,
      copy,
    });
    if (!importInput) {
      return;
    }

    const importItems = resolveAnimationImportItems(importInput);
    const validationMessage = getAnimationImportValidationMessage({
      importInput,
      animationItems: importItems,
      copy,
    });
    if (validationMessage) {
      showImportError(appService, validationMessage, copy);
      return;
    }

    store.openImportDestinationStep({
      importInput,
      sourceValues: values,
      includeImages: hasImportImageDependencies(importInput, importItems),
    });
    render();
    return;
  }

  if (actionId !== "import") {
    return;
  }

  if (valid === false) {
    showImportError(
      appService,
      copy.chooseDestinationFolders ?? "Choose destination folders.",
      copy,
    );
    return;
  }

  store.setImportDestinationValues?.({ values });
  const importInput = store.selectImportDialogPendingInput?.();
  if (!importInput) {
    showImportError(
      appService,
      copy.importPackageMissingBack ??
        "Import package is missing. Click Back and continue again.",
      copy,
    );
    return;
  }

  const importItems = resolveAnimationImportItems(importInput);
  const validationMessage = getAnimationImportValidationMessage({
    importInput,
    animationItems: importItems,
    copy,
  });
  if (validationMessage) {
    showImportError(appService, validationMessage, copy);
    return;
  }

  const imageParentId = normalizeImportParentId(
    values?.imageFolderId ?? store.selectImportDialogImageFolderId?.(),
  );
  let imageIdMap = new Map();
  try {
    imageIdMap = await importImageDependencies({
      importInput,
      projectService,
      imageParentId,
      animationItems: importItems,
      copy,
    });
  } catch (error) {
    showImportError(
      appService,
      getImportErrorMessage(
        error,
        copy.imageDependenciesImportFailed ??
          "Image dependencies could not be imported.",
      ),
      copy,
    );
    return;
  }

  const targetGroupId = normalizeImportParentId(
    values?.animationFolderId ?? store.selectImportDialogTargetGroupId?.(),
  );
  const importedAnimationIds = [];

  for (const item of importItems) {
    const animationId = generateId();
    const importAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage:
        copy.failedImportAnimation ?? "Failed to import animation.",
      action: () =>
        projectService.createAnimation({
          animationId,
          data: normalizeImportedAnimationData(item, {
            imageIdMap,
            copy,
          }),
          parentId: targetGroupId,
          position: "last",
        }),
    });

    if (!importAttempt.ok) {
      return;
    }

    importedAnimationIds.push(animationId);
  }

  store.closeImportDialog();
  clearImportVisibilityFilters(store);
  showImportSuccess(appService, importedAnimationIds.length, copy);
  await handleDataChanged(deps, {
    selectedItemId: importedAnimationIds[0],
  });
};

export const handleAnimationItemDoubleClick = (deps, payload) => {
  const { appService, store } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  openAnimationEditor({
    appService,
    store,
    itemId,
  });
};

export const handleMobileDetailOpenClick = (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  handleAnimationItemDoubleClick(deps, {
    _event: {
      detail: {
        itemId,
      },
    },
  });
};

export const handleMobileDetailDuplicateClick = async (deps, payload) => {
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();

  const itemId = deps.store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  await handleItemDuplicate(deps, {
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

export const handleAnimationItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;

  openEditDialogWithValues({ deps, itemId });
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    openFolderNameDialogWithValues({
      deps,
      folderId: store.selectSelectedFolderId(),
    });
    return;
  }

  openEditDialogWithValues({ deps, itemId });
};

export const handleAddFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "add-form",
  });
};

export const handleEditFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "edit-form",
    itemId: deps.store.selectEditItemId(),
  });
};

export const handleEditDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeEditDialog();
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
      message: copy.nameRequired ?? "Please enter an animation name.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  if (!editItemId) {
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedUpdateAnimation ?? "Failed to update animation.",
    action: () =>
      projectService.updateAnimation({
        animationId: editItemId,
        data: {
          name,
          description: values?.description ?? "",
          tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
        },
      }),
  });

  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await handleDataChanged(deps, { selectedItemId: editItemId });
};

export const handleAddDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAction = async (deps, payload) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: copy.nameRequired ?? "Please enter an animation name.",
      title: copy.warningTitle ?? "Warning",
    });
    return;
  }

  const dialogType =
    values?.dialogType === "transition" ? "transition" : "update";
  const targetGroupId = store.selectTargetGroupId();
  const animationId = generateId();

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedCreateAnimation ?? "Failed to create animation.",
    action: () =>
      projectService.createAnimation({
        animationId,
        data: createInitialAnimationResourceData({
          name,
          description: values?.description ?? "",
          dialogType,
          tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
        }),
        parentId: targetGroupId,
        position: "last",
      }),
  });

  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  render();

  navigateToAnimationEditor({
    appService,
    animationId,
  });
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
    checkTargets: ["scenes", "layouts"],
  });

  if (usage.isUsed) {
    appService.showAlert({
      message:
        copy.cannotDeleteResourceInUse ??
        "Cannot delete resource, it is currently in use.",
    });
    return;
  }

  await projectService.deleteAnimations({
    animationIds: [itemId],
  });

  await handleDataChanged(deps);
};

export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const duplicateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedDuplicateAnimation ?? "Failed to duplicate animation.",
    action: () =>
      projectService.duplicateAnimation({
        animationId: itemId,
      }),
  });
  if (!duplicateAttempt.ok) {
    return;
  }

  await handleDataChanged(deps, {
    selectedItemId: duplicateAttempt.result,
  });
};
