import { IMPORT_PACK_SCHEMA } from "../../../internal/importPackages.js";

const OMITTED_PACKAGE_ITEM_KEYS = new Set([
  "parentId",
  "fullLabel",
  "resolvedTags",
  "fileType",
  "fileSize",
  "tagIds",
  "spriteGroups",
]);

export const DEFAULT_ASSET_PACKAGE_METADATA = Object.freeze({
  id: "placeholder.asset-package",
  name: "Placeholder Asset Package",
  version: "1.0.0",
  description: "Placeholder asset package description.",
});

export const selectTopLevelFolders = (resourceData) => {
  return resourceData.tree
    .map((node) => {
      const item = resourceData.items[node.id];
      if (item?.type !== "folder") {
        return undefined;
      }

      return { ...item, id: node.id };
    })
    .filter(Boolean);
};

export const isTopLevelFolder = (resourceData, folderId) => {
  return (
    resourceData.items[folderId]?.type === "folder" &&
    resourceData.tree.some((node) => node.id === folderId)
  );
};

const sanitizePackageValue = (sourceValue) => {
  if (Array.isArray(sourceValue)) {
    return sourceValue.map(sanitizePackageValue);
  }
  if (!sourceValue || typeof sourceValue !== "object") {
    return sourceValue;
  }

  const value = {};
  for (const [key, entry] of Object.entries(sourceValue)) {
    if (!OMITTED_PACKAGE_ITEM_KEYS.has(key)) {
      value[key] = sanitizePackageValue(entry);
    }
  }
  return value;
};

const sanitizePackageItem = (sourceItem, itemId) => {
  const item = sanitizePackageValue(sourceItem);
  item.id = itemId;
  return item;
};

const appendResourceSubtree = ({ resourceData, sourceNode, items }) => {
  const sourceItem = resourceData.items[sourceNode.id];
  if (!sourceItem) {
    return undefined;
  }

  items[sourceNode.id] = sanitizePackageItem(sourceItem, sourceNode.id);

  const node = { id: sourceNode.id };
  const children = (sourceNode.children ?? [])
    .map((childNode) =>
      appendResourceSubtree({ resourceData, sourceNode: childNode, items }),
    )
    .filter(Boolean);
  if (children.length > 0) {
    node.children = children;
  }
  return node;
};

const selectNestedResourceData = (resourceData, selectedFolderIds) => {
  const rootNodesById = new Map(
    resourceData.tree.map((node) => [node.id, node]),
  );
  const items = {};
  const tree = selectedFolderIds
    .map((folderId) => {
      if (!isTopLevelFolder(resourceData, folderId)) {
        return undefined;
      }
      return appendResourceSubtree({
        resourceData,
        sourceNode: rootNodesById.get(folderId),
        items,
      });
    })
    .filter(Boolean);

  return { items, tree };
};

const collectFileIdsFromValue = (
  value,
  availableFileIds,
  referencedFileIds,
  key,
) => {
  if (typeof value === "string") {
    if (availableFileIds.has(value) || /fileIds?$/i.test(key ?? "")) {
      referencedFileIds.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileIdsFromValue(item, availableFileIds, referencedFileIds, key);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    return;
  }
  for (const [childKey, item] of Object.entries(value)) {
    collectFileIdsFromValue(
      item,
      availableFileIds,
      referencedFileIds,
      childKey,
    );
  }
};

const collectReferencedFileIds = ({ filesData, collections }) => {
  const fileIds = new Set();
  const availableFileIds = new Set(Object.keys(filesData.items));
  for (const collection of collections) {
    for (const item of Object.values(collection.items)) {
      collectFileIdsFromValue(item, availableFileIds, fileIds);
    }
  }
  return fileIds;
};

const createPackageFileDescriptor = (fileId, sourceFile) => {
  if (!sourceFile?.mimeType) {
    throw new Error(`File metadata is missing for '${fileId}'.`);
  }

  const descriptor = {
    id: fileId,
    mimeType: sourceFile.mimeType,
    source: { url: `./files/${encodeURIComponent(fileId)}` },
  };
  if (sourceFile.type !== undefined) {
    descriptor.type = sourceFile.type;
  }
  if (sourceFile.name !== undefined) {
    descriptor.name = sourceFile.name;
  }
  if (Number.isFinite(sourceFile.size) && sourceFile.size >= 0) {
    descriptor.size = sourceFile.size;
  }
  if (/^(?:sha256[:-])?[a-f\d]{64}$/i.test(sourceFile.sha256 ?? "")) {
    descriptor.sha256 = sourceFile.sha256;
  }
  return descriptor;
};

const createPackageFiles = ({ filesData, collections }) => {
  const items = {};
  for (const fileId of collectReferencedFileIds({ filesData, collections })) {
    items[fileId] = createPackageFileDescriptor(
      fileId,
      filesData.items[fileId],
    );
  }
  return { items };
};

export const createAssetPackageRepository = ({
  filesData,
  resourceDataByType,
  selectedFolderIdsByType,
  resourceTypeOrder,
}) => {
  const collectionByType = {};
  const collections = [];
  for (const resourceType of resourceTypeOrder) {
    const collection = selectNestedResourceData(
      resourceDataByType[resourceType],
      selectedFolderIdsByType[resourceType],
    );
    collectionByType[resourceType] = collection;
    collections.push(collection);
  }
  const repository = {
    files: createPackageFiles({ filesData, collections }),
  };
  for (const resourceType of resourceTypeOrder) {
    const collection = collectionByType[resourceType];
    if (collection.tree.length > 0) {
      repository[resourceType] = collection;
    }
  }
  return repository;
};

const createPackageMetadata = (packageMetadata) => {
  const metadata = {
    id: packageMetadata.id.trim(),
    name: packageMetadata.name.trim(),
    version: packageMetadata.version.trim(),
    description: packageMetadata.description.trim(),
  };
  for (const key of ["id", "name", "version"]) {
    if (!metadata[key]) {
      throw new Error(`Asset package ${key} is required.`);
    }
  }
  return metadata;
};

export const createAssetPackageManifest = ({
  repository,
  packageMetadata,
}) => ({
  schema: IMPORT_PACK_SCHEMA,
  package: createPackageMetadata(packageMetadata),
  repository: structuredClone(repository),
});
