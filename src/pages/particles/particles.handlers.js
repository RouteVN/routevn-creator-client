import { nanoid } from "nanoid";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { extractFileIdsFromRenderState } from "../../internal/project/layout.js";
import { createRenderableParticleData } from "../../internal/particles.js";
import {
  buildParticleFormValues,
  buildParticlePayload,
  createParticlePresetSelectionForm,
  resolveParticleBaseData,
} from "./support/particleForm.js";
import { createParticlePreviewState } from "./support/particlePreview.js";
import {
  DEFAULT_PARTICLE_PRESET_ID,
  PARTICLE_PRESET_OPTIONS,
} from "./support/particlePresets.js";

const syncDialogFormValues = ({ refs, values } = {}) => {
  refs.particleForm?.reset?.();
  refs.particleForm?.setValues?.({ values });
};

const getPreviewCanvasRef = (refs, target) => {
  return target === "dialog" ? refs.dialogCanvas : refs.detailCanvas;
};

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

const resolveDialogBaseParticle = ({ deps, fallbackParticle } = {}) => {
  const { store } = deps;
  return resolveParticleBaseData({
    particle: fallbackParticle,
    presetId: store.selectDialogPresetId(),
    projectResolution: store.selectProjectResolution(),
  });
};

const ensurePreviewRuntime = async ({
  deps,
  target,
  width,
  height,
  forceInit = false,
} = {}) => {
  const { graphicsService, refs, store } = deps;
  const canvas = getPreviewCanvasRef(refs, target);

  if (!graphicsService || !canvas) {
    return false;
  }

  const runtime = store.selectPreviewRuntime();
  const shouldInit =
    forceInit ||
    runtime.target !== target ||
    runtime.width !== width ||
    runtime.height !== height;

  if (!shouldInit) {
    return true;
  }

  await graphicsService.init({
    canvas,
    width,
    height,
  });
  store.setPreviewRuntime({
    target,
    width,
    height,
  });
  return true;
};

const renderParticlePreview = async ({
  deps,
  target,
  particleData,
  forceInit = false,
} = {}) => {
  const { graphicsService, store } = deps;
  if (!graphicsService || !particleData) {
    return;
  }

  const renderableParticle = createRenderableParticleData(
    particleData,
    store.selectImagesData()?.items || {},
  );
  const width = Math.max(1, Math.round(Number(renderableParticle.width) || 1));
  const height = Math.max(1, Math.round(Number(renderableParticle.height) || 1));
  const isReady = await ensurePreviewRuntime({
    deps,
    target,
    width,
    height,
    forceInit,
  });

  if (!isReady) {
    return;
  }

  const previewState = createParticlePreviewState(renderableParticle);
  await loadParticlePreviewAssets({
    deps,
    renderState: previewState,
  });
  graphicsService.render(previewState);
};

async function renderDetailPreview(deps) {
  const { store } = deps;
  if (store.selectIsDialogOpen()) {
    return;
  }

  const selectedParticle = store.selectSelectedParticle();
  if (!selectedParticle) {
    return;
  }

  await renderParticlePreview({
    deps,
    target: "detail",
    particleData: selectedParticle,
    forceInit: true,
  });
}

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

const mergeDialogFormValues = (store, values = {}) => {
  return {
    ...(store.selectDialogFormValues() ?? {}),
    ...(values ?? {}),
  };
};

const buildDialogParticleData = ({ deps, values, fallbackParticle } = {}) => {
  const { store } = deps;
  return buildParticlePayload({
    values,
    baseParticle: resolveDialogBaseParticle({
      deps,
      fallbackParticle,
    }),
    projectResolution: store.selectProjectResolution(),
  });
};

