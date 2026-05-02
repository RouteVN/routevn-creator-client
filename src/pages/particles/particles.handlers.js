import { generateId } from "../../internal/id.js";
import { createCatalogPageHandlers } from "../../internal/ui/resourcePages/catalog/createCatalogPageHandlers.js";
import { createResourceFileExplorerHandlers } from "../../internal/ui/fileExplorer.js";
import {
  appendTagIdToForm,
  createResourcePageTagHandlers,
} from "../../internal/ui/resourcePages/tags.js";
import { runResourcePageMutation } from "../../internal/ui/resourcePages/resourcePageErrors.js";
import { extractFileIdsFromRenderState } from "../../internal/project/layout.js";
import { createRenderableParticleData } from "../../internal/particles.js";
import { captureCanvasThumbnailImage } from "../../internal/runtime/graphicsEngineRuntime.js";
import { createFileExplorerKeyboardScopeHandlers } from "../../internal/ui/fileExplorerKeyboardScope.js";
import {
  getTagsCollection,
  resolveCollectionWithTags,
} from "../../internal/resourceTags.js";
import {
  buildParticleFormValues,
  buildParticlePayload,
  resolveParticleBaseData,
} from "./support/particleForm.js";
import { createParticlePreviewState } from "./support/particlePreview.js";
import {
  DEFAULT_PARTICLE_PRESET_ID,
  PARTICLE_PRESET_OPTIONS,
} from "./support/particlePresets.js";
import { PARTICLE_TAG_SCOPE_KEY } from "./particles.store.js";

const CREATE_PARTICLE_SETUP_STEP = "setup";
const PARTICLE_EDITOR_STEP = "editor";

const dataUrlToBlob = async (value) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Thumbnail image is missing");
  }

  const commaIndex = value.indexOf(",");
  if (commaIndex < 0) {
    throw new Error("Thumbnail image is not a valid data URL");
  }

  const header = value.slice(0, commaIndex);
  const body = value.slice(commaIndex + 1);
  const mimeMatch = header.match(/^data:([^;,]+)?(?:;base64)?$/);
  if (!mimeMatch) {
    throw new Error("Thumbnail image is not a valid data URL");
  }

  const mimeType = mimeMatch[1] || "application/octet-stream";
  const isBase64 = header.includes(";base64");

  if (!isBase64) {
    return new Blob([decodeURIComponent(body)], { type: mimeType });
  }

  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
};

const syncDialogFormValues = ({ refs, values } = {}) => {
  refs.particleForm?.reset?.();
  refs.particleForm?.setValues?.({ values });
};

const getPreviewCanvasRef = (refs, target) => {
  return target === "dialog" ? refs.dialogCanvas : refs.detailCanvas;
};

