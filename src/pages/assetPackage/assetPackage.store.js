import {
  ASSET_PACKAGE_RESOURCE_CONFIGS,
  ASSET_PACKAGE_SCHEMA_VERSION,
  normalizeAssetPackage,
} from "../../internal/assetPackageResources.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  createAssetPackageRepository,
  isTopLevelFolder,
  selectTopLevelFolders,
} from "./support/assetPackageManifest.js";

const ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS =
  ASSET_PACKAGE_RESOURCE_CONFIGS.filter(
    ({ resourceType }) => resourceType !== "layouts",
  );
const ASSET_PACKAGE_CREATOR_RESOURCE_TYPES = new Set(
  ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS.map(
    ({ resourceType }) => resourceType,
  ),
);

const createEmptyResourceData = () => ({
  items: {},
  tree: [],
});

const createResourceDataByType = () =>
  Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_CONFIGS.map(({ resourceType }) => [
      resourceType,
      createEmptyResourceData(),
    ]),
  );

const createSelectedFolderIdsByType = () =>
  Object.fromEntries(
    ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS.map(({ resourceType }) => [
      resourceType,
      [],
    ]),
  );

const createResourceTypeOrder = () =>
  ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS.map(
    ({ resourceType }) => resourceType,
  );

const createResourceTypeContextMenu = () => ({
  isOpen: false,
  x: 0,
  y: 0,
  resourceType: undefined,
});

const createFolderPicker = () => ({
  resourceType: undefined,
  isOpen: false,
  x: 0,
  y: 0,
  draftSelectedFolderIds: [],
});

const buildFolderViewData = ({ resourceData, folderPicker, selectedIds }) => {
  const folders = selectTopLevelFolders(resourceData);
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const folderOptions = folders.map((folder) => {
    const selectedIndex = folderPicker.draftSelectedFolderIds.indexOf(
      folder.id,
    );
    const selected = selectedIndex !== -1;
    const selectionOrder = selected ? selectedIndex + 1 : undefined;
    return {
      id: folder.id,
      label: folder.name,
      selected,
      selectionOrder,
      icon: "folder",
      buttonVariant: selected ? "se" : "gh",
    };
  });
  const selectedFolders = selectedIds
    .map((folderId) => {
      const folder = foldersById.get(folderId);
      if (!folder) {
        return undefined;
      }

      return {
        id: folder.id,
        label: folder.name,
      };
    })
    .filter(Boolean);

  return { folderOptions, selectedFolders };
};

const selectOrderedSelectedResourceTypes = (state) =>
  state.resourceTypeOrder.filter(
    (resourceType) => state.selectedFolderIdsByType[resourceType].length > 0,
  );

