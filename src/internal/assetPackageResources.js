import { DIALOGUE_CHARACTER_ID_CONDITION_TARGET } from "./layoutConditions.js";

const configs = [
  {
    resourceType: "images",
    itemType: "image",
    commandType: "image.create",
    idField: "imageId",
    previewFileFields: ["thumbnailFileId", "fileId"],
    largePreviewFileFields: ["fileId", "thumbnailFileId"],
    importPriority: 10,
  },
  {
    resourceType: "sounds",
    itemType: "sound",
    commandType: "sound.create",
    idField: "soundId",
    previewFileFields: ["previewMediaFileId"],
    largePreviewFileFields: ["fileId", "previewMediaFileId"],
    importPriority: 20,
  },
  {
    resourceType: "videos",
    itemType: "video",
    commandType: "video.create",
    idField: "videoId",
    previewFileFields: ["thumbnailFileId", "fileId"],
    largePreviewFileFields: ["fileId", "thumbnailFileId"],
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
    largePreviewFileFields: ["previewFileId", "thumbnailFileId"],
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
    largePreviewFileFields: [
      "previewMediaFileId",
      "thumbnailMediaFileId",
      "thumbnailFileId",
    ],
    importPriority: 90,
  },
  {
    resourceType: "audioEffects",
    itemType: "audioEffect",
    commandType: "audioEffect.create",
    idField: "audioEffectId",
    previewFileFields: [],
    importPriority: 95,
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
    largePreviewFileFields: [
      "previewMediaFileId",
      "thumbnailMediaFileId",
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
    largePreviewFileFields: [
      "previewMediaFileId",
      "thumbnailMediaFileId",
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
    largePreviewFileFields: ["previewMediaFileId", "thumbnailFileId"],
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

// Resource types the asset store does not take for now: the store does not
// offer them and an asset pack cannot add them.
export const ASSET_STORE_HIDDEN_RESOURCE_TYPES = Object.freeze([
  "audioEffects",
  "controls",
]);

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
  "audioEffectId",
  "audioEffectIds",
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
const PROJECT_REFERENCE_FIELDS = new Set([
  "lineId",
  "lineIds",
  "sceneId",
  "sceneIds",
  "sectionId",
  "sectionIds",
]);
const ASSET_PACKAGE_FILE_MIME_TYPES_BY_KIND = Object.freeze({
  audio: new Set([
    "audio/mpeg",
    "audio/x-mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "audio/wave",
    "audio/ogg",
  ]),
  font: new Set(["font/ttf", "font/otf", "font/woff2"]),
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  json: new Set(["application/json", "text/json"]),
  video: new Set(["video/mp4"]),
});
const OPAQUE_REFERENCE_VALUE_FIELDS = new Set(["enumValues", "value"]);

// A character's sprites, picked as `{ id, resourceId }` per sprite group: a
// transform preview's `sprites`, and the avatar `sprite.items` of a layout
// preview's dialogue. The ids are the character's own, which it keeps when
// imported, so they are not references of the project.
const isCharacterSpritePicks = (fieldName, value, holderFieldName) =>
  Array.isArray(value) &&
  (fieldName === "sprites" ||
    (fieldName === "items" && holderFieldName === "sprite"));

// `holderFieldName` is the field that holds the object `fieldName` is in.
const isOpaqueReferenceValue = (fieldName, value, holderFieldName) => {
  if (OPAQUE_REFERENCE_VALUE_FIELDS.has(fieldName)) {
    return true;
  }
  // A computed variable's example values for runtime fields.
  if (fieldName === "runtime" && holderFieldName === "input") {
    return true;
  }
  if (isCharacterSpritePicks(fieldName, value, holderFieldName)) {
    return true;
  }
  if (fieldName !== "default") {
    return false;
  }
  return !value || typeof value !== "object" || !Object.hasOwn(value, "expr");
};

// Values by variable id, which are only data: a computed variable's example
// inputs (`examples[].input.variables`) and a layout preview's variable
// values (`preview.variables`). Each key names a variable.
const isVariableValueMap = (fieldName, holderFieldName) =>
  fieldName === "variables" &&
  (holderFieldName === "input" || holderFieldName === "preview");

// Fields that name a resource only in some objects: the character a
// condition on the speaking character compares with, and each image a
// particle texture picks between (`texture: { items: [{ src }] }`). Like a
// `texture`, what they name need not exist.
const isOptionalResourceField = ({
  holder,
  fieldName,
  holderFieldName,
  holderParentFieldName,
}) =>
  (fieldName === "value" &&
    holder.target === DIALOGUE_CHARACTER_ID_CONDITION_TARGET) ||
  (fieldName === "src" &&
    holderFieldName === "items" &&
    holderParentFieldName === "texture");

const VARIABLE_PATH_ID = "[A-Za-z0-9_$]+";

const parseVariableReferencePath = (value) => {
  // An id that is not a name, such as one that starts with a digit, may
  // follow the dot too.
  const dotMatch = value.match(
    new RegExp(`^variables\\.(${VARIABLE_PATH_ID})(.*)$`),
  );
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

const QUOTED_TEXT = String.raw`"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'`;
// In an element's `$when` expression: quoted text, which names nothing; a
// variable path; or the speaking character compared with a quoted id.
const WHEN_REFERENCE_PATTERN = new RegExp(
  String.raw`${QUOTED_TEXT}|variables(?:\.(${VARIABLE_PATH_ID})|\[\s*(${QUOTED_TEXT})\s*\])|dialogue\.characterId\s*[!=]==?\s*(${QUOTED_TEXT})`,
  "g",
);

const parseQuotedText = (text) => {
  if (text.startsWith("'")) {
    return text.slice(1, -1);
  }
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};

// The variables and characters an element's `$when` expression names. Each
// is the part of the expression from `start` to `end`, which `format`
// writes for another id. They need not exist, as the expression is not
// checked.
const findWhenReferences = (expression) => {
  const references = [];
  for (const match of expression.matchAll(WHEN_REFERENCE_PATTERN)) {
    const [text, dotId, quotedId, quotedCharacterId] = match;
    const end = match.index + text.length;
    if (
      text.startsWith('"') ||
      text.startsWith("'") ||
      /[\w$.]/.test(expression[match.index - 1] ?? "")
    ) {
      continue;
    }
    const reference =
      quotedCharacterId === undefined
        ? {
            resourceId: dotId ?? parseQuotedText(quotedId),
            start: match.index,
            format: (resourceId) => `variables[${JSON.stringify(resourceId)}]`,
          }
        : {
            resourceId: parseQuotedText(quotedCharacterId),
            start: end - quotedCharacterId.length,
            format: (resourceId) => JSON.stringify(resourceId),
          };
    if (reference.resourceId) {
      reference.end = end;
      reference.kind = "resource";
      reference.required = false;
      references.push(reference);
    }
  }
  return references;
};

// The references a string field holds, each the part of the string from
// `start` to `end`, which `format` writes for another id.
const getAssetPackageReferences = (fieldName, value) => {
  if (value === "") {
    return [];
  }
  if (fieldName === "$when") {
    return findWhenReferences(value);
  }
  const whole = (reference) => [{ ...reference, start: 0, end: value.length }];
  if (fieldName === "var" || fieldName === "target") {
    const variableReference = parseVariableReferencePath(value);
    if (variableReference) {
      return whole({ kind: "resource", required: true, ...variableReference });
    }
    if (fieldName === "var") {
      return [];
    }
  }
  const kind = getAssetPackageReferenceKind(fieldName);
  return kind
    ? whole({
        kind,
        required: !["target", "texture", "textures"].includes(fieldName),
        resourceId: value,
        format: (resourceId) => resourceId,
      })
    : [];
};

const replaceReferences = (value, references, mapReference) => {
  let mapped = "";
  let end = 0;
  for (const reference of references) {
    mapped +=
      value.slice(end, reference.start) +
      reference.format(mapReference(reference));
    end = reference.end;
  }
  return mapped + value.slice(end);
};

export const getAssetPackageReferenceKind = (fieldName) => {
  if (FILE_REFERENCE_FIELDS.has(fieldName)) {
    return "file";
  }
  if (RESOURCE_REFERENCE_FIELDS.has(fieldName)) {
    return "resource";
  }
  if (PROJECT_REFERENCE_FIELDS.has(fieldName)) {
    return "project";
  }
  return undefined;
};

export const getAssetPackageFileValidationKind = ({
  resourceType,
  fieldName,
} = {}) => {
  if (fieldName === "waveformDataFileId") {
    return resourceType === "sounds" ? "json" : undefined;
  }
  if (fieldName === "thumbnailFileId" || fieldName === "previewFileId") {
    return "image";
  }
  if (fieldName !== "fileId") {
    return undefined;
  }
  if (
    resourceType === "images" ||
    resourceType === "characters" ||
    resourceType === "spritesheets"
  ) {
    return "image";
  }
  if (resourceType === "sounds") {
    return "audio";
  }
  if (resourceType === "videos") {
    return "video";
  }
  if (resourceType === "fonts") {
    return "font";
  }
  return undefined;
};

export const isAssetPackageFileMimeTypeAllowed = ({
  validationKind,
  mimeType,
} = {}) =>
  ASSET_PACKAGE_FILE_MIME_TYPES_BY_KIND[validationKind]?.has(
    mimeType?.trim().toLowerCase(),
  ) === true;

// The visitor also gets `parentFieldName`, the key of the object holding the
// field, such as the action a `resourceId` belongs to.
export const visitAssetPackageReferences = (
  value,
  visitor,
  fieldName,
  parentFieldName,
) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      visitAssetPackageReferences(item, visitor, fieldName, parentFieldName);
    }
    return;
  }
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") {
      return;
    }
    for (const reference of getAssetPackageReferences(fieldName, value)) {
      visitor({
        fieldName,
        parentFieldName,
        kind: reference.kind,
        required: reference.required,
        value: reference.resourceId,
      });
    }
    return;
  }
  if (isVariableValueMap(fieldName, parentFieldName)) {
    for (const variableId of Object.keys(value)) {
      visitor({
        fieldName,
        parentFieldName,
        kind: "resource",
        required: false,
        value: variableId,
      });
    }
    return;
  }
  for (const [childFieldName, item] of Object.entries(value)) {
    if (
      typeof item === "string" &&
      item !== "" &&
      isOptionalResourceField({
        holder: value,
        fieldName: childFieldName,
        holderFieldName: fieldName,
        holderParentFieldName: parentFieldName,
      })
    ) {
      visitor({
        fieldName: childFieldName,
        parentFieldName: fieldName,
        kind: "resource",
        required: false,
        value: item,
      });
      continue;
    }
    if (isOpaqueReferenceValue(childFieldName, item, fieldName)) {
      continue;
    }
    visitAssetPackageReferences(item, visitor, childFieldName, fieldName);
  }
};

