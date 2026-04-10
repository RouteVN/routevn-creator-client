import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  PARTICLE_FORM_TABS,
  buildParticleCatalogItem,
  buildParticleDetailFields,
  buildParticleFormValues,
  createParticleForm,
} from "./support/particleForm.js";
import { DEFAULT_PARTICLE_PRESET_ID } from "./support/particlePresets.js";
import { formatParticleAspectRatio } from "./support/particlePreview.js";
import { toParticleTextureImageOptions } from "../../internal/particles.js";

const EMPTY_TREE = {
  items: {},
  tree: [],
};

const DEFAULT_PARTICLE_FORM_TAB = PARTICLE_FORM_TABS[0]?.id ?? "basics";

const createDialogForm = ({
  editMode = false,
  imagesData = EMPTY_TREE,
  activeTab = DEFAULT_PARTICLE_FORM_TAB,
} = {}) => {
  return createParticleForm({
    editMode,
    imageOptions: toParticleTextureImageOptions(imagesData),
    activeTab,
  });
};

const createDefaultDialogState = (projectResolution) => {
  const particle = buildParticleFormValues({
    presetId: DEFAULT_PARTICLE_PRESET_ID,
    projectResolution,
  });

  return {
    dialogDefaultValues: particle,
    dialogPresetId: DEFAULT_PARTICLE_PRESET_ID,
    dialogPreviewAspectRatio: formatParticleAspectRatio({
      width: particle.width,
      height: particle.height,
    }),
  };
};

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
};

const {
  createInitialState: createCatalogInitialState,
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectItemById,
  selectSelectedItemId,
  setSearchQuery,
  selectViewData: selectCatalogViewData,
} = createCatalogPageStore({
  itemType: "particle",
  resourceType: "particles",
  title: "Particles",
  selectedResourceId: "particles",
  resourceCategory: "animatedAssets",
  addText: "Add",
  emptyMessage: "No particle effects found",
  matchesSearch,
  buildDetailFields: buildParticleDetailFields,
  buildCatalogItem: buildParticleCatalogItem,
  extendViewData: ({ state, selectedItem, baseViewData }) => ({
    ...baseViewData,
    detailFields: buildParticleDetailFields({
      item: selectedItem,
      imagesData: state.imagesData,
    }),
    isDialogOpen: state.isDialogOpen,
    isPreviewOnlyDialog: state.dialogMode === "preview",
    particleFormTabs: PARTICLE_FORM_TABS,
    selectedParticleFormTab: state.dialogFormTab,
    particleFormKey: `particle-form-${state.dialogFormTab}`,
    particleForm: state.particleForm,
    dialogFormValues: state.dialogFormValues,
    dialogPreviewAspectRatio: state.dialogPreviewAspectRatio,
    selectedPreviewAspectRatio: formatParticleAspectRatio(selectedItem),
    selectedItem,
  }),
});

export const createInitialState = () => {
  const projectResolution = DEFAULT_PROJECT_RESOLUTION;
  const defaultDialogState = createDefaultDialogState(projectResolution);

  return {
    ...createCatalogInitialState(),
    isDialogOpen: false,
    dialogMode: "form",
    targetGroupId: undefined,
    editMode: false,
    editItemId: undefined,
    projectResolution,
    previewRuntimeTarget: undefined,
    previewRuntimeWidth: undefined,
    previewRuntimeHeight: undefined,
    dialogFormTab: DEFAULT_PARTICLE_FORM_TAB,
    imagesData: EMPTY_TREE,
    particleForm: createDialogForm(),
    dialogFormValues: defaultDialogState.dialogDefaultValues,
    dialogDefaultValues: defaultDialogState.dialogDefaultValues,
    dialogPresetId: defaultDialogState.dialogPresetId,
    dialogPreviewAspectRatio: defaultDialogState.dialogPreviewAspectRatio,
  };
};

export {
  setItems,
  setSelectedItemId,
  selectSelectedItem,
  selectSelectedItemId,
  setSearchQuery,
};

export const selectParticleItemById = selectItemById;
export const selectSelectedParticle = selectSelectedItem;

export const setProjectResolution = ({ state }, { projectResolution } = {}) => {
  state.projectResolution = requireProjectResolution(
    projectResolution,
    "Project resolution",
  );

  if (!state.isDialogOpen) {
    const defaultDialogState = createDefaultDialogState(state.projectResolution);
    state.dialogFormValues = defaultDialogState.dialogDefaultValues;
    state.dialogDefaultValues = defaultDialogState.dialogDefaultValues;
    state.dialogPresetId = defaultDialogState.dialogPresetId;
    state.dialogPreviewAspectRatio = defaultDialogState.dialogPreviewAspectRatio;
  }
};

