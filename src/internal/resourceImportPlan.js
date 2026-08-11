import { validatePayload } from "@routevn/creator-model";
import { IMPORT_PACK_SCHEMA, isPlainObject } from "./importPackages.js";
import { toFlatItems } from "./project/tree.js";

const EXPECTED_RESOURCE_TYPES = new Set(["animations", "transforms"]);
const COLLECTION_KEYS = new Set(["items", "tree"]);
const ENVELOPE_KEYS = new Set(["schema", "package", "primary", "repository"]);
const PACKAGE_KEYS = new Set([
  "id",
  "name",
  "version",
  "description",
  "publisher",
  "source",
  "defaultFolderName",
]);
const PRIMARY_KEYS = new Set(["resourceType", "id"]);
const REPOSITORY_KEYS = new Set([
  "files",
  "images",
  "animations",
  "transforms",
  "tags",
]);
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
const FILE_SOURCE_KEYS = new Set(["url"]);
const COMMON_RESOURCE_KEYS = [
  "id",
  "type",
  "name",
  "description",
  "tagIds",
  "parentId",
  "fullLabel",
  "resolvedTags",
];
const RESOURCE_KEYS = Object.freeze({
  image: new Set([
    ...COMMON_RESOURCE_KEYS,
    "fileId",
    "thumbnailFileId",
    "width",
    "height",
  ]),
  animation: new Set([
    ...COMMON_RESOURCE_KEYS,
    "animation",
    "thumbnailFileId",
    "previewMediaFileId",
    "preview",
  ]),
  transform: new Set([
    ...COMMON_RESOURCE_KEYS,
    "x",
    "y",
    "scaleX",
    "scaleY",
    "anchorX",
    "anchorY",
    "anchor",
    "rotation",
    "thumbnailFileId",
    "previewFileId",
    "previewMediaFileId",
    "preview",
  ]),
  folder: new Set(COMMON_RESOURCE_KEYS),
  tag: new Set([...COMMON_RESOURCE_KEYS, "color"]),
});
const IMPORT_ONLY_RESOURCE_KEYS = new Set([
  "id",
  "parentId",
  "fullLabel",
  "resolvedTags",
  "previewMediaFileId",
]);
const PACKAGE_REFERENCE_KEYS = new Set([
  "fileId",
  "thumbnailFileId",
  "previewFileId",
  "previewMediaFileId",
  "imageId",
  "transformId",
  "animationId",
  "resourceId",
  "particleId",
]);
const MAX_RESOURCE_COUNT = 500;
const MAX_FILE_COUNT = 100;
const MAX_TREE_DEPTH = 32;
const MAX_STRING_LENGTH = 10_000;
const PREVIEW_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const PREVIEW_VIDEO_MIME_TYPE = "video/mp4";

export class ResourceImportPlanError extends Error {
  constructor(code, message, { path, resourceId, details } = {}) {
    super(message);
    this.name = "ResourceImportPlanError";
    this.code = code;
    this.path = path;
    this.resourceId = resourceId;
    this.details = details;
    this.retryable = false;
  }
}

const fail = (code, message, options) => {
  throw new ResourceImportPlanError(code, message, options);
};

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value ?? {}, key);

const assertAllowedKeys = (value, allowedKeys, path) => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      fail(
        "unsupported_field",
        `${path}.${key} is not supported by this import format.`,
        { path: `${path}.${key}` },
      );
    }
  }
};

const assertPlainObject = (value, path) => {
  if (!isPlainObject(value)) {
    fail("invalid_package", `${path} must be an object.`, { path });
  }
};

const assertString = (
  value,
  path,
  { required = false, nonEmpty = false } = {},
) => {
  if (value === undefined && !required) return;
  if (
    typeof value !== "string" ||
    (nonEmpty && value.trim().length === 0) ||
    value.length > MAX_STRING_LENGTH
  ) {
    fail("invalid_package", `${path} must be valid text.`, { path });
  }
};

