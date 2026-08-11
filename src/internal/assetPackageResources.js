const configs = [
  {
    resourceType: "images",
    itemType: "image",
    commandType: "image.create",
    idField: "imageId",
    previewFileFields: ["thumbnailFileId", "fileId"],
    importPriority: 10,
  },
  {
    resourceType: "sounds",
    itemType: "sound",
    commandType: "sound.create",
    idField: "soundId",
    previewFileFields: ["previewMediaFileId"],
    importPriority: 20,
  },
  {
    resourceType: "videos",
    itemType: "video",
    commandType: "video.create",
    idField: "videoId",
    previewFileFields: ["thumbnailFileId", "fileId"],
    importPriority: 30,
  },
  {
    resourceType: "characters",
    itemType: "character",
    commandType: "character.create",
    idField: "characterId",
    previewFileFields: ["fileId"],
    importPriority: 120,
  },
  {
    resourceType: "transforms",
    itemType: "transform",
    commandType: "transform.create",
    idField: "transformId",
    previewFileFields: ["thumbnailFileId", "previewFileId"],
    importPriority: 80,
  },
  {
    resourceType: "animations",
    itemType: "animation",
    commandType: "animation.create",
    idField: "animationId",
    previewFileFields: [
      "thumbnailMediaFileId",
      "previewMediaFileId",
      "thumbnailFileId",
    ],
    importPriority: 90,
  },
  {
    resourceType: "particles",
    itemType: "particle",
    commandType: "particle.create",
    idField: "particleId",
    previewFileFields: [
      "thumbnailMediaFileId",
      "previewMediaFileId",
      "thumbnailFileId",
    ],
    importPriority: 100,
  },
  {
    resourceType: "spritesheets",
    itemType: "spritesheet",
    commandType: "spritesheet.create",
    idField: "spritesheetId",
    previewFileFields: [
      "thumbnailMediaFileId",
      "previewMediaFileId",
      "thumbnailFileId",
      "fileId",
    ],
    importPriority: 40,
  },
  {
    resourceType: "colors",
    itemType: "color",
    commandType: "color.create",
    idField: "colorId",
    previewFileFields: [],
    importPriority: 50,
  },
  {
    resourceType: "fonts",
    itemType: "font",
    commandType: "font.create",
    idField: "fontId",
    previewFileFields: ["previewMediaFileId", "fileId"],
    importPriority: 60,
  },
  {
    resourceType: "textStyles",
    itemType: "textStyle",
    commandType: "textStyle.create",
    idField: "textStyleId",
    previewFileFields: ["previewMediaFileId"],
    importPriority: 110,
  },
  {
    resourceType: "layouts",
    itemType: "layout",
    commandType: "layout.create",
    idField: "layoutId",
    previewFileFields: ["thumbnailFileId"],
    importPriority: 130,
  },
  {
    resourceType: "variables",
    itemType: "variable",
    commandType: "variable.create",
    idField: "variableId",
    previewFileFields: [],
    importPriority: 70,
  },
  {
    resourceType: "controls",
    itemType: "control",
    commandType: "control.create",
    idField: "controlId",
    previewFileFields: ["thumbnailFileId"],
    importPriority: 140,
  },
];

export const ASSET_PACKAGE_RESOURCE_CONFIGS = Object.freeze(
  configs.map((config) => Object.freeze(config)),
);

export const ASSET_PACKAGE_RESOURCE_TYPES = Object.freeze(
  ASSET_PACKAGE_RESOURCE_CONFIGS.map(({ resourceType }) => resourceType),
);

export const ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE = Object.freeze(
  Object.fromEntries(
    ASSET_PACKAGE_RESOURCE_CONFIGS.map((config) => [
      config.resourceType,
      config,
    ]),
  ),
);

export const ASSET_PACKAGE_SCHEMA_VERSION = 1;
export const ASSET_PACKAGE_KIND = "routevn.creator.asset-package";

export const EMPTY_ASSET_PACKAGE_METADATA = Object.freeze({
  id: "",
  name: "",
  version: "",
  description: "",
});

const FILE_REFERENCE_FIELDS = new Set([
  "fileId",
  "fileIds",
  "thumbnailFileId",
  "previewFileId",
  "waveformDataFileId",
]);
const RESOURCE_REFERENCE_FIELDS = new Set([
  "animationId",
  "animationIds",
  "backgroundImageId",
  "barImageId",
  "bgmId",
  "characterId",
  "clickImageId",
  "clickSoundId",
  "clickTextStyleId",
  "colorId",
  "colorIds",
  "controlId",
  "fontId",
  "fontIds",
  "fragmentLayoutId",
  "hoverBarImageId",
  "hoverImageId",
  "hoverSoundId",
  "hoverTextStyleId",
  "hoverThumbImageId",
  "imageId",
  "imageIds",
  "incomingImageId",
  "layoutId",
  "layoutIds",
  "nameVariableId",
  "outgoingImageId",
  "paginationVariableId",
  "particleId",
  "resourceId",
  "revealSoundId",
  "rightClickSoundId",
  "soundId",
  "soundIds",
  "spritesheetId",
  "sfxId",
  "strokeColorId",
  "target",
  "targetImageId",
  "textStyleId",
  "texture",
  "textures",
  "thumbImageId",
  "transformId",
  "variableId",
  "videoId",
  "videoIds",
]);
const OPAQUE_REFERENCE_VALUE_FIELDS = new Set([
  "enumValues",
  "examples",
  "value",
]);

