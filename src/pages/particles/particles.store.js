import { createCatalogPageStore } from "../../internal/ui/resourcePages/catalog/createCatalogPageStore.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import {
  DEFAULT_PROJECT_RESOLUTION,
  requireProjectResolution,
} from "../../internal/projectResolution.js";
import {
  buildTagFilterOptions,
  createEmptyTagCollection,
  matchesTagAwareSearch,
  matchesTagFilter,
} from "../../internal/resourceTags.js";
import {
  PARTICLE_FORM_TABS,
  buildParticleCatalogItem,
  buildParticleDetailFields,
  buildParticleFormValues,
  createParticleCreateSetupForm,
  createParticleForm,
} from "./support/particleForm.js";
import { DEFAULT_PARTICLE_PRESET_ID } from "./support/particlePresets.js";
import { formatParticleAspectRatio } from "./support/particlePreview.js";
import { toParticleTextureImageOptions } from "../../internal/particles.js";

const EMPTY_TREE = {
  items: {},
  tree: [],
};

export const PARTICLE_TAG_SCOPE_KEY = "particles";

const DEFAULT_PARTICLE_FORM_TAB = PARTICLE_FORM_TABS[0]?.id ?? "basics";
const CREATE_PARTICLE_SETUP_STEP = "setup";
const PARTICLE_EDITOR_STEP = "editor";
const CREATE_TAG_DEFAULT_VALUES = Object.freeze({
  name: "",
});

const createTagForm = {
  title: "Create Tag",
  fields: [
    {
      name: "name",
      type: "input-text",
      label: "Tag Name",
      required: true,
    },
  ],
  actions: {
    layout: "",
    buttons: [
      {
        id: "submit",
        variant: "pr",
        label: "Create Tag",
      },
    ],
  },
};

