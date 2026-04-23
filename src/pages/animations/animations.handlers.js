import { generateId } from "../../internal/id.js";
import { createAnimationEditorPayload } from "../../internal/animationEditorRoute.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { ANIMATION_TAG_SCOPE_KEY } from "./animations.store.js";

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

const {
  handleBeforeMount: handleBeforeMountBase,
  handleAfterMount: handleAfterMountBase,
  refreshData: handleDataChanged,
  handleFileExplorerSelectionChanged: handleFileExplorerSelectionChangedBase,
  handleFileExplorerAction: handleFileExplorerActionBase,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleItemClick: handleAnimationItemClickBase,
  handleSearchInput,
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
  },
  tagging: {
    scopeKey: ANIMATION_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateAnimation({
        animationId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: "Failed to update animation tags.",
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

export {
  handleDataChanged,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleSearchInput,
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

export const handleAfterMount = (deps) => {
  handleAfterMountBase(deps);
};

export const handleFileExplorerSelectionChanged = (deps, payload) => {
  handleFileExplorerSelectionChangedBase(deps, payload);

  const { itemId, isFolder } = payload?._event?.detail ?? {};
  if (isFolder || !itemId) {
    return;
  }
};

export const handleAnimationItemClick = (deps, payload) => {
  handleAnimationItemClickBase(deps, payload);
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
  fileExplorer.selectItem({ itemId });
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

export const handleAnimationItemEdit = (deps, payload) => {
  const { itemId } = payload._event.detail;

  openEditDialogWithValues({ deps, itemId });
};

export const handleDetailHeaderClick = (deps) => {
  const { store } = deps;
  openEditDialogWithValues({
    deps,
    itemId: store.selectSelectedItemId(),
  });
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
    itemId: deps.store.getState().editItemId,
  });
};

export const handleEditDialogClose = (deps) => {
  const { render, store } = deps;
  store.closeEditDialog();
  render();
};

export const handleEditFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Please enter an animation name.",
      title: "Warning",
    });
    return;
  }

  const editItemId = store.getState().editItemId;
  if (!editItemId) {
    return;
  }

  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to update animation.",
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
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      message: "Please enter an animation name.",
      title: "Warning",
    });
    return;
  }

  const dialogType =
    values?.dialogType === "transition" ? "transition" : "update";
  const targetGroupId = store.selectTargetGroupId();
  const animationId = generateId();

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create animation.",
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
      message: "Cannot delete resource, it is currently in use.",
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
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const duplicateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to duplicate animation.",
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
