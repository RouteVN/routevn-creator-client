import { toFlatGroups, toFlatItems } from "../../project/tree.js";

const matchesSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const name = (item.name ?? "").toLowerCase();
  const description = (item.description ?? "").toLowerCase();
  return name.includes(searchQuery) || description.includes(searchQuery);
};

// What a character or sprite picker lists: each folder's items under it, and
// the top-level items under an "Ungrouped" group, with the folders for the
// side list. Search (already lowercased and trimmed) matches names and
// descriptions, and the selected item gets the primary border.
export const buildSelectableResourceTree = ({
  collection,
  selectedItemId,
  syntheticRootId,
  ungroupedLabel,
  searchQuery = "",
  itemFilter = () => true,
  itemViewMapper = (item) => item,
  hideEmptyGroups = false,
} = {}) => {
  const allItems = toFlatItems(collection);
  const filterVisibleItem = (item) =>
    itemFilter(item) && matchesSearch(item, searchQuery);
  const toItemView = (item) => {
    const isSelected = item.id === selectedItemId;
    return {
      ...itemViewMapper(item),
      itemBorderColor: isSelected ? "pr" : "bo",
      itemHoverBorderColor: isSelected ? "pr" : "ac",
    };
  };
  const rootChildren = allItems.filter(
    (item) => item.type !== "folder" && item.parentId === null,
  );
  const visibleRootChildren = rootChildren
    .filter(filterVisibleItem)
    .map(toItemView);

  const groups = toFlatGroups(collection)
    .map((group) => {
      const children = group.children.filter(filterVisibleItem).map(toItemView);

      return {
        ...group,
        children,
        hasChildren: children.length > 0,
        shouldDisplay:
          children.length > 0 || (!hideEmptyGroups && !searchQuery),
      };
    })
    .filter((group) => group.shouldDisplay);

  const visibleGroupIds = new Set(groups.map((group) => group.id));
  const explorerItems = allItems.filter(
    (item) =>
      item.type === "folder" &&
      (!hideEmptyGroups || visibleGroupIds.has(item.id)),
  );

  if (
    hideEmptyGroups ? visibleRootChildren.length > 0 : rootChildren.length > 0
  ) {
    explorerItems.unshift({
      id: syntheticRootId,
      type: "folder",
      name: ungroupedLabel,
      fullLabel: ungroupedLabel,
      _level: 0,
      parentId: null,
      hasChildren: true,
    });
  }

  if (visibleRootChildren.length > 0) {
    groups.unshift({
      id: syntheticRootId,
      type: "folder",
      name: ungroupedLabel,
      fullLabel: ungroupedLabel,
      _level: 0,
      parentId: null,
      hasChildren: true,
      children: visibleRootChildren,
      shouldDisplay: true,
    });
  }

  return {
    explorerItems,
    groups,
  };
};