const createDialogForm = ({
  editMode = false,
  imagesData = EMPTY_TREE,
  tagsData = createEmptyTagCollection(),
  activeTab = DEFAULT_PARTICLE_FORM_TAB,
  dialogStep = PARTICLE_EDITOR_STEP,
} = {}) => {
  const imageOptions = toParticleTextureImageOptions(imagesData);
  const tagOptions = buildTagFilterOptions({
    tagsCollection: tagsData,
  });

  if (!editMode && dialogStep === CREATE_PARTICLE_SETUP_STEP) {
    return createParticleCreateSetupForm({
      imageOptions,
    });
  }

  return createParticleForm({
    editMode,
    imageOptions,
    tagOptions,
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

const matchesSearch = matchesTagAwareSearch;

const {
  createInitialState: createCatalogInitialState,
  setItems: setBaseItems,
  setSelectedItemId: setBaseSelectedItemId,
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
  extendViewData: ({ state, selectedItem, baseViewData }) => {
    const activeTagIds = state.activeTagIds ?? [];
    const filteredCatalogGroups = (baseViewData.catalogGroups ?? [])
      .map((group) => ({
        ...group,
        children: (group.children ?? []).filter((child) =>
          matchesTagFilter({
            item: state.data?.items?.[child.id],
            activeTagIds,
          }),
        ),
      }))
      .filter((group) => group.children.length > 0 || activeTagIds.length === 0);

    return {
      ...baseViewData,
      catalogGroups: filteredCatalogGroups,
      detailFields: buildParticleDetailFields({
        item: selectedItem,
        imagesData: state.imagesData,
      }),
      tagFilterOptions: buildTagFilterOptions({
        tagsCollection: state.tagsData,
      }),
      selectedTagFilterValues: activeTagIds,
      tagFilterPlaceholder: "Filter tags",
      selectedItemTagIds: selectedItem?.tagIds ?? [],
      detailTagDraftValues: state.detailTagIds ?? [],
      isDetailTagSelectOpen: !!state.isDetailTagSelectOpen,
      detailTagAddOption: {
        label: "Add tag",
      },
      isDialogOpen: state.isDialogOpen,
      isPreviewOnlyDialog: state.dialogMode === "preview",
      showParticleFormTabs: state.dialogStep === PARTICLE_EDITOR_STEP,
      particleFormTabs: PARTICLE_FORM_TABS,
      selectedParticleFormTab: state.dialogFormTab,
      particleFormKey: `particle-form-${state.dialogStep}-${state.dialogFormTab}`,
      particleForm: state.particleForm,
      dialogFormValues: state.dialogFormValues,
      dialogPreviewAspectRatio: state.dialogPreviewAspectRatio,
      selectedPreviewAspectRatio: formatParticleAspectRatio(selectedItem),
      isCreateTagDialogOpen: state.isCreateTagDialogOpen,
      createTagDefaultValues: state.createTagDefaultValues,
      createTagForm,
      selectedItem,
    };
  },
});

export const createInitialState = () => {
  const projectResolution = DEFAULT_PROJECT_RESOLUTION;
  const defaultDialogState = createDefaultDialogState(projectResolution);

  return {
    ...createCatalogInitialState(),
    tagsData: createEmptyTagCollection(),
    activeTagIds: [],
    detailTagIds: [],
    detailTagIdsDirty: false,
    isDetailTagSelectOpen: false,
    isDialogOpen: false,
    dialogMode: "form",
    targetGroupId: undefined,
    editMode: false,
    editItemId: undefined,
    projectResolution,
    previewRuntimeTarget: undefined,
    previewRuntimeWidth: undefined,
    previewRuntimeHeight: undefined,
    dialogStep: CREATE_PARTICLE_SETUP_STEP,
    dialogFormTab: DEFAULT_PARTICLE_FORM_TAB,
    imagesData: EMPTY_TREE,
    particleForm: createDialogForm({
      dialogStep: CREATE_PARTICLE_SETUP_STEP,
    }),
    isCreateTagDialogOpen: false,
    createTagDefaultValues: {
      ...CREATE_TAG_DEFAULT_VALUES,
    },
    createTagContext: {
      mode: undefined,
      itemId: undefined,
      draftTagIds: [],
    },
    dialogFormValues: defaultDialogState.dialogDefaultValues,
    dialogDefaultValues: defaultDialogState.dialogDefaultValues,
    dialogPresetId: defaultDialogState.dialogPresetId,
    dialogPreviewAspectRatio: defaultDialogState.dialogPreviewAspectRatio,
  };
};

const syncDetailTagIds = (state, { preserveDirty = false } = {}) => {
  if (preserveDirty && state.detailTagIdsDirty) {
    return;
  }

  const item = state.selectedItemId
    ? state.data?.items?.[state.selectedItemId]
    : undefined;
  state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
  state.detailTagIdsDirty = false;
};

export const setItems = (context, payload = {}) => {
  setBaseItems(context, payload);
  syncDetailTagIds(context.state, { preserveDirty: true });
};

export const setSelectedItemId = (context, payload = {}) => {
  setBaseSelectedItemId(context, payload);
  context.state.isDetailTagSelectOpen = false;
  syncDetailTagIds(context.state);
};

export const setTagsData = ({ state }, { tagsData } = {}) => {
  state.tagsData = tagsData ?? createEmptyTagCollection();
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.activeTagIds = state.activeTagIds.filter((tagId) => validTagIds.has(tagId));
  state.detailTagIds = state.detailTagIds.filter((tagId) => validTagIds.has(tagId));
  state.particleForm = createDialogForm({
    editMode: state.editMode,
    imagesData: state.imagesData,
    tagsData: state.tagsData,
    activeTab: state.dialogFormTab,
    dialogStep: state.dialogStep,
  });
};

export const setActiveTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.activeTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
};

export const setDetailTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = true;
};

export const commitDetailTagIds = ({ state }, { tagIds } = {}) => {
  const validTagIds = new Set(Object.keys(state.tagsData.items ?? {}));
  state.detailTagIds = [
    ...new Set((tagIds ?? []).filter((tagId) => validTagIds.has(tagId))),
  ];
  state.detailTagIdsDirty = false;
};