const isOpaqueReferenceValue = (fieldName, value) => {
  if (OPAQUE_REFERENCE_VALUE_FIELDS.has(fieldName)) {
    return true;
  }
  if (fieldName !== "default") {
    return false;
  }
  return !value || typeof value !== "object" || !Object.hasOwn(value, "expr");
};

const parseVariableReferencePath = (value) => {
  const dotMatch = value.match(/^variables\.([A-Za-z_$][A-Za-z0-9_$]*)(.*)$/);
  if (dotMatch) {
    return {
      resourceId: dotMatch[1],
      format: (resourceId) =>
        `variables[${JSON.stringify(resourceId)}]${dotMatch[2]}`,
    };
  }

  const bracketMatch = value.match(/^variables\[("(?:\\.|[^"\\])*")\](.*)$/);
  if (!bracketMatch) {
    return undefined;
  }
  try {
    const resourceId = JSON.parse(bracketMatch[1]);
    return {
      resourceId,
      format: (nextResourceId) =>
        `variables[${JSON.stringify(nextResourceId)}]${bracketMatch[2]}`,
    };
  } catch {
    return undefined;
  }
};

const getAssetPackageReference = (fieldName, value) => {
  if (fieldName === "var" || fieldName === "target") {
    const variableReference = parseVariableReferencePath(value);
    if (variableReference) {
      return { kind: "resource", required: true, ...variableReference };
    }
    if (fieldName === "var") {
      return undefined;
    }
  }
  const kind = getAssetPackageReferenceKind(fieldName);
  return kind
    ? {
        kind,
        required: !["target", "texture", "textures"].includes(fieldName),
        resourceId: value,
        format: (resourceId) => resourceId,
      }
    : undefined;
};

export const getAssetPackageReferenceKind = (fieldName) => {
  if (FILE_REFERENCE_FIELDS.has(fieldName)) {
    return "file";
  }
  if (RESOURCE_REFERENCE_FIELDS.has(fieldName)) {
    return "resource";
  }
  return undefined;
};

export const visitAssetPackageReferences = (value, visitor, fieldName) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitAssetPackageReferences(item, visitor, fieldName);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") {
      return;
    }
    const reference = getAssetPackageReference(fieldName, value);
    if (reference) {
      visitor({
        fieldName,
        kind: reference.kind,
        required: reference.required,
        value: reference.resourceId,
      });
    }
    return;
  }
  for (const [childFieldName, item] of Object.entries(value)) {
    if (isOpaqueReferenceValue(childFieldName, item)) {
      continue;
    }
    visitAssetPackageReferences(item, visitor, childFieldName);
  }
};

export const mapAssetPackageReferences = (value, mapper, fieldName) => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      mapAssetPackageReferences(item, mapper, fieldName),
    );
  }
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") {
      return value;
    }
    const reference = getAssetPackageReference(fieldName, value);
    if (!reference) {
      return value;
    }
    return reference.format(
      mapper({
        fieldName,
        kind: reference.kind,
        required: reference.required,
        value: reference.resourceId,
      }),
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([childFieldName, item]) => [
      childFieldName,
      isOpaqueReferenceValue(childFieldName, item)
        ? item
        : mapAssetPackageReferences(item, mapper, childFieldName),
    ]),
  );
};

const ASSET_PACKAGE_KEYS = new Set(["schemaVersion", "metadata", "resources"]);
const ASSET_PACKAGE_METADATA_KEYS = new Set([
  "id",
  "name",
  "version",
  "description",
]);
const ASSET_PACKAGE_RESOURCE_KEYS = new Set(["resourceType", "folderIds"]);

export class AssetPackageValidationError extends Error {
  constructor(message, { path } = {}) {
    super(message);
    this.name = "AssetPackageValidationError";
    this.code = "invalid_asset_package";
    this.path = path;
  }
}

const failAssetPackageValidation = (message, path) => {
  throw new AssetPackageValidationError(message, { path });
};

const isPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const assertAllowedKeys = (value, allowedKeys, path) => {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      failAssetPackageValidation(
        `${path}.${key} is not supported.`,
        `${path}.${key}`,
      );
    }
  }
};

