import { validatePayload } from "@routevn/creator-model";
import {
  ASSET_PACKAGE_KIND,
  ASSET_PACKAGE_IMPORT_CONFIGS,
  ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE,
  ASSET_PACKAGE_RESOURCE_TYPES,
  getAssetPackageFileValidationKind,
  isAssetPackageFileMimeTypeAllowed,
  mapAssetPackageReferences,
  visitAssetPackageReferences,
} from "./assetPackageResources.js";
import { IMPORT_PACK_SCHEMA, isPlainObject } from "./importPackages.js";

const ENVELOPE_KEYS = new Set(["schema", "package", "repository"]);
const PACKAGE_KEYS = new Set([
  "kind",
  "id",
  "name",
  "version",
  "description",
  "publisher",
  "source",
  "defaultFolderName",
]);
const REPOSITORY_KEYS = new Set(["files", ...ASSET_PACKAGE_RESOURCE_TYPES]);
const FILE_KEYS = new Set([
  "id",
  "type",
  "name",
  "mimeType",
  "size",
  "sha256",
  "source",
  "url",
]);
const MAX_RESOURCE_COUNT = 500;
const MAX_FILE_COUNT = MAX_RESOURCE_COUNT * 4;
const MAX_TREE_DEPTH = 32;
const PREVIEW_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PREVIEW_VIDEO_MIME_TYPES = new Set(["video/mp4", "video/webm"]);

export class AssetImportPlanError extends Error {
  constructor(code, message, { path, resourceId, details } = {}) {
    super(message);
    this.name = "AssetImportPlanError";
    this.code = code;
    this.path = path;
    this.resourceId = resourceId;
    this.details = details;
    this.retryable = false;
  }
}

const fail = (code, message, options) => {
  throw new AssetImportPlanError(code, message, options);
};

const assertPlainObject = (value, path) => {
  if (!isPlainObject(value)) {
    fail("invalid_package", `${path} must be an object.`, { path });
  }
};

const assertAllowedKeys = (value, allowedKeys, path) => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      fail(
        "unsupported_field",
        `${path}.${key} is not supported by asset packages.`,
        { path: `${path}.${key}` },
      );
    }
  }
};

const assertNonEmptyString = (value, path) => {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail("invalid_package", `${path} must be valid text.`, { path });
  }
};

const assertOptionalString = (value, path) => {
  if (value !== undefined && typeof value !== "string") {
    fail("invalid_package", `${path} must be text.`, { path });
  }
};

const createResourceData = (item) => {
  const data = structuredClone(item);
  delete data.id;
  delete data.parentId;
  delete data.fullLabel;
  delete data.resolvedTags;
  delete data.previewMediaFileId;
  delete data.thumbnailMediaFileId;
  return data;
};

const validateResourcePayload = ({
  config,
  data,
  destinationId,
  resourceId,
}) => {
  const result = validatePayload({
    type: config.commandType,
    payload: {
      [config.idField]: destinationId,
      data,
      parentId: null,
      index: 0,
    },
  });
  if (result?.valid === false) {
    fail(
      "resource_validation_failed",
      result.error?.message ?? "An imported asset is invalid.",
      { resourceId, details: result.error },
    );
  }
};

const validateFileCollection = (files) => {
  assertPlainObject(files, "repository.files");
  assertAllowedKeys(files, new Set(["items"]), "repository.files");
  assertPlainObject(files.items, "repository.files.items");
  if (Object.keys(files.items).length > MAX_FILE_COUNT) {
    fail("too_many_files", "repository.files contains too many files.");
  }
  for (const [fileId, descriptor] of Object.entries(files.items)) {
    const path = `repository.files.items.${fileId}`;
    assertPlainObject(descriptor, path);
    assertAllowedKeys(descriptor, FILE_KEYS, path);
    if (descriptor.id !== undefined && descriptor.id !== fileId) {
      fail("item_id_mismatch", `${path}.id must match its item key.`, {
        path: `${path}.id`,
        resourceId: fileId,
      });
    }
    assertNonEmptyString(descriptor.mimeType, `${path}.mimeType`);
    if (descriptor.source !== undefined) {
      assertPlainObject(descriptor.source, `${path}.source`);
      assertAllowedKeys(descriptor.source, new Set(["url"]), `${path}.source`);
    }
    assertNonEmptyString(
      descriptor.source?.url ?? descriptor.url,
      `${path}.source.url`,
    );
    if (
      descriptor.size !== undefined &&
      (!Number.isFinite(descriptor.size) || descriptor.size < 0)
    ) {
      fail("invalid_package", `${path}.size must be a positive number.`, {
        path: `${path}.size`,
      });
    }
    if (
      descriptor.sha256 !== undefined &&
      (typeof descriptor.sha256 !== "string" ||
        !/^(?:sha256[:-])?[a-f\d]{64}$/i.test(descriptor.sha256))
    ) {
      fail("invalid_hash", `${path}.sha256 must be a SHA-256 hash.`, {
        path: `${path}.sha256`,
      });
    }
  }
};