export const mapAssetPackageReferences = (
  value,
  mapper,
  fieldName,
  parentFieldName,
) => {
  if (Array.isArray(value)) {
    return value.map((item) =>
      mapAssetPackageReferences(item, mapper, fieldName, parentFieldName),
    );
  }
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") {
      return value;
    }
    return replaceReferences(
      value,
      getAssetPackageReferences(fieldName, value),
      (reference) =>
        mapper({
          fieldName,
          kind: reference.kind,
          required: reference.required,
          value: reference.resourceId,
        }),
    );
  }
  if (isVariableValueMap(fieldName, parentFieldName)) {
    return Object.fromEntries(
      Object.entries(value).map(([variableId, item]) => [
        mapper({
          fieldName,
          kind: "resource",
          required: false,
          value: variableId,
        }),
        item,
      ]),
    );
  }
  return Object.fromEntries(
    Object.entries(value).map(([childFieldName, item]) => {
      if (
        typeof item === "string" &&
        item !== "" &&
        isOptionalResourceField({
          holder: value,
          fieldName: childFieldName,
          holderFieldName: fieldName,
          holderParentFieldName: parentFieldName,
        })
      ) {
        return [
          childFieldName,
          mapper({
            fieldName: childFieldName,
            kind: "resource",
            required: false,
            value: item,
          }),
        ];
      }
      return [
        childFieldName,
        isOpaqueReferenceValue(childFieldName, item, fieldName)
          ? item
          : mapAssetPackageReferences(item, mapper, childFieldName, fieldName),
      ];
    }),
  );
};