const openParticleDialog = async ({
  deps,
  editMode = false,
  previewOnly = false,
  itemId,
  itemData,
  presetId,
  targetGroupId,
} = {}) => {
  const { refs, render, store } = deps;

  if (itemId) {
    store.setSelectedItemId({ itemId });
    refs.fileExplorer?.selectItem?.({ itemId });
  }

  store.clearPreviewRuntime();

  if (previewOnly) {
    store.openParticlePreviewDialog({
      itemId,
      itemData,
    });
  } else {
    store.openParticleFormDialog({
      editMode,
      itemId,
      itemData,
      presetId,
      targetGroupId,
    });
  }

  render();

  if (!previewOnly) {
    syncDialogFormValues({
      refs,
      values: buildParticleFormValues({
        particle: itemData,
        presetId: store.selectDialogPresetId(),
        projectResolution: store.selectProjectResolution(),
      }),
    });
  }

  const previewParticle = previewOnly
    ? itemData
    : resolveDialogBaseParticle({
        deps,
        fallbackParticle: itemData,
      });

  await renderParticlePreview({
    deps,
    target: "dialog",
    particleData: previewParticle,
    forceInit: true,
  });
};

const {
  handleBeforeMount: handleBeforeMountBase,
  refreshData: refreshDataBase,
  handleFileExplorerSelectionChanged: handleFileExplorerSelectionChangedBase,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleItemClick: handleParticleItemClickBase,
  handleSearchInput,
} = createCatalogPageHandlers({
  resourceType: "particles",
  onProjectStateChanged: ({ deps, repositoryState }) => {
    deps.store.setProjectResolution({
      projectResolution: repositoryState?.project?.resolution,
    });
    deps.store.setImagesData({
      imagesData: repositoryState?.images,
    });
  },
  createExplorerHandlers: ({ refresh }) =>
    createResourceFileExplorerHandlers({
      resourceType: "particles",
      refresh: async (deps, options) => {
        await refresh(deps, options);
        normalizeSelectedParticle(deps);
        deps.store.clearPreviewRuntime();
        await renderDetailPreview(deps);
      },
    }),
});

const refreshParticleData = async (deps, options = {}) => {
  await refreshDataBase(deps, options);
  normalizeSelectedParticle(deps);
  deps.store.clearPreviewRuntime();
  await renderDetailPreview(deps);
};

export const handleBeforeMount = (deps) => {
  const cleanupBase = handleBeforeMountBase(deps);

  return () => {
    cleanupBase?.();
    deps.store.clearPreviewRuntime();
  };
};

export const handleDataChanged = refreshParticleData;
export { handleFileExplorerAction, handleFileExplorerTargetChanged, handleSearchInput };

export const handleFileExplorerSelectionChanged = async (deps, payload) => {
  handleFileExplorerSelectionChangedBase(deps, payload);
  deps.store.clearPreviewRuntime();
  await renderDetailPreview(deps);
};

export const handleParticleItemClick = async (deps, payload) => {
  handleParticleItemClickBase(deps, payload);
  deps.store.clearPreviewRuntime();
  await renderDetailPreview(deps);
};

export const handleParticleItemDoubleClick = async (deps, payload) => {
  const { itemId, isFolder } = payload._event.detail;
  if (isFolder || !itemId) {
    return;
  }

  const itemData = deps.store.selectParticleItemById({ itemId });
  if (!itemData) {
    return;
  }

  await openParticleDialog({
    deps,
    previewOnly: true,
    itemId,
    itemData,
  });
};

export const handleDetailHeaderClick = async (deps) => {
  const { store } = deps;
  const itemId = store.selectSelectedItemId();
  if (!itemId) {
    return;
  }

  const itemData = store.selectParticleItemById({ itemId });
  if (!itemData) {
    return;
  }

  await openParticleDialog({
    deps,
    editMode: true,
    itemId,
    itemData,
  });
};

