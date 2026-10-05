import { generateId } from "../../internal/id.js";
import { createParticleEditorPayload } from "../../internal/particleEditorRoute.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { appendTagIdToForm } from "../../internal/ui/resourcePages/tags.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { extractFileIdsFromRenderState } from "../../internal/project/layout.js";
import { createRenderableParticleData } from "../../internal/particles.js";
import { createParticlePreviewState } from "../../internal/particlePreview.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import { createParticlePreset } from "./support/particlePresets.js";
import { PARTICLE_TAG_SCOPE_KEY } from "./particles.store.js";
import { selectParticlesPageCopy } from "./support/particlesPageCopy.js";

const selectCopy = (deps = {}) => selectParticlesPageCopy(deps.i18n);

const navigateToEditor = ({ appService, particleId } = {}) => {
  if (!particleId) {
    return;
  }

  appService.navigate(
    "/project/particle-editor",
    createParticleEditorPayload({
      payload: appService.getPayload() ?? {},
      particleId,
    }),
  );
};

const createMetadataValues = (values) => ({
  name: values.name?.trim() ?? "",
  description: values.description ?? "",
  tagIds: Array.isArray(values.tagIds) ? values.tagIds : [],
});

const loadParticlePreviewAssets = async ({ deps, renderState } = {}) => {
  const { graphicsService, projectService } = deps;
  const fileReferences = extractFileIdsFromRenderState(renderState?.elements);

  if (fileReferences.length === 0) {
    return;
  }

  const assets = {};

  for (const fileReference of fileReferences) {
    const fileId = fileReference?.url;
    if (!fileId) {
      continue;
    }

    const result = await projectService.getFileContent(fileId);
    assets[fileId] = {
      url: result.url,
      type: fileReference.type || result.type || "image/png",
    };
  }

  if (Object.keys(assets).length > 0) {
    await graphicsService.loadAssets(assets);
  }
};

// The detail panel plays the selected particle. It shows only on desktop;
// touch layouts have no detail canvas.
const renderDetailPreview = async (deps) => {
  const { graphicsService, refs, store } = deps;
  const particle = store.selectSelectedParticle();
  if (!particle || !refs.detailCanvas) {
    return;
  }

  const renderableParticle = createRenderableParticleData(
    particle,
    store.selectImagesData().items,
  );
  await graphicsService.init({
    canvas: refs.detailCanvas,
    width: Math.max(1, Math.round(Number(renderableParticle.width) || 1)),
    height: Math.max(1, Math.round(Number(renderableParticle.height) || 1)),
  });
  const previewState = createParticlePreviewState(renderableParticle);
  await loadParticlePreviewAssets({
    deps,
    renderState: previewState,
  });
  graphicsService.render(previewState);
};

