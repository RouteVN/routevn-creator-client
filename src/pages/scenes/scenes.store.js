import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { getSectionPresentation } from "../../internal/projectStory.js";

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
  selectedItemId: null,
  whiteboardItems: [],
  isWaitingForTransform: false,
  showSceneForm: false,
  sceneFormPosition: { x: 0, y: 0 },
  sceneWhiteboardPosition: { x: 0, y: 0 },
  sceneFormData: { name: "", folderId: "_root" },
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
  state.sceneFormData = { name: "", folderId: "_root" };
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

  const layouts = state.layoutsData;
  const flatItems = toFlatItems(state.scenesData);
  const flatGroups = toFlatGroups(state.scenesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;
  const selectedSceneFirstSectionId = selectedItem?.sections?.tree?.[0]?.id;
  const selectedSceneInitialSectionId =
    selectedItem?.initialSectionId || selectedSceneFirstSectionId;
  const menuSceneId = repositoryState?.story?.initialSceneId;

  let selectedSceneName = "";
  let detailFields = [];
  let selectedSceneSections = [];
  if (selectedItem?.type === "scene") {
    selectedSceneName = selectedItem.name ?? "";
    selectedSceneSections = toFlatItems(
      selectedItem.sections || {
        tree: [],
        items: {},
      },
    ).map((section, index) => {
      const { isDeadEnd } = getSectionPresentation({
        section,
        initialSectionId: selectedSceneInitialSectionId,
        layouts,
        menuSceneId,
      });

      return {
        id: section.id,
        name: section.name || `Section ${index + 1}`,
        isDeadEnd,
      };
    });
    detailFields = [
      {
        type: "text",
        label: "",
        value: selectedSceneName,
      },
      {
        type: "slot",
        slot: "open-action",
        label: "",
      },
      {
        type: "slot",
        slot: "preview",
        label: "",
      },
      {
        type: "slot",
        slot: "sections-list",
        label: "",
      },
    ];
  }

  // Get folder options for form
  const folderOptions = [
    { id: "_root", name: "Root Folder" },
    ...flatItems
      .filter((item) => item.type === "folder")
      .map((folder) => ({ id: folder.id, name: folder.name || folder.id })),
  ];

  // Define form fields
  const sceneFormFields = {
    title: "Create New Scene",
    fields: [
      {
        name: "name",
        type: "input-text",
        label: "Scene Name",
        description: "Enter the scene name",
        required: true,
      },
      {
        name: "folderId",
        type: "select",
        label: "Folder",
        options: folderOptions.map((option) => ({
          value: option.id,
          label: option.name,
        })),
        required: true,
      },
    ],
    actions: {
      layout: "",
      buttons: [
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
        type: "textarea",
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
    detailFields,
    selectedSceneName,
    isWaitingForTransform: state.isWaitingForTransform,
    showSceneForm: state.showSceneForm,
    sceneFormPosition: state.sceneFormPosition,
    sceneFormData: state.sceneFormData,
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
    deadEndTooltip: state.deadEndTooltip,
    folderContextMenuItems: fileExplorerFolderContextMenuItems,
    itemContextMenuItems: fileExplorerItemContextMenuItems,
    emptyContextMenuItems: fileExplorerEmptyContextMenuItems,
  };
};
