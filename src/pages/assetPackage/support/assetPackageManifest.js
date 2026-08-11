import { IMPORT_PACK_SCHEMA } from "../../../internal/importPackages.js";
import {
  ASSET_PACKAGE_KIND,
  ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE,
  ASSET_PACKAGE_RESOURCE_TYPES,
  visitAssetPackageReferences,
} from "../../../internal/assetPackageResources.js";

const OMITTED_PACKAGE_ITEM_KEYS = new Set([
  "parentId",
  "fullLabel",
  "resolvedTags",
  "fileType",
  "fileSize",
  "tagIds",
  "spriteGroups",
]);

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

const collectReferencedFileIds = ({ collections }) => {
  const fileIds = new Set();
  for (const collection of collections) {
    for (const item of Object.values(collection.items)) {
      visitAssetPackageReferences(item, ({ kind, value }) => {
        if (kind === "file") {
          fileIds.add(value);
        }
      });
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
  for (const fileId of collectReferencedFileIds({ collections })) {
    items[fileId] = createPackageFileDescriptor(
      fileId,
      filesData.items[fileId],
    );
  }
  return { items };
};

const collectSelectedResourceIds = (collection) =>
  new Set(
    Object.entries(collection.items)
      .filter(([, item]) => item.type !== "folder")
      .map(([itemId]) => itemId),
  );

const indexSourceResources = (resourceDataByType) => {
  const sourceById = new Map();
  for (const resourceType of ASSET_PACKAGE_RESOURCE_TYPES) {
    for (const [itemId, item] of Object.entries(
      resourceDataByType[resourceType]?.items ?? {},
    )) {
      if (item.type === "folder") {
        continue;
      }
      if (sourceById.has(itemId)) {
        throw new Error(
          `Resource id '${itemId}' is used by more than one resource type.`,
        );
      }
      sourceById.set(itemId, { item, itemId, resourceType });
    }
  }
  return sourceById;
};

const includeTransitiveDependencies = ({ includedIdsByType, sourceById }) => {
  const pending = [];
  for (const [resourceType, includedIds] of Object.entries(includedIdsByType)) {
    for (const itemId of includedIds) {
      const source = sourceById.get(itemId);
      if (source?.resourceType === resourceType) {
        pending.push(source);
      }
    }
  }

  for (let index = 0; index < pending.length; index += 1) {
    const { item } = pending[index];
    visitAssetPackageReferences(item, ({ kind, required, value }) => {
      if (kind !== "resource") {
        return;
      }
      const dependency = sourceById.get(value);
      if (!dependency) {
        if (required) {
          throw new Error(`Referenced resource '${value}' is missing.`);
        }
        return;
      }
      const includedIds = includedIdsByType[dependency.resourceType];
      if (includedIds.has(dependency.itemId)) {
        return;
      }
      includedIds.add(dependency.itemId);
      pending.push(dependency);
    });
  }
};

const selectIncludedResourceData = (
  resourceData,
  includedIds,
  selectedFolderIds,
) => {
  const items = {};
  const visit = (sourceNode) => {
    const sourceItem = resourceData.items[sourceNode.id];
    if (!sourceItem) {
      return undefined;
    }
    if (sourceItem.type !== "folder") {
      if (!includedIds.has(sourceNode.id)) {
        return undefined;
      }
      items[sourceNode.id] = sanitizePackageItem(sourceItem, sourceNode.id);
      return { id: sourceNode.id };
    }

    const children = (sourceNode.children ?? []).map(visit).filter(Boolean);
    if (children.length === 0) {
      return undefined;
    }
    items[sourceNode.id] = sanitizePackageItem(sourceItem, sourceNode.id);
    return { id: sourceNode.id, children };
  };

  const rootNodesById = new Map(
    resourceData.tree.map((node) => [node.id, node]),
  );
  const orderedRootNodes = [
    ...selectedFolderIds
      .map((folderId) => rootNodesById.get(folderId))
      .filter(Boolean),
    ...resourceData.tree.filter((node) => !selectedFolderIds.includes(node.id)),
  ];
  return {
    items,
    tree: orderedRootNodes.map(visit).filter(Boolean),
  };
};

export const createAssetPackageRepository = ({
  filesData,
  resourceDataByType,
  selectedFolderIdsByType,
  resourceTypeOrder,
}) => {
  const orderedResourceTypes = [
    ...resourceTypeOrder,
    ...ASSET_PACKAGE_RESOURCE_TYPES.filter(
      (resourceType) => !resourceTypeOrder.includes(resourceType),
    ),
  ];
  const includedIdsByType = Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_TYPES.map((resourceType) => {
      const selectedCollection = selectNestedResourceData(
        resourceDataByType[resourceType],
        selectedFolderIdsByType[resourceType] ?? [],
      );
      return [resourceType, collectSelectedResourceIds(selectedCollection)];
    }),
  );
  const sourceById = indexSourceResources(resourceDataByType);
  includeTransitiveDependencies({ includedIdsByType, sourceById });

  const collectionByType = Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_TYPES.map((resourceType) => [
      resourceType,
      selectIncludedResourceData(
        resourceDataByType[resourceType],
        includedIdsByType[resourceType],
        selectedFolderIdsByType[resourceType] ?? [],
      ),
    ]),
  );
  const collections = Object.values(collectionByType).filter(
    (collection) => collection.tree.length > 0,
  );
  const repository = {
    files: createPackageFiles({ filesData, collections }),
  };
  for (const resourceType of orderedResourceTypes) {
    const collection = collectionByType[resourceType];
    if (collection.tree.length > 0) {
      repository[resourceType] = collection;
    }
  }
  return repository;
};

export class AssetPackageManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AssetPackageManifestError";
    this.code = code;
  }
}

export const createAssetPackageManifest = ({ repository }) => {
  const resourceCount = ASSET_PACKAGE_RESOURCE_TYPES.reduce(
    (count, resourceType) => {
      const itemType =
        ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE[resourceType].itemType;
      return (
        count +
        Object.values(repository?.[resourceType]?.items ?? {}).filter(
          (item) => item.type === itemType,
        ).length
      );
    },
    0,
  );
  if (resourceCount === 0) {
    throw new AssetPackageManifestError(
      "no_resources",
      "Select at least one resource before exporting.",
    );
  }

  return {
    schema: IMPORT_PACK_SCHEMA,
    package: { kind: ASSET_PACKAGE_KIND },
    repository: structuredClone(repository),
  };
};