const validateAssetCollection = ({ collection, resourceType, config }) => {
  const path = `repository.${resourceType}`;
  assertPlainObject(collection, path);
  assertAllowedKeys(collection, new Set(["items", "tree"]), path);
  assertPlainObject(collection.items, `${path}.items`);
  if (Object.keys(collection.items).length > MAX_RESOURCE_COUNT) {
    fail("too_many_resources", `${path} contains too many resources.`, {
      path,
    });
  }
  if (!Array.isArray(collection.tree)) {
    fail("invalid_tree", `${path}.tree must be an array.`, {
      path: `${path}.tree`,
    });
  }

  const seen = new Set();
  const visit = (nodes, depth) => {
    if (depth > MAX_TREE_DEPTH) {
      fail("tree_too_deep", `${path}.tree is nested too deeply.`, {
        path: `${path}.tree`,
      });
    }
    for (const node of nodes) {
      assertPlainObject(node, `${path}.tree[]`);
      assertAllowedKeys(node, new Set(["id", "children"]), `${path}.tree[]`);
      assertNonEmptyString(node.id, `${path}.tree[].id`);
      const item = collection.items[node.id];
      if (!item) {
        fail(
          "tree_item_missing",
          `${path}.tree references missing item '${node.id}'.`,
          { resourceId: node.id },
        );
      }
      if (seen.has(node.id)) {
        fail(
          "tree_duplicate",
          `${path}.tree contains duplicate item '${node.id}'.`,
          { resourceId: node.id },
        );
      }
      seen.add(node.id);
      if (node.children !== undefined) {
        if (!Array.isArray(node.children) || item.type !== "folder") {
          fail(
            "invalid_tree",
            `${path}.tree children must belong to a folder.`,
            { resourceId: node.id },
          );
        }
        visit(node.children, depth + 1);
      }
    }
  };
  visit(collection.tree, 1);

  for (const [itemId, item] of Object.entries(collection.items)) {
    const itemPath = `${path}.items.${itemId}`;
    assertPlainObject(item, itemPath);
    if (item.id !== itemId) {
      fail("item_id_mismatch", `${itemPath}.id must match its item key.`, {
        path: `${itemPath}.id`,
        resourceId: itemId,
      });
    }
    if (item.type !== "folder" && item.type !== config.itemType) {
      fail(
        "unsupported_resource",
        `${itemPath}.type is not supported in ${resourceType}.`,
        { path: `${itemPath}.type`, resourceId: itemId },
      );
    }
    if (!seen.has(itemId)) {
      fail("tree_item_missing", `${itemPath} must appear in ${path}.tree.`, {
        resourceId: itemId,
      });
    }
    if ((item.tagIds?.length ?? 0) > 0) {
      fail(
        "unsupported_tag_scope",
        "Asset package tags are not supported yet.",
        { resourceId: itemId },
      );
    }
  }
};

