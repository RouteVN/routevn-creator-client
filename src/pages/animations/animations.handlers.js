import { generateId } from "../../internal/id.js";
import { createAnimationEditorPayload } from "../../internal/animationEditorRoute.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
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

const selectCopy = (deps = {}) => selectAnimationsPageCopy(deps.i18n);

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
  handleResourceViewBackgroundClick: handleResourceViewBackgroundClickBase,
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
  onEditKey: ({ deps, selectedItemId }) => {
    openEditDialogWithValues({ deps, itemId: selectedItemId });
  },
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

export const handleResourceViewBackgroundClick = async (deps) => {
  deps.store.setAnimationPreviewVisible?.({ visible: false });
  handleResourceViewBackgroundClickBase(deps);
  deps.store.clearPreviewRuntime();
  await renderSelectedAnimationPreview(deps, { forceInit: true });
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

  store.setSelectedItemId({ itemId, suppressMobileDetailSheet: true });
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

export const handleEditSubmitClick = async (deps) => {
  const { editForm } = deps.refs;
  await handleEditFormAction(deps, {
    _event: {
      detail: {
        actionId: "submit",
        values: editForm.getValues(),
      },
    },
  });
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

export const handleAddSubmitClick = async (deps) => {
  const { addForm } = deps.refs;
  await handleAddFormAction(deps, {
    _event: {
      detail: {
        actionId: "submit",
        values: addForm.getValues(),
      },
    },
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
