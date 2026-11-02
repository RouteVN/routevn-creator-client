import {
  ASSET_PACKAGE_RESOURCE_CONFIGS,
  ASSET_PACKAGE_SCHEMA_VERSION,
  normalizeAssetPackage,
} from "../../internal/assetPackageResources.js";
import {
  formatI18nCopy,
  formatPluralCopy,
} from "../../internal/ui/i18nCopy.js";
import {
  createAssetPackageContents,
  isTopLevelFolder,
  listAssetPackageDependencies,
  selectTopLevelFolders,
} from "./support/assetPackageManifest.js";
import {
  collectFolderResources,
  createResourcePreview,
} from "./support/assetPackagePreviews.js";

// A pack lists its types in this order, and each type's folders in the
// order they were picked.
const RESOURCE_TYPE_ORDER = ASSET_PACKAGE_RESOURCE_CONFIGS.map(
  ({ resourceType }) => resourceType,
);
const RESOURCE_TYPES = new Set(RESOURCE_TYPE_ORDER);
const MAX_LISTED_USERS = 3;

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

// The saved folders in their saved order, without those the project no
// longer has at its top level.
const keepTopLevelFolders = (resourceData, folderIds) =>
  [...new Set(folderIds)].filter((folderId) =>
    isTopLevelFolder(resourceData, folderId),
  );

const copyFolderIdsByType = (folderIdsByType) =>
  Object.fromEntries(
    Object.entries(folderIdsByType).map(([resourceType, folderIds]) => [
      resourceType,
      [...folderIds],
    ]),
  );