const validateManifest = (manifest) => {
  assertPlainObject(manifest, "package");
  assertAllowedKeys(manifest, ENVELOPE_KEYS, "package");
  if (manifest.schema !== IMPORT_PACK_SCHEMA) {
    fail("unsupported_schema", "This package format is not supported.", {
      path: "schema",
    });
  }
  assertPlainObject(manifest.package, "package.package");
  assertAllowedKeys(manifest.package, PACKAGE_KEYS, "package.package");
  if (manifest.package.kind !== ASSET_PACKAGE_KIND) {
    fail("invalid_package_kind", "This is not a RouteVN asset package.", {
      path: "package.package.kind",
    });
  }
  for (const key of [
    "id",
    "name",
    "version",
    "description",
    "publisher",
    "source",
    "defaultFolderName",
  ]) {
    assertOptionalString(manifest.package[key], `package.package.${key}`);
  }
  assertPlainObject(manifest.repository, "package.repository");
  assertAllowedKeys(manifest.repository, REPOSITORY_KEYS, "package.repository");
  validateFileCollection(manifest.repository.files);

  let resourceCount = 0;
  for (const resourceType of ASSET_PACKAGE_RESOURCE_TYPES) {
    const collection = manifest.repository[resourceType];
    if (!collection) continue;
    const config = ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE[resourceType];
    validateAssetCollection({ collection, resourceType, config });
    resourceCount += Object.values(collection.items).filter(
      (item) => item.type === config.itemType,
    ).length;
  }
  if (resourceCount === 0) {
    fail("no_matching_resources", "No matching resources were found.");
  }
};

const collectReferencedFiles = (manifest) => {
  const referencesByFileId = new Map();
  for (const resourceType of ASSET_PACKAGE_RESOURCE_TYPES) {
    for (const item of Object.values(
      manifest.repository[resourceType]?.items ?? {},
    )) {
      if (item.type === "folder") continue;
      visitAssetPackageReferences(item, ({ fieldName, kind, value }) => {
        if (kind === "project") {
          fail(
            "project_reference_unsupported",
            `Project reference '${fieldName}' is not supported in asset packages.`,
            { resourceId: item.id },
          );
        }
        if (kind !== "file") return;
        const validationKind = getAssetPackageFileValidationKind({
          resourceType,
          fieldName,
        });
        if (!validationKind) {
          fail(
            "file_owner_unsupported",
            `File reference '${fieldName}' is not supported for ${resourceType}.`,
            { resourceId: item.id },
          );
        }
        const validationKinds = referencesByFileId.get(value) ?? new Set();
        validationKinds.add(validationKind);
        referencesByFileId.set(value, validationKinds);
      });
    }
  }
  return referencesByFileId;
};

const assertFileMimeTypes = ({ descriptor, sourceId, validationKinds }) => {
  for (const validationKind of validationKinds) {
    if (
      !isAssetPackageFileMimeTypeAllowed({
        validationKind,
        mimeType: descriptor.mimeType,
      })
    ) {
      fail(
        "file_type_unsupported",
        `File '${sourceId}' has an unsupported type for ${validationKind} assets.`,
        { resourceId: sourceId },
      );
    }
  }
};

const rewriteMappedReferences = (
  value,
  { fileIdBySourceId, resourceIdBySourceId },
) =>
  mapAssetPackageReferences(value, ({ kind, value: referenceId }) => {
    if (kind === "file") {
      return fileIdBySourceId?.get(referenceId) ?? referenceId;
    }
    return resourceIdBySourceId?.get(referenceId) ?? referenceId;
  });

const getPreviewData = ({ item, config, files }) => {
  for (const field of config.previewFileFields) {
    const previewSourceId = item[field];
    if (!previewSourceId) continue;
    const descriptor = files[previewSourceId];
    if (!descriptor) {
      fail(
        "file_dependency_missing",
        `Preview media '${previewSourceId}' is missing.`,
        { resourceId: item.id },
      );
    }
    const mimeType = descriptor?.mimeType?.toLowerCase();
    if (
      !PREVIEW_IMAGE_MIME_TYPES.has(mimeType) &&
      !PREVIEW_VIDEO_MIME_TYPES.has(mimeType)
    ) {
      if (field === "fileId") continue;
      fail(
        "preview_type_unsupported",
        "A package preview must be a JPEG, PNG, WebP, MP4, or WebM file.",
        { resourceId: item.id },
      );
    }
    return {
      previewSourceId,
      previewKind: PREVIEW_VIDEO_MIME_TYPES.has(mimeType) ? "video" : "image",
      previewMimeType: mimeType,
    };
  }
  return {};
};

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

