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
    previewFileFields: ["thumbnailFileId", "previewMediaFileId"],
    importPriority: 90,
  },
  {
    resourceType: "particles",
    itemType: "particle",
    commandType: "particle.create",
    idField: "particleId",
    previewFileFields: ["previewMediaFileId", "thumbnailFileId"],
    importPriority: 100,
  },
  {
    resourceType: "spritesheets",
    itemType: "spritesheet",
    commandType: "spritesheet.create",
    idField: "spritesheetId",
    previewFileFields: ["previewMediaFileId", "thumbnailFileId", "fileId"],
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

const ASSET_PACKAGE_KEYS = new Set(["schemaVersion", "resources"]);
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
    resources,
  };
};

export const ASSET_PACKAGE_IMPORT_CONFIGS = Object.freeze(
  [...ASSET_PACKAGE_RESOURCE_CONFIGS].sort(
    (left, right) => left.importPriority - right.importPriority,
  ),
);
