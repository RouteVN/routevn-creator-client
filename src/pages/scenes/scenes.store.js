import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";

const CONTEXT_MENU_ITEMS = [
  { label: "Open", type: "item", value: "open-item" },
  { label: "Preview", type: "item", value: "preview-item" },
  { label: "Edit", type: "item", value: "edit-item" },
  { label: "Set Initial Scene", type: "item", value: "set-initial" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const fileExplorerFolderContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-child-folder" },
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const fileExplorerItemContextMenuItems = [
  { label: "Rename", type: "item", value: "rename-item" },
  { label: "Delete", type: "item", value: "delete-item" },
];

const fileExplorerEmptyContextMenuItems = [
  { label: "New Folder", type: "item", value: "new-item" },
];
const toFiniteNumberOr = (value, fallback) =>
  Number.isFinite(value) ? value : fallback;

export const createInitialState = () => ({
  scenesData: { tree: [], items: {} },
  layoutsData: { tree: [], items: {} },
  sceneOverviewsById: {},
  selectedItemId: null,
  whiteboardItems: [],
  isWaitingForTransform: false,
  showSceneForm: false,
  sceneFormPosition: { x: 0, y: 0 },
  sceneWhiteboardPosition: { x: 0, y: 0 },
  sceneFormData: { name: "", folderId: undefined },
  // Dropdown menu state
  dropdownMenu: {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    itemId: null,
  },
  previewVisible: false,
  previewSceneId: undefined,
  sectionsListOpen: true,
  deadEndTooltip: {
    open: false,
    x: 0,
    y: 0,
    content: "",
  },
  showMapAddHint: true,
  isEditDialogOpen: false,
  editItemId: undefined,
  editDefaultValues: {
    name: "",
    description: "",
  },
});

export const setItems = ({ state }, { scenesData } = {}) => {
  state.scenesData = scenesData;
};

export const setLayouts = ({ state }, { layoutsData } = {}) => {
  state.layoutsData = layoutsData || { tree: [], items: {} };
};

export const setSceneOverviews = ({ state }, { sceneOverviewsById } = {}) => {
  state.sceneOverviewsById =
    sceneOverviewsById && typeof sceneOverviewsById === "object"
      ? sceneOverviewsById
      : {};
};

export const showPreviewSceneId = ({ state }, { sceneId } = {}) => {
  state.previewVisible = true;
  state.previewSceneId = sceneId;
};

export const hidePreviewScene = ({ state }, _payload = {}) => {
  state.previewVisible = false;
};

export const selectPreviewScene = ({ state }) => {
  return {
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
  };
};

export const setSelectedItemId = ({ state }, { itemId } = {}) => {
  if (state.selectedItemId !== itemId) {
    state.sectionsListOpen = true;
    state.deadEndTooltip.open = false;
  }
  state.selectedItemId = itemId;
};

export const toggleSectionsList = ({ state }, _payload = {}) => {
  state.sectionsListOpen = !state.sectionsListOpen;
};

export const showDeadEndTooltip = ({ state }, { x, y, content } = {}) => {
  state.deadEndTooltip = {
    open: true,
    x,
    y,
    content,
  };
};

export const hideDeadEndTooltip = ({ state }, _payload = {}) => {
  state.deadEndTooltip = {
    ...state.deadEndTooltip,
    open: false,
  };
};

export const hideMapAddHint = ({ state }, _payload = {}) => {
  state.showMapAddHint = false;
};

export const openEditDialog = (
  { state },
  { itemId, defaultValues = {} } = {},
) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editDefaultValues = {
    name: "",
    description: "",
  };
};

export const updateItemPosition = ({ state }, { itemId, x, y } = {}) => {
  const item = state.whiteboardItems.find((item) => item.id === itemId);
  if (item) {
    item.x = x;
    item.y = y;
  }
};

export const updatePersistedScenePosition = (
  { state },
  { itemId, x, y } = {},
) => {
  const scene = state.scenesData?.items?.[itemId];
  if (scene) {
    scene.position = { x, y };
  }
};

export const addWhiteboardItem = ({ state }, { newItem } = {}) => {
  state.whiteboardItems.push(newItem);
};

export const setWhiteboardItems = ({ state }, { items } = {}) => {
  state.whiteboardItems = items;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const setWaitingForTransform = ({ state }, { isWaiting } = {}) => {
  state.isWaitingForTransform = isWaiting;
};

export const setShowSceneForm = ({ state }, { show } = {}) => {
  state.showSceneForm = show;
};

export const setSceneFormPosition = ({ state }, { position } = {}) => {
  state.sceneFormPosition = position;
};

export const setSceneWhiteboardPosition = ({ state }, { position } = {}) => {
  state.sceneWhiteboardPosition = position;
};

export const setSceneFormData = ({ state }, { data } = {}) => {
  state.sceneFormData = { ...state.sceneFormData, ...data };
};

export const resetSceneForm = ({ state }, _payload = {}) => {
  state.showSceneForm = false;
  state.isWaitingForTransform = false;
  state.sceneFormPosition = { x: 0, y: 0 };
  state.sceneFormData = { name: "", folderId: undefined };
};

// Dropdown menu functions
export const showDropdownMenu = ({ state }, { position, itemId } = {}) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    itemId,
    items: CONTEXT_MENU_ITEMS,
  };
};

export const hideDropdownMenu = ({ state }, _payload = {}) => {
  state.dropdownMenu = {
    isOpen: false,
    position: { x: 0, y: 0 },
    items: [],
    itemId: null,
  };
};

export const selectDropdownMenuItemId = ({ state }) => {
  return state.dropdownMenu.itemId;
};

export const selectWhiteboardItems = ({ state }) => {
  return state.whiteboardItems;
};