const collectResourceDependencySourceIds = ({
  data,
  entryByPackageSourceId,
  sourceId,
}) => {
  const dependencySourceIds = new Set();
  visitAssetPackageReferences(data, ({ fieldName, kind, required, value }) => {
    if (kind === "project") {
      fail(
        "project_reference_unsupported",
        `Project reference '${fieldName}' is not supported in asset packages.`,
        { resourceId: sourceId },
      );
    }
    if (kind !== "resource") {
      return;
    }
    const dependency = entryByPackageSourceId.get(value);
    if (!dependency) {
      if (required) {
        fail(
          "resource_dependency_missing",
          `Referenced resource '${value}' is missing.`,
          { resourceId: sourceId },
        );
      }
      return;
    }
    if (dependency.sourceId !== sourceId) {
      dependencySourceIds.add(dependency.sourceId);
    }
  });
  return [...dependencySourceIds];
};

const collectResourceFileDestinationIds = (data) => {
  const fileDestinationIds = new Set();
  visitAssetPackageReferences(data, ({ kind, value }) => {
    if (kind === "file") fileDestinationIds.add(value);
  });
  return [...fileDestinationIds];
};

const orderEntriesByDependencies = (entries) => {
  const pending = [...entries];
  const ordered = [];
  const includedSourceIds = new Set();
  const availableSourceIds = new Set(entries.map((entry) => entry.sourceId));
  while (pending.length > 0) {
    const readyIndex = pending.findIndex((entry) => {
      if (
        entry.parentSourceId &&
        !includedSourceIds.has(entry.parentSourceId)
      ) {
        return false;
      }
      return entry.dependencySourceIds.every(
        (dependencySourceId) =>
          !availableSourceIds.has(dependencySourceId) ||
          includedSourceIds.has(dependencySourceId),
      );
    });
    if (readyIndex === -1) {
      fail(
        "cyclic_resource_dependency",
        "The asset package contains a cyclic resource dependency.",
      );
    }
    const [entry] = pending.splice(readyIndex, 1);
    ordered.push(entry);
    includedSourceIds.add(entry.sourceId);
  }
  return ordered;
};

