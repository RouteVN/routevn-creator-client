import { IMPORT_PACK_SCHEMA_V2 } from "../../../internal/importPackages.js";
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

// What the picks use, directly or through each other, that is not a pick,
// with the picks that use each. A pick's own dependencies count for that
// pick, so the walk stops at picks.
const collectDependencies = ({ pickedIdsByType, sourceById }) => {
  const dependencies = new Map();
  for (const [resourceType, pickedIds] of Object.entries(pickedIdsByType)) {
    for (const pickId of pickedIds) {
      const pick = sourceById.get(pickId);
      if (pick?.resourceType !== resourceType) {
        continue;
      }
      const visited = new Set([pickId]);
      const pending = [pick];
      while (pending.length > 0) {
        const { item, itemId } = pending.pop();
        visitAssetPackageReferences(
          item,
          ({ fieldName, kind, required, value }) => {
            if (kind === "project") {
              throw new Error(
                `Resource '${itemId}' contains unsupported project reference '${fieldName}'.`,
              );
            }
            if (kind !== "resource") {
              return;
            }
            const source = sourceById.get(value);
            if (!source) {
              if (required) {
                throw new Error(`Referenced resource '${value}' is missing.`);
              }
              return;
            }
            if (
              pickedIdsByType[source.resourceType].has(source.itemId) ||
              visited.has(source.itemId)
            ) {
              return;
            }
            visited.add(source.itemId);
            const dependency = dependencies.get(source.itemId) ?? {
              ...source,
              usedBy: new Set(),
            };
            dependency.usedBy.add(pickId);
            dependencies.set(source.itemId, dependency);
            pending.push(source);
          },
        );
      }
    }
  }
  return dependencies;
};

// A type's dependencies, in the order they appear in the project.
const selectDependencyItems = (resourceData, dependencyIds) => {
  const items = {};
  const visit = (nodes) => {
    for (const node of nodes) {
      const sourceItem = resourceData.items[node.id];
      if (sourceItem?.type !== "folder" && dependencyIds.has(node.id)) {
        items[node.id] = sanitizePackageItem(sourceItem, node.id);
      }
      visit(node.children ?? []);
    }
  };
  visit(resourceData.tree);
  return items;
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

const getOrderedResourceTypes = (resourceTypeOrder = []) => [
  ...resourceTypeOrder,
  ...ASSET_PACKAGE_RESOURCE_TYPES.filter(
    (resourceType) => !resourceTypeOrder.includes(resourceType),
  ),
];

const collectPickedIdsByType = ({
  resourceDataByType,
  selectedFolderIdsByType,
}) =>
  Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_TYPES.map((resourceType) => [
      resourceType,
      collectSelectedResourceIds(
        selectNestedResourceData(
          resourceDataByType[resourceType],
          selectedFolderIdsByType[resourceType] ?? [],
        ),
      ),
    ]),
  );

// The package's two sections: `repository`, the picks (every resource in the
// chosen folders) in their folders, and `dependencies`, what the picks use
// that is not a pick, without folders.
export const createAssetPackageContents = ({
  filesData,
  resourceDataByType,
  selectedFolderIdsByType,
  resourceTypeOrder,
}) => {
  const pickedIdsByType = collectPickedIdsByType({
    resourceDataByType,
    selectedFolderIdsByType,
  });
  const dependencies = collectDependencies({
    pickedIdsByType,
    sourceById: indexSourceResources(resourceDataByType),
  });
  const collections = [];
  const repository = {};
  const packageDependencies = {};
  for (const resourceType of getOrderedResourceTypes(resourceTypeOrder)) {
    const resourceData = resourceDataByType[resourceType];
    const picks = selectIncludedResourceData(
      resourceData,
      pickedIdsByType[resourceType],
      selectedFolderIdsByType[resourceType] ?? [],
    );
    if (picks.tree.length > 0) {
      repository[resourceType] = picks;
      collections.push(picks);
    }
    const dependencyIds = new Set(
      [...dependencies.values()]
        .filter((dependency) => dependency.resourceType === resourceType)
        .map((dependency) => dependency.itemId),
    );
    if (dependencyIds.size > 0) {
      const items = selectDependencyItems(resourceData, dependencyIds);
      packageDependencies[resourceType] = { items };
      collections.push({ items });
    }
  }
  return {
    repository: {
      files: createPackageFiles({ filesData, collections }),
      ...repository,
    },
    dependencies: packageDependencies,
  };
};

// The dependencies the export page lists: each with its type and the picks
// that use it, by type in the page's order, then in project order.
export const listAssetPackageDependencies = ({
  resourceDataByType,
  selectedFolderIdsByType,
  resourceTypeOrder,
}) => {
  const dependencies = collectDependencies({
    pickedIdsByType: collectPickedIdsByType({
      resourceDataByType,
      selectedFolderIdsByType,
    }),
    sourceById: indexSourceResources(resourceDataByType),
  });
  return getOrderedResourceTypes(resourceTypeOrder).flatMap((resourceType) => {
    const items = selectDependencyItems(
      resourceDataByType[resourceType],
      new Set(dependencies.keys()),
    );
    return Object.keys(items).map((itemId) => ({
      resourceType,
      itemId,
      name: resourceDataByType[resourceType].items[itemId].name,
      usedBy: [...dependencies.get(itemId).usedBy],
    }));
  });
};

export class AssetPackageManifestError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AssetPackageManifestError";
    this.code = code;
  }
}

export const createAssetPackageManifest = ({ repository, dependencies }) => {
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

  const manifest = {
    schema: IMPORT_PACK_SCHEMA_V2,
    package: { kind: ASSET_PACKAGE_KIND },
    repository: structuredClone(repository),
  };
  if (Object.keys(dependencies ?? {}).length > 0) {
    manifest.dependencies = structuredClone(dependencies);
  }
  return manifest;
};