const normalizeSelectedParticle = (deps) => {
  const { render, store } = deps;
  const selectedItemId = store.selectSelectedItemId();
  if (!selectedItemId) {
    return;
  }

  const selectedParticle = store.selectParticleItemById({
    itemId: selectedItemId,
  });
  if (selectedParticle) {
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
  handleFileExplorerAction: handleBaseFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
  handleItemClick: handleParticleItemClickBase,
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
  resourceType: "particles",
  copy: ({ i18n }) => selectParticlesPageCopy(i18n),
  onEditKey: ({ deps, selectedItemId }) => {
    navigateToEditor({
      appService: deps.appService,
      particleId: selectedItemId,
    });
  },
  selectData: (repositoryState) => {
    const tagsData = getTagsCollection(repositoryState, PARTICLE_TAG_SCOPE_KEY);

    return resolveCollectionWithTags({
      collection: repositoryState?.particles,
      tagsCollection: tagsData,
      itemType: "particle",
    });
  },
  onProjectStateChanged: ({ deps, repositoryState }) => {
    const { store } = deps;
    store.setTagsData({
      tagsData: getTagsCollection(repositoryState, PARTICLE_TAG_SCOPE_KEY),
    });
    store.setProjectResolution({
      projectResolution: repositoryState.project?.resolution,
    });
    store.setImagesData({
      imagesData: repositoryState.images,
    });
  },
  createExplorerHandlers: ({ refresh }) =>
    createResourceFileExplorerHandlers({
      resourceType: "particles",
      refresh: async (deps, options) => {
        await refresh(deps, options);
        normalizeSelectedParticle(deps);
        await renderDetailPreview(deps);
      },
    }),
  tagging: {
    scopeKey: PARTICLE_TAG_SCOPE_KEY,
    updateItemTagIds: ({ deps, itemId, tagIds }) =>
      deps.projectService.updateParticle({
        particleId: itemId,
        data: {
          tagIds,
        },
      }),
    updateItemTagFallbackMessage: ({ deps }) =>
      selectCopy(deps).failedUpdateTags,
    // A tag created from the add or edit form goes into that form.
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

const refreshParticleData = async (deps, options = {}) => {
  await refreshDataBase(deps, options);
  normalizeSelectedParticle(deps);
  await renderDetailPreview(deps);
};

export const handleBeforeMount = (deps) => {
  return handleBeforeMountBase(deps);
};

export const handleAfterMount = (deps) => {
  handleAfterMountBase(deps);
};

export const handleDataChanged = refreshParticleData;
export {
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleResourceViewBackgroundClick,
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

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  handleFileExplorerSelectionChangedBase(deps, payload);
  await renderDetailPreview(deps);
};

export const handleFileExplorerAction = async (deps, payload) => {
  const { appService } = deps;
  const { itemId, item } = payload._event.detail;
  if (item?.value === "edit-item") {
    navigateToEditor({ appService, particleId: itemId });
    return;
  }
  if (item?.value === "duplicate-item") {
    await handleItemDuplicate(deps, payload);
    return;
  }
  await handleBaseFileExplorerAction(deps, payload);
};

export const handleParticleItemClick = async (deps, payload) => {
  handleParticleItemClickBase(deps, payload);
  await renderDetailPreview(deps);
};

// Double-click and long press open the particle in the editor.
export const handleParticleItemDoubleClick = (deps, payload) => {
  const { appService } = deps;
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder) {
    return;
  }
  navigateToEditor({ appService, particleId: itemId });
};

export const handleParticleItemEdit = (deps, payload) => {
  const { appService } = deps;
  const { itemId } = payload._event.detail;
  navigateToEditor({ appService, particleId: itemId });
};

export const handleMobileDetailOpenClick = (deps) => {
  const { appService, store } = deps;
  navigateToEditor({ appService, particleId: store.selectSelectedItemId() });
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
  const item = store.selectParticleItemById({ itemId });
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

// The detail header edits the particle's name, description and tags; its
// effect is edited in the editor.
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

export const handleAddParticleClick = (deps, payload) => {
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

// Creates the particle from the preset, at the project's size, and opens it
// in the editor, where its texture is picked.
export const handleAddFormAction = async (deps, payload) => {
  const { appService, projectService, render, store } = deps;
  const copy = selectCopy(deps);
  const { actionId, values } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const metadata = createMetadataValues(values);
  if (!metadata.name) {
    appService.showAlert({
      message: copy.particleNameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const { width, height, seed, modules } = createParticlePreset({
    presetId: values.presetId,
    projectResolution: store.selectProjectResolution(),
  });
  const particleId = generateId();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedCreateParticle,
    title: copy.errorTitle,
    action: () =>
      projectService.createParticle({
        particleId,
        data: {
          type: "particle",
          ...metadata,
          width,
          height,
          seed,
          modules,
        },
        parentId: store.selectTargetGroupId(),
        position: "last",
      }),
  });
  if (!createAttempt.ok) {
    return;
  }

  store.closeAddDialog();
  render();
  navigateToEditor({ appService, particleId });
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
      message: copy.particleNameRequired,
      title: copy.warningTitle,
    });
    return;
  }

  const editItemId = store.selectEditItemId();
  const updateAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedUpdateParticle,
    title: copy.errorTitle,
    action: () =>
      projectService.updateParticle({
        particleId: editItemId,
        data: metadata,
      }),
  });
  if (!updateAttempt.ok) {
    return;
  }

  store.closeEditDialog();
  await refreshParticleData(deps, { selectedItemId: editItemId });
};

export const handleItemDelete = async (deps, payload) => {
  const { appService, projectService } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const deleteAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedDeleteParticle,
    title: copy.errorTitle,
    action: () =>
      projectService.deleteParticles({
        particleIds: [itemId],
      }),
  });

  if (!deleteAttempt.ok) {
    return;
  }

  await refreshParticleData(deps);
};

// The copy has the particle's effect, name, description, tags and thumbnail,
// and goes right after it, in its folder.
export const handleItemDuplicate = async (deps, payload) => {
  const { appService, projectService, store } = deps;
  const copy = selectCopy(deps);
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  const itemData = store.selectParticleItemById({ itemId });
  if (!itemData) {
    return;
  }

  const duplicateParticleId = generateId();
  const duplicateData = {
    type: "particle",
    ...createMetadataValues(itemData),
    width: itemData.width,
    height: itemData.height,
    modules: structuredClone(itemData.modules),
  };
  if (Number.isFinite(itemData.seed)) {
    duplicateData.seed = itemData.seed;
  }
  if (itemData.thumbnailFileId) {
    duplicateData.thumbnailFileId = itemData.thumbnailFileId;
  }
  if (itemData.preview) {
    duplicateData.preview = structuredClone(itemData.preview);
  }

  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: copy.failedDuplicateParticle,
    title: copy.errorTitle,
    action: () =>
      projectService.createParticle({
        particleId: duplicateParticleId,
        data: duplicateData,
        parentId: store.selectItemParentId({ itemId }) ?? null,
        position: "after",
        positionTargetId: itemId,
      }),
  });

  if (!createAttempt.ok) {
    return;
  }

  await refreshParticleData(deps, {
    selectedItemId: duplicateParticleId,
  });
};