export const createInitialState = () => ({
  resourceCategory: "releases",
  selectedResourceId: "assetPackage",
  isTouchMode: false,
  filesData: { items: {} },
  resourceDataByType: createResourceDataByType(),
  selectedFolderIdsByType: createSelectedFolderIdsByType(),
  resourceTypeOrder: createResourceTypeOrder(),
  resourceTypeMenu: {
    isOpen: false,
    x: 0,
    y: 0,
  },
  resourceTypeContextMenu: createResourceTypeContextMenu(),
  folderPicker: createFolderPicker(),
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setFilesData = ({ state }, { filesData } = {}) => {
  state.filesData = filesData ?? { items: {} };
};

export const setResourceData = ({ state }, { resourceDataByType } = {}) => {
  for (const { resourceType } of ASSET_PACKAGE_RESOURCE_CONFIGS) {
    state.resourceDataByType[resourceType] =
      resourceDataByType?.[resourceType] ?? createEmptyResourceData();
  }
};

export const setAssetPackage = ({ state }, { assetPackage } = {}) => {
  const normalizedAssetPackage = normalizeAssetPackage(assetPackage);
  const selectedFolderIdsByType = createSelectedFolderIdsByType();
  const selectedResourceTypes = [];

  for (const { resourceType, folderIds } of normalizedAssetPackage.resources) {
    if (!ASSET_PACKAGE_CREATOR_RESOURCE_TYPES.has(resourceType)) {
      continue;
    }

    const resourceData = state.resourceDataByType[resourceType];
    const validFolderIds = folderIds.filter((folderId) =>
      isTopLevelFolder(resourceData, folderId),
    );
    if (validFolderIds.length === 0) {
      continue;
    }

    selectedFolderIdsByType[resourceType] = validFolderIds;
    selectedResourceTypes.push(resourceType);
  }

  state.selectedFolderIdsByType = selectedFolderIdsByType;
  state.resourceTypeOrder = [
    ...selectedResourceTypes,
    ...createResourceTypeOrder().filter(
      (resourceType) => !selectedResourceTypes.includes(resourceType),
    ),
  ];
};

export const openResourceTypeMenu = ({ state }, { x, y } = {}) => {
  state.resourceTypeMenu.isOpen = true;
  state.resourceTypeMenu.x = x;
  state.resourceTypeMenu.y = y;
};

export const closeResourceTypeMenu = ({ state }) => {
  state.resourceTypeMenu.isOpen = false;
};

export const selectResourceTypeMenuPosition = ({ state }) => ({
  x: state.resourceTypeMenu.x,
  y: state.resourceTypeMenu.y,
});

export const openResourceTypeContextMenu = (
  { state },
  { resourceType, x, y } = {},
) => {
  const selectedResourceTypes = selectOrderedSelectedResourceTypes(state);
  if (
    selectedResourceTypes.length < 2 ||
    !selectedResourceTypes.includes(resourceType)
  ) {
    state.resourceTypeContextMenu = createResourceTypeContextMenu();
    return;
  }

  state.resourceTypeContextMenu.isOpen = true;
  state.resourceTypeContextMenu.x = x;
  state.resourceTypeContextMenu.y = y;
  state.resourceTypeContextMenu.resourceType = resourceType;
};

export const closeResourceTypeContextMenu = ({ state }) => {
  state.resourceTypeContextMenu = createResourceTypeContextMenu();
};

export const selectResourceTypeContextMenuResourceType = ({ state }) =>
  state.resourceTypeContextMenu.resourceType;

export const moveResourceType = ({ state }, { resourceType, offset } = {}) => {
  const selectedResourceTypes = selectOrderedSelectedResourceTypes(state);
  const selectedIndex = selectedResourceTypes.indexOf(resourceType);
  const targetSelectedIndex = selectedIndex + offset;
  if (
    selectedIndex === -1 ||
    targetSelectedIndex < 0 ||
    targetSelectedIndex >= selectedResourceTypes.length
  ) {
    return;
  }

  const targetResourceType = selectedResourceTypes[targetSelectedIndex];
  const resourceIndex = state.resourceTypeOrder.indexOf(resourceType);
  const targetResourceIndex =
    state.resourceTypeOrder.indexOf(targetResourceType);
  state.resourceTypeOrder[resourceIndex] = targetResourceType;
  state.resourceTypeOrder[targetResourceIndex] = resourceType;
};

export const openResourceFolderPicker = (
  { state },
  { resourceType, x, y } = {},
) => {
  const resourceData = state.resourceDataByType[resourceType];
  if (
    !ASSET_PACKAGE_CREATOR_RESOURCE_TYPES.has(resourceType) ||
    !resourceData ||
    selectTopLevelFolders(resourceData).length === 0
  ) {
    state.folderPicker.resourceType = undefined;
    state.folderPicker.isOpen = false;
    state.folderPicker.draftSelectedFolderIds = [];
    return;
  }

  state.folderPicker.resourceType = resourceType;
  state.folderPicker.isOpen = true;
  state.folderPicker.x = x;
  state.folderPicker.y = y;
  state.folderPicker.draftSelectedFolderIds = [
    ...state.selectedFolderIdsByType[resourceType],
  ];
};

export const closeResourceFolderPicker = ({ state }) => {
  const { resourceType } = state.folderPicker;
  state.folderPicker.isOpen = false;
  state.folderPicker.draftSelectedFolderIds = resourceType
    ? [...state.selectedFolderIdsByType[resourceType]]
    : [];
};

export const toggleResourceFolderSelection = ({ state }, { folderId } = {}) => {
  const { resourceType } = state.folderPicker;
  const resourceData = state.resourceDataByType[resourceType];
  if (!resourceData || !isTopLevelFolder(resourceData, folderId)) {
    return;
  }

  const selectedIndex =
    state.folderPicker.draftSelectedFolderIds.indexOf(folderId);
  if (selectedIndex === -1) {
    state.folderPicker.draftSelectedFolderIds.push(folderId);
    return;
  }

  state.folderPicker.draftSelectedFolderIds.splice(selectedIndex, 1);
};

export const confirmResourceFolderSelection = ({ state }) => {
  const { resourceType } = state.folderPicker;
  const resourceData = state.resourceDataByType[resourceType];
  if (!resourceData) {
    return;
  }

  state.selectedFolderIdsByType[resourceType] =
    state.folderPicker.draftSelectedFolderIds.filter((folderId) =>
      isTopLevelFolder(resourceData, folderId),
    );
  state.folderPicker.isOpen = false;
};

export const selectAssetPackageData = ({ state }) =>
  createAssetPackageRepository({
    filesData: state.filesData,
    resourceDataByType: state.resourceDataByType,
    selectedFolderIdsByType: state.selectedFolderIdsByType,
    resourceTypeOrder: state.resourceTypeOrder,
  });

export const selectAssetPackage = ({ state }) => ({
  schemaVersion: ASSET_PACKAGE_SCHEMA_VERSION,
  resources: selectOrderedSelectedResourceTypes(state).map((resourceType) => ({
    resourceType,
    folderIds: [...state.selectedFolderIdsByType[resourceType]],
  })),
});

export const selectViewData = ({ state, i18n }) => {
  const copy = i18n.assetPackagePage;
  const resourceTypesCopy = i18n.resourceTypes;
  const resourceTypeMenuItems = [];
  const selectedResourceSections = [];

  for (const resourceType of state.resourceTypeOrder) {
    const label = resourceTypesCopy[resourceType] ?? resourceType;
    const { folderOptions, selectedFolders } = buildFolderViewData({
      resourceData: state.resourceDataByType[resourceType],
      folderPicker: createFolderPicker(),
      selectedIds: state.selectedFolderIdsByType[resourceType],
    });
    if (selectedFolders.length === 0) {
      if (folderOptions.length > 0) {
        resourceTypeMenuItems.push({
          label,
          type: "item",
          value: resourceType,
        });
      }
      continue;
    }
    selectedResourceSections.push({
      resourceType,
      label,
      selectedFolders,
      editButtonLabel: formatI18nCopy(copy.editResourceFoldersButtonLabel, {
        resourceType: label,
      }),
    });
  }

  const contextMenuResourceType = state.resourceTypeContextMenu.resourceType;
  const contextMenuResourceIndex = selectedResourceSections.findIndex(
    ({ resourceType }) => resourceType === contextMenuResourceType,
  );
  const contextMenuItems = [];
  if (contextMenuResourceIndex > 0) {
    contextMenuItems.push({
      label: i18n.resourcePages.moveUpMenuItem,
      type: "item",
      value: "move-up",
    });
  }
  if (
    contextMenuResourceIndex >= 0 &&
    contextMenuResourceIndex < selectedResourceSections.length - 1
  ) {
    contextMenuItems.push({
      label: i18n.resourcePages.moveDownMenuItem,
      type: "item",
      value: "move-down",
    });
  }

  const activeResourceType = state.folderPicker.resourceType;
  const activeFolderViewData = activeResourceType
    ? buildFolderViewData({
        resourceData: state.resourceDataByType[activeResourceType],
        folderPicker: state.folderPicker,
        selectedIds: state.selectedFolderIdsByType[activeResourceType],
      })
    : { folderOptions: [], selectedFolders: [] };

  return {
    ...state,
    showExplorerPanel: !state.isTouchMode,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
    resourceTypeMenuItems,
    selectedResourceSections,
    resourceTypeContextMenu: {
      ...state.resourceTypeContextMenu,
      items: contextMenuItems,
    },
    folderOptions: activeFolderViewData.folderOptions,
    resourceFolderPickerOpen:
      state.folderPicker.isOpen &&
      activeFolderViewData.folderOptions.length > 0,
  };
};