const validateTree = ({ collection, path }) => {
  const seen = new Set();
  const visiting = new Set();
  const items = collection.items;

  const visit = (nodes, depth) => {
    if (!Array.isArray(nodes)) {
      fail("invalid_tree", `${path}.tree must be an array.`, {
        path: `${path}.tree`,
      });
    }
    if (depth > MAX_TREE_DEPTH) {
      fail("tree_too_deep", `${path}.tree is nested too deeply.`, {
        path: `${path}.tree`,
      });
    }

    for (const node of nodes) {
      assertPlainObject(node, `${path}.tree[]`);
      assertAllowedKeys(node, new Set(["id", "children"]), `${path}.tree[]`);
      assertString(node.id, `${path}.tree[].id`, {
        required: true,
        nonEmpty: true,
      });
      if (!hasOwn(items, node.id)) {
        fail(
          "tree_item_missing",
          `${path}.tree references missing item '${node.id}'.`,
          { resourceId: node.id },
        );
      }
      if (visiting.has(node.id)) {
        fail("tree_cycle", `${path}.tree contains a cycle.`, {
          resourceId: node.id,
        });
      }
      if (seen.has(node.id)) {
        fail(
          "tree_duplicate",
          `${path}.tree contains duplicate item '${node.id}'.`,
          { resourceId: node.id },
        );
      }
      seen.add(node.id);
      visiting.add(node.id);
      if (node.children !== undefined) {
        visit(node.children, depth + 1);
      }
      visiting.delete(node.id);
    }
  };

  visit(collection.tree, 1);
};

const validateResourceItem = ({ item, id, path }) => {
  assertPlainObject(item, path);
  assertString(item.id, `${path}.id`, { required: true, nonEmpty: true });
  if (item.id !== id) {
    fail("item_id_mismatch", `${path}.id must match its item key.`, {
      path: `${path}.id`,
      resourceId: id,
    });
  }
  assertString(item.type, `${path}.type`, { required: true, nonEmpty: true });
  const allowedKeys = RESOURCE_KEYS[item.type];
  if (!allowedKeys) {
    fail("unsupported_resource", `${path}.type is not supported.`, {
      path: `${path}.type`,
      resourceId: id,
    });
  }
  assertAllowedKeys(item, allowedKeys, path);
  assertString(item.name, `${path}.name`, {
    required: item.type !== "folder",
    nonEmpty: item.type !== "folder",
  });
  assertString(item.description, `${path}.description`);
  assertString(item.previewMediaFileId, `${path}.previewMediaFileId`, {
    nonEmpty: true,
  });
  if (item.tagIds !== undefined) {
    if (
      !Array.isArray(item.tagIds) ||
      item.tagIds.some(
        (tagId) => typeof tagId !== "string" || tagId.length === 0,
      ) ||
      new Set(item.tagIds).size !== item.tagIds.length
    ) {
      fail("invalid_tag_ids", `${path}.tagIds must contain unique text ids.`, {
        path: `${path}.tagIds`,
        resourceId: id,
      });
    }
  }
};

const validateCollection = ({ collection, path }) => {
  assertPlainObject(collection, path);
  assertAllowedKeys(collection, COLLECTION_KEYS, path);
  assertPlainObject(collection.items, `${path}.items`);
  if (Object.keys(collection.items).length > MAX_RESOURCE_COUNT) {
    fail("too_many_resources", `${path} contains too many resources.`, {
      path,
    });
  }
  for (const [id, item] of Object.entries(collection.items)) {
    validateResourceItem({ item, id, path: `${path}.items.${id}` });
  }
  validateTree({ collection, path });
};

