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

const ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS =
  ASSET_PACKAGE_RESOURCE_CONFIGS.filter(
    ({ resourceType }) => resourceType !== "layouts",
  );
const ASSET_PACKAGE_CREATOR_RESOURCE_TYPES = new Set(
  ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS.map(
    ({ resourceType }) => resourceType,
  ),
);
// A pack lists its types in this order, and each type's folders in the
// order the project has them.
const RESOURCE_TYPE_ORDER = ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS.map(
  ({ resourceType }) => resourceType,
);
// A folder row shows its first few previews; expanding it shows them all.
const STRIP_SIZE = 6;
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
    ASSET_PACKAGE_CREATOR_RESOURCE_CONFIGS.map(({ resourceType }) => [
      resourceType,
      [],
    ]),
  );

const sortByProjectOrder = (resourceData, folderIds) =>
  resourceData.tree
    .map((node) => node.id)
    .filter(
      (folderId) =>
        folderIds.includes(folderId) &&
        isTopLevelFolder(resourceData, folderId),
    );

const toFolderKey = (resourceType, folderId, inPicker = false) =>
  `${inPicker ? "picker:" : ""}${resourceType}:${folderId}`;

const toggleListValue = (values, value) =>
  values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];

export const createInitialState = () => ({
  resourceCategory: "releases",
  selectedResourceId: "assetPackage",
  isTouchMode: false,
  filesData: { items: {} },
  resourceDataByType: createResourceDataByType(),
  selectedFolderIdsByType: createSelectedFolderIdsByType(),
  expandedFolderKeys: [],
  collapsedResourceTypes: [],
  isPickerOpen: false,
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
    if (!ASSET_PACKAGE_CREATOR_RESOURCE_TYPES.has(resourceType)) {
      continue;
    }
    selectedFolderIdsByType[resourceType] = sortByProjectOrder(
      state.resourceDataByType[resourceType],
      folderIds,
    );
  }
  state.selectedFolderIdsByType = selectedFolderIdsByType;
};

// Ticks or unticks a top-level folder; `selected` says which, or the folder
// flips.
export const toggleFolder = (
  { state },
  { resourceType, folderId, selected } = {},
) => {
  const resourceData = state.resourceDataByType[resourceType];
  if (
    !ASSET_PACKAGE_CREATOR_RESOURCE_TYPES.has(resourceType) ||
    !resourceData ||
    !isTopLevelFolder(resourceData, folderId)
  ) {
    return;
  }
  const selectedIds = state.selectedFolderIdsByType[resourceType];
  const nextSelected = selected ?? !selectedIds.includes(folderId);
  const otherIds = selectedIds.filter((id) => id !== folderId);
  state.selectedFolderIdsByType[resourceType] = sortByProjectOrder(
    resourceData,
    nextSelected ? [...otherIds, folderId] : otherIds,
  );
};

// The page and the picker expand folders separately.
export const toggleFolderExpanded = (
  { state },
  { resourceType, folderId, inPicker = false } = {},
) => {
  state.expandedFolderKeys = toggleListValue(
    state.expandedFolderKeys,
    toFolderKey(resourceType, folderId, inPicker),
  );
};

export const openPicker = ({ state }) => {
  state.isPickerOpen = true;
};

export const closePicker = ({ state }) => {
  state.isPickerOpen = false;
};

export const toggleResourceTypeCollapsed = (
  { state },
  { resourceType } = {},
) => {
  state.collapsedResourceTypes = toggleListValue(
    state.collapsedResourceTypes,
    resourceType,
  );
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
      preview: previewOf(state, dependency.resourceType, dependency.itemId),
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

// Each type and its top-level folders, each with its count and previews. The
// page lists only the picked folders; the picker lists every folder, with
// types that have resources but no folders saying so.
const buildSectionsViewData = ({
  state,
  copy,
  resourceTypesCopy,
  i18n,
  inPicker,
}) =>
  RESOURCE_TYPE_ORDER.flatMap((resourceType) => {
    const resourceData = state.resourceDataByType[resourceType];
    const resourceCount = Object.values(resourceData.items).filter(
      (item) => item.type !== "folder",
    ).length;
    const selectedIds = state.selectedFolderIdsByType[resourceType];
    const folders = selectTopLevelFolders(resourceData).filter(
      (folder) => inPicker || selectedIds.includes(folder.id),
    );
    if (
      inPicker
        ? folders.length === 0 && resourceCount === 0
        : folders.length === 0
    ) {
      return [];
    }
    const isCollapsed =
      inPicker && state.collapsedResourceTypes.includes(resourceType);
    return [
      {
        resourceType,
        label: resourceTypesCopy[resourceType] ?? resourceType,
        isCollapsed,
        headerIcon: isCollapsed ? "folderArrowRight" : "folderArrowDown",
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
        folders: isCollapsed
          ? []
          : folders.map((folder) => {
              const isExpanded = state.expandedFolderKeys.includes(
                toFolderKey(resourceType, folder.id, inPicker),
              );
              const resources = collectFolderResources(resourceData, folder.id);
              const previews = (
                isExpanded ? resources : resources.slice(0, STRIP_SIZE)
              ).map(({ itemId }) =>
                previewOf(state, resourceType, itemId, {
                  showName: isExpanded,
                }),
              );
              const hiddenCount = resources.length - STRIP_SIZE;
              return {
                folderId: folder.id,
                name: folder.name,
                selected: selectedIds.includes(folder.id),
                removeLabel: formatI18nCopy(copy.removeFolderLabel, {
                  name: folder.name,
                }),
                countLabel: formatPluralCopy(
                  copy,
                  "folderResourceCount",
                  resources.length,
                  { dateTime: i18n.dateTime },
                ),
                canExpand: resources.length > 0,
                isExpanded,
                expandIcon: isExpanded ? "folderArrowDown" : "folderArrowRight",
                expandLabel: isExpanded
                  ? copy.collapseFolderLabel
                  : copy.expandFolderLabel,
                strip: isExpanded ? [] : previews,
                hasStrip: !isExpanded && previews.length > 0,
                moreLabel:
                  !isExpanded && hiddenCount > 0
                    ? formatI18nCopy(copy.moreCount, { count: hiddenCount })
                    : "",
                items: isExpanded ? previews : [],
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
  });
  // The picker's folders are built only while it is open.
  const pickerSections = state.isPickerOpen
    ? buildSectionsViewData({
        state,
        copy,
        resourceTypesCopy,
        i18n,
        inPicker: true,
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
    addFoldersLabel: copy.addFoldersButton,
    hasPicks: pickedSections.length > 0,
    nothingPickedMessage: copy.nothingPicked,
    pickedSections,
    pickerTitle: copy.pickerTitle,
    pickerHint: copy.introHint,
    pickerDoneLabel: copy.doneButton,
    hasPickerSections: pickerSections.length > 0,
    emptyProjectMessage: copy.emptyProjectMessage,
    pickerSections,
    comesWith,
    pickedSummary:
      pickedCount > 0
        ? formatPluralCopy(copy, "pickedSummary", pickedCount, {
            dateTime: i18n.dateTime,
          })
        : "",
    exportDisabled: pickedCount === 0 || comesWith.isInvalid,
  };
};