// Whether `character` has the sprite `spriteId`, other than a folder.
export const isAssetPackageCharacterSprite = (character, spriteId) => {
  const sprite = character?.sprites?.items?.[spriteId];
  return (
    character?.type === "character" &&
    sprite !== undefined &&
    sprite.type !== "folder"
  );
};

// Keeps the sprites a resource picks of a character that
// `hasSprite(characterId, spriteId)` accepts: those of a transform
// preview's character, and the avatar of the speaker a layout preview's
// dialogue shows. A transform preview left with none shows no character, as
// a character needs one.
export const keepAssetPackageCharacterSprites = (item, hasSprite) => {
  const target = item.preview?.target;
  const dialogue = item.preview?.dialogue;
  const keepSprites = (characterId, sprites) =>
    sprites.filter(({ resourceId }) => hasSprite(characterId, resourceId));
  const hasTargetSprites = Array.isArray(target?.sprites);
  const hasAvatarSprites = Array.isArray(dialogue?.character?.sprite?.items);
  if (!hasTargetSprites && !hasAvatarSprites) {
    return item;
  }
  const data = structuredClone(item);
  if (hasTargetSprites) {
    const sprites = keepSprites(target.characterId, target.sprites);
    if (sprites.length > 0) {
      data.preview.target.sprites = sprites;
    } else {
      delete data.preview.target;
    }
  }
  if (hasAvatarSprites) {
    data.preview.dialogue.character.sprite.items = keepSprites(
      dialogue.characterId,
      dialogue.character.sprite.items,
    );
  }
  return data;
};