export const setDetailTagPopoverOpen = ({ state }, { open, item } = {}) => {
  state.isDetailTagSelectOpen = !!open;
  if (!state.isDetailTagSelectOpen && state.detailTagIdsDirty) {
    state.detailTagIds = Array.isArray(item?.tagIds) ? [...item.tagIds] : [];
    state.detailTagIdsDirty = false;
  }
};

export const openCreateTagDialog = ({ state }, { mode, itemId, draftTagIds } = {}) => {
  state.isCreateTagDialogOpen = true;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: mode ?? "item",
    itemId,
    draftTagIds: Array.isArray(draftTagIds) ? [...draftTagIds] : [],
  };
};

export const closeCreateTagDialog = ({ state }, _payload = {}) => {
  state.isCreateTagDialogOpen = false;
  state.createTagDefaultValues = {
    ...CREATE_TAG_DEFAULT_VALUES,
  };
  state.createTagContext = {
    mode: undefined,
    itemId: undefined,
    draftTagIds: [],
  };
};

export {
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
    const defaultDialogState = createDefaultDialogState(
      state.projectResolution,
    );
    state.dialogFormValues = defaultDialogState.dialogDefaultValues;
    state.dialogDefaultValues = defaultDialogState.dialogDefaultValues;
    state.dialogPresetId = defaultDialogState.dialogPresetId;
    state.dialogPreviewAspectRatio =
      defaultDialogState.dialogPreviewAspectRatio;
  }
};

const setDialogState = (state, options = {}) => {
  const {
    dialogMode = "form",
    editMode = false,
    dialogStep = editMode ? PARTICLE_EDITOR_STEP : CREATE_PARTICLE_SETUP_STEP,
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
  state.dialogStep = dialogStep;
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
    tagsData: state.tagsData,
    activeTab: state.dialogFormTab,
    dialogStep: state.dialogStep,
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
  state.dialogStep = CREATE_PARTICLE_SETUP_STEP;
  state.dialogFormTab = DEFAULT_PARTICLE_FORM_TAB;
  state.dialogFormValues = defaultDialogState.dialogDefaultValues;
  state.dialogPresetId = defaultDialogState.dialogPresetId;
  state.dialogDefaultValues = defaultDialogState.dialogDefaultValues;
  state.dialogPreviewAspectRatio = defaultDialogState.dialogPreviewAspectRatio;
  state.particleForm = createDialogForm({
    imagesData: state.imagesData,
    tagsData: state.tagsData,
    activeTab: state.dialogFormTab,
    dialogStep: state.dialogStep,
  });
};

export const setDialogDefaultValues = (
  { state },
  { values, presetId } = {},
) => {
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
  state.particleForm = createDialogForm({
    editMode: state.editMode,
    imagesData: state.imagesData,
    tagsData: state.tagsData,
    activeTab: state.dialogFormTab,
    dialogStep: state.dialogStep,
  });
};

export const setDialogFormValues = ({ state }, { values } = {}) => {
  state.dialogFormValues = values ?? {};
};

export const setDialogFormTab = ({ state }, { tab } = {}) => {
  state.dialogFormTab = tab ?? DEFAULT_PARTICLE_FORM_TAB;
  state.particleForm = createDialogForm({
    editMode: state.editMode,
    imagesData: state.imagesData,
    tagsData: state.tagsData,
    activeTab: state.dialogFormTab,
    dialogStep: state.dialogStep,
  });
};

export const setDialogStep = ({ state }, { step } = {}) => {
  state.dialogStep = step ?? CREATE_PARTICLE_SETUP_STEP;
  state.particleForm = createDialogForm({
    editMode: state.editMode,
    imagesData: state.imagesData,
    tagsData: state.tagsData,
    activeTab: state.dialogFormTab,
    dialogStep: state.dialogStep,
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
export const selectDialogStep = ({ state }) => state.dialogStep;
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