const validateFileCollection = (collection) => {
  assertPlainObject(collection, "repository.files");
  assertAllowedKeys(collection, COLLECTION_KEYS, "repository.files");
  assertPlainObject(collection.items, "repository.files.items");
  if (Object.keys(collection.items).length > MAX_FILE_COUNT) {
    fail("too_many_files", "repository.files contains too many files.");
  }
  for (const [id, file] of Object.entries(collection.items)) {
    const path = `repository.files.items.${id}`;
    assertPlainObject(file, path);
    assertAllowedKeys(file, FILE_KEYS, path);
    if (file.id !== undefined && file.id !== id) {
      fail("item_id_mismatch", `${path}.id must match its item key.`, {
        path: `${path}.id`,
        resourceId: id,
      });
    }
    assertString(file.mimeType, `${path}.mimeType`, {
      required: true,
      nonEmpty: true,
    });
    if (
      file.size !== undefined &&
      (!Number.isFinite(file.size) || file.size < 0)
    ) {
      fail("invalid_package", `${path}.size must be a positive number.`, {
        path: `${path}.size`,
      });
    }
    assertString(file.sha256, `${path}.sha256`);
    if (
      file.sha256 !== undefined &&
      !/^(?:sha256[:-])?[a-f\d]{64}$/i.test(file.sha256)
    ) {
      fail("invalid_hash", `${path}.sha256 must be a SHA-256 hash.`, {
        path: `${path}.sha256`,
      });
    }
    if (file.source !== undefined) {
      assertPlainObject(file.source, `${path}.source`);
      assertAllowedKeys(file.source, FILE_SOURCE_KEYS, `${path}.source`);
    }
    assertString(file.source?.url ?? file.url, `${path}.source.url`, {
      required: true,
      nonEmpty: true,
    });
  }
  if (collection.tree !== undefined) {
    validateTree({
      collection: { ...collection, tree: collection.tree },
      path: "repository.files",
    });
  }
};

const validateTags = (tags) => {
  assertPlainObject(tags, "repository.tags");
  for (const [scopeKey, collection] of Object.entries(tags)) {
    if (!EXPECTED_RESOURCE_TYPES.has(scopeKey) && scopeKey !== "images") {
      fail(
        "unsupported_tag_scope",
        `repository.tags.${scopeKey} is not a supported tag scope.`,
      );
    }
    validateCollection({ collection, path: `repository.tags.${scopeKey}` });
    for (const item of Object.values(collection.items)) {
      if (item.type !== "tag") {
        fail(
          "invalid_tag",
          `repository.tags.${scopeKey} may contain only tags.`,
          { resourceId: item.id },
        );
      }
    }
  }
};

export const validateResourceImportManifest = (
  manifest,
  { expectedResourceType } = {},
) => {
  assertPlainObject(manifest, "package");
  assertAllowedKeys(manifest, ENVELOPE_KEYS, "package");
  if (manifest.schema !== IMPORT_PACK_SCHEMA) {
    fail("unsupported_schema", "This package format is not supported.", {
      path: "schema",
    });
  }
  if (!EXPECTED_RESOURCE_TYPES.has(expectedResourceType)) {
    fail("unsupported_resource_type", "This resource type cannot be imported.");
  }

  assertPlainObject(manifest.package, "package.package");
  assertAllowedKeys(manifest.package, PACKAGE_KEYS, "package.package");
  for (const key of ["id", "name", "version"]) {
    assertString(manifest.package[key], `package.package.${key}`, {
      required: true,
      nonEmpty: true,
    });
  }
  assertString(manifest.package.description, "package.package.description");
  assertString(manifest.package.publisher, "package.package.publisher");
  assertString(manifest.package.source, "package.package.source");
  assertString(
    manifest.package.defaultFolderName,
    "package.package.defaultFolderName",
    { nonEmpty: true },
  );

  if (manifest.primary !== undefined) {
    assertPlainObject(manifest.primary, "package.primary");
    assertAllowedKeys(manifest.primary, PRIMARY_KEYS, "package.primary");
    assertString(
      manifest.primary.resourceType,
      "package.primary.resourceType",
      {
        required: true,
        nonEmpty: true,
      },
    );
    assertString(manifest.primary.id, "package.primary.id", {
      required: true,
      nonEmpty: true,
    });
    if (manifest.primary.resourceType !== expectedResourceType) {
      fail(
        "primary_type_mismatch",
        "The package primary resource has the wrong type.",
        { resourceId: manifest.primary.id },
      );
    }
  }

  assertPlainObject(manifest.repository, "package.repository");
  assertAllowedKeys(manifest.repository, REPOSITORY_KEYS, "package.repository");
  const targetCollection = manifest.repository[expectedResourceType];
  if (!targetCollection) {
    fail("no_matching_resources", "No matching resources were found.");
  }
  validateCollection({
    collection: targetCollection,
    path: `repository.${expectedResourceType}`,
  });
  for (const root of ["images", "animations", "transforms"]) {
    if (root !== expectedResourceType && manifest.repository[root]) {
      validateCollection({
        collection: manifest.repository[root],
        path: `repository.${root}`,
      });
    }
  }
  if (manifest.repository.files) {
    validateFileCollection(manifest.repository.files);
  }
  if (manifest.repository.tags) {
    validateTags(manifest.repository.tags);
  }

  const primaryId = manifest.primary?.id;
  if (
    primaryId &&
    targetCollection.items?.[primaryId]?.type !==
      expectedResourceType.replace(/s$/, "")
  ) {
    fail(
      "primary_missing",
      "The package primary resource could not be found.",
      { resourceId: primaryId },
    );
  }
  return manifest;
};