export const handleAddParticleClick = async (deps, payload) => {
  const { appService } = deps;
  const { groupId } = payload._event.detail;
  const presetDialogResult = await appService.showFormDialog({
    form: createParticlePresetSelectionForm(),
    defaultValues: {
      presetId: DEFAULT_PARTICLE_PRESET_ID,
    },
  });

  if (!presetDialogResult || presetDialogResult.actionId !== "submit") {
    return;
  }

  const presetId = presetDialogResult.values?.presetId;
  const isValidPreset = PARTICLE_PRESET_OPTIONS.some(
    (option) => option.value === presetId,
  );

  if (!isValidPreset) {
    appService.showToast("Particle preset is required.", {
      title: "Warning",
    });
    return;
  }

  await openParticleDialog({
    deps,
    presetId,
    targetGroupId: groupId,
  });
};

export const handleParticleDialogClose = async (deps) => {
  const { render, store } = deps;
  store.closeParticleDialog();
  store.clearPreviewRuntime();
  render();
  await renderDetailPreview(deps);
};

export const handleParticleFormActionClick = async (deps, payload) => {
  const { appService, projectService, store, render } = deps;
  const { actionId, values: nextValues } = payload._event.detail;
  if (actionId !== "submit") {
    return;
  }

  const values = mergeDialogFormValues(store, nextValues);
  store.setDialogFormValues({
    values,
  });

  const particleData = buildDialogParticleData({
    deps,
    values,
    fallbackParticle: store.selectParticleItemById({
      itemId: store.selectEditItemId(),
    }),
  });

  if (!particleData.name) {
    appService.showToast("Particle name is required.", { title: "Warning" });
    return;
  }

  const textureImageId = `${values?.textureImageId ?? ""}`.trim();
  if (!textureImageId) {
    appService.showToast("Particle texture image is required.", {
      title: "Warning",
    });
    return;
  }

  if (!store.selectImagesData()?.items?.[textureImageId]?.fileId) {
    appService.showToast("Select a valid particle texture image.", {
      title: "Warning",
    });
    return;
  }

  const editMode = store.selectEditMode();
  const editItemId = store.selectEditItemId();
  const targetGroupId = store.selectTargetGroupId();

  if (editMode && editItemId) {
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update particle.",
      action: () =>
        projectService.updateParticle({
          particleId: editItemId,
          data: particleData,
        }),
    });

    if (!updateAttempt.ok) {
      return;
    }

    store.closeParticleDialog();
    store.clearPreviewRuntime();
    render();
    await refreshParticleData(deps, { selectedItemId: editItemId });
    return;
  }

  const particleId = nanoid();
  const createAttempt = await runResourcePageMutation({
    appService,
    fallbackMessage: "Failed to create particle.",
    action: () =>
      projectService.createParticle({
        particleId,
        data: {
          type: "particle",
          ...particleData,
        },
        parentId: targetGroupId,
        position: "last",
      }),
  });

  if (!createAttempt.ok) {
    return;
  }

  store.closeParticleDialog();
  store.clearPreviewRuntime();
  render();
  await refreshParticleData(deps, { selectedItemId: particleId });
};

export const handleParticleFormChange = async (deps, payload) => {
  const { render, store } = deps;
  const values = mergeDialogFormValues(store, payload._event.detail.values);
  store.setDialogFormValues({
    values,
  });

  const previewParticle = buildDialogParticleData({
    deps,
    values,
    fallbackParticle: store.selectParticleItemById({
      itemId: store.selectEditItemId(),
    }),
  });

  store.setDialogPreviewSize({
    width: previewParticle.width,
    height: previewParticle.height,
  });
  render();

  await renderParticlePreview({
    deps,
    target: "dialog",
    particleData: previewParticle,
  });
};

export const handleParticleFormTabClick = (deps, payload) => {
  const { render, store } = deps;
  const tab = payload._event.detail.id;

  if (!tab || tab === store.selectDialogFormTab()) {
    return;
  }

  store.setDialogFormTab({
    tab,
  });
  render();
};

export const handleItemDelete = async (deps, payload) => {
  const { projectService } = deps;
  const { itemId } = payload._event.detail;
  if (!itemId) {
    return;
  }

  await projectService.deleteParticles({
    particleIds: [itemId],
  });

  await refreshParticleData(deps);
};