export const createAssetImportPlan = ({
  manifest,
  manifestUrl,
  projectId,
  repositoryState,
  repositoryRevision,
  createId,
} = {}) => {
  validateManifest(manifest);
  const planId = createId();
  const referencedFiles = collectReferencedFiles(manifest);
  const destinationFileIdBySourceId = new Map();
  const files = [];
  let knownDownloadBytes = 0;
  let hasUnknownDownloadSize = false;
  for (const [sourceId, validationKinds] of referencedFiles) {
    const descriptor = manifest.repository.files.items[sourceId];
    if (!descriptor) {
      fail(
        "file_dependency_missing",
        `Referenced file '${sourceId}' is missing.`,
        { resourceId: sourceId },
      );
    }
    assertFileMimeTypes({ descriptor, sourceId, validationKinds });
    const destinationId = createId();
    destinationFileIdBySourceId.set(sourceId, destinationId);
    files.push({
      sourceId,
      destinationId,
      commandId: createId(),
      descriptor: structuredClone(descriptor),
      validationKinds: [...validationKinds],
    });
    if (Number.isFinite(descriptor.size)) knownDownloadBytes += descriptor.size;
    else hasUnknownDownloadSize = true;
  }

  const entries = [];
  const entryByPackageSourceId = new Map();
  for (const config of ASSET_PACKAGE_IMPORT_CONFIGS) {
    const { resourceType } = config;
    const collection = manifest.repository[resourceType];
    if (!collection) continue;
    const visit = (nodes, parentEntry) => {
      nodes.forEach((node, index) => {
        const item = collection.items[node.id];
        const sourceId = `${resourceType}:${node.id}`;
        const destinationId = createId();
        const entry = {
          sourceId,
          packageSourceId: node.id,
          destinationId,
          commandId: createId(),
          resourceType,
          parentSourceId: parentEntry?.sourceId,
          parentDestinationId: parentEntry?.destinationId,
          index,
          folder: item.type === "folder",
          item,
          config,
        };
        entries.push(entry);
        if (entry.folder) {
          visit(node.children ?? [], entry);
          return;
        }
        if (entryByPackageSourceId.has(node.id)) {
          fail(
            "duplicate_resource_id",
            `Resource id '${node.id}' is used by more than one resource type.`,
            { resourceId: node.id },
          );
        }
        entryByPackageSourceId.set(node.id, entry);
      });
    };
    visit(collection.tree, undefined);
  }

  const destinationResourceIdBySourceId = new Map(
    [...entryByPackageSourceId.entries()].map(([sourceId, entry]) => [
      sourceId,
      entry.destinationId,
    ]),
  );
  const preparedEntries = entries.map((entry) => {
    const sourceData = createResourceData(entry.item);
    const dependencySourceIds = entry.folder
      ? []
      : collectResourceDependencySourceIds({
          data: sourceData,
          entryByPackageSourceId,
          sourceId: entry.sourceId,
        });
    const data = rewriteMappedReferences(sourceData, {
      fileIdBySourceId: destinationFileIdBySourceId,
      resourceIdBySourceId: destinationResourceIdBySourceId,
    });
    validateResourcePayload({
      config: entry.config,
      data,
      destinationId: entry.destinationId,
      resourceId: entry.packageSourceId,
    });
    return {
      sourceId: entry.sourceId,
      packageSourceId: entry.packageSourceId,
      destinationId: entry.destinationId,
      commandId: entry.commandId,
      resourceType: entry.resourceType,
      parentSourceId: entry.parentSourceId,
      parentDestinationId: entry.parentDestinationId,
      index: entry.index,
      folder: entry.folder,
      dependencySourceIds,
      fileDestinationIds: entry.folder
        ? []
        : collectResourceFileDestinationIds(data),
      data,
    };
  });
  const orderedEntries = orderEntriesByDependencies(preparedEntries);
  const resources = [];
  const warnings = [];
  for (const entry of orderedEntries) {
    if (entry.folder) continue;
    const config = ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE[entry.resourceType];
    const item =
      manifest.repository[entry.resourceType].items[entry.packageSourceId];
    const resource = {
      ...entry,
      type: config.itemType,
      name: item.name,
      description: item.description ?? "",
      ...getPreviewData({
        item,
        config,
        files: manifest.repository.files.items,
      }),
    };
    resources.push(resource);
    const hasNameConflict = Object.values(
      repositoryState?.[entry.resourceType]?.items ?? {},
    ).some(
      (existingItem) =>
        existingItem?.type === config.itemType &&
        existingItem.name?.trim().toLocaleLowerCase() ===
          item.name.trim().toLocaleLowerCase(),
    );
    if (hasNameConflict) {
      warnings.push({
        code: "name_conflict",
        resourceId: entry.sourceId,
        message: `A ${config.itemType} named '${item.name}' already exists. A new copy will be created.`,
      });
    }
  }

  const previewFiles = [
    ...new Set(
      resources.map((resource) => resource.previewSourceId).filter(Boolean),
    ),
  ].map((sourceId) => ({
    sourceId,
    descriptor: structuredClone(manifest.repository.files.items[sourceId]),
  }));

  return deepFreeze({
    planId,
    manifestUrl,
    projectId,
    repositoryRevision,
    package: structuredClone(manifest.package),
    entries: orderedEntries,
    resources,
    files,
    previewFiles,
    warnings,
    knownDownloadBytes,
    hasUnknownDownloadSize,
  });
};

export const rewriteAssetImportPlanReferences = ({
  resources,
  resourceNames = {},
  resourceDescriptions = {},
  fileIdMap = new Map(),
} = {}) =>
  resources.map((resource) => {
    const data = rewriteMappedReferences(resource.data, {
      fileIdBySourceId: fileIdMap,
      resourceIdBySourceId: new Map(),
    });
    if (resourceNames[resource.sourceId] !== undefined) {
      data.name = resourceNames[resource.sourceId].trim();
    }
    if (resourceDescriptions[resource.sourceId] !== undefined) {
      data.description = resourceDescriptions[resource.sourceId].trim();
    }
    return { ...resource, data };
  });
