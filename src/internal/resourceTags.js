import { toFlatItems } from "./project/tree.js";

export const createEmptyTagCollection = () => ({
  items: {},
  tree: [],
});

const normalizeTagRecord = (tag) => ({
  id: tag.id,
  name: tag.name ?? "",
  color: tag.color ?? "",
});

export const getTagsCollection = (projectState, scopeKey) => {
  const collection = projectState?.tags?.[scopeKey];
  if (!collection || typeof collection !== "object") {
    return createEmptyTagCollection();
  }

  return {
    items: collection.items ?? {},
    tree: Array.isArray(collection.tree) ? collection.tree : [],
  };
};

export const getOrderedTags = ({ tagsCollection } = {}) => {
  return toFlatItems(tagsCollection ?? createEmptyTagCollection())
    .filter((item) => item?.type === "tag")
    .map(normalizeTagRecord);
};

export const buildTagFilterOptions = ({ tagsCollection } = {}) => {
  return getOrderedTags({ tagsCollection }).map((tag) => ({
    label: tag.name,
    value: tag.id,
  }));
};

export const resolveItemTags = ({ item, tagsCollection } = {}) => {
  const tagItems = tagsCollection?.items ?? {};

  return (item?.tagIds ?? [])
    .map((tagId) => tagItems[tagId])
    .filter((tag) => tag?.type === "tag")
    .map(normalizeTagRecord);
};

export const resolveCollectionWithTags = ({
  collection,
  tagsCollection,
  itemType,
} = {}) => {
  const items = {};

  for (const [itemId, item] of Object.entries(collection?.items ?? {})) {
    if (item?.type === itemType) {
      items[itemId] = {
        ...item,
        resolvedTags: resolveItemTags({
          item,
          tagsCollection,
        }),
      };
      continue;
    }

    items[itemId] = item;
  }

  return {
    items,
    tree: Array.isArray(collection?.tree) ? collection.tree : [],
  };
};

export const matchesTagAwareSearch = (item, searchQuery) => {
  if (!searchQuery) {
    return true;
  }

  const normalizedSearchQuery = searchQuery.toLowerCase();
  const name = (item?.name ?? "").toLowerCase();
  const description = (item?.description ?? "").toLowerCase();
  const matchesTagName = (item?.resolvedTags ?? []).some((tag) =>
    (tag.name ?? "").toLowerCase().includes(normalizedSearchQuery),
  );

  return (
    name.includes(normalizedSearchQuery) ||
    description.includes(normalizedSearchQuery) ||
    matchesTagName
  );
};

export const matchesTagFilter = ({ item, activeTagIds = [] } = {}) => {
  if (!Array.isArray(activeTagIds) || activeTagIds.length === 0) {
    return true;
  }

  const itemTagIds = Array.isArray(item?.tagIds) ? item.tagIds : [];
  return activeTagIds.every((tagId) => itemTagIds.includes(tagId));
};

export const buildUniqueTagIds = (...tagIdGroups) => {
  return [...new Set(tagIdGroups.flat().filter(Boolean))];
};

export const appendTagToCollection = ({ tagsCollection, tag } = {}) => {
  if (!tag?.id) {
    return tagsCollection ?? createEmptyTagCollection();
  }

  const items = {};

  if (tagsCollection?.items) {
    Object.assign(items, tagsCollection.items);
  }

  items[tag.id] = tag;
  const existingTree = Array.isArray(tagsCollection?.tree)
    ? tagsCollection.tree
    : [];
  const hasTreeEntry = existingTree.some((entry) => entry?.id === tag.id);

  return {
    items,
    tree: hasTreeEntry ? existingTree : [...existingTree, { id: tag.id }],
  };
};
