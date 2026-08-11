import {
  ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE,
  ASSET_PACKAGE_RESOURCE_CONFIGS,
  ASSET_PACKAGE_SCHEMA_VERSION,
  EMPTY_ASSET_PACKAGE_METADATA,
  normalizeAssetPackage,
} from "../../internal/assetPackageResources.js";
import { formatI18nCopy } from "../../internal/ui/i18nCopy.js";
import {
  createAssetPackageRepository,
  isTopLevelFolder,
  selectTopLevelFolders,
} from "./support/assetPackageManifest.js";

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
    ASSET_PACKAGE_RESOURCE_CONFIGS.map(({ resourceType }) => [
      resourceType,
      [],
    ]),
  );

const createResourceTypeOrder = () =>
  ASSET_PACKAGE_RESOURCE_CONFIGS.map(({ resourceType }) => resourceType);

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

const clonePackageMetadata = (packageMetadata) => ({
  id: packageMetadata.id,
  name: packageMetadata.name,
  version: packageMetadata.version,
  description: packageMetadata.description,
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
  packageMetadata: clonePackageMetadata(EMPTY_ASSET_PACKAGE_METADATA),
  packageMetadataEditDialogOpen: false,
  packageMetadataEditDefaultValues: clonePackageMetadata(
    EMPTY_ASSET_PACKAGE_METADATA,
  ),
});

export const selectPackageMetadata = ({ state }) =>
  clonePackageMetadata(state.packageMetadata);

export const selectPackageMetadataEditDefaultValues = ({ state }) =>
  clonePackageMetadata(state.packageMetadataEditDefaultValues);

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
  state.packageMetadata = clonePackageMetadata(normalizedAssetPackage.metadata);
  state.resourceTypeOrder = [
    ...selectedResourceTypes,
    ...createResourceTypeOrder().filter(
      (resourceType) => !selectedResourceTypes.includes(resourceType),
    ),
  ];
};

export const openPackageMetadataEditDialog = ({ state }) => {
  state.packageMetadataEditDialogOpen = true;
  state.packageMetadataEditDefaultValues = clonePackageMetadata(
    state.packageMetadata,
  );
};

export const closePackageMetadataEditDialog = ({ state }) => {
  state.packageMetadataEditDialogOpen = false;
};

export const setPackageMetadata = ({ state }, { packageMetadata } = {}) => {
  state.packageMetadata = clonePackageMetadata(packageMetadata);
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
    !ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE[resourceType] ||
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
  metadata: clonePackageMetadata(state.packageMetadata),
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

  const packageMetadataComplete = ["id", "name", "version"].every(
    (key) => state.packageMetadata[key].trim().length > 0,
  );
  const packageMetadataEditForm = {
    title: copy.editPackageInformationTitle,
    fields: [
      {
        name: "id",
        type: "input-text",
        label: copy.packageIdLabel,
        required: true,
      },
      {
        name: "name",
        type: "input-text",
        label: copy.packageNameLabel,
        required: true,
      },
      {
        name: "version",
        type: "input-text",
        label: copy.packageVersionLabel,
        required: true,
      },
      {
        name: "description",
        type: "input-textarea",
        label: copy.packageDescriptionLabel,
        required: false,
      },
    ],
    actions: {
      buttons: [
        {
          id: "submit",
          variant: "pr",
          label: copy.savePackageInformationButton,
          validate: true,
        },
      ],
    },
  };

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
    packageMetadataComplete,
    packageMetadataName: packageMetadataComplete
      ? state.packageMetadata.name
      : copy.addPackageInformation,
    packageMetadataSummary: packageMetadataComplete
      ? `${state.packageMetadata.id} · ${state.packageMetadata.version}`
      : copy.packageInformationRequired,
    packageMetadataDescription: state.packageMetadata.description,
    packageMetadataEditForm,
  };
};
