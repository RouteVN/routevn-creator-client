import {
  ASSET_PACKAGE_RESOURCE_CONFIGS,
  ASSET_PACKAGE_SCHEMA_VERSION,
  ASSET_STORE_HIDDEN_RESOURCE_TYPES,
  normalizeAssetPackage,
} from "../../internal/assetPackageResources.js";
import {
  formatI18nCopy,
  formatPluralCopy,
} from "../../internal/ui/i18nCopy.js";
import {
  createAssetPackageContents,
  indexResourceFolders,
  listAssetPackageDependencies,
  listAssetPackageLinks,
  selectOutermostFolderIds,
} from "../../internal/assetPackageManifest.js";
import {
  collectFolderResources,
  createResourcePreview,
} from "./support/assetPackagePreviews.js";

// The order a type goes in when the pack has no place for it yet: types newly
// picked go after the pack's own, in this order. A pack keeps its own order,
// which the editor can change, and lists each type's folders in the order
// they were picked.
const RESOURCE_TYPE_ORDER = ASSET_PACKAGE_RESOURCE_CONFIGS.map(
  ({ resourceType }) => resourceType,
);
const RESOURCE_TYPES = new Set(RESOURCE_TYPE_ORDER);
const MAX_LISTED_USERS = 3;
// How far the picker indents a folder for each folder it sits in.
const PICKER_FOLDER_INDENT = 24;

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
// longer has. A pack may pick a folder at any depth, as the model allows.
const keepExistingFolders = (resourceData, folderIds) =>
  [...new Set(folderIds)].filter(
    (folderId) => resourceData.items[folderId]?.type === "folder",
  );

const copyFolderIdsByType = (folderIdsByType) =>
  Object.fromEntries(
    Object.entries(folderIdsByType).map(([resourceType, folderIds]) => [
      resourceType,
      [...folderIds],
    ]),
  );

// The types with folders picked, in the page's order: those the pack lists,
// in its order, then those picked since, in the default order. A type that
// was unpicked is no longer in `resourceTypeOrder`, so picking it again puts
// it last.
const orderResourceTypes = (folderIdsByType, resourceTypeOrder) => {
  const isPicked = (resourceType) => folderIdsByType[resourceType].length > 0;
  const listed = resourceTypeOrder.filter(isPicked);
  return [
    ...listed,
    ...RESOURCE_TYPE_ORDER.filter(
      (resourceType) =>
        isPicked(resourceType) && !listed.includes(resourceType),
    ),
  ];
};

// A pack's `resources`: the types with folders picked, in the page's order.
const toResources = (folderIdsByType, resourceTypeOrder) =>
  orderResourceTypes(folderIdsByType, resourceTypeOrder).map(
    (resourceType) => ({
      resourceType,
      folderIds: [...folderIdsByType[resourceType]],
    }),
  );