const collectImageReferences = (value, imageIds) => {
  if (Array.isArray(value)) {
    for (const item of value) collectImageReferences(item, imageIds);
    return;
  }
  if (!isPlainObject(value)) return;
  if (typeof value.imageId === "string") imageIds.add(value.imageId);
  if (Array.isArray(value.imageIds)) {
    for (const imageId of value.imageIds) {
      if (typeof imageId === "string") imageIds.add(imageId);
    }
  }
  for (const item of Object.values(value)) {
    collectImageReferences(item, imageIds);
  }
};

const collectTransformReferences = (value, transformIds) => {
  if (Array.isArray(value)) {
    for (const item of value) collectTransformReferences(item, transformIds);
    return;
  }
  if (!isPlainObject(value)) return;
  if (typeof value.transformId === "string") {
    transformIds.add(value.transformId);
  }
  for (const item of Object.values(value)) {
    collectTransformReferences(item, transformIds);
  }
};

const cloneResourceData = (item) => {
  const data = {};
  for (const [key, value] of Object.entries(item)) {
    if (!IMPORT_ONLY_RESOURCE_KEYS.has(key)) {
      data[key] = structuredClone(value);
    }
  }
  return data;
};

const rewriteReferences = (value, { imageIds, transformIds, fileIds }) => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      rewriteReferences(item, { imageIds, transformIds, fileIds }),
    );
  }
  if (!isPlainObject(value)) return value;

  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "imageId" && typeof entry === "string") {
      next[key] = imageIds.get(entry) ?? entry;
      continue;
    }
    if (key === "imageIds" && Array.isArray(entry)) {
      next[key] = entry.map((id) => imageIds.get(id) ?? id);
      continue;
    }
    if (key === "transformId" && typeof entry === "string") {
      next[key] = transformIds.get(entry) ?? entry;
      continue;
    }
    if (
      (key === "fileId" ||
        key === "thumbnailFileId" ||
        key === "previewFileId" ||
        key === "waveformDataFileId") &&
      typeof entry === "string"
    ) {
      next[key] = fileIds.get(entry) ?? entry;
      continue;
    }
    next[key] = rewriteReferences(entry, {
      imageIds,
      transformIds,
      fileIds,
    });
  }
  return next;
};

const assertNoPackageReferences = (value, packageIds, path = "data") => {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoPackageReferences(item, packageIds, `${path}.${index}`),
    );
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (
      PACKAGE_REFERENCE_KEYS.has(key) &&
      typeof entry === "string" &&
      packageIds.has(entry)
    ) {
      fail(
        "unmapped_package_reference",
        `${path}.${key} still references package-local id '${entry}'.`,
        { path: `${path}.${key}`, resourceId: entry },
      );
    }
    if ((key === "imageIds" || key === "tagIds") && Array.isArray(entry)) {
      for (const id of entry) {
        if (packageIds.has(id)) {
          fail(
            "unmapped_package_reference",
            `${path}.${key} still contains package-local id '${id}'.`,
            { path: `${path}.${key}`, resourceId: id },
          );
        }
      }
    }
    assertNoPackageReferences(entry, packageIds, `${path}.${key}`);
  }
};