const {
  focusKeyboardScope: focusImageSelectorKeyboardScope,
  handleKeyboardScopeClick: handleImageSelectorKeyboardScopeClick,
  handleKeyboardScopeKeyDown: handleImageSelectorKeyboardScopeKeyDown,
} = createFileExplorerKeyboardScopeHandlers({
  fileExplorerRefName: "imageSelectorFileExplorer",
  keyboardScopeRefName: "imageSelectorKeyboardScope",
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
  const height = Math.max(
    1,
    Math.round(Number(renderableParticle.height) || 1),
  );
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

  const previewState = createParticlePreviewState(renderableParticle, {
    backgroundImage:
      target === "dialog" && store.selectDialogMode() === "form"
        ? store.selectDialogPreviewBackgroundImage()
        : undefined,
  });
  await loadParticlePreviewAssets({
    deps,
    renderState: previewState,
  });
  graphicsService.render(previewState);
};

const showParticleThumbnailError = ({ appService, message, error } = {}) => {
  if (error) {
    console.error(`[particles] ${message}`, error);
  } else {
    console.error(`[particles] ${message}`);
  }

  appService.showAlert({
    message,
    title: "Error",
  });
};

const captureParticleThumbnail = async ({ deps, particleData } = {}) => {
  const { appService, graphicsService, projectService, refs, store } = deps;

  let renderableParticle;
  try {
    renderableParticle = createRenderableParticleData(
      particleData,
      store.selectImagesData()?.items || {},
    );
  } catch (error) {
    showParticleThumbnailError({
      appService,
      error,
      message:
        "Failed to save particle thumbnail: particle data preparation failed.",
    });
    return;
  }

  const width = Math.max(1, Math.round(Number(renderableParticle.width) || 1));
  const height = Math.max(
    1,
    Math.round(Number(renderableParticle.height) || 1),
  );
  let isReady;
  try {
    isReady = await ensurePreviewRuntime({
      deps,
      target: "dialog",
      width,
      height,
    });
  } catch (error) {
    showParticleThumbnailError({
      appService,
      error,
      message:
        "Failed to save particle thumbnail: preview runtime setup failed.",
    });
    return;
  }

  if (!isReady) {
    showParticleThumbnailError({
      appService,
      message: "Failed to save particle thumbnail: preview canvas unavailable.",
    });
    return;
  }

  let previewState;
  try {
    previewState = createParticlePreviewState(renderableParticle);
  } catch (error) {
    showParticleThumbnailError({
      appService,
      error,
      message:
        "Failed to save particle thumbnail: preview state creation failed.",
    });
    return;
  }

  try {
    await loadParticlePreviewAssets({
      deps,
      renderState: previewState,
    });
  } catch (error) {
    showParticleThumbnailError({
      appService,
      error,
      message: "Failed to save particle thumbnail: texture asset load failed.",
    });
    return;
  }

  try {
    graphicsService.render(previewState);
  } catch (error) {
    showParticleThumbnailError({
      appService,
      error,
      message: "Failed to save particle thumbnail: preview render failed.",
    });
    return;
  }

  const thumbnailImage = await captureCanvasThumbnailImage(
    graphicsService,
    refs.dialogCanvas,
  );
  if (!thumbnailImage) {
    showParticleThumbnailError({
      appService,
      message:
        "Failed to save particle thumbnail: canvas capture returned no image.",
    });
    return;
  }

  let thumbnailBlob;
  try {
    thumbnailBlob = await dataUrlToBlob(thumbnailImage);
  } catch (error) {
    showParticleThumbnailError({
      appService,
      error,
      message: "Failed to save particle thumbnail: image conversion failed.",
    });
    return;
  }

  let storedFile;
  try {
    storedFile = await projectService.storeFile({
      file: thumbnailBlob,
    });
  } catch (error) {
    showParticleThumbnailError({
      appService,
      error,
      message: "Failed to save particle thumbnail: file storage failed.",
    });
    return;
  }

  return {
    thumbnailFileId: storedFile.fileId,
    fileRecords: storedFile.fileRecords,
  };
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
  const currentValues = store.selectDialogFormValues() ?? {};
  return {
    ...currentValues,
    ...values,
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

const isValidParticlePresetId = (presetId) => {
  return PARTICLE_PRESET_OPTIONS.some((option) => option.value === presetId);
};

const getDialogFallbackParticle = (store) => {
  return store.selectParticleItemById({
    itemId: store.selectEditItemId(),
  });
};

const renderCurrentDialogPreview = async (deps, { forceInit = false } = {}) => {
  const { store } = deps;
  const previewParticle = buildDialogParticleData({
    deps,
    values: store.selectDialogFormValues(),
    fallbackParticle: getDialogFallbackParticle(store),
  });

  store.setDialogPreviewSize({
    width: previewParticle.width,
    height: previewParticle.height,
  });

  await renderParticlePreview({
    deps,
    target: "dialog",
    particleData: previewParticle,
    forceInit,
  });
};

const getTextureImageId = (values = {}) => {
  return `${values?.textureImageId ?? ""}`.trim();
};

const hasValidTextureImage = ({ store, textureImageId } = {}) => {
  return Boolean(
    textureImageId && store.selectImagesData()?.items?.[textureImageId]?.fileId,
  );
};

const resolveCreateSetupDialogValues = ({ deps, values } = {}) => {
  const { store } = deps;
  const presetId = `${values?.presetId ?? ""}`.trim();

  if (!presetId || presetId === store.selectDialogPresetId()) {
    return values;
  }

  const presetValues = buildParticleFormValues({
    presetId,
    projectResolution: store.selectProjectResolution(),
  });

  return {
    ...presetValues,
    textureImageId: values?.textureImageId ?? presetValues.textureImageId ?? "",
  };
};

const openParticleDialog = async ({
  deps,
  editMode = false,
  dialogStep,
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
      dialogStep,
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
      values: store.selectDialogFormValues(),
    });
  }

  const previewParticle = previewOnly
    ? itemData
    : buildDialogParticleData({
        deps,
        values: store.selectDialogFormValues(),
        fallbackParticle: itemData,
      });

  await renderParticlePreview({
    deps,
    target: "dialog",
    particleData: previewParticle,
    forceInit: true,
  });
};

const restoreParticleFormDialog = async ({
  deps,
  editMode = false,
  dialogStep = PARTICLE_EDITOR_STEP,
  itemId,
  itemData,
  presetId,
  targetGroupId,
  values,
} = {}) => {
  await openParticleDialog({
    deps,
    editMode,
    dialogStep,
    itemId,
    itemData,
    presetId,
    targetGroupId,
  });

  deps.store.setDialogFormValues({
    values,
  });
  syncDialogFormValues({
    refs: deps.refs,
    values,
  });

  await renderParticlePreview({
    deps,
    target: "dialog",
    particleData: buildDialogParticleData({
      deps,
      values,
      fallbackParticle: itemData,
    }),
    forceInit: true,
  });
};

const {
  handleBeforeMount: handleBeforeMountBase,
  handleAfterMount: handleAfterMountBase,
  refreshData: refreshDataBase,
  handleFileExplorerSelectionChanged: handleFileExplorerSelectionChangedBase,
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleItemClick: handleParticleItemClickBase,
  handleSearchInput,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  openFolderNameDialogWithValues,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
} = createCatalogPageHandlers({
  resourceType: "particles",
  selectData: (repositoryState) => {
    const tagsData = getTagsCollection(repositoryState, PARTICLE_TAG_SCOPE_KEY);

    return resolveCollectionWithTags({
      collection: repositoryState?.particles,
      tagsCollection: tagsData,
      itemType: "particle",
    });
  },
  onProjectStateChanged: ({ deps, repositoryState }) => {
    deps.store.setTagsData({
      tagsData: getTagsCollection(repositoryState, PARTICLE_TAG_SCOPE_KEY),
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

export const handleAfterMount = (deps) => {
  handleAfterMountBase(deps);
};

export const handleDataChanged = refreshParticleData;
export {
  handleFileExplorerAction,
  handleFileExplorerTargetChanged,
  handleFileExplorerKeyboardScopeClick,
  handleFileExplorerKeyboardScopeKeyDown,
  handleSearchInput,
  handleMobileFileExplorerOpen,
  handleMobileFileExplorerClose,
  handleMobileDetailSheetClose,
  handleFolderNameDialogClose,
  handleFolderNameFormAction,
};

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
    openFolderNameDialogWithValues({
      deps,
      folderId: store.selectSelectedFolderId(),
    });
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

export const handleParticleFormAddOptionClick = (deps) => {
  openCreateTagDialogForMode({
    deps,
    mode: "form",
    itemId: deps.store.selectEditItemId(),
  });
};

export const handleAddParticleClick = async (deps, payload) => {
  const { groupId } = payload._event.detail;
  await openParticleDialog({
    deps,
    presetId: DEFAULT_PARTICLE_PRESET_ID,
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
  const { appService, projectService, refs, store, render } = deps;
  const { actionId, valid, values: nextValues } = payload._event.detail;
  const dialogStep = store.selectDialogStep();
  const mergedValues = mergeDialogFormValues(store, nextValues);
  const values =
    dialogStep === CREATE_PARTICLE_SETUP_STEP && !store.selectEditMode()
      ? resolveCreateSetupDialogValues({
          deps,
          values: mergedValues,
        })
      : mergedValues;
  const presetId = `${values?.presetId ?? ""}`.trim();

  if (dialogStep === CREATE_PARTICLE_SETUP_STEP && presetId) {
    store.setDialogPresetId({
      presetId,
    });
  }

  store.setDialogFormValues({
    values,
  });

  if (actionId === "cancel") {
    await handleParticleDialogClose(deps);
    return;
  }

  if (actionId !== "submit") {
    return;
  }

  if (valid === false) {
    return;
  }

  if (dialogStep === CREATE_PARTICLE_SETUP_STEP && !store.selectEditMode()) {
    if (!isValidParticlePresetId(presetId)) {
      appService.showAlert({
        message: "Particle preset is required.",
        title: "Warning",
      });
      return;
    }

    const textureImageId = getTextureImageId(values);
    if (!textureImageId) {
      appService.showAlert({
        message: "Particle texture image is required.",
        title: "Warning",
      });
      return;
    }

    if (
      !hasValidTextureImage({
        store,
        textureImageId,
      })
    ) {
      appService.showAlert({
        message: "Select a valid particle texture image.",
        title: "Warning",
      });
      return;
    }

    store.setDialogStep({
      step: PARTICLE_EDITOR_STEP,
    });
    render();
    syncDialogFormValues({
      refs,
      values,
    });

    await renderParticlePreview({
      deps,
      target: "dialog",
      particleData: buildDialogParticleData({
        deps,
        values,
        fallbackParticle: getDialogFallbackParticle(store),
      }),
      forceInit: true,
    });
    return;
  }

  const particleData = buildDialogParticleData({
    deps,
    values,
    fallbackParticle: getDialogFallbackParticle(store),
  });

  if (!particleData.name) {
    appService.showAlert({
      message: "Particle name is required.",
      title: "Warning",
    });
    return;
  }

  const textureImageId = getTextureImageId(values);
  if (!textureImageId) {
    appService.showAlert({
      message: "Particle texture image is required.",
      title: "Warning",
    });
    return;
  }

  if (
    !hasValidTextureImage({
      store,
      textureImageId,
    })
  ) {
    appService.showAlert({
      message: "Select a valid particle texture image.",
      title: "Warning",
    });
    return;
  }

  const editMode = store.selectEditMode();
  const editItemId = store.selectEditItemId();
  const targetGroupId = store.selectTargetGroupId();
  const editItemData = store.selectParticleItemById({
    itemId: editItemId,
  });
  const dialogSnapshot = {
    editMode,
    dialogStep: PARTICLE_EDITOR_STEP,
    itemId: editItemId,
    itemData: editItemData,
    presetId: store.selectDialogPresetId(),
    targetGroupId,
    values,
  };
  const thumbnailResult = await captureParticleThumbnail({
    deps,
    particleData,
  });

  if (!thumbnailResult) {
    return;
  }

  particleData.thumbnailFileId = thumbnailResult.thumbnailFileId;

  store.closeParticleDialog();
  store.clearPreviewRuntime();
  render();

  if (editMode && editItemId) {
    const updateAttempt = await runResourcePageMutation({
      appService,
      fallbackMessage: "Failed to update particle.",
      action: () =>
        projectService.updateParticle({
          particleId: editItemId,
          data: particleData,
          fileRecords: thumbnailResult.fileRecords,
        }),
    });

    if (!updateAttempt.ok) {
      await restoreParticleFormDialog({
        deps,
        ...dialogSnapshot,
      });
      return;
    }

    await refreshParticleData(deps, { selectedItemId: editItemId });
    return;
  }

  const particleId = generateId();
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
        fileRecords: thumbnailResult.fileRecords,
        parentId: targetGroupId,
        position: "last",
      }),
  });

  if (!createAttempt.ok) {
    await restoreParticleFormDialog({
      deps,
      ...dialogSnapshot,
    });
    return;
  }

  await refreshParticleData(deps, { selectedItemId: particleId });
};

export const handleParticleFormChange = async (deps, payload) => {
  const { render, store } = deps;
  const dialogStep = store.selectDialogStep();
  const mergedValues = mergeDialogFormValues(
    store,
    payload._event.detail.values,
  );
  const values =
    dialogStep === CREATE_PARTICLE_SETUP_STEP && !store.selectEditMode()
      ? resolveCreateSetupDialogValues({
          deps,
          values: mergedValues,
        })
      : mergedValues;
  const presetId = `${values?.presetId ?? ""}`.trim();

  if (dialogStep === CREATE_PARTICLE_SETUP_STEP && presetId) {
    store.setDialogPresetId({
      presetId,
    });
  }

  store.setDialogFormValues({
    values,
  });

  const previewParticle = buildDialogParticleData({
    deps,
    values,
    fallbackParticle: getDialogFallbackParticle(store),
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

export const handleDialogPreviewBackgroundImageClick = (deps) => {
  const { render, store } = deps;
  store.showPreviewImageSelectorDialog();
  render();
};

export const handleDialogPreviewBackgroundImageContextMenu = async (
  deps,
  payload,
) => {
  const { appService, render, store } = deps;
  const event = payload?._event;
  event?.preventDefault?.();

  if (!store.selectDialogPreviewBackgroundImage()) {
    return;
  }

  const result = await appService.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });

  if (!result || result.item?.key !== "remove") {
    return;
  }

  store.clearDialogPreviewBackgroundImage();
  render();
  await renderCurrentDialogPreview(deps);
};

const applyDialogPreviewBackgroundImage = async (deps, imageId) => {
  const { render, store } = deps;
  store.setDialogPreviewBackgroundImage({
    imageId,
  });
  store.hidePreviewImageSelectorDialog();
  render();
  await renderCurrentDialogPreview(deps);
};

export const handlePreviewImageSelected = (deps, payload) => {
  const { render, store } = deps;
  store.setPreviewImageSelectorSelectedImageId({
    imageId: payload._event.detail?.imageId,
  });
  render();
};

export const handlePreviewImageDoubleClick = async (deps, payload) => {
  const imageId = payload?._event?.detail?.imageId;
  if (!imageId) {
    return;
  }

  await applyDialogPreviewBackgroundImage(deps, imageId);
};

export const handlePreviewImageFileExplorerClickItem = (deps, payload) => {
  const itemId = payload?._event?.detail?.itemId;
  if (!itemId) {
    return;
  }

  deps.refs.imageSelector?.transformedHandlers?.handleScrollToItem?.({
    itemId,
  });
  focusImageSelectorKeyboardScope(deps);
};

export {
  handleImageSelectorKeyboardScopeClick,
  handleImageSelectorKeyboardScopeKeyDown,
};

export const handleConfirmPreviewImageSelection = async (deps) => {
  const { store } = deps;
  const imageSelectorDialog = store.selectPreviewImageSelectorDialog();
  await applyDialogPreviewBackgroundImage(
    deps,
    imageSelectorDialog.selectedImageId,
  );
};

export const handleCancelPreviewImageSelection = (deps) => {
  const { render, store } = deps;
  store.hidePreviewImageSelectorDialog();
  render();
};

export const handleClosePreviewImageSelectorDialog = (deps) => {
  const { render, store } = deps;
  store.hidePreviewImageSelectorDialog();
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
  resolveScopeKey: () => PARTICLE_TAG_SCOPE_KEY,
  updateItemTagIds: ({ deps, itemId, tagIds }) =>
    deps.projectService.updateParticle({
      particleId: itemId,
      data: {
        tagIds,
      },
    }),
  refreshAfterItemTagUpdate: ({ deps, itemId }) =>
    refreshParticleData(deps, { selectedItemId: itemId }),
  getSelectedItemTagIds: ({ deps }) =>
    deps.store.selectSelectedParticle()?.tagIds ?? [],
  appendCreatedTagByMode: ({ deps, mode, tagId }) => {
    if (mode !== "form") {
      return;
    }

    appendTagIdToForm({
      form: deps.refs.particleForm,
      tagId,
    });
  },
  updateItemTagFallbackMessage: "Failed to update particle tags.",
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

export const handleParticleFormTabClick = (deps, payload) => {
  const { render, store } = deps;
  const tab = payload._event.detail.id;

  if (
    store.selectDialogStep() !== PARTICLE_EDITOR_STEP ||
    !tab ||
    tab === store.selectDialogFormTab()
  ) {
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
