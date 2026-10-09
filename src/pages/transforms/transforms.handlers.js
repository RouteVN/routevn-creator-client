import { generateId } from "../../internal/id.js";
import { createTransformEditorPayload } from "../../internal/transformEditorRoute.js";
import {
  DEFAULT_TRANSFORM_VALUES,
  TRANSFORM_VALUE_FIELDS,
} from "../../internal/transformValues.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { TRANSFORM_TAG_SCOPE_KEY } from "./transforms.store.js";
import { selectTransformsPageCopy } from "./support/transformsPageCopy.js";

const selectCopy = (deps = {}) => selectTransformsPageCopy(deps.i18n);

const navigateToEditor = ({ appService, transformId } = {}) => {
  if (!transformId) {
    return;
  }

  appService.navigate(
    "/project/transform-editor",
    createTransformEditorPayload({
      payload: appService.getPayload() ?? {},
      transformId,
    }),
  );
};

const createMetadataValues = (values) => ({
  name: values.name?.trim() ?? "",
  description: values.description ?? "",
  tagIds: Array.isArray(values.tagIds) ? values.tagIds : [],
});

const {
  handleBeforeMount: handleBeforeMountBase,
  handleAfterMount: handleAfterMountBase,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleItemClick: handleTransformItemClick,
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
  resourceType: "transforms",
  copy: ({ i18n }) => selectTransformsPageCopy(i18n),
  onEditKey: ({ deps, selectedItemId }) => {
    navigateToEditor({
      appService: deps.appService,
      transformId: selectedItemId,
    });
  },
  selectData: (repositoryState) => {
    const tagsData = getTagsCollection(
      repositoryState,
      TRANSFORM_TAG_SCOPE_KEY,
    );

    return resolveCollectionWithTags({
      collection: repositoryState?.transforms,
      tagsCollection: tagsData,
      itemType: "transform",
    });
  },
  onProjectStateChanged: ({ deps, repositoryState }) => {
    const { store } = deps;
    store.setTagsData({
      tagsData: getTagsCollection(repositoryState, TRANSFORM_TAG_SCOPE_KEY),
    });
    store.setDefaultDialogueAvatarTransformId({
      transformId: repositoryState.project.defaultDialogueAvatarTransformId,
    });
  },
  tagging: {
    scopeKey: TRANSFORM_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateTransform({
        transformId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags,
    appendCreatedTagByMode: ({ deps, mode, tagId }) => {
      const { refs } = deps;
      if (mode === "add-form") {
        appendTagIdToForm({ form: refs.addForm, tagId });
      } else if (mode === "edit-form") {
        appendTagIdToForm({ form: refs.editForm, tagId });
      }
    },
  },
});

const applyDefaultDialogueAvatarAction = async (deps, { itemId, action }) => {
  const { store, projectService, appService } = deps;
  const item = store.selectTransformItemById({ itemId });
  if (item?.type !== "transform") {
    return;
  }
  if (
    action === "clear-default-dialogue-avatar" &&
    itemId !== store.selectDefaultDialogueAvatarTransformId()
  ) {
    return;
  }
  const transformId =
    action === "set-default-dialogue-avatar" ? itemId : undefined;
  const copy = selectCopy(deps);
  try {
    const result = await projectService.setDefaultDialogueAvatarTransform({
      transformId,
    });
    if (result.valid === false) {
      appService.showToast({ message: copy.failedUpdateDefaultDialogueAvatar });
      return;
    }
    await handleDataChanged(deps);
  } catch {
    appService.showToast({ message: copy.failedUpdateDefaultDialogueAvatar });
  }
};

const isDefaultDialogueAvatarAction = (action) =>
  action === "set-default-dialogue-avatar" ||
  action === "clear-default-dialogue-avatar";

export const handleTransformItemAction = async (deps, payload) => {
  const { itemId, action } = payload._event.detail;
  if (isDefaultDialogueAvatarAction(action)) {
    await applyDefaultDialogueAvatarAction(deps, { itemId, action });
  }
};

export const handleFileExplorerAction = async (deps, payload) => {
  const { appService } = deps;
  const { itemId, item } = payload._event.detail;
  if (item?.value === "edit-item") {
    navigateToEditor({ appService, transformId: itemId });
    return;
  }
  if (item?.value === "duplicate-item") {
    await handleItemDuplicate(deps, payload);
    return;
  }
  if (isDefaultDialogueAvatarAction(item?.value)) {
    await applyDefaultDialogueAvatarAction(deps, {
      itemId,
      action: item.value,
    });
    return;
  }
  await handleBaseFileExplorerAction(deps, payload);
};

export {
  handleDataChanged,
  handleFileExplorerSelectionChanged,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleTransformItemClick,
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

export const handleBeforeMount = (deps) => {
  return handleBeforeMountBase(deps);
};

// Thumbnails that went out of date, such as when the app closed before an
// editor was left, or that a new transform lacks, are drawn in the
// background.
export const handleAfterMount = (deps) => {
  const { projectService } = deps;
  handleAfterMountBase(deps);
  void projectService.requestTransformThumbnails();
};

export const handleTransformItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }
  navigateToEditor({ appService, transformId: itemId });
};