const getOrderedResourceItems = (collection, itemType, primaryId) => {
  const ordered = toFlatItems(collection)
    .map((item) => collection.items[item.id])
    .filter((item) => item?.type === itemType);
  const ids = new Set(ordered.map((item) => item.id));
  for (const item of Object.values(collection.items)) {
    if (item.type === itemType && !ids.has(item.id)) ordered.push(item);
  }
  if (!primaryId) return ordered;
  const index = ordered.findIndex((item) => item.id === primaryId);
  if (index > 0) {
    const [primary] = ordered.splice(index, 1);
    ordered.unshift(primary);
  }
  return ordered;
};

const findExistingTag = ({ repositoryState, scopeKey, name }) => {
  const normalizedName = name.trim().toLocaleLowerCase();
  return Object.values(repositoryState?.tags?.[scopeKey]?.items ?? {}).find(
    (item) =>
      item?.type === "tag" &&
      item.name?.trim().toLocaleLowerCase() === normalizedName,
  );
};

const createTagsPlan = ({
  selectedItems,
  manifest,
  expectedResourceType,
  repositoryState,
  createId,
}) => {
  const referencedTagIds = new Set(
    selectedItems.flatMap((item) => item.tagIds ?? []),
  );
  const packageTags =
    manifest.repository.tags?.[expectedResourceType]?.items ?? {};
  const tags = [];
  const tagIdMap = new Map();

  for (const sourceId of referencedTagIds) {
    const sourceTag = packageTags[sourceId];
    if (sourceTag?.type !== "tag") {
      fail("tag_missing", `Referenced package tag '${sourceId}' is missing.`, {
        resourceId: sourceId,
      });
    }
    const existing = findExistingTag({
      repositoryState,
      scopeKey: expectedResourceType,
      name: sourceTag.name,
    });
    const destinationId = existing?.id ?? createId();
    tagIdMap.set(sourceId, destinationId);
    tags.push({
      sourceId,
      destinationId,
      commandId: createId(),
      scopeKey: expectedResourceType,
      mode: existing ? "existing" : "create",
      data: {
        type: "tag",
        name: sourceTag.name,
        color: sourceTag.color ?? "",
      },
    });
  }

  return { tags, tagIdMap };
};

const assertCreatorModelPayload = ({ type, idField, id, data }) => {
  const result = validatePayload({
    type,
    payload: {
      [idField]: id,
      data,
      parentId: null,
      index: 0,
    },
  });
  if (result?.valid === false) {
    fail(
      "resource_validation_failed",
      result.error?.message ?? "An imported resource is invalid.",
      { resourceId: id, details: result.error },
    );
  }
};

const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
};