// Links: a pack's jumps into the story (to a section or a scene), and its
// actions that open a layout it does not carry, point at an entry of its
// `links` instead, and the importer chooses their own for each. Jumps to a
// line stay unsupported.
const STORY_LINK_KIND_BY_FIELD = Object.freeze({
  sectionId: "section",
  sectionIds: "section",
  sceneId: "scene",
  sceneIds: "scene",
});

export const getAssetPackageStoryLinkKind = (fieldName) =>
  STORY_LINK_KIND_BY_FIELD[fieldName];

// The actions that open a layout, which they name with `resourceId`. Only
// these may point at a layout link.
const LAYOUT_OPEN_ACTIONS = new Set(["pushOverlay", "showConfirmDialog"]);

export const isAssetPackageLayoutOpenReference = ({
  fieldName,
  parentFieldName,
}) => fieldName === "resourceId" && LAYOUT_OPEN_ACTIONS.has(parentFieldName);

const isLinkField = (fieldName, parentFieldName) =>
  Boolean(getAssetPackageStoryLinkKind(fieldName)) ||
  isAssetPackageLayoutOpenReference({ fieldName, parentFieldName });

const UNSET_LINK = Symbol("unset link");

const mapLinksInner = (value, resolve, fieldName, parentFieldName, isRoot) => {
  if (Array.isArray(value)) {
    return value
      .map((item) =>
        mapLinksInner(item, resolve, fieldName, parentFieldName, false),
      )
      .filter((item) => item !== UNSET_LINK);
  }
  if (typeof value === "string") {
    if (value === "" || !isLinkField(fieldName, parentFieldName)) {
      return value;
    }
    return resolve(value, fieldName) || UNSET_LINK;
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const mapped = {};
  for (const [childFieldName, item] of Object.entries(value)) {
    if (
      isOpaqueReferenceValue(childFieldName, item, fieldName) ||
      isVariableValueMap(childFieldName, fieldName)
    ) {
      mapped[childFieldName] = item;
      continue;
    }
    const mappedItem = mapLinksInner(
      item,
      resolve,
      childFieldName,
      fieldName,
      false,
    );
    if (mappedItem === UNSET_LINK) {
      // A jump with no destination goes, with the action that holds it.
      if (typeof item === "string" && !isRoot) {
        return UNSET_LINK;
      }
      continue;
    }
    mapped[childFieldName] = mappedItem;
  }
  return mapped;
};

// Passes each section, scene and opened-layout reference through `resolve`,
// which returns the value to keep or put in its place. One it resolves to
// nothing is removed with the action that holds it: the object around it, or
// its entry in a list.
export const mapAssetPackageLinks = (value, resolve) =>
  mapLinksInner(value, resolve, undefined, undefined, true);

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
    resources,
  };
};

export const ASSET_PACKAGE_IMPORT_CONFIGS = Object.freeze(
  [...ASSET_PACKAGE_RESOURCE_CONFIGS].sort(
    (left, right) => left.importPriority - right.importPriority,
  ),
);
