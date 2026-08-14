import { generateId } from "../../internal/id.js";
import { createAudioEffectsEditorPayload } from "../../internal/audioEffectsEditorRoute.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { AUDIO_EFFECT_TAG_SCOPE_KEY } from "./audioEffects.store.js";
import { selectAudioEffectsPageCopy } from "./support/audioEffectsPageCopy.js";

const selectCopy = (deps = {}) => selectAudioEffectsPageCopy(deps.i18n);

const navigateToEditor = ({ appService, audioEffectId } = {}) => {
  if (!audioEffectId) {
    return;
  }

  appService.navigate("/project/audio-effects-editor", {
    ...createAudioEffectsEditorPayload({
      payload: appService.getPayload() ?? {},
      audioEffectId,
    }),
  });
};

const createInitialAudioEffectDefinition = (dialogType) => {
  if (dialogType === "transition") {
    return {
      type: "transition",
      prev: {
        fade: {
          keyframes: [
            {
              value: 0,
              duration: 1000,
              easing: "easeInOutSine",
            },
          ],
        },
      },
      next: {
        fade: {
          keyframes: [
            {
              value: 100,
              duration: 1000,
              easing: "easeInOutSine",
            },
          ],
        },
      },
    };
  }

  return {
    type: "update",
    tween: {
      volume: {
        keyframes: [
          {
            value: 100,
            duration: 300,
            easing: "easeInOutSine",
          },
        ],
      },
    },
  };
};

const normalizeSelectedAudioEffect = (deps) => {
  const { render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  if (store.selectAudioEffectItemById({ itemId: selectedItemId })) {
    return;
  }

  store.setSelectedItemId({ itemId: undefined });
  render();
};

const {
  handleBeforeMount,
  handleAfterMount,
  refreshData,
  handleFileExplorerSelectionChanged,
  handleFileExplorerAction: handleFileExplorerActionBase,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleItemClick: handleAudioEffectItemClick,
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
  resourceType: "audioEffects",
  copy: ({ i18n }) => selectAudioEffectsPageCopy(i18n),
  onEditKey: ({ deps, selectedItemId }) => {
    const { appService } = deps;
    navigateToEditor({ appService, audioEffectId: selectedItemId });
  },
  selectData: (repositoryState) =>
    resolveCollectionWithTags({
      collection: repositoryState?.audioEffects,
      tagsCollection: getTagsCollection(
        repositoryState,
        AUDIO_EFFECT_TAG_SCOPE_KEY,
      ),
      itemType: "audioEffect",
    }),
  onProjectStateChanged: ({ deps, repositoryState }) => {
    const { store } = deps;
    store.setTagsData({
      tagsData: getTagsCollection(repositoryState, AUDIO_EFFECT_TAG_SCOPE_KEY),
    });
  },
  createExplorerHandlers: ({ refresh }) =>
    createResourceFileExplorerHandlers({
      resourceType: "audioEffects",
      copy: ({ i18n }) => selectAudioEffectsPageCopy(i18n),
      refresh: async (deps, options) => {
        await refresh(deps, options);
        normalizeSelectedAudioEffect(deps);
      },
    }),
  tagging: {
    scopeKey: AUDIO_EFFECT_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) => {
      const { projectService } = deps;
      return projectService.updateAudioEffect({
        audioEffectId: itemId,
        data: { tagIds },
      });
    },
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags ??
      "Failed to update audio effect tags.",
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

export {
  handleBeforeMount,
  handleAfterMount,
  handleFileExplorerSelectionChanged,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleAudioEffectItemClick,
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

export const handleDataChanged = async (deps, options = {}) => {
  await refreshData(deps, options);
  normalizeSelectedAudioEffect(deps);
};

export const handleFileExplorerAction = async (deps, payload) => {
  const { appService } = deps;
  const detail = payload?._event?.detail ?? {};
  const action = (detail.item ?? detail)?.value;
  if (action === "edit-item") {
    navigateToEditor({ appService, audioEffectId: detail.itemId });
    return;
  }

  await handleFileExplorerActionBase(deps, payload);
};

export const handleAddAudioEffectClick = (deps, payload) => {
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

export const handleAddFormAction = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const name = values?.name?.trim();
  if (!name) {
    appService.showAlert({
      title: copy.warningTitle ?? "Warning",
      message: copy.nameRequired ?? "Please enter an audio effect name.",
    });
    return;
  }

  const dialogType =
    values?.dialogType === "transition" ? "transition" : "update";
  const audioEffectId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedCreateAudioEffect ?? "Failed to create audio effect.",
    action: () =>
      projectService.createAudioEffect({
        audioEffectId,
        parentId: store.selectTargetGroupId(),
        position: "last",
        data: {
          type: "audioEffect",
          name,
          description: values?.description ?? "",
          tagIds: Array.isArray(values?.tagIds) ? values.tagIds : [],
          audioEffect: createInitialAudioEffectDefinition(dialogType),
        },
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  await handleDataChanged(deps, { selectedItemId: audioEffectId });
};

export const handleAddFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({ deps, mode: "add-form" });
};

export const handleAudioEffectItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }
  navigateToEditor({ appService, audioEffectId: itemId });
};

export const handleAudioEffectItemEdit = (deps, payload) => {
  const { appService } = deps;
  navigateToEditor({
    appService,
    audioEffectId: payload._event.detail.itemId,
  });
};

const openEditDialogWithValues = ({ deps, itemId } = {}) => {
  if (!itemId) {
    return;
  }

  const { refs, render, store } = deps;
  const { editForm, fileExplorer } = refs;
  const item = store.selectAudioEffectItemById({ itemId });
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
      title: copy.warningTitle ?? "Warning",
      message: copy.nameRequired ?? "Please enter an audio effect name.",
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
      copy.failedUpdateAudioEffect ?? "Failed to update audio effect.",
    action: () =>
      projectService.updateAudioEffect({
        audioEffectId: editItemId,
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
    });
    return;
  }

  const deleteAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage:
      copy.failedDeleteAudioEffect ?? "Failed to delete audio effect.",
    action: () =>
      projectService.deleteAudioEffects({ audioEffectIds: [itemId] }),
  });
  if (!deleteAttempt.ok) {
    return;
  }
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
      copy.failedDuplicateAudioEffect ?? "Failed to duplicate audio effect.",
    action: () =>
      projectService.duplicateAudioEffect({ audioEffectId: itemId }),
  });
  if (!duplicateAttempt.ok) {
    return;
  }
  await handleDataChanged(deps, { selectedItemId: duplicateAttempt.result });
};

export const handleMobileDetailOpenClick = (deps, payload) => {
  const { appService, store } = deps;
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    navigateToEditor({ appService, audioEffectId: itemId });
  }
};

export const handleMobileDetailDuplicateClick = async (deps, payload) => {
  const { store } = deps;
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    await handleItemDuplicate(deps, {
      _event: { detail: { itemId } },
    });
  }
};

export const handleMobileDetailDeleteClick = async (deps, payload) => {
  const { store } = deps;
  payload?._event?.preventDefault?.();
  payload?._event?.stopPropagation?.();
  const itemId = store.selectSelectedItemId();
  if (itemId) {
    await handleItemDelete(deps, {
      _event: { detail: { itemId } },
    });
  }
};