export const selectScenesData = ({ state }) => {
  return state.scenesData;
};

export const selectIsWaitingForTransform = ({ state }) => {
  return state.isWaitingForTransform;
};

export const selectSceneWhiteboardPosition = ({ state }) => {
  return state.sceneWhiteboardPosition;
};

// Track if we've initialized from repository yet
let hasInitialized = false;

export const selectViewData = ({ state }, payload) => {
  const repositoryState = payload?.repository?.getState?.();

  // Check if we need to initialize from repository on first render
  if (!hasInitialized && repositoryState) {
    const { scenes, story, layouts: repositoryLayouts } = repositoryState;

    if (scenes && Object.keys(scenes.items || {}).length > 0) {
      // Initialize the scenes data
      state.scenesData = scenes;
      state.layoutsData = repositoryLayouts || { tree: [], items: {} };

      // Transform only scene items (not folders) into whiteboard items
      const initialSceneId = story?.initialSceneId;

      const sceneItems = Object.entries(scenes.items || {})
        .filter(([, item]) => item.type === "scene")
        .map(([sceneId, scene]) => ({
          id: sceneId,
          name: scene.name || `Scene ${sceneId}`,
          x: toFiniteNumberOr(scene.position?.x, 200),
          y: toFiniteNumberOr(scene.position?.y, 200),
          isInitial: sceneId === initialSceneId,
        }));

      state.whiteboardItems = sceneItems;
      hasInitialized = true;
    }
  }

  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.scenesData),
  );
  const flatGroups = toFlatGroups(state.scenesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let selectedSceneName = "";
  let selectedItemDescription = "";
  let selectedSceneSections = [];
  if (selectedItem?.type === "scene") {
    const selectedSceneOverview = state.sceneOverviewsById?.[selectedItem.id];
    selectedSceneName = selectedItem.name ?? "";
    selectedItemDescription = selectedItem.description ?? "";
    selectedSceneSections = Array.isArray(selectedSceneOverview?.sections)
      ? selectedSceneOverview.sections.map((section, index) => ({
          id: section.sectionId || section.id,
          name: section.name || `Section ${index + 1}`,
          isDeadEnd: section.isDeadEnd === true,
        }))
      : toFlatItems(
          selectedItem.sections || {
            tree: [],
            items: {},
          },
        ).map((section, index) => ({
          id: section.id,
          name: section.name || `Section ${index + 1}`,
          isDeadEnd: false,
        }));
  }

  // Get folder options for form
  const folderOptions = flatItems
    .filter((item) => item.type === "folder")
    .map((folder) => ({ id: folder.id, name: folder.name || folder.id }));
  const defaultSceneFolderId = folderOptions[0]?.id;
  const hasSelectedSceneFolder = folderOptions.some(
    (folder) => folder.id === state.sceneFormData.folderId,
  );
  const sceneFormDefaultValues = {
    name: state.sceneFormData.name ?? "",
    folderId: hasSelectedSceneFolder
      ? state.sceneFormData.folderId
      : defaultSceneFolderId,
  };
  const sceneFormKey = `${state.showSceneForm}-${sceneFormDefaultValues.folderId ?? "none"}-${folderOptions.length}`;

  // Define form fields
  const sceneFormFieldsList = [
    {
      name: "name",
      type: "input-text",
      label: "Scene Name",
      description: "Enter the scene name",
      required: true,
    },
  ];

  if (folderOptions.length > 0) {
    sceneFormFieldsList.push({
      name: "folderId",
      type: "select",
      label: "Folder",
      clearable: false,
      options: folderOptions.map((option) => ({
        value: option.id,
        label: option.name,
      })),
      required: true,
    });
  }

  const sceneFormFields = {
    title: "Create New Scene",
    fields: sceneFormFieldsList,
    actions: {
      layout: "",
      buttons: [
        {
          id: "cancel",
          variant: "se",
          label: "Cancel",
        },
        {
          id: "submit",
          variant: "pr",
          label: "Create Scene",
        },
      ],
    },
  };

  const editForm = {
    title: "Edit Scene",
    description: "Update scene details",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Name",
        required: true,
      },
      {
        name: "description",
        type: "input-textarea",
        label: "Description",
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: "Save",
        },
      ],
    },
  };

  // console.log({
  //   selectedItemId: state.selectedItemId,
  //   defaultValues: defaultValues,
  // });

  return {
    flatItems,
    flatGroups,
    resourceCategory: "project",
    selectedResourceId: "scenes",
    selectedItemId: state.selectedItemId,
    addSceneButtonVariant: state.isWaitingForTransform ? "pr" : "se",
    whiteboardItems: state.whiteboardItems,
    selectedSceneName,
    selectedItemDescription,
    isWaitingForTransform: state.isWaitingForTransform,
    showSceneForm: state.showSceneForm,
    sceneFormKey,
    sceneFormPosition: state.sceneFormPosition,
    sceneFormData: sceneFormDefaultValues,
    sceneFormFields,
    isEditDialogOpen: state.isEditDialogOpen,
    editDefaultValues: state.editDefaultValues,
    editForm,
    folderOptions,
    whiteboardCursor: state.isWaitingForTransform ? "crosshair" : undefined,
    dropdownMenu: state.dropdownMenu,
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
    showMapAddHint: state.showMapAddHint,
    sectionsListOpen: state.sectionsListOpen,
    selectedSceneSections,
    selectedItemName: selectedSceneName,
    deadEndTooltip: state.deadEndTooltip,
    folderContextMenuItems: fileExplorerFolderContextMenuItems,
    itemContextMenuItems: fileExplorerItemContextMenuItems,
    emptyContextMenuItems: fileExplorerEmptyContextMenuItems,
  };
};