export const handleTransformItemEdit = (deps, payload) => {
  const { appService } = deps;
  const { itemId } = payload._event.detail;
  navigateToEditor({ appService, transformId: itemId });
};

export const handleMobileDetailOpenClick = (deps) => {
  const { appService, store } = deps;
  navigateToEditor({ appService, transformId: store.selectSelectedItemId() });
};

export const handleMobileDetailDuplicateClick = async (deps) => {
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

export const handleMobileDetailDeleteClick = async (deps) => {
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

const openEditDialogWithValues = ({ deps, itemId }) => {
  const { refs, render, store } = deps;
  const { editForm, fileExplorer } = refs;
  const item = store.selectTransformItemById({ itemId });
  if (!item) {
    return;
  }

  const editValues = createMetadataValues(item);
  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });
  fileExplorer?.selectItem?.({ itemId });
  store.openEditDialog({ itemId, defaultValues: editValues });
  render();
  editForm.reset();
  editForm.setValues({ values: editValues });
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    openEditDialogWithValues({ deps, itemId });
    return;
  }

  openFolderNameDialogWithValues({
    deps,
    folderId: store.selectSelectedFolderId(),
  });
};

export const handleAddTransformClick = (deps, payload) => {
  const { render, store } = deps;
  const { groupId } = payload._event.detail;
  store.openAddDialog({ groupId });
  render();
};

export const handleAddDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeAddDialog();
  render();
};

export const handleAddFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({ deps, mode: "add-form" });
};

export const handleAddFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const metadata = createMetadataValues(values);
  if (!metadata.name) {
    appService.showAlert({
      message: copy.nameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const transformId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedCreateTransform,
    action: () =>
      projectService.createTransform({
        transformId,
        data: {
          type: "transform",
          ...metadata,
          ...DEFAULT_TRANSFORM_VALUES,
        },
        parentId: store.selectTargetGroupId(),
        position: "last",
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  await handleDataChanged(deps, { selectedItemId: transformId });
  void projectService.requestTransformThumbnails({
    transformIds: [transformId],
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

  const metadata = createMetadataValues(values);
  if (!metadata.name) {
    appService.showAlert({
      message: copy.nameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateTransform,
    action: () =>
      projectService.updateTransform({
        transformId: editItemId,
        data: metadata,
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await handleDataChanged(deps, { selectedItemId: editItemId });
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
      message: copy.cannotDeleteResourceInUse,
    });
    return;
  }

  await projectService.deleteTransforms({
    transformIds: [itemId],
  });

  await handleDataChanged(deps);
};

export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const itemData = store.selectTransformItemById({ itemId });
  if (!itemData) {
    return;
  }

  const duplicateTransformId = generateId();
  const duplicateData = {
    type: "transform",
    ...createMetadataValues(itemData),
  };
  for (const field of TRANSFORM_VALUE_FIELDS) {
    duplicateData[field] = itemData[field] ?? DEFAULT_TRANSFORM_VALUES[field];
  }
  if (itemData.thumbnailFileId) {
    duplicateData.thumbnailFileId = itemData.thumbnailFileId;
  }
  // The copy draws as the original does, so its thumbnail stays current.
  if (itemData.thumbnailSourceHash) {
    duplicateData.thumbnailSourceHash = itemData.thumbnailSourceHash;
  }
  if (itemData.previewFileId) {
    duplicateData.previewFileId = itemData.previewFileId;
  }
  if (itemData.preview) {
    duplicateData.preview = structuredClone(itemData.preview);
  }

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedDuplicateTransform,
    action: () =>
      projectService.createTransform({
        transformId: duplicateTransformId,
        data: duplicateData,
        parentId: itemData.parentId ?? null,
        position: "after",
        positionTargetId: itemId,
      }),
  });

  if (!createAttempt.ok) {
    return;
  }

  await handleDataChanged(deps, {
    selectedItemId: duplicateTransformId,
  });
};
