import { toFlatGroups, toFlatItems } from "insieme";

const createTransitionKey = (transition) => {
  if (!transition) {
    return null;
  }

  const sceneId = transition.sceneId || "";
  const sectionId = transition.sectionId || "";

  if (!sceneId && !sectionId) {
    return null;
  }

  return `${sceneId}::${sectionId}`;
};

const getTransitionsFromLayout = (layout) => {
  if (!layout?.elements?.items) {
    return [];
  }

  return Object.values(layout.elements.items)
    .map((element) => {
      return element?.click?.actionPayload?.actions?.sectionTransition;
    })
    .filter(Boolean);
};

const getSectionPresentation = (
  section,
  initialSectionId,
  layouts,
  menuSceneId,
) => {
  const lines = section?.lines ? toFlatItems(section.lines) : [];
  const transitions = new Set();

  let choiceCount = 0;
  let hasMenuReturnAction = false;
  let returnsToMenuScene = false;

  lines.forEach((line) => {
    const pushLayeredView =
      line.actions?.pushLayeredView || line.actions?.actions?.pushLayeredView;
    const popLayeredView =
      line.actions?.popLayeredView || line.actions?.actions?.popLayeredView;
    if (pushLayeredView || popLayeredView) {
      hasMenuReturnAction = true;
    }

    const sectionTransition =
      line.actions?.sectionTransition ||
      line.actions?.actions?.sectionTransition;
    if (menuSceneId && sectionTransition?.sceneId === menuSceneId) {
      returnsToMenuScene = true;
    }
    const sectionTransitionKey = createTransitionKey(sectionTransition);
    if (sectionTransitionKey) {
      transitions.add(sectionTransitionKey);
    }

    const choice = line.actions?.choice || line.actions?.actions?.choice;
    const choiceItems = Array.isArray(choice?.items) ? choice.items : [];
    choiceCount += choiceItems.length;

    choiceItems.forEach((choiceItem) => {
      const choiceTransition =
        choiceItem.events?.click?.actions?.sectionTransition;
      if (menuSceneId && choiceTransition?.sceneId === menuSceneId) {
        returnsToMenuScene = true;
      }
      const choiceTransitionKey = createTransitionKey(choiceTransition);
      if (choiceTransitionKey) {
        transitions.add(choiceTransitionKey);
      }
    });

    const layoutRefs = [
      line.actions?.background,
      line.actions?.base,
      line.actions?.actions?.background,
      line.actions?.actions?.base,
    ].filter((ref) => ref?.resourceType === "layout" && ref?.resourceId);

    layoutRefs.forEach((layoutRef) => {
      const layout = layouts?.items?.[layoutRef.resourceId];
      const layoutTransitions = getTransitionsFromLayout(layout);

      layoutTransitions.forEach((layoutTransition) => {
        if (menuSceneId && layoutTransition?.sceneId === menuSceneId) {
          returnsToMenuScene = true;
        }
        const layoutTransitionKey = createTransitionKey(layoutTransition);
        if (layoutTransitionKey) {
          transitions.add(layoutTransitionKey);
        }
      });
    });
  });

  const outgoingCount = transitions.size;
  const isMenuReturn = hasMenuReturnAction || returnsToMenuScene;

  return {
    lineCount: lines.length,
    choiceCount,
    outgoingCount,
    isMenuReturn,
    isDeadEnd: outgoingCount === 0 && !isMenuReturn,
    isInitial: section.id === initialSectionId,
  };
};

const form = {
  fields: [
    { name: "name", inputType: "popover-input", description: "Name" },
    { name: "preview", inputType: "slot", slot: "preview" },
  ],
};

const CONTEXT_MENU_ITEMS = [
  { label: "Set Initial Scene", type: "item", value: "set-initial" },
  { label: "Delete", type: "item", value: "delete-item" },
];

export const createInitialState = () => ({
  scenesData: { tree: [], items: {} },
  layoutsData: { tree: [], items: {} },
  selectedItemId: null,
  whiteboardItems: [],
  sectionsPanelExpanded: false,
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
});

export const setItems = (state, scenesData) => {
  state.scenesData = scenesData;
};

export const setLayouts = (state, layoutsData) => {
  state.layoutsData = layoutsData || { tree: [], items: {} };
};

export const showPreviewSceneId = (state, payload) => {
  const { sceneId } = payload;
  state.previewVisible = true;
  state.previewSceneId = sceneId;
};

export const hidePreviewScene = (state) => {
  state.previewVisible = false;
};

export const selectPreviewScene = ({ state }) => {
  return {
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
  };
};

export const setSelectedItemId = (state, itemId) => {
  state.selectedItemId = itemId;
};

export const toggleSectionsPanelExpanded = (state) => {
  state.sectionsPanelExpanded = !state.sectionsPanelExpanded;
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
          x: scene.position?.x || 200,
          y: scene.position?.y || 200,
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

  let defaultValues = {};
  if (selectedItem) {
    defaultValues = {
      name: selectedItem.name,
    };
  }

  const selectedSceneFirstSectionId = selectedItem?.sections?.tree?.[0]?.id;
  const selectedSceneInitialSectionId =
    selectedItem?.initialSectionId || selectedSceneFirstSectionId;
  const menuSceneId = repositoryState?.story?.initialSceneId;

  const selectedSceneSections =
    selectedItem?.type === "scene" && selectedItem?.sections
      ? toFlatItems(selectedItem.sections).map((section, index) => {
          const {
            lineCount,
            choiceCount,
            outgoingCount,
            isMenuReturn,
            isDeadEnd,
            isInitial,
          } = getSectionPresentation(
            section,
            selectedSceneInitialSectionId,
            layouts,
            menuSceneId,
          );

          return {
            id: section.id,
            name: section.name || `Section ${index + 1}`,
            lineCount,
            choiceCount,
            outgoingCount,
            isMenuReturn,
            isDeadEnd,
            isInitial,
            index,
          };
        })
      : [];
  const sectionCount = selectedSceneSections.length;
  const deadEndCount = selectedSceneSections.filter(
    (section) => section.isDeadEnd,
  ).length;
  const sectionCards = selectedSceneSections.map((section, index) => ({
    ...section,
    order: index + 1,
  }));
  const initialSection = selectedSceneSections.find(
    (section) => section.isInitial,
  );
  const initialSectionName = initialSection ? initialSection.name : undefined;
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

  // console.log({
  //   selectedItemId: state.selectedItemId,
  //   defaultValues: defaultValues,
  // });

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
    sectionsPanelExpanded: state.sectionsPanelExpanded,
    sectionsPanelToggleLabel: state.sectionsPanelExpanded
      ? "Collapse"
      : "Expand",
    sectionCards,
    sectionCount,
    deadEndCount,
    initialSectionName,
    isWaitingForTransform: state.isWaitingForTransform,
    showSceneForm: state.showSceneForm,
    sceneFormPosition: state.sceneFormPosition,
    sceneFormData: state.sceneFormData,
    sceneFormFields,
    folderOptions,
    whiteboardCursor: state.isWaitingForTransform ? "crosshair" : undefined,
    dropdownMenu: state.dropdownMenu,
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
  };
};
