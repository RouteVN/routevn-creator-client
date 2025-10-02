import { toFlatGroups, toFlatItems } from "../../deps/repository";

const form = {
  fields: [{ name: "name", inputType: "popover-input", description: "Name" }],
};

const CONTEXT_MENU_ITEMS = [
  { label: "Set Initial Scene", type: "item", value: "set-initial" },
  { label: "Delete", type: "item", value: "delete-item" },
];

export const createInitialState = () => ({
  scenesData: { tree: [], items: {} },
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
});

export const setItems = (state, scenesData) => {
  state.scenesData = scenesData;
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const updateItemPosition = (state, { itemId, x, y }) => {
  const item = state.whiteboardItems.find((item) => item.id === itemId);
  if (item) {
    item.x = x;
    item.y = y;
  }
};

export const addWhiteboardItem = (state, newItem) => {
  state.whiteboardItems.push(newItem);
};

export const setWhiteboardItems = (state, items) => {
  state.whiteboardItems = items;
};

export const selectSelectedItemId = ({ state }) => {
  return state.selectedItemId;
};

export const setWaitingForTransform = (state, isWaiting) => {
  state.isWaitingForTransform = isWaiting;
};

export const setShowSceneForm = (state, show) => {
  state.showSceneForm = show;
};

export const setSceneFormPosition = (state, position) => {
  state.sceneFormPosition = position;
};

export const setSceneWhiteboardPosition = (state, position) => {
  state.sceneWhiteboardPosition = position;
};

export const setSceneFormData = (state, data) => {
  state.sceneFormData = { ...state.sceneFormData, ...data };
};

export const resetSceneForm = (state) => {
  state.showSceneForm = false;
  state.isWaitingForTransform = false;
  state.sceneFormPosition = { x: 0, y: 0 };
  state.sceneFormData = { name: "", folderId: "_root" };
};

// Dropdown menu functions
export const showDropdownMenu = (state, { position, itemId }) => {
  state.dropdownMenu = {
    isOpen: true,
    position,
    itemId,
    items: CONTEXT_MENU_ITEMS,
  };
};

export const hideDropdownMenu = (state) => {
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

export const selectViewData = ({ state, props }, payload) => {
  // Check if we need to initialize from repository on first render
  if (!hasInitialized && payload && payload.repository) {
    const repositoryState = payload.repository.getState();
    const { scenes } = repositoryState;

    if (scenes && Object.keys(scenes.items || {}).length > 0) {
      // Initialize the scenes data
      state.scenesData = scenes;

      // Transform only scene items (not folders) into whiteboard items
      const initialSceneId = scenes.initialSceneId;
      const sceneItems = Object.entries(scenes.items || {})
        .filter(([key, item]) => item.type === "scene")
        .map(([sceneId, scene]) => ({
          id: sceneId,
          name: scene.name || `Scene ${sceneId}`,
          x: scene.position?.x || 200,
          y: scene.position?.y || 200,
          // Add red color for initial scene
          textColor: sceneId === initialSceneId ? "de" : undefined,
        }));

      state.whiteboardItems = sceneItems;
      hasInitialized = true;
    }
  }

  const flatItems = toFlatItems(state.scenesData);
  const flatGroups = toFlatGroups(state.scenesData);

  // Get selected item details
  const selectedItem = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
    };
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
        inputType: "inputText",
        label: "Scene Name",
        description: "Enter the scene name",
        required: true,
      },
      {
        name: "folderId",
        inputType: "select",
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
          content: "Create Scene",
        },
      ],
    },
  };

  return {
    flatItems,
    flatGroups,
    resourceCategory: "project",
    selectedResourceId: "scenes",
    repositoryTarget: "scenes",
    selectedItemId: state.selectedItemId,
    addSceneButtonVariant: state.isWaitingForTransform ? "pr" : "se",
    whiteboardItems: state.whiteboardItems,
    form,
    defaultValues,
    isWaitingForTransform: state.isWaitingForTransform,
    showSceneForm: state.showSceneForm,
    sceneFormPosition: state.sceneFormPosition,
    sceneFormData: state.sceneFormData,
    sceneFormFields,
    folderOptions,
    whiteboardCursor: state.isWaitingForTransform ? "crosshair" : undefined,
    dropdownMenu: state.dropdownMenu,
  };
};
