import { toFlatGroups, toFlatItems } from "../../internal/project/tree.js";
import { applyFolderRequiredRootDragOptions } from "../../internal/fileExplorerDragOptions.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import { selectScenesPageCopy } from "./support/scenesPageCopy.js";

const createContextMenuItems = (copy = {}) => [
  { label: copy.openMenuItem ?? "Open", type: "item", value: "open-item" },
  {
    label: copy.previewMenuItem ?? "Preview",
    type: "item",
    value: "preview-item",
  },
  { label: copy.editMenuItem ?? "Edit", type: "item", value: "edit-item" },
  {
    label: copy.setInitialSceneMenuItem ?? "Set Initial Scene",
    type: "item",
    value: "set-initial",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createFileExplorerFolderContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-child-folder",
  },
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createFileExplorerItemContextMenuItems = (copy = {}) => [
  {
    label: copy.renameMenuItem ?? "Rename",
    type: "item",
    value: "rename-item",
  },
  {
    label: copy.deleteMenuItem ?? "Delete",
    type: "item",
    value: "delete-item",
  },
];

const createFileExplorerEmptyContextMenuItems = (copy = {}) => [
  {
    label: copy.newFolderMenuItem ?? "New Folder",
    type: "item",
    value: "new-item",
  },
];

const localizeDropdownMenuItems = (items = [], copy = {}) => {
  const localizedItems = createContextMenuItems(copy);
  return items.map((item) => {
    const localizedItem = localizedItems.find(
      (candidate) => candidate.value === item.value,
    );

    return localizedItem ? { ...item, label: localizedItem.label } : item;
  });
};

export const createInitialState = () => ({
  scenesData: { tree: [], items: {} },
  layoutsData: { tree: [], items: {} },
  sceneOverviewsById: {},
  selectedItemId: null,
  selectedFolderId: undefined,
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
  editItemType: undefined,
  editDefaultValues: {
    name: "",
    description: "",
  },
  sceneOverviewRequestId: 0,
  isTouchMode: false,
  isMobileFileExplorerOpen: false,
  isTouchMinimapReady: false,
  touchMinimapFrameId: undefined,
  isWhiteboardConnectionsReady: false,
  whiteboardConnectionsFrameId: undefined,
  sceneOverviewFrameId: undefined,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const selectIsTouchMode = ({ state }) => state.isTouchMode;

export const openMobileFileExplorer = ({ state }, _payload = {}) => {
  state.isMobileFileExplorerOpen = true;
};

export const closeMobileFileExplorer = ({ state }, _payload = {}) => {
  state.isMobileFileExplorerOpen = false;
};

export const selectIsMobileFileExplorerOpen = ({ state }) => {
  return Boolean(state.isMobileFileExplorerOpen);
};

export const setTouchMinimapReady = ({ state }, { isReady } = {}) => {
  state.isTouchMinimapReady = isReady === true;
};

export const selectIsTouchMinimapReady = ({ state }) =>
  state.isTouchMinimapReady;

export const setTouchMinimapFrameId = ({ state }, { frameId } = {}) => {
  state.touchMinimapFrameId = frameId;
};

export const clearTouchMinimapFrameId = ({ state }) => {
  state.touchMinimapFrameId = undefined;
};

export const selectTouchMinimapFrameId = ({ state }) =>
  state.touchMinimapFrameId;

export const setWhiteboardConnectionsReady = ({ state }, { isReady } = {}) => {
  state.isWhiteboardConnectionsReady = isReady === true;
};

export const selectIsWhiteboardConnectionsReady = ({ state }) =>
  state.isWhiteboardConnectionsReady;

export const setWhiteboardConnectionsFrameId = (
  { state },
  { frameId } = {},
) => {
  state.whiteboardConnectionsFrameId = frameId;
};

export const clearWhiteboardConnectionsFrameId = ({ state }) => {
  state.whiteboardConnectionsFrameId = undefined;
};

export const selectWhiteboardConnectionsFrameId = ({ state }) =>
  state.whiteboardConnectionsFrameId;

export const setSceneOverviewFrameId = ({ state }, { frameId } = {}) => {
  state.sceneOverviewFrameId = frameId;
};

export const clearSceneOverviewFrameId = ({ state }) => {
  state.sceneOverviewFrameId = undefined;
};

export const selectSceneOverviewFrameId = ({ state }) =>
  state.sceneOverviewFrameId;

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

export const setSceneOverviewRequestId = ({ state }, { requestId } = {}) => {
  state.sceneOverviewRequestId = Number.isFinite(Number(requestId))
    ? Math.max(0, Math.floor(Number(requestId)))
    : 0;
};

export const selectSceneOverviewRequestId = ({ state }) => {
  return Number(state.sceneOverviewRequestId) || 0;
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
  if (itemId) {
    state.selectedFolderId = undefined;
  }
};

export const setSelectedFolderId = ({ state }, { folderId } = {}) => {
  if (state.selectedFolderId !== folderId) {
    state.sectionsListOpen = true;
    state.deadEndTooltip.open = false;
  }
  state.selectedFolderId = folderId;
  if (folderId) {
    state.selectedItemId = undefined;
  }
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
  { itemId, itemType, defaultValues = {} } = {},
) => {
  state.isEditDialogOpen = true;
  state.editItemId = itemId;
  state.editItemType = itemType;
  state.editDefaultValues = {
    name: defaultValues?.name ?? "",
    description: defaultValues?.description ?? "",
  };
};

export const closeEditDialog = ({ state }, _payload = {}) => {
  state.isEditDialogOpen = false;
  state.editItemId = undefined;
  state.editItemType = undefined;
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

export const selectSelectedFolderId = ({ state }) => {
  return state.selectedFolderId;
};

export const selectEditItem = ({ state }) => {
  return {
    itemId: state.editItemId,
    itemType: state.editItemType,
  };
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
    items: createContextMenuItems(),
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

export const selectShowSceneForm = ({ state }) => {
  return state.showSceneForm;
};

export const selectSceneItemById = ({ state }, { itemId } = {}) => {
  return state.scenesData?.items?.[itemId];
};

export const selectIsWaitingForTransform = ({ state }) => {
  return state.isWaitingForTransform;
};

export const selectSceneWhiteboardPosition = ({ state }) => {
  return state.sceneWhiteboardPosition;
};

export const selectViewData = ({ state, i18n }) => {
  const copy = selectScenesPageCopy(i18n);
  const flatItems = applyFolderRequiredRootDragOptions(
    toFlatItems(state.scenesData),
  );
  const flatGroups = toFlatGroups(state.scenesData);

  const selectedScene = state.selectedItemId
    ? flatItems.find((item) => item.id === state.selectedItemId)
    : null;
  const selectedFolderItem = state.selectedFolderId
    ? flatItems.find((item) => item.id === state.selectedFolderId)
    : null;
  const selectedFolder = selectedFolderItem
    ? {
        ...selectedFolderItem,
        type: "folder",
        name: selectedFolderItem.name ?? selectedFolderItem.id,
        description: selectedFolderItem.description ?? "",
      }
    : null;
  const selectedDetailItem = selectedScene ?? selectedFolder;
  const selectedDetailType = selectedDetailItem?.type;
  const selectedDetailId = selectedDetailItem?.id;

  let selectedItemName = "";
  let selectedItemDescription = "";
  let selectedSceneSections = [];
  let detailFields = [];
  if (selectedScene?.type === "scene") {
    const selectedSceneOverview = state.sceneOverviewsById?.[selectedScene.id];
    selectedItemName = selectedScene.name ?? "";
    selectedItemDescription = selectedScene.description ?? "";
    selectedSceneSections = Array.isArray(selectedSceneOverview?.sections)
      ? selectedSceneOverview.sections.map((section, index) => ({
          id: section.sectionId || section.id,
          name:
            section.name ||
            formatI18nCopy(copy.sectionFallback ?? "Section {index}", {
              index: index + 1,
            }),
          isDeadEnd: section.isDeadEnd === true,
        }))
      : toFlatItems(
          selectedScene.sections || {
            tree: [],
            items: {},
          },
        ).map((section, index) => ({
          id: section.id,
          name:
            section.name ||
            formatI18nCopy(copy.sectionFallback ?? "Section {index}", {
              index: index + 1,
            }),
          isDeadEnd: false,
        }));
  } else if (selectedFolder) {
    selectedItemName = selectedFolder.name ?? selectedFolder.id;
    selectedItemDescription = selectedFolder.description ?? "";
    detailFields = [
      {
        type: "text",
        label: copy.typeLabel ?? "Type",
        value: copy.folderTypeValue ?? "folder",
      },
      {
        type: "description",
        value: selectedFolder.description ?? "",
      },
    ];
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
      label: copy.sceneNameLabel ?? "Scene Name",
      description: copy.sceneNameDescription ?? "Enter the scene name",
      required: true,
    },
  ];

  if (folderOptions.length > 0) {
    sceneFormFieldsList.push({
      name: "folderId",
      type: "select",
      label: copy.folderLabel ?? "Folder",
      clearable: false,
      options: folderOptions.map((option) => ({
        value: option.id,
        label: option.name,
      })),
      required: true,
    });
  }

  const sceneFormFields = {
    title: copy.createSceneTitle ?? "Create Scene",
    fields: sceneFormFieldsList,
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: copy.createButton ?? "Create",
        },
      ],
    },
  };

  const editItemType = state.editItemType ?? "scene";
  const editForm = {
    title:
      editItemType === "folder"
        ? (copy.editFolderTitle ?? "Edit Folder")
        : (copy.editSceneTitle ?? "Edit Scene"),
    description:
      editItemType === "folder"
        ? (copy.updateFolderDescription ?? "Update folder details")
        : (copy.updateSceneDescription ?? "Update scene details"),
    fields: [
      {
        name: "name",
        type: "input-text",
        label: copy.nameLabel ?? "Name",
        required: true,
      },
      {
        name: "description",
        type: "input-textarea",
        label: copy.descriptionLabel ?? "Description",
      },
    ],
    actions: {
      layout: "",
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: copy.saveButton ?? "Save",
        },
      ],
    },
  };

  return {
    flatItems,
    flatGroups,
    resourceCategory: "project",
    selectedResourceId: "scenes",
    selectedItemId: state.selectedItemId,
    selectedFolderId: state.selectedFolderId,
    selectedDetailId,
    selectedDetailType,
    addSceneButtonVariant: state.isWaitingForTransform ? "pr" : "se",
    whiteboardItems: state.whiteboardItems,
    showWhiteboardConnections:
      !state.isTouchMode || state.isWhiteboardConnectionsReady,
    selectedSceneName: selectedItemName,
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
    dropdownMenu: {
      ...state.dropdownMenu,
      items: localizeDropdownMenuItems(state.dropdownMenu.items, copy),
    },
    previewVisible: state.previewVisible,
    previewSceneId: state.previewSceneId,
    showMapAddHint: state.showMapAddHint,
    sectionsListOpen: state.sectionsListOpen,
    selectedSceneSections,
    selectedItemName,
    detailFields,
    deadEndTooltip: state.deadEndTooltip,
    folderContextMenuItems: createFileExplorerFolderContextMenuItems(copy),
    itemContextMenuItems: createFileExplorerItemContextMenuItems(copy),
    emptyContextMenuItems: createFileExplorerEmptyContextMenuItems(copy),
    isTouchMode: state.isTouchMode,
    showExplorerPanel: !state.isTouchMode,
    showDetailPanel: !state.isTouchMode,
    showMobileScenesControls: state.isTouchMode,
    showMobileFileExplorer: state.isTouchMode && state.isMobileFileExplorerOpen,
    showWhiteboardMinimapInTouchMode:
      state.isTouchMode && state.isTouchMinimapReady,
    whiteboardMinimapPlacement: state.isTouchMode ? "top-left" : "bottom-left",
    whiteboardMinimapHeightScale: state.isTouchMode ? 2 / 3 : 1,
    filesLabel: copy.filesLabel ?? "Files",
    title: copy.title ?? "Scenes",
    previewButton: copy.previewMenuItem ?? "Preview",
    sectionsLabel: copy.sectionsLabel ?? "Sections",
    noSectionsLabel: copy.noSectionsLabel ?? "No sections",
    noSelectionLabel: copy.noSelectionLabel ?? "No selection",
    mapAddHint: copy.mapAddHint ?? "Right click in the map to add a scene",
  };
};