export const createInitialState = () => ({
  resourceCategory: "releases",
  selectedResourceId: "asset-pack-editor",
  // The asset pack being edited.
  assetPackId: undefined,
  assetPackName: "",
  isTouchMode: false,
  filesData: { items: {} },
  // The project's scenes and sections, which name the story links.
  scenesData: { items: {}, tree: [] },
  tagsData: {},
  resourceDataByType: createResourceDataByType(),
  selectedFolderIdsByType: createSelectedFolderIdsByType(),
  // The picker ticks a copy of the selection, applied by Done.
  pickerFolderIdsByType: createSelectedFolderIdsByType(),
  // The picks as last loaded or saved. A save changes only the types picked
  // differently since, so it leaves the others as they are now.
  baseFolderIdsByType: createSelectedFolderIdsByType(),
  // The picked types in the pack's order, as the page lists them, and as last
  // loaded or saved. A move saves at once, so it changes both.
  resourceTypeOrder: [],
  baseResourceTypeOrder: [],
  // The menu of a type's heading, which moves the type up or down.
  typeMenu: {
    isOpen: false,
    x: 0,
    y: 0,
    resourceType: undefined,
    items: [],
  },
  // While Done saves the picks, it does nothing more.
  isSavingPicks: false,
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

export const setScenesData = ({ state }, { scenesData } = {}) => {
  state.scenesData = scenesData ?? { items: {}, tree: [] };
};

export const setTagsData = ({ state }, { tagsData } = {}) => {
  state.tagsData = tagsData ?? {};
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
    selectedFolderIdsByType[resourceType] = keepExistingFolders(
      state.resourceDataByType[resourceType],
      folderIds,
    );
  }
  state.selectedFolderIdsByType = selectedFolderIdsByType;
  state.baseFolderIdsByType = copyFolderIdsByType(selectedFolderIdsByType);
  state.resourceTypeOrder = orderResourceTypes(
    selectedFolderIdsByType,
    normalizedAssetPackage.resources.map(({ resourceType }) => resourceType),
  );
  state.baseResourceTypeOrder = [...state.resourceTypeOrder];
};

// The asset pack being edited, and its picks.
export const setAssetPack = (
  { state },
  { assetPackId, name, resources } = {},
) => {
  state.assetPackId = assetPackId;
  state.assetPackName = name ?? "";
  setAssetPackage(
    { state },
    {
      assetPackage: {
        schemaVersion: ASSET_PACKAGE_SCHEMA_VERSION,
        resources: resources ?? [],
      },
    },
  );
};

export const selectAssetPackId = ({ state }) => state.assetPackId;
export const selectAssetPackName = ({ state }) => state.assetPackName;
export const selectIsSavingPicks = ({ state }) => state.isSavingPicks;

// The picks as last loaded or saved, which a save compares its picks with.
export const selectBaseResources = ({ state }) =>
  toResources(state.baseFolderIdsByType, state.baseResourceTypeOrder);

export const startSavingPicks = ({ state }) => {
  state.isSavingPicks = true;
};

// A save of the picks ended. After one that succeeded, `savedResources` are
// what it saved, and the next save starts from them.
export const finishSavingPicks = ({ state }, { savedResources } = {}) => {
  state.isSavingPicks = false;
  if (!savedResources) {
    return;
  }
  const baseFolderIdsByType = createSelectedFolderIdsByType();
  for (const { resourceType, folderIds } of savedResources) {
    baseFolderIdsByType[resourceType] = [...folderIds];
  }
  state.baseFolderIdsByType = baseFolderIdsByType;
  state.baseResourceTypeOrder = savedResources.map(
    ({ resourceType }) => resourceType,
  );
};

// Ticks or unticks a folder, at any depth, in the picker; `selected` says
// which, or the folder flips. A ticked folder goes after those picked before
// it. A folder inside a ticked one comes with it, so it is neither ticked nor
// unticked on its own; a pick of its own stays for when that one is unticked.
export const toggleFolder = (
  { state },
  { resourceType, folderId, selected } = {},
) => {
  if (!RESOURCE_TYPES.has(resourceType)) {
    return;
  }
  const folder = indexResourceFolders(
    state.resourceDataByType[resourceType],
  ).get(folderId);
  const selectedIds = state.pickerFolderIdsByType[resourceType];
  if (
    !folder ||
    folder.ancestorIds.some((ancestorId) => selectedIds.includes(ancestorId))
  ) {
    return;
  }
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

// The folders the picker offers for a type, at any depth, in tree order,
// each with its tree node and the folders it sits in: those with resources in
// them or in a folder inside them, and those already picked, with the folders
// they sit in, so a picked folder that was emptied can still be unticked.
const listPickerFolders = (state, resourceType) => {
  const resourceData = state.resourceDataByType[resourceType];
  const pickedIds = new Set(state.selectedFolderIdsByType[resourceType]);
  const folders = [];
  // Whether the nodes hold a resource or a folder the picker offers.
  const visit = (nodes, ancestorIds) => {
    let offersAny = false;
    for (const node of nodes ?? []) {
      const item = resourceData.items[node.id];
      if (!item) continue;
      if (item.type !== "folder") {
        offersAny = true;
        continue;
      }
      const index = folders.push({
        id: node.id,
        name: item.name,
        node,
        ancestorIds,
      });
      const isOffered =
        visit(node.children, [...ancestorIds, node.id]) ||
        pickedIds.has(node.id);
      if (isOffered) {
        offersAny = true;
      } else {
        // Nothing inside it is offered either.
        folders.length = index - 1;
      }
    }
    return offersAny;
  };
  visit(resourceData.tree, []);
  return folders;
};

// The types the picker offers: those with resources or folders to offer.
// A type the asset store does not take is offered only while the pack has
// folders of it picked, so they can be unticked.
const listPickerResourceTypes = (state) =>
  RESOURCE_TYPE_ORDER.filter((resourceType) => {
    if (ASSET_STORE_HIDDEN_RESOURCE_TYPES.includes(resourceType)) {
      return state.selectedFolderIdsByType[resourceType].length > 0;
    }
    return (
      hasResources(state.resourceDataByType[resourceType]) ||
      listPickerFolders(state, resourceType).length > 0
    );
  });

// How many folders of a type the picker has ticked, counting a folder inside
// a ticked one only with it; empty when none.
const formatPickedCount = (state, resourceType) => {
  const count = selectOutermostFolderIds(
    state.resourceDataByType[resourceType],
    state.pickerFolderIdsByType[resourceType],
  ).length;
  return count > 0 ? String(count) : "";
};

// The picker shows one type at a time: the one shown last, or else the first
// with folders to offer. It starts from the current selection.
export const openPicker = ({ state }) => {
  const resourceTypes = listPickerResourceTypes(state);
  if (!resourceTypes.includes(state.pickerResourceType)) {
    state.pickerResourceType =
      resourceTypes.find(
        (resourceType) => listPickerFolders(state, resourceType).length > 0,
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

// Done: the picker's ticks become the selection. The types stay in the order
// they were in, and those newly picked go after them.
export const applyPicker = ({ state }) => {
  state.selectedFolderIdsByType = copyFolderIdsByType(
    state.pickerFolderIdsByType,
  );
  state.resourceTypeOrder = orderResourceTypes(
    state.selectedFolderIdsByType,
    state.resourceTypeOrder,
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
    // The package lists the types in the pack's order, which import follows.
    resourceTypeOrder: orderResourceTypes(
      state.selectedFolderIdsByType,
      state.resourceTypeOrder,
    ),
    scenesData: state.scenesData,
    tagsData: state.tagsData,
  });

export const selectAssetPackage = ({ state }) => ({
  schemaVersion: ASSET_PACKAGE_SCHEMA_VERSION,
  resources: toResources(
    state.selectedFolderIdsByType,
    state.resourceTypeOrder,
  ),
});

const MOVE_UP_VALUE = "move-up";
const MOVE_DOWN_VALUE = "move-down";

// Where a type's heading menu can move it: up unless it is the first, down
// unless it is the last.
const listTypeMenuItems = ({ copy, index, total }) => {
  const items = [];
  if (index > 0) {
    items.push({
      label: copy.moveTypeUpMenuItem,
      type: "item",
      value: MOVE_UP_VALUE,
    });
  }
  if (index < total - 1) {
    items.push({
      label: copy.moveTypeDownMenuItem,
      type: "item",
      value: MOVE_DOWN_VALUE,
    });
  }
  return items;
};

export const openTypeMenu = ({ state, i18n }, { x, y, resourceType } = {}) => {
  const resourceTypes = orderResourceTypes(
    state.selectedFolderIdsByType,
    state.resourceTypeOrder,
  );
  const index = resourceTypes.indexOf(resourceType);
  if (index === -1) {
    return;
  }
  state.typeMenu.isOpen = true;
  state.typeMenu.x = x ?? 0;
  state.typeMenu.y = y ?? 0;
  state.typeMenu.resourceType = resourceType;
  state.typeMenu.items = listTypeMenuItems({
    copy: i18n.assetPackagePage,
    index,
    total: resourceTypes.length,
  });
};

export const closeTypeMenu = ({ state }) => {
  state.typeMenu.isOpen = false;
  state.typeMenu.x = 0;
  state.typeMenu.y = 0;
  state.typeMenu.resourceType = undefined;
  state.typeMenu.items = [];
};

export const selectIsTypeMenuOpen = ({ state }) => state.typeMenu.isOpen;
export const selectTypeMenuResourceType = ({ state }) =>
  state.typeMenu.resourceType;

// What a menu item asks of a type: to go `before` the type above it, or
// `after` the type below it. Nothing at the ends, where there is no such type.
export const selectResourceTypeMove = (
  { state },
  { resourceType, value } = {},
) => {
  const resourceTypes = orderResourceTypes(
    state.selectedFolderIdsByType,
    state.resourceTypeOrder,
  );
  const index = resourceTypes.indexOf(resourceType);
  if (index === -1) {
    return undefined;
  }
  if (value === MOVE_UP_VALUE && index > 0) {
    return {
      resourceType,
      position: "before",
      positionTargetResourceType: resourceTypes[index - 1],
    };
  }
  if (value === MOVE_DOWN_VALUE && index < resourceTypes.length - 1) {
    return {
      resourceType,
      position: "after",
      positionTargetResourceType: resourceTypes[index + 1],
    };
  }
  return undefined;
};

// A move that was saved: the type goes `before` or `after` another, in the
// page's order and in the saved order the next save starts from.
export const moveResourceType = (
  { state },
  { resourceType, position, positionTargetResourceType } = {},
) => {
  const pickedResourceTypes = orderResourceTypes(
    state.selectedFolderIdsByType,
    state.resourceTypeOrder,
  );
  if (!pickedResourceTypes.includes(resourceType)) {
    return;
  }
  const resourceTypes = pickedResourceTypes.filter(
    (type) => type !== resourceType,
  );
  const targetIndex = resourceTypes.indexOf(positionTargetResourceType);
  if (targetIndex === -1) {
    return;
  }
  resourceTypes.splice(
    position === "before" ? targetIndex : targetIndex + 1,
    0,
    resourceType,
  );
  state.resourceTypeOrder = resourceTypes;
  state.baseResourceTypeOrder = [...resourceTypes];
};

const previewOf = (state, resourceType, itemId, extra = {}) => ({
  ...createResourcePreview({
    resourceType,
    itemId,
    item: state.resourceDataByType[resourceType].items[itemId],
    resourceDataByType: state.resourceDataByType,
  }),
  ...extra,
});

// Why a selection cannot be exported, naming the resource at fault when the
// export says which: one that jumps to a line of the story, or one that uses
// a resource the project no longer has.
const INVALID_SELECTION_COPY_KEYS = Object.freeze({
  line_reference: "selectionLineReference",
  missing_resource: "selectionMissingResource",
});

// "Used by A, B, C, 2 more".
const formatUsedBy = ({ copy, nameById, ids }) => {
  const users = ids.map((id) => nameById.get(id) ?? id);
  let names = users.slice(0, MAX_LISTED_USERS).join(", ");
  if (users.length > MAX_LISTED_USERS) {
    names = `${names}, ${formatI18nCopy(copy.usedByMore, {
      count: users.length - MAX_LISTED_USERS,
    })}`;
  }
  return formatI18nCopy(copy.usedByLabel, { names });
};

const LINK_ICONS = Object.freeze({
  section: "section",
  scene: "scene",
  layout: "layout",
});
const UNKNOWN_LINK_COPY_KEYS = Object.freeze({
  section: "linkUnknownSection",
  scene: "linkUnknownScene",
  layout: "linkUnknownLayout",
});

const formatLinkLabel = ({ copy, link }) => {
  if (!link.name) {
    return copy[UNKNOWN_LINK_COPY_KEYS[link.kind]];
  }
  return link.sceneName
    ? formatI18nCopy(copy.linkSectionLabel, {
        scene: link.sceneName,
        section: link.name,
      })
    : link.name;
};

const describeInvalidSelection = ({
  state,
  copy,
  resourceTypesCopy,
  error,
}) => {
  const copyKey = INVALID_SELECTION_COPY_KEYS[error?.code];
  const resourceType = RESOURCE_TYPE_ORDER.find(
    (type) => state.resourceDataByType[type].items[error?.itemId],
  );
  if (!copyKey || !resourceType) {
    return copy.selectionInvalid;
  }
  return formatI18nCopy(copy[copyKey], {
    name: state.resourceDataByType[resourceType].items[error.itemId].name,
    type: resourceTypesCopy[resourceType] ?? resourceType,
  });
};

// "Comes with": what the picks use that is not a pick, by type, and the
// links: the places in the story they jump to and the layouts they open. A selection that cannot be exported
// lists nothing and says so.
const buildComesWithViewData = ({ state, copy, resourceTypesCopy }) => {
  let dependencies;
  let links;
  let isInvalid = false;
  let invalidMessage = copy.selectionInvalid;
  try {
    dependencies = listAssetPackageDependencies({
      resourceDataByType: state.resourceDataByType,
      selectedFolderIdsByType: state.selectedFolderIdsByType,
      resourceTypeOrder: RESOURCE_TYPE_ORDER,
    });
    links = listAssetPackageLinks({
      resourceDataByType: state.resourceDataByType,
      selectedFolderIdsByType: state.selectedFolderIdsByType,
      scenesData: state.scenesData,
    });
  } catch (error) {
    dependencies = [];
    links = [];
    isInvalid = true;
    invalidMessage = describeInvalidSelection({
      state,
      copy,
      resourceTypesCopy,
      error,
    });
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
    group.items.push({
      id: dependency.itemId,
      name: dependency.name,
      usedBy: formatUsedBy({ copy, nameById, ids: dependency.usedBy }),
      preview: previewOf(state, dependency.resourceType, dependency.itemId, {
        showName: true,
      }),
    });
  }
  return {
    isVisible: groups.length > 0,
    isInvalid,
    invalidMessage,
    title: copy.comesWithTitle,
    hint: copy.comesWithHint,
    groups,
    links: {
      isVisible: links.length > 0,
      title: copy.linksTitle,
      hint: copy.linksHint,
      items: links.map((link) => ({
        id: link.id,
        icon: LINK_ICONS[link.kind],
        label: formatLinkLabel({ copy, link }),
        usedBy: formatUsedBy({ copy, nameById, ids: link.usedBy }),
      })),
    },
  };
};

// A type's picked folders as the page lists them: in the order picked,
// without one inside another pick, as that one shows it. A folder that sits
// in another is named with its path, as the import dialog names a pack's.
const listPickedFolders = (state, resourceType) => {
  const resourceData = state.resourceDataByType[resourceType];
  const folders = indexResourceFolders(resourceData);
  return selectOutermostFolderIds(
    resourceData,
    state.selectedFolderIdsByType[resourceType],
  ).map((folderId) => {
    const { node, ancestorIds } = folders.get(folderId);
    return {
      id: folderId,
      name: [...ancestorIds, folderId]
        .map((id) => resourceData.items[id].name)
        .join(" > "),
      node,
    };
  });
};

const formatSelectedLabel = ({ copy, i18n, count }) =>
  count > 0
    ? formatPluralCopy(copy, "selectedFolderCount", count, {
        dateTime: i18n.dateTime,
      })
    : "";

// The types with folders picked, in the pack's order, each with its picked
// folders and every resource in them, at any depth, with its preview. A type
// has a menu to move it, unless it is the only one.
const buildPickedSectionsViewData = ({
  state,
  copy,
  resourceTypesCopy,
  i18n,
}) => {
  const sections = orderResourceTypes(
    state.selectedFolderIdsByType,
    state.resourceTypeOrder,
  ).flatMap((resourceType) => {
    const resourceData = state.resourceDataByType[resourceType];
    const folders = listPickedFolders(state, resourceType);
    if (folders.length === 0) {
      return [];
    }
    return [
      {
        resourceType,
        label: resourceTypesCopy[resourceType] ?? resourceType,
        selectedLabel: formatSelectedLabel({
          copy,
          i18n,
          count: folders.length,
        }),
        folders: folders.map((folder) => {
          const resources = collectFolderResources(resourceData, folder.node);
          return {
            folderId: folder.id,
            name: folder.name,
            items: resources.map(({ itemId }) =>
              previewOf(state, resourceType, itemId, { showName: true }),
            ),
            resourceCount: resources.length,
          };
        }),
      },
    ];
  });
  return sections.map((section) => ({
    ...section,
    hasTypeMenu: sections.length > 1,
  }));
};

// The folders the picker offers for the type it shows, in tree order and
// indented by depth, each with the resources directly in it, so a resource
// shows once, and ticked as in the picker's own copy of the selection. A
// folder inside a ticked one shows as included in it. A picked folder shows
// its place in the pack. It says so when it offers no folders.
const buildPickerSectionViewData = ({
  state,
  copy,
  resourceTypesCopy,
  i18n,
  resourceType,
}) => {
  const resourceData = state.resourceDataByType[resourceType];
  const pickerIds = state.pickerFolderIdsByType[resourceType];
  const outermostIds = selectOutermostFolderIds(resourceData, pickerIds);
  const folders = listPickerFolders(state, resourceType);
  return {
    resourceType,
    label: resourceTypesCopy[resourceType] ?? resourceType,
    selectedLabel: formatSelectedLabel({
      copy,
      i18n,
      count: outermostIds.length,
    }),
    hasNoFolders: folders.length === 0,
    noFoldersHint: copy.noFoldersHint,
    folders: folders.map((folder) => {
      const includedInId = folder.ancestorIds.findLast((ancestorId) =>
        pickerIds.includes(ancestorId),
      );
      const isIncluded = includedInId !== undefined;
      const pickIndex = outermostIds.indexOf(folder.id);
      const resources = collectFolderResources(resourceData, folder.node, {
        ownOnly: true,
      });
      return {
        folderId: folder.id,
        name: folder.name,
        indent: String(folder.ancestorIds.length * PICKER_FOLDER_INDENT),
        selected: isIncluded || pickerIds.includes(folder.id),
        isIncluded,
        includedHint: isIncluded
          ? formatI18nCopy(copy.includedInFolderHint, {
              name: resourceData.items[includedInId].name,
            })
          : "",
        // Where a picked folder goes among its type's picks.
        pickOrder: pickIndex === -1 ? "" : String(pickIndex + 1),
        items: resources.map(({ itemId }) =>
          previewOf(state, resourceType, itemId, { showName: true }),
        ),
        resourceCount: resources.length,
      };
    }),
  };
};

export const selectViewData = ({ state, i18n }) => {
  const copy = i18n.assetPackagePage;
  const resourceTypesCopy = i18n.resourceTypes;
  const pickedSections = buildPickedSectionsViewData({
    state,
    copy,
    resourceTypesCopy,
    i18n,
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
    selectedCount: formatPickedCount(state, resourceType),
  }));
  const pickerSection = pickerResourceTypes.includes(state.pickerResourceType)
    ? buildPickerSectionViewData({
        state,
        copy,
        resourceTypesCopy,
        i18n,
        resourceType: state.pickerResourceType,
      })
    : { folders: [] };
  const comesWith = buildComesWithViewData({ state, copy, resourceTypesCopy });
  const pickedCount = pickedSections.reduce(
    (count, section) =>
      count +
      section.folders.reduce(
        (folderCount, folder) => folderCount + folder.resourceCount,
        0,
      ),
    0,
  );

  return {
    ...state,
    showExplorerPanel: !state.isTouchMode,
    contentLeftPadding: state.isTouchMode ? "0" : "sm",
    backLabel: copy.backButton ?? "Back",
    pickedTitle: copy.pickedTitle,
    pickResourcesLabel: copy.pickResourcesButton,
    hasPicks: pickedSections.length > 0,
    nothingPickedMessage: copy.nothingPicked,
    pickedSections,
    typeOptionsLabel: copy.typeOptionsButton,
    typeMenuDisabled: state.isSavingPicks,
    pickerTitle: copy.pickerTitle,
    pickerHint: copy.introHint,
    pickerDoneLabel: copy.doneButton,
    pickerDoneDisabled: state.isSavingPicks,
    hasPickerTypes: pickerTypes.length > 0,
    emptyProjectMessage: copy.emptyProjectMessage,
    pickerTypes,
    pickerSection,
    comesWith,
    exportDisabled: pickedCount === 0 || comesWith.isInvalid,
  };
};