export const createInitialState = () => ({
  resourceCategory: "releases",
  selectedResourceId: "assetPackage",
  isTouchMode: false,
  filesData: { items: {} },
  resourceDataByType: createResourceDataByType(),
  selectedFolderIdsByType: createSelectedFolderIdsByType(),
  // The picker ticks a copy of the selection, applied by Done.
  pickerFolderIdsByType: createSelectedFolderIdsByType(),
  isPickerOpen: false,
  pickerResourceType: undefined,
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
  for (const { resourceType, folderIds } of normalizedAssetPackage.resources) {
    if (!RESOURCE_TYPES.has(resourceType)) {
      continue;
    }
    selectedFolderIdsByType[resourceType] = keepTopLevelFolders(
      state.resourceDataByType[resourceType],
      folderIds,
    );
  }
  state.selectedFolderIdsByType = selectedFolderIdsByType;
};

// Ticks or unticks a top-level folder in the picker; `selected` says which,
// or the folder flips. A ticked folder goes after those picked before it.
export const toggleFolder = (
  { state },
  { resourceType, folderId, selected } = {},
) => {
  const resourceData = state.resourceDataByType[resourceType];
  if (
    !RESOURCE_TYPES.has(resourceType) ||
    !resourceData ||
    !isTopLevelFolder(resourceData, folderId)
  ) {
    return;
  }
  const selectedIds = state.pickerFolderIdsByType[resourceType];
  const isSelected = selectedIds.includes(folderId);
  const nextSelected = selected ?? !isSelected;
  if (nextSelected === isSelected) {
    return;
  }
  state.pickerFolderIdsByType[resourceType] = nextSelected
    ? [...selectedIds, folderId]
    : selectedIds.filter((id) => id !== folderId);
};

const hasResources = (resourceData) =>
  Object.values(resourceData.items).some((item) => item.type !== "folder");

// The types the picker offers: those with resources or folders.
const listPickerResourceTypes = (state) =>
  RESOURCE_TYPE_ORDER.filter((resourceType) => {
    const resourceData = state.resourceDataByType[resourceType];
    return (
      hasResources(resourceData) ||
      selectTopLevelFolders(resourceData).length > 0
    );
  });

// The picker shows one type at a time: the one shown last, or else the first
// with folders. It starts from the current selection.
export const openPicker = ({ state }) => {
  const resourceTypes = listPickerResourceTypes(state);
  if (!resourceTypes.includes(state.pickerResourceType)) {
    state.pickerResourceType =
      resourceTypes.find(
        (resourceType) =>
          selectTopLevelFolders(state.resourceDataByType[resourceType]).length >
          0,
      ) ?? resourceTypes[0];
  }
  state.pickerFolderIdsByType = copyFolderIdsByType(
    state.selectedFolderIdsByType,
  );
  state.isPickerOpen = true;
};

export const setPickerResourceType = ({ state }, { resourceType } = {}) => {
  if (listPickerResourceTypes(state).includes(resourceType)) {
    state.pickerResourceType = resourceType;
  }
};

// Done: the picker's ticks become the selection.
export const applyPicker = ({ state }) => {
  state.selectedFolderIdsByType = copyFolderIdsByType(
    state.pickerFolderIdsByType,
  );
  state.isPickerOpen = false;
};

// Closing the picker any other way leaves the selection as it was.
export const closePicker = ({ state }) => {
  state.pickerFolderIdsByType = copyFolderIdsByType(
    state.selectedFolderIdsByType,
  );
  state.isPickerOpen = false;
};

export const selectAssetPackageData = ({ state }) =>
  createAssetPackageContents({
    filesData: state.filesData,
    resourceDataByType: state.resourceDataByType,
    selectedFolderIdsByType: state.selectedFolderIdsByType,
    resourceTypeOrder: RESOURCE_TYPE_ORDER,
  });

export const selectAssetPackage = ({ state }) => ({
  schemaVersion: ASSET_PACKAGE_SCHEMA_VERSION,
  resources: RESOURCE_TYPE_ORDER.filter(
    (resourceType) => state.selectedFolderIdsByType[resourceType].length > 0,
  ).map((resourceType) => ({
    resourceType,
    folderIds: [...state.selectedFolderIdsByType[resourceType]],
  })),
});

const previewOf = (state, resourceType, itemId, extra = {}) => ({
  ...createResourcePreview({
    resourceType,
    itemId,
    item: state.resourceDataByType[resourceType].items[itemId],
    resourceDataByType: state.resourceDataByType,
  }),
  ...extra,
});

// "Comes with": what the picks use that is not a pick, by type. A selection
// that cannot be exported lists nothing and says so.
const buildComesWithViewData = ({ state, copy, resourceTypesCopy }) => {
  let dependencies;
  let isInvalid = false;
  try {
    dependencies = listAssetPackageDependencies({
      resourceDataByType: state.resourceDataByType,
      selectedFolderIdsByType: state.selectedFolderIdsByType,
      resourceTypeOrder: RESOURCE_TYPE_ORDER,
    });
  } catch {
    dependencies = [];
    isInvalid = true;
  }
  const nameById = new Map(
    Object.values(state.resourceDataByType).flatMap((resourceData) =>
      Object.entries(resourceData.items).map(([id, item]) => [id, item.name]),
    ),
  );
  const groups = [];
  for (const dependency of dependencies) {
    let group = groups.at(-1);
    if (group?.resourceType !== dependency.resourceType) {
      group = {
        resourceType: dependency.resourceType,
        label:
          resourceTypesCopy[dependency.resourceType] ?? dependency.resourceType,
        items: [],
      };
      groups.push(group);
    }
    const users = dependency.usedBy.map((id) => nameById.get(id) ?? id);
    let names = users.slice(0, MAX_LISTED_USERS).join(", ");
    if (users.length > MAX_LISTED_USERS) {
      names = `${names}, ${formatI18nCopy(copy.usedByMore, {
        count: users.length - MAX_LISTED_USERS,
      })}`;
    }
    group.items.push({
      id: dependency.itemId,
      name: dependency.name,
      usedBy: formatI18nCopy(copy.usedByLabel, { names }),
      preview: previewOf(state, dependency.resourceType, dependency.itemId, {
        showName: true,
      }),
    });
  }
  return {
    isVisible: groups.length > 0,
    isInvalid,
    invalidMessage: copy.selectionInvalid,
    title: copy.comesWithTitle,
    hint: copy.comesWithHint,
    groups,
  };
};

// Types and their top-level folders, each with its count and every
// resource's preview. The page lists only the picked folders, in the order
// they were picked; the picker lists every folder of the type it shows, in
// project order, ticked as in its own copy of the selection, and says so when
// the type has no folders.
const buildSectionsViewData = ({
  state,
  copy,
  resourceTypesCopy,
  i18n,
  inPicker,
  resourceTypes,
}) =>
  resourceTypes.flatMap((resourceType) => {
    const resourceData = state.resourceDataByType[resourceType];
    const selectedIds = (
      inPicker ? state.pickerFolderIdsByType : state.selectedFolderIdsByType
    )[resourceType];
    const topLevelFolders = selectTopLevelFolders(resourceData);
    const folders = inPicker
      ? topLevelFolders
      : selectedIds
          .map((folderId) =>
            topLevelFolders.find((folder) => folder.id === folderId),
          )
          .filter(Boolean);
    if (!inPicker && folders.length === 0) {
      return [];
    }
    return [
      {
        resourceType,
        label: resourceTypesCopy[resourceType] ?? resourceType,
        selectedLabel:
          selectedIds.length > 0
            ? formatPluralCopy(
                copy,
                "selectedFolderCount",
                selectedIds.length,
                {
                  dateTime: i18n.dateTime,
                },
              )
            : "",
        hasNoFolders: folders.length === 0,
        noFoldersHint: copy.noFoldersHint,
        folders: folders.map((folder) => {
          const resources = collectFolderResources(resourceData, folder.id);
          return {
            folderId: folder.id,
            name: folder.name,
            selected: selectedIds.includes(folder.id),
            // Where a picked folder goes among its type's picks.
            pickOrder: selectedIds.includes(folder.id)
              ? String(selectedIds.indexOf(folder.id) + 1)
              : "",
            items: resources.map(({ itemId }) =>
              previewOf(state, resourceType, itemId, { showName: true }),
            ),
            resourceCount: resources.length,
          };
        }),
      },
    ];
  });

export const selectViewData = ({ state, i18n }) => {
  const copy = i18n.assetPackagePage;
  const resourceTypesCopy = i18n.resourceTypes;
  const pickedSections = buildSectionsViewData({
    state,
    copy,
    resourceTypesCopy,
    i18n,
    inPicker: false,
    resourceTypes: RESOURCE_TYPE_ORDER,
  });
  // The picker's types and the folders of the one it shows, built only while
  // it is open.
  const pickerResourceTypes = state.isPickerOpen
    ? listPickerResourceTypes(state)
    : [];
  const pickerTypes = pickerResourceTypes.map((resourceType) => ({
    resourceType,
    label: resourceTypesCopy[resourceType] ?? resourceType,
    isCurrent: resourceType === state.pickerResourceType,
    selectedCount:
      state.pickerFolderIdsByType[resourceType].length > 0
        ? String(state.pickerFolderIdsByType[resourceType].length)
        : "",
  }));
  const [pickerSection] = pickerResourceTypes.includes(state.pickerResourceType)
    ? buildSectionsViewData({
        state,
        copy,
        resourceTypesCopy,
        i18n,
        inPicker: true,
        resourceTypes: [state.pickerResourceType],
      })
    : [];
  const comesWith = buildComesWithViewData({ state, copy, resourceTypesCopy });
  const pickedCount = RESOURCE_TYPE_ORDER.reduce(
    (count, resourceType) =>
      count +
      state.selectedFolderIdsByType[resourceType].reduce(
        (folderCount, folderId) =>
          folderCount +
          collectFolderResources(
            state.resourceDataByType[resourceType],
            folderId,
          ).length,
        0,
      ),
    0,
  );

  return {
    ...state,
    showExplorerPanel: !state.isTouchMode,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
    pickedTitle: copy.pickedTitle,
    pickResourcesLabel: copy.pickResourcesButton,
    hasPicks: pickedSections.length > 0,
    nothingPickedMessage: copy.nothingPicked,
    pickedSections,
    pickerTitle: copy.pickerTitle,
    pickerHint: copy.introHint,
    pickerDoneLabel: copy.doneButton,
    hasPickerTypes: pickerTypes.length > 0,
    emptyProjectMessage: copy.emptyProjectMessage,
    pickerTypes,
    pickerSection: pickerSection ?? { folders: [] },
    comesWith,
    exportDisabled: pickedCount === 0 || comesWith.isInvalid,
  };
};