const setDialogState = (state, options = {}) => {
  const {
    dialogMode = "form",
    editMode = false,
    itemId = undefined,
    itemData = undefined,
    targetGroupId = undefined,
    presetId = editMode ? "" : DEFAULT_PARTICLE_PRESET_ID,
  } = options;

  const dialogDefaultValues = buildParticleFormValues({
    particle: itemData,
    presetId,
    projectResolution: state.projectResolution,
  });

  state.isDialogOpen = true;
  state.dialogMode = dialogMode;
  state.editMode = editMode;
  state.editItemId = itemId;
  state.targetGroupId = targetGroupId === "_root" ? undefined : targetGroupId;
  state.dialogFormTab = DEFAULT_PARTICLE_FORM_TAB;
  state.dialogFormValues = dialogDefaultValues;
  state.dialogPresetId = presetId;
  state.dialogDefaultValues = dialogDefaultValues;
  state.dialogPreviewAspectRatio = formatParticleAspectRatio({
    width: dialogDefaultValues.width,
    height: dialogDefaultValues.height,
  });
  state.particleForm = createDialogForm({
    editMode,
    imagesData: state.imagesData,
    activeTab: state.dialogFormTab,
  });
};

export const openParticleFormDialog = ({ state }, options = {}) => {
  setDialogState(state, {
    ...options,
    dialogMode: "form",
  });
};

export const openParticlePreviewDialog = ({ state }, options = {}) => {
  setDialogState(state, {
    ...options,
    dialogMode: "preview",
    editMode: false,
    targetGroupId: undefined,
    presetId: "",
  });
};

export const closeParticleDialog = ({ state }, _payload = {}) => {
  const defaultDialogState = createDefaultDialogState(state.projectResolution);

  state.isDialogOpen = false;
  state.dialogMode = "form";
  state.targetGroupId = undefined;
  state.editMode = false;
  state.editItemId = undefined;
  state.dialogFormTab = DEFAULT_PARTICLE_FORM_TAB;
  state.dialogFormValues = defaultDialogState.dialogDefaultValues;
  state.dialogPresetId = defaultDialogState.dialogPresetId;
  state.dialogDefaultValues = defaultDialogState.dialogDefaultValues;
  state.dialogPreviewAspectRatio = defaultDialogState.dialogPreviewAspectRatio;
  state.particleForm = createDialogForm({
    imagesData: state.imagesData,
    activeTab: state.dialogFormTab,
  });
};

export const setDialogDefaultValues = ({ state }, { values, presetId } = {}) => {
  state.dialogFormValues = values ?? {};
  state.dialogDefaultValues = values ?? {};
  state.dialogPresetId = presetId ?? "";
  state.dialogPreviewAspectRatio = formatParticleAspectRatio({
    width: values?.width,
    height: values?.height,
  });
};

export const setDialogPresetId = ({ state }, { presetId } = {}) => {
  state.dialogPresetId = presetId ?? "";
};

export const setDialogPreviewSize = ({ state }, { width, height } = {}) => {
  state.dialogPreviewAspectRatio = formatParticleAspectRatio({
    width,
    height,
  });
};

export const setImagesData = ({ state }, { imagesData } = {}) => {
  state.imagesData = imagesData ?? EMPTY_TREE;

  if (!state.isDialogOpen) {
    state.particleForm = createDialogForm({
      editMode: state.editMode,
      imagesData: state.imagesData,
      activeTab: state.dialogFormTab,
    });
  }
};

export const setDialogFormValues = ({ state }, { values } = {}) => {
  state.dialogFormValues = values ?? {};
};

export const setDialogFormTab = ({ state }, { tab } = {}) => {
  state.dialogFormTab = tab ?? DEFAULT_PARTICLE_FORM_TAB;
  state.particleForm = createDialogForm({
    editMode: state.editMode,
    imagesData: state.imagesData,
    activeTab: state.dialogFormTab,
  });
};

export const setPreviewRuntime = (
  { state },
  { target, width, height } = {},
) => {
  state.previewRuntimeTarget = target;
  state.previewRuntimeWidth = width;
  state.previewRuntimeHeight = height;
};

export const clearPreviewRuntime = ({ state }, _payload = {}) => {
  state.previewRuntimeTarget = undefined;
  state.previewRuntimeWidth = undefined;
  state.previewRuntimeHeight = undefined;
};

export const selectTargetGroupId = ({ state }) => state.targetGroupId;
export const selectEditMode = ({ state }) => state.editMode;
export const selectEditItemId = ({ state }) => state.editItemId;
export const selectProjectResolution = ({ state }) => state.projectResolution;
export const selectDialogPresetId = ({ state }) => state.dialogPresetId;
export const selectIsDialogOpen = ({ state }) => state.isDialogOpen;
export const selectDialogMode = ({ state }) => state.dialogMode;
export const selectDialogFormTab = ({ state }) => state.dialogFormTab;
export const selectDialogFormValues = ({ state }) => state.dialogFormValues;
export const selectImagesData = ({ state }) => state.imagesData;
export const selectPreviewRuntime = ({ state }) => ({
  target: state.previewRuntimeTarget,
  width: state.previewRuntimeWidth,
  height: state.previewRuntimeHeight,
});

export const selectViewData = (context) => {
  const viewData = selectCatalogViewData(context);

  return {
    ...viewData,
    flatItems: applyFolderRequiredRootDragOptions(viewData.flatItems),
  };
};