export const assertValidAssetPackage = (assetPackage) => {
  if (!isPlainObject(assetPackage)) {
    failAssetPackageValidation(
      "assetPackage must be an object.",
      "assetPackage",
    );
  }
  assertAllowedKeys(assetPackage, ASSET_PACKAGE_KEYS, "assetPackage");

  if (assetPackage.schemaVersion !== ASSET_PACKAGE_SCHEMA_VERSION) {
    failAssetPackageValidation(
      `assetPackage.schemaVersion must be ${ASSET_PACKAGE_SCHEMA_VERSION}.`,
      "assetPackage.schemaVersion",
    );
  }
  if (!Array.isArray(assetPackage.resources)) {
    failAssetPackageValidation(
      "assetPackage.resources must be an array.",
      "assetPackage.resources",
    );
  }
  if (assetPackage.metadata !== undefined) {
    if (!isPlainObject(assetPackage.metadata)) {
      failAssetPackageValidation(
        "assetPackage.metadata must be an object.",
        "assetPackage.metadata",
      );
    }
    assertAllowedKeys(
      assetPackage.metadata,
      ASSET_PACKAGE_METADATA_KEYS,
      "assetPackage.metadata",
    );
    for (const key of ASSET_PACKAGE_METADATA_KEYS) {
      if (typeof assetPackage.metadata[key] !== "string") {
        failAssetPackageValidation(
          `assetPackage.metadata.${key} must be text.`,
          `assetPackage.metadata.${key}`,
        );
      }
    }
  }

  const seenResourceTypes = new Set();
  for (const [index, resource] of assetPackage.resources.entries()) {
    const path = `assetPackage.resources[${index}]`;
    if (!isPlainObject(resource)) {
      failAssetPackageValidation(`${path} must be an object.`, path);
    }
    assertAllowedKeys(resource, ASSET_PACKAGE_RESOURCE_KEYS, path);

    const { resourceType, folderIds } = resource;
    if (!ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE[resourceType]) {
      failAssetPackageValidation(
        `${path}.resourceType is not supported.`,
        `${path}.resourceType`,
      );
    }
    if (seenResourceTypes.has(resourceType)) {
      failAssetPackageValidation(
        `${path}.resourceType must be unique.`,
        `${path}.resourceType`,
      );
    }
    seenResourceTypes.add(resourceType);

    if (!Array.isArray(folderIds) || folderIds.length === 0) {
      failAssetPackageValidation(
        `${path}.folderIds must be a non-empty array.`,
        `${path}.folderIds`,
      );
    }

    const seenFolderIds = new Set();
    for (const [folderIndex, folderId] of folderIds.entries()) {
      const folderPath = `${path}.folderIds[${folderIndex}]`;
      if (typeof folderId !== "string" || folderId.trim().length === 0) {
        failAssetPackageValidation(
          `${folderPath} must be a non-empty string.`,
          folderPath,
        );
      }
      if (seenFolderIds.has(folderId)) {
        failAssetPackageValidation(
          `${folderPath} must be unique within its resource type.`,
          folderPath,
        );
      }
      seenFolderIds.add(folderId);
    }
  }

  return assetPackage;
};

export const cloneValidAssetPackage = (assetPackage) => {
  assertValidAssetPackage(assetPackage);
  return structuredClone(assetPackage);
};

export const normalizeAssetPackage = (assetPackage) => {
  const resources = [];
  const seenResourceTypes = new Set();
  const sourceResources = Array.isArray(assetPackage?.resources)
    ? assetPackage.resources
    : [];

  for (const sourceResource of sourceResources) {
    const resourceType = sourceResource?.resourceType;
    if (
      !ASSET_PACKAGE_RESOURCE_CONFIG_BY_TYPE[resourceType] ||
      seenResourceTypes.has(resourceType)
    ) {
      continue;
    }

    const folderIds = [
      ...new Set(
        (Array.isArray(sourceResource.folderIds)
          ? sourceResource.folderIds
          : []
        ).filter((folderId) => typeof folderId === "string" && folderId),
      ),
    ];
    if (folderIds.length === 0) {
      continue;
    }

    seenResourceTypes.add(resourceType);
    resources.push({ resourceType, folderIds });
  }

  return {
    schemaVersion: ASSET_PACKAGE_SCHEMA_VERSION,
    metadata: {
      id: assetPackage?.metadata?.id ?? "",
      name: assetPackage?.metadata?.name ?? "",
      version: assetPackage?.metadata?.version ?? "",
      description: assetPackage?.metadata?.description ?? "",
    },
    resources,
  };
};

export const ASSET_PACKAGE_IMPORT_CONFIGS = Object.freeze(
  [...ASSET_PACKAGE_RESOURCE_CONFIGS].sort(
    (left, right) => left.importPriority - right.importPriority,
  ),
);