export const createResourceImportPlan = ({
  manifest,
  manifestUrl,
  expectedResourceType,
  projectId,
  repositoryState,
  repositoryRevision,
  createId,
  resolveFileUrl,
} = {}) => {
  validateResourceImportManifest(manifest, { expectedResourceType });
  const itemType = expectedResourceType.replace(/s$/, "");
  const selectedItems = getOrderedResourceItems(
    manifest.repository[expectedResourceType],
    itemType,
    manifest.primary?.id,
  );
  if (selectedItems.length === 0) {
    fail("no_matching_resources", "No matching resources were found.");
  }

  const planId = createId();
  const destinationFolders = {
    resource: {
      destinationId: createId(),
      commandId: createId(),
    },
    images: {
      destinationId: createId(),
      commandId: createId(),
    },
  };
  const resourceIdMap = new Map(
    selectedItems.map((item) => [item.id, createId()]),
  );
  const imageSourceIds = new Set();
  const imageConsumerIds = new Map();
  const transformSourceIds = new Set();
  for (const item of selectedItems) {
    const itemImageIds = new Set();
    collectImageReferences(item, itemImageIds);
    for (const imageId of itemImageIds) {
      imageSourceIds.add(imageId);
      const consumerIds = imageConsumerIds.get(imageId) ?? [];
      consumerIds.push(item.id);
      imageConsumerIds.set(imageId, consumerIds);
    }
    collectTransformReferences(item.preview, transformSourceIds);
  }

  if (expectedResourceType === "animations") {
    for (const transformId of transformSourceIds) {
      if (!resourceIdMap.has(transformId)) {
        fail(
          "unsupported_dependency",
          "Animation preview transform dependencies are not supported by this importer.",
          { resourceId: transformId },
        );
      }
    }
  }

  const imageIdMap = new Map();
  const images = [];
  for (const sourceId of imageSourceIds) {
    const item = manifest.repository.images?.items?.[sourceId];
    if (item?.type !== "image") {
      fail(
        "image_dependency_missing",
        `Referenced image '${sourceId}' is missing.`,
        { resourceId: sourceId },
      );
    }
    if (!item.fileId) {
      fail("file_dependency_missing", `Image '${item.name}' has no file.`, {
        resourceId: sourceId,
      });
    }
    const destinationId = createId();
    imageIdMap.set(sourceId, destinationId);
    const imagePlan = {
      sourceId,
      destinationId,
      commandId: createId(),
      sourceFileId: item.fileId,
      thumbnailFileId: createId(),
      thumbnailCommandId: createId(),
      name: item.name,
      description: item.description ?? "",
      tagIds: item.tagIds ?? [],
      usedByResourceIds: imageConsumerIds.get(sourceId) ?? [],
      choice: { mode: "import" },
    };
    const descriptor = manifest.repository.files?.items?.[item.fileId];
    const previewMimeType = descriptor?.mimeType?.toLowerCase();
    if (
      descriptor &&
      resolveFileUrl &&
      PREVIEW_IMAGE_MIME_TYPES.has(previewMimeType)
    ) {
      imagePlan.previewUrl = resolveFileUrl({ descriptor, manifestUrl });
      imagePlan.previewKind = "image";
      imagePlan.previewMimeType = previewMimeType;
    }
    images.push(imagePlan);
  }

  const { tags, tagIdMap } = createTagsPlan({
    selectedItems,
    manifest,
    expectedResourceType,
    repositoryState,
    createId,
  });
  const fileSourceIds = new Set(images.map((image) => image.sourceFileId));
  for (const item of selectedItems) {
    for (const field of ["thumbnailFileId", "previewFileId"]) {
      if (item[field]) fileSourceIds.add(item[field]);
    }
  }
  const fileIdMap = new Map();
  const files = [];
  let knownDownloadBytes = 0;
  let hasUnknownDownloadSize = false;
  for (const sourceId of fileSourceIds) {
    const descriptor = manifest.repository.files?.items?.[sourceId];
    if (!descriptor) {
      fail(
        "file_dependency_missing",
        `Referenced file '${sourceId}' is missing.`,
        { resourceId: sourceId },
      );
    }
    const destinationId = createId();
    fileIdMap.set(sourceId, destinationId);
    files.push({
      sourceId,
      destinationId,
      commandId: createId(),
      descriptor: structuredClone(descriptor),
    });
    if (Number.isFinite(descriptor.size)) knownDownloadBytes += descriptor.size;
    else hasUnknownDownloadSize = true;
  }

  const packageIds = new Set();
  for (const root of Object.values(manifest.repository)) {
    if (isPlainObject(root?.items)) {
      for (const id of Object.keys(root.items)) packageIds.add(id);
      continue;
    }
    if (isPlainObject(root)) {
      for (const scope of Object.values(root)) {
        if (isPlainObject(scope?.items)) {
          for (const id of Object.keys(scope.items)) packageIds.add(id);
        }
      }
    }
  }

  const imagePreviewBySourceId = new Map(
    images.map((image) => [image.sourceId, image]),
  );
  const resources = selectedItems.map((item) => {
    const data = cloneResourceData(item);
    data.tagIds = (data.tagIds ?? []).map((tagId) => tagIdMap.get(tagId));
    const normalizedData = rewriteReferences(data, {
      imageIds: imageIdMap,
      transformIds: resourceIdMap,
      fileIds: fileIdMap,
    });
    const destinationId = resourceIdMap.get(item.id);
    assertNoPackageReferences(normalizedData, packageIds);
    assertCreatorModelPayload({
      type: `${itemType}.create`,
      idField: `${itemType}Id`,
      id: destinationId,
      data: normalizedData,
    });
    const resourcePlan = {
      sourceId: item.id,
      destinationId,
      commandId: createId(),
      type: itemType,
      name: item.name,
      description: item.description ?? "",
      data: normalizedData,
      selected: true,
      primary: item.id === (manifest.primary?.id ?? selectedItems[0].id),
    };
    if (item.previewMediaFileId) {
      const descriptor =
        manifest.repository.files?.items?.[item.previewMediaFileId];
      if (!descriptor) {
        fail(
          "file_dependency_missing",
          `Preview media '${item.previewMediaFileId}' is missing.`,
          { resourceId: item.id },
        );
      }
      const previewMimeType = descriptor.mimeType.toLowerCase();
      if (
        !PREVIEW_IMAGE_MIME_TYPES.has(previewMimeType) &&
        previewMimeType !== PREVIEW_VIDEO_MIME_TYPE
      ) {
        fail(
          "preview_type_unsupported",
          "A package preview must be a JPEG, PNG, WebP, or MP4 file.",
          { resourceId: item.id },
        );
      }
      if (resolveFileUrl) {
        resourcePlan.previewUrl = resolveFileUrl({
          descriptor,
          manifestUrl,
        });
        resourcePlan.previewKind =
          previewMimeType === PREVIEW_VIDEO_MIME_TYPE ? "video" : "image";
        resourcePlan.previewMimeType = previewMimeType;
      }
    } else {
      const previewImageSourceIds = new Set();
      collectImageReferences(item, previewImageSourceIds);
      const previewImage = [...previewImageSourceIds]
        .map((sourceId) => imagePreviewBySourceId.get(sourceId))
        .find((image) => image?.previewUrl);
      if (previewImage) {
        resourcePlan.previewUrl = previewImage.previewUrl;
        resourcePlan.previewKind = "image";
        resourcePlan.previewMimeType = previewImage.previewMimeType;
      }
    }
    return resourcePlan;
  });

  const existingNames = new Set(
    Object.values(repositoryState?.[expectedResourceType]?.items ?? {})
      .filter((item) => item?.type === itemType)
      .map((item) => item.name?.trim().toLocaleLowerCase()),
  );
  const warnings = resources
    .filter((resource) =>
      existingNames.has(resource.name.trim().toLocaleLowerCase()),
    )
    .map((resource) => ({
      code: "name_conflict",
      resourceId: resource.sourceId,
      message: `A ${itemType} named '${resource.name}' already exists. A new copy will be created.`,
    }));

  return deepFreeze({
    planId,
    schema: manifest.schema,
    manifestUrl,
    projectId,
    repositoryRevision,
    expectedResourceType,
    package: structuredClone(manifest.package),
    destinationFolders,
    primarySourceId: manifest.primary?.id ?? selectedItems[0].id,
    resources,
    images,
    tags,
    files,
    warnings,
    unsupportedResourceTypes: Object.keys(manifest.repository).filter(
      (key) => !["files", "images", "tags", expectedResourceType].includes(key),
    ),
    knownDownloadBytes,
    hasUnknownDownloadSize,
  });
};

export const rewriteResourceImportPlanReferences = ({
  plan,
  resourceChoices = {},
  resourceNames = {},
  resourceDescriptions = {},
  fileIdMap = new Map(),
} = {}) => {
  const imageIds = new Map(
    plan.images.map((image) => {
      const choice = resourceChoices[image.sourceId] ?? image.choice;
      return [
        image.destinationId,
        choice.mode === "existing"
          ? choice.projectResourceId
          : image.destinationId,
      ];
    }),
  );

  return plan.resources.map((resource) => {
    const data = rewriteReferences(resource.data, {
      imageIds,
      transformIds: new Map(),
      fileIds: fileIdMap,
    });
    if (resourceNames[resource.sourceId] !== undefined) {
      data.name = resourceNames[resource.sourceId].trim();
    }
    if (resourceDescriptions[resource.sourceId] !== undefined) {
      data.description = resourceDescriptions[resource.sourceId].trim();
    }
    return { ...resource, data };
  });
};
