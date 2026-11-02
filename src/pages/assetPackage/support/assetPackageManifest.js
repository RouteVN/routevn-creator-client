import { IMPORT_PACK_SCHEMA_V2 } from "../../../internal/importPackages.js";
import {
  ASSET_PACKAGE_KIND,
  ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE,
  ASSET_PACKAGE_RESOURCE_TYPES,
  ASSET_PACKAGE_LAYOUT_LINK_FIELD,
  getAssetPackageStoryLinkKind,
  mapAssetPackageLinks,
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

// A jump to a section also names its scene. The section is enough, as the
// app finds its scene, so the scene is left out and the importer chooses
// only the section.
const dropSectionJumpScenes = (value) => {
  if (Array.isArray(value)) {
    return value.map(dropSectionJumpScenes);
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const isSectionJump =
    typeof value.sectionId === "string" && value.sectionId !== "";
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !(isSectionJump && key === "sceneId"))
      .map(([key, entry]) => [key, dropSectionJumpScenes(entry)]),
  );
};

// What the picks use, directly or through each other, that is not a pick,
// with the picks that use each; and the links: the story sections and scenes
// they jump to, and the layouts they open that the pack does not carry, with
// the resources that do so. A pick's own dependencies count for that pick, so
// the walk stops at picks, and at a layout an action only opens.
const collectDependencies = ({ pickedIdsByType, sourceById }) => {
  const dependencies = new Map();
  const links = new Map();
  const addLink = ({ targetId, kind, itemId }) => {
    const link = links.get(targetId) ?? { kind, usedBy: new Set() };
    link.usedBy.add(itemId);
    links.set(targetId, link);
  };
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
          dropSectionJumpScenes(item),
          ({ fieldName, kind, required, value }) => {
            if (kind === "project") {
              const linkKind = getAssetPackageStoryLinkKind(fieldName);
              if (!linkKind) {
                throw new AssetPackageManifestError(
                  "line_reference",
                  `Resource '${itemId}' contains unsupported project reference '${fieldName}'.`,
                  { itemId },
                );
              }
              addLink({ targetId: value, kind: linkKind, itemId });
              return;
            }
            if (kind !== "resource") {
              return;
            }
            const source = sourceById.get(value);
            if (!source) {
              if (required) {
                throw new AssetPackageManifestError(
                  "missing_resource",
                  `Referenced resource '${value}' is missing.`,
                  { itemId },
                );
              }
              return;
            }
            if (pickedIdsByType[source.resourceType].has(source.itemId)) {
              return;
            }
            if (
              fieldName === ASSET_PACKAGE_LAYOUT_LINK_FIELD &&
              source.resourceType === "layouts"
            ) {
              addLink({ targetId: source.itemId, kind: "layout", itemId });
              return;
            }
            if (visited.has(source.itemId)) {
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
  // A layout the pack carries anyway, as something else draws it, is opened
  // as itself.
  for (const [targetId, link] of links) {
    if (link.kind === "layout" && dependencies.has(targetId)) {
      links.delete(targetId);
    }
  }
  return { dependencies, links };
};

// A link's name: its section's and that section's scene's, its scene's, or
// its layout's, with the layout's type; empty when the project no longer has
// it.
const describeLinkTarget = ({
  resourceDataByType,
  scenesData,
  link,
  targetId,
}) => {
  if (link.kind === "layout") {
    const layout = resourceDataByType.layouts?.items?.[targetId];
    return {
      name: layout?.name ?? "",
      ...(typeof layout?.layoutType === "string"
        ? { layoutType: layout.layoutType }
        : {}),
    };
  }
  if (link.kind === "scene") {
    return { name: scenesData?.items?.[targetId]?.name ?? "" };
  }
  const scene = Object.values(scenesData?.items ?? {}).find(
    (item) => item?.type === "scene" && item.sections?.items?.[targetId],
  );
  return scene
    ? { name: scene.sections.items[targetId].name ?? "", sceneName: scene.name }
    : { name: "" };
};

const toLinkId = (targetId) => `link.${targetId}`;

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
  scenesData,
}) => {
  const pickedIdsByType = collectPickedIdsByType({
    resourceDataByType,
    selectedFolderIdsByType,
  });
  const { dependencies, links } = collectDependencies({
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
  // Jumps into the story, and layouts opened that the pack does not carry,
  // point at the pack's links instead.
  const resolveLink = (value, fieldName) =>
    getAssetPackageStoryLinkKind(fieldName) || links.has(value)
      ? toLinkId(value)
      : value;
  for (const collection of collections) {
    for (const [itemId, item] of Object.entries(collection.items)) {
      if (item.type === "folder") continue;
      collection.items[itemId] = mapAssetPackageLinks(
        dropSectionJumpScenes(item),
        resolveLink,
      );
    }
  }
  return {
    repository: {
      files: createPackageFiles({ filesData, collections }),
      ...repository,
    },
    dependencies: packageDependencies,
    links: {
      items: Object.fromEntries(
        [...links].map(([targetId, link]) => [
          toLinkId(targetId),
          {
            kind: link.kind,
            ...describeLinkTarget({
              resourceDataByType,
              scenesData,
              link,
              targetId,
            }),
          },
        ]),
      ),
    },
  };
};

// The dependencies the export page lists: each with its type and the picks
// that use it, by type in the page's order, then in project order.
export const listAssetPackageDependencies = ({
  resourceDataByType,
  selectedFolderIdsByType,
  resourceTypeOrder,
}) => {
  const { dependencies } = collectDependencies({
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

// The links the export page lists: each with its name and the resources that
// jump there or open it, in the order the picks reach them.
export const listAssetPackageLinks = ({
  resourceDataByType,
  selectedFolderIdsByType,
  scenesData,
}) => {
  const { links } = collectDependencies({
    pickedIdsByType: collectPickedIdsByType({
      resourceDataByType,
      selectedFolderIdsByType,
    }),
    sourceById: indexSourceResources(resourceDataByType),
  });
  return [...links].map(([targetId, link]) => ({
    id: toLinkId(targetId),
    kind: link.kind,
    ...describeLinkTarget({ resourceDataByType, scenesData, link, targetId }),
    usedBy: [...link.usedBy],
  }));
};

// `itemId` names the resource at fault, when there is one.
export class AssetPackageManifestError extends Error {
  constructor(code, message, { itemId } = {}) {
    super(message);
    this.name = "AssetPackageManifestError";
    this.code = code;
    this.itemId = itemId;
  }
}

export const createAssetPackageManifest = ({
  repository,
  dependencies,
  links,
}) => {
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
  if (Object.keys(links?.items ?? {}).length > 0) {
    manifest.links = structuredClone(links);
  }
  return manifest;
};
