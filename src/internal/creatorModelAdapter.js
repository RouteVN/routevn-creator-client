import {
  normalizeState as normalizeCreatorModelState,
  processCommand as processCreatorModelCommand,
  replayCommands as replayCreatorModelCommands,
} from "@routevn/creator-model";

class CreatorModelAdapterError extends Error {
  constructor(message) {
    super(message);
    this.name = "CreatorModelAdapterError";
    this.code = "validation_failed";
  }
}

const VALID_RESULT = Object.freeze({
  valid: true,
});

const CHARACTER_SPRITESHEET_CREATE_KEYS = Object.freeze([
  "type",
  "name",
  "description",
  "tagIds",
  "thumbnailFileId",
  "fileId",
  "sheetWidth",
  "sheetHeight",
  "frameCount",
  "width",
  "height",
  "jsonData",
  "animations",
]);

const CHARACTER_IMAGE_CREATE_KEYS = Object.freeze([
  "type",
  "name",
  "description",
  "tagIds",
  "fileId",
  "thumbnailFileId",
  "width",
  "height",
]);

const CHARACTER_FOLDER_CREATE_KEYS = Object.freeze([
  "type",
  "name",
  "description",
]);

const CHARACTER_SPRITESHEET_UPDATE_KEYS = Object.freeze([
  "name",
  "description",
  "tagIds",
  "thumbnailFileId",
  "fileId",
  "sheetWidth",
  "sheetHeight",
  "frameCount",
  "width",
  "height",
  "jsonData",
  "animations",
]);

const CHARACTER_IMAGE_UPDATE_KEYS = Object.freeze([
  "name",
  "description",
  "tagIds",
  "fileId",
  "thumbnailFileId",
  "width",
  "height",
]);

const CHARACTER_FOLDER_UPDATE_KEYS = Object.freeze(["name", "description"]);

const CHARACTER_SPRITESHEET_ONLY_UPDATE_KEYS = Object.freeze([
  "sheetWidth",
  "sheetHeight",
  "frameCount",
  "jsonData",
  "animations",
]);

const CHARACTER_SPRITE_TAG_SCOPE_PREFIX = "characterSprites:";

const CHARACTER_SPRITE_COMMAND_TYPES = Object.freeze({
  CREATE: "character.sprite.create",
  UPDATE: "character.sprite.update",
  DELETE: "character.sprite.delete",
  MOVE: "character.sprite.move",
});

const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isNonEmptyString = (value) =>
  typeof value === "string" && value.length > 0;

const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

const createInvalidResult = (message, details = {}) => ({
  valid: false,
  error: {
    code: "validation_failed",
    message,
    ...(Object.keys(details).length > 0 ? { details } : {}),
  },
});

const hasOwn = (value, key) =>
  Object.prototype.hasOwnProperty.call(value ?? {}, key);

const clone = (value) => structuredClone(value);

const validateAllowedKeys = ({ value, allowedKeys, path }) => {
  if (!isPlainObject(value)) {
    return createInvalidResult(`${path} must be an object`);
  }

  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      return createInvalidResult(`${path}.${key} is not supported`);
    }
  }

  return VALID_RESULT;
};

const validateRequiredKeys = ({ value, keys, path }) => {
  for (const key of keys) {
    if (!hasOwn(value, key)) {
      return createInvalidResult(`${path}.${key} is required`);
    }
  }

  return VALID_RESULT;
};

const validateNonEmptyStringField = ({ value, path, required = false }) => {
  if (value === undefined && !required) {
    return VALID_RESULT;
  }

  if (!isNonEmptyString(value)) {
    return createInvalidResult(`${path} must be a non-empty string`);
  }

  return VALID_RESULT;
};

const validateStringField = ({ value, path }) => {
  if (value !== undefined && typeof value !== "string") {
    return createInvalidResult(`${path} must be a string when provided`);
  }

  return VALID_RESULT;
};

const validateFiniteNumberField = ({ value, path }) => {
  if (value !== undefined && !isFiniteNumber(value)) {
    return createInvalidResult(`${path} must be a finite number when provided`);
  }

  return VALID_RESULT;
};

const validateTagIds = ({ tagIds, path }) => {
  if (tagIds === undefined) {
    return VALID_RESULT;
  }

  if (!Array.isArray(tagIds)) {
    return createInvalidResult(`${path} must be an array when provided`);
  }

  const seen = new Set();
  for (let index = 0; index < tagIds.length; index += 1) {
    const tagId = tagIds[index];
    if (!isNonEmptyString(tagId)) {
      return createInvalidResult(`${path}.${index} must be a non-empty string`);
    }

    if (seen.has(tagId)) {
      return createInvalidResult(`${path} must not contain duplicate ids`);
    }
    seen.add(tagId);
  }

  return VALID_RESULT;
};

const validateSpritesheetAnimationMap = ({ animations, path }) => {
  if (!isPlainObject(animations)) {
    return createInvalidResult(`${path} must be an object`);
  }

  for (const [animationName, animation] of Object.entries(animations)) {
    const animationPath = `${path}.${animationName}`;

    if (!isNonEmptyString(animationName)) {
      return createInvalidResult(
        `${animationPath} must use a non-empty animation name`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: animation,
        allowedKeys: ["frames", "animationSpeed", "fps", "loop"],
        path: animationPath,
      });
      if (result.valid === false) {
        return result;
      }
    }

    if (!Array.isArray(animation.frames)) {
      return createInvalidResult(`${animationPath}.frames must be an array`);
    }

    for (let index = 0; index < animation.frames.length; index += 1) {
      const frame = animation.frames[index];
      if (!Number.isInteger(frame) || frame < 0) {
        return createInvalidResult(
          `${animationPath}.frames.${index} must be an integer greater than or equal to 0`,
        );
      }
    }

    if (
      animation.animationSpeed !== undefined &&
      !isFiniteNumber(animation.animationSpeed)
    ) {
      return createInvalidResult(
        `${animationPath}.animationSpeed must be a finite number when provided`,
      );
    }

    if (
      animation.fps !== undefined &&
      (!isFiniteNumber(animation.fps) || animation.fps <= 0)
    ) {
      return createInvalidResult(
        `${animationPath}.fps must be a positive finite number when provided`,
      );
    }

    if (animation.loop !== undefined && typeof animation.loop !== "boolean") {
      return createInvalidResult(
        `${animationPath}.loop must be a boolean when provided`,
      );
    }
  }

  return VALID_RESULT;
};

const validateFileReferences = ({ state, data, fields, details = {} }) => {
  for (const field of fields) {
    const fileId = data?.[field];
    if (fileId === undefined) {
      continue;
    }

    if (!isPlainObject(state?.files?.items?.[fileId])) {
      return createInvalidResult(
        `payload.data.${field} must reference an existing file`,
        {
          ...details,
          field,
          fileId,
        },
      );
    }
  }

  return VALID_RESULT;
};

const validateTagReferences = ({ state, characterId, tagIds }) => {
  if (tagIds === undefined) {
    return VALID_RESULT;
  }

  const scopeKey = `${CHARACTER_SPRITE_TAG_SCOPE_PREFIX}${characterId}`;
  const tagItems = state?.tags?.[scopeKey]?.items ?? {};
  for (const tagId of tagIds) {
    if (!isPlainObject(tagItems[tagId])) {
      return createInvalidResult("payload.data.tagIds must reference tags", {
        characterId,
        tagId,
      });
    }
  }

  return VALID_RESULT;
};

const validateCharacterSpriteBaseData = ({ data, path }) => {
  {
    const result = validateNonEmptyStringField({
      value: data.name,
      path: `${path}.name`,
      required: true,
    });
    if (result.valid === false) {
      return result;
    }
  }

  return validateStringField({
    value: data.description,
    path: `${path}.description`,
  });
};

const validateCharacterImageData = ({ data, path, requireFileId }) => {
  for (const key of ["width", "height"]) {
    const result = validateFiniteNumberField({
      value: data[key],
      path: `${path}.${key}`,
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateNonEmptyStringField({
      value: data.fileId,
      path: `${path}.fileId`,
      required: requireFileId,
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateNonEmptyStringField({
      value: data.thumbnailFileId,
      path: `${path}.thumbnailFileId`,
    });
    if (result.valid === false) {
      return result;
    }
  }

  return validateTagIds({
    tagIds: data.tagIds,
    path: `${path}.tagIds`,
  });
};

const validateCharacterSpritesheetData = ({
  data,
  path,
  requireFileId,
  requireAtlas,
}) => {
  for (const key of [
    "sheetWidth",
    "sheetHeight",
    "frameCount",
    "width",
    "height",
  ]) {
    const result = validateFiniteNumberField({
      value: data[key],
      path: `${path}.${key}`,
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateNonEmptyStringField({
      value: data.fileId,
      path: `${path}.fileId`,
      required: requireFileId,
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateNonEmptyStringField({
      value: data.thumbnailFileId,
      path: `${path}.thumbnailFileId`,
    });
    if (result.valid === false) {
      return result;
    }
  }

  if (
    (requireAtlas || data.jsonData !== undefined) &&
    !isPlainObject(data.jsonData)
  ) {
    return createInvalidResult(`${path}.jsonData must be an object`);
  }

  if (
    (requireAtlas || data.animations !== undefined) &&
    !isPlainObject(data.animations)
  ) {
    return createInvalidResult(`${path}.animations must be an object`);
  }

  if (data.animations !== undefined) {
    const result = validateSpritesheetAnimationMap({
      animations: data.animations,
      path: `${path}.animations`,
    });
    if (result.valid === false) {
      return result;
    }
  }

  return validateTagIds({
    tagIds: data.tagIds,
    path: `${path}.tagIds`,
  });
};

const validateCharacterSpriteCreateData = ({ data }) => {
  if (!isPlainObject(data)) {
    return createInvalidResult("payload.data must be an object");
  }

  if (!["folder", "image", "spritesheet"].includes(data.type)) {
    return createInvalidResult(
      "payload.data.type must be 'folder', 'image', or 'spritesheet'",
    );
  }

  const allowedKeys =
    data.type === "folder"
      ? CHARACTER_FOLDER_CREATE_KEYS
      : data.type === "image"
        ? CHARACTER_IMAGE_CREATE_KEYS
        : CHARACTER_SPRITESHEET_CREATE_KEYS;

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys,
      path: "payload.data",
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteBaseData({
      data,
      path: "payload.data",
    });
    if (result.valid === false) {
      return result;
    }
  }

  if (data.type === "image") {
    return validateCharacterImageData({
      data,
      path: "payload.data",
      requireFileId: true,
    });
  }

  if (data.type === "spritesheet") {
    return validateCharacterSpritesheetData({
      data,
      path: "payload.data",
      requireFileId: true,
      requireAtlas: true,
    });
  }

  return VALID_RESULT;
};

const validateCharacterSpriteUpdateData = ({ data, currentItem }) => {
  if (!isPlainObject(data)) {
    return createInvalidResult("payload.data must be an object");
  }

  if (Object.keys(data).length === 0) {
    return createInvalidResult(
      "payload.data must include at least one updatable field",
    );
  }

  const allowedKeys =
    currentItem?.type === "folder"
      ? CHARACTER_FOLDER_UPDATE_KEYS
      : currentItem?.type === "image"
        ? CHARACTER_IMAGE_UPDATE_KEYS
        : CHARACTER_SPRITESHEET_UPDATE_KEYS;

  {
    const result = validateAllowedKeys({
      value: data,
      allowedKeys,
      path: "payload.data",
    });
    if (result.valid === false) {
      return result;
    }
  }

  if (data.name !== undefined) {
    const result = validateNonEmptyStringField({
      value: data.name,
      path: "payload.data.name",
      required: true,
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateStringField({
      value: data.description,
      path: "payload.data.description",
    });
    if (result.valid === false) {
      return result;
    }
  }

  if (currentItem?.type === "image") {
    return validateCharacterImageData({
      data,
      path: "payload.data",
      requireFileId: false,
    });
  }

  if (currentItem?.type === "spritesheet") {
    return validateCharacterSpritesheetData({
      data,
      path: "payload.data",
      requireFileId: false,
      requireAtlas: false,
    });
  }

  return VALID_RESULT;
};

const validateCharacterSpriteCreatePayloadShape = ({ payload }) => {
  {
    const result = validateRequiredKeys({
      value: payload,
      keys: ["characterId", "spriteId", "data"],
      path: "payload",
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteCommandCommonPayload({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(payload.spriteId)) {
    return createInvalidResult("payload.spriteId must be a non-empty string");
  }

  {
    const result = validatePlacementFields({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  return validateCharacterSpriteCreateData({
    data: payload.data,
  });
};

const validateCharacterSpritesheetUpdatePayloadShape = ({ payload }) => {
  {
    const result = validateRequiredKeys({
      value: payload,
      keys: ["characterId", "spriteId", "data"],
      path: "payload",
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteCommandCommonPayload({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(payload.spriteId)) {
    return createInvalidResult("payload.spriteId must be a non-empty string");
  }

  if (!isPlainObject(payload.data)) {
    return createInvalidResult("payload.data must be an object");
  }

  if (Object.keys(payload.data).length === 0) {
    return createInvalidResult(
      "payload.data must include at least one updatable field",
    );
  }

  {
    const result = validateAllowedKeys({
      value: payload.data,
      allowedKeys: CHARACTER_SPRITESHEET_UPDATE_KEYS,
      path: "payload.data",
    });
    if (result.valid === false) {
      return result;
    }
  }

  if (payload.data.name !== undefined) {
    const result = validateNonEmptyStringField({
      value: payload.data.name,
      path: "payload.data.name",
      required: true,
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateStringField({
      value: payload.data.description,
      path: "payload.data.description",
    });
    if (result.valid === false) {
      return result;
    }
  }

  return validateCharacterSpritesheetData({
    data: payload.data,
    path: "payload.data",
    requireFileId: false,
    requireAtlas: false,
  });
};

const findTreeNode = ({ nodes, nodeId }) => {
  if (!Array.isArray(nodes)) {
    return undefined;
  }

  for (const node of nodes) {
    if (!isPlainObject(node) || !isNonEmptyString(node.id)) {
      continue;
    }
    if (node.id === nodeId) {
      return node;
    }

    const found = findTreeNode({
      nodes: node.children,
      nodeId,
    });
    if (found) {
      return found;
    }
  }

  return undefined;
};

const findTreeParentId = ({ nodes, nodeId, parentId = null }) => {
  if (!Array.isArray(nodes)) {
    return undefined;
  }

  for (const node of nodes) {
    if (!isPlainObject(node) || !isNonEmptyString(node.id)) {
      continue;
    }
    if (node.id === nodeId) {
      return parentId;
    }

    const found = findTreeParentId({
      nodes: node.children,
      nodeId,
      parentId: node.id,
    });
    if (found !== undefined) {
      return found;
    }
  }

  return undefined;
};

const getTreeSiblings = ({ tree, parentId }) => {
  if (parentId === null || parentId === undefined) {
    return Array.isArray(tree) ? tree : [];
  }

  const parentNode = findTreeNode({
    nodes: tree,
    nodeId: parentId,
  });
  return Array.isArray(parentNode?.children) ? parentNode.children : [];
};

const collectTreeDescendantIds = ({ node, ids = [] }) => {
  if (!isPlainObject(node) || !isNonEmptyString(node.id)) {
    return ids;
  }

  ids.push(node.id);
  for (const child of Array.isArray(node.children) ? node.children : []) {
    collectTreeDescendantIds({ node: child, ids });
  }

  return ids;
};

const removeTreeNode = ({ nodes, nodeId }) => {
  if (!Array.isArray(nodes)) {
    return undefined;
  }

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!isPlainObject(node) || !isNonEmptyString(node.id)) {
      continue;
    }

    if (node.id === nodeId) {
      nodes.splice(index, 1);
      return node;
    }

    const removedNode = removeTreeNode({
      nodes: node.children,
      nodeId,
    });
    if (removedNode) {
      if (Array.isArray(node.children) && node.children.length === 0) {
        delete node.children;
      }
      return removedNode;
    }
  }

  return undefined;
};

const clampInsertIndex = ({ index, length }) => {
  if (!Number.isInteger(index)) {
    return undefined;
  }

  return Math.max(0, Math.min(index, length));
};

const resolveInsertIndex = ({
  siblings,
  index,
  position,
  positionTargetId,
}) => {
  const explicitIndex = clampInsertIndex({
    index,
    length: siblings.length,
  });
  if (explicitIndex !== undefined) {
    return explicitIndex;
  }

  if (position === "first") {
    return 0;
  }

  if (position === "before" && isNonEmptyString(positionTargetId)) {
    const beforeIndex = siblings.findIndex(
      (node) => node?.id === positionTargetId,
    );
    return beforeIndex >= 0 ? beforeIndex : siblings.length;
  }

  if (position === "after" && isNonEmptyString(positionTargetId)) {
    const afterIndex = siblings.findIndex(
      (node) => node?.id === positionTargetId,
    );
    return afterIndex >= 0 ? afterIndex + 1 : siblings.length;
  }

  if (isPlainObject(position)) {
    if (isNonEmptyString(position.before)) {
      const beforeIndex = siblings.findIndex(
        (node) => node?.id === position.before,
      );
      return beforeIndex >= 0 ? beforeIndex : siblings.length;
    }
    if (isNonEmptyString(position.after)) {
      const afterIndex = siblings.findIndex(
        (node) => node?.id === position.after,
      );
      return afterIndex >= 0 ? afterIndex + 1 : siblings.length;
    }
  }

  return siblings.length;
};

const insertTreeNode = ({
  tree,
  node,
  parentId,
  index,
  position,
  positionTargetId,
}) => {
  const siblings = getTreeSiblings({
    tree,
    parentId,
  });
  const insertIndex = resolveInsertIndex({
    siblings,
    index,
    position,
    positionTargetId,
  });

  siblings.splice(insertIndex, 0, node);
};

const filterTreeNodesByItemIds = ({ nodes, removedIds }) => {
  if (!Array.isArray(nodes)) {
    return [];
  }

  const nextNodes = [];
  for (const node of nodes) {
    if (!isPlainObject(node) || !isNonEmptyString(node.id)) {
      continue;
    }

    if (removedIds.has(node.id)) {
      for (const descendantId of collectTreeDescendantIds({ node })) {
        removedIds.add(descendantId);
      }
      continue;
    }

    const nextNode = {
      id: node.id,
    };
    const children = filterTreeNodesByItemIds({
      nodes: node.children,
      removedIds,
    });
    if (children.length > 0) {
      nextNode.children = children;
    }
    nextNodes.push(nextNode);
  }

  return nextNodes;
};

const getCharacterSpriteCollection = ({ state, characterId }) => {
  const character = state?.characters?.items?.[characterId];
  if (!isPlainObject(character) || character.type !== "character") {
    return undefined;
  }

  return character.sprites;
};

const ensureCharacterSpriteCollection = ({ state, characterId }) => {
  const character = state.characters.items[characterId];
  if (!isPlainObject(character.sprites)) {
    character.sprites = {
      items: {},
      tree: [],
    };
  }
  if (!isPlainObject(character.sprites.items)) {
    character.sprites.items = {};
  }
  if (!Array.isArray(character.sprites.tree)) {
    character.sprites.tree = [];
  }

  return character.sprites;
};

const hasCharacterSpritesheetExtensions = ({ state, characterId }) => {
  const collection = getCharacterSpriteCollection({
    state,
    characterId,
  });

  return Object.values(collection?.items ?? {}).some(
    (item) => item?.type === "spritesheet",
  );
};

const hasSpritesheetOnlyUpdateFields = (data) =>
  CHARACTER_SPRITESHEET_ONLY_UPDATE_KEYS.some((key) => hasOwn(data, key));

const getCommandCharacterId = (command) =>
  command?.payload?.characterId ?? undefined;

const isCharacterSpriteCommand = (command) =>
  Object.values(CHARACTER_SPRITE_COMMAND_TYPES).includes(command?.type);

const requiresClientModelCharacterSpriteProjection = ({
  command,
  repositoryState,
}) => {
  if (!isCharacterSpriteCommand(command)) {
    return false;
  }

  const characterId = getCommandCharacterId(command);
  if (
    isNonEmptyString(characterId) &&
    hasCharacterSpritesheetExtensions({
      state: repositoryState,
      characterId,
    })
  ) {
    return true;
  }

  if (
    command.type === CHARACTER_SPRITE_COMMAND_TYPES.CREATE &&
    command.payload?.data?.type === "spritesheet"
  ) {
    return true;
  }

  return (
    command.type === CHARACTER_SPRITE_COMMAND_TYPES.UPDATE &&
    hasSpritesheetOnlyUpdateFields(command.payload?.data)
  );
};

export const isClientModelExtensionCommand = (command) => {
  if (
    command?.type === CHARACTER_SPRITE_COMMAND_TYPES.CREATE &&
    command.payload?.data?.type === "spritesheet"
  ) {
    return true;
  }

  return (
    command?.type === CHARACTER_SPRITE_COMMAND_TYPES.UPDATE &&
    hasSpritesheetOnlyUpdateFields(command.payload?.data)
  );
};

const stripClientModelExtensions = (state) => {
  const nextState = clone(state);
  for (const character of Object.values(nextState?.characters?.items ?? {})) {
    const collection = character?.sprites;
    if (!isPlainObject(collection?.items)) {
      continue;
    }

    const removedIds = new Set(
      Object.entries(collection.items)
        .filter(([, item]) => item?.type === "spritesheet")
        .map(([itemId]) => itemId),
    );
    if (removedIds.size === 0) {
      continue;
    }

    collection.tree = filterTreeNodesByItemIds({
      nodes: collection.tree,
      removedIds,
    });

    for (const itemId of removedIds) {
      delete collection.items[itemId];
    }
  }

  return nextState;
};

const collectClientModelExtensions = (state) => {
  const extensions = [];
  for (const [characterId, character] of Object.entries(
    state?.characters?.items ?? {},
  )) {
    const collection = character?.sprites;
    if (!isPlainObject(collection?.items)) {
      continue;
    }

    for (const [itemId, item] of Object.entries(collection.items)) {
      if (item?.type !== "spritesheet") {
        continue;
      }

      const parentId =
        findTreeParentId({
          nodes: collection.tree,
          nodeId: itemId,
        }) ?? null;
      const siblings = getTreeSiblings({
        tree: collection.tree,
        parentId,
      });
      const index = siblings.findIndex((node) => node?.id === itemId);

      extensions.push({
        characterId,
        itemId,
        item: clone(item),
        parentId,
        index: index >= 0 ? index : undefined,
      });
    }
  }

  return extensions;
};

const collectSpritesReplacementCharacterIds = (commands = []) => {
  const characterIds = new Set();
  for (const command of commands) {
    if (
      command?.type === "character.update" &&
      isNonEmptyString(command.payload?.characterId) &&
      hasOwn(command.payload?.data, "sprites")
    ) {
      characterIds.add(command.payload.characterId);
    }
  }

  return characterIds;
};

const getCharacterIdFromCharacterSpriteTagScope = (scopeKey) => {
  if (
    typeof scopeKey !== "string" ||
    !scopeKey.startsWith(CHARACTER_SPRITE_TAG_SCOPE_PREFIX)
  ) {
    return undefined;
  }

  const characterId = scopeKey.slice(CHARACTER_SPRITE_TAG_SCOPE_PREFIX.length);
  return characterId || undefined;
};

const removeDeletedTagsFromExtensionItem = ({ extension, commands }) => {
  const item = clone(extension.item);
  if (!Array.isArray(item.tagIds) || item.tagIds.length === 0) {
    return item;
  }

  const deletedTagIds = new Set();
  for (const command of commands) {
    if (command?.type !== "tag.delete") {
      continue;
    }

    const scopeCharacterId = getCharacterIdFromCharacterSpriteTagScope(
      command.payload?.scopeKey,
    );
    if (scopeCharacterId !== extension.characterId) {
      continue;
    }

    for (const tagId of command.payload?.tagIds ?? []) {
      deletedTagIds.add(tagId);
    }
  }

  if (deletedTagIds.size === 0) {
    return item;
  }

  item.tagIds = item.tagIds.filter((tagId) => !deletedTagIds.has(tagId));
  if (item.tagIds.length === 0) {
    delete item.tagIds;
  }

  return item;
};

export const validateClientModelStateExtensions = (state) => {
  for (const extension of collectClientModelExtensions(state)) {
    const { characterId, item, itemId, parentId } = extension;
    if (item.id !== undefined && item.id !== itemId) {
      return createInvalidResult(
        `characters.items.${characterId}.sprites.items.${itemId}.id must match item key`,
      );
    }

    {
      const result = validateAllowedKeys({
        value: item,
        allowedKeys: ["id", ...CHARACTER_SPRITESHEET_CREATE_KEYS],
        path: `characters.items.${characterId}.sprites.items.${itemId}`,
      });
      if (result.valid === false) {
        return result;
      }
    }

    {
      const result = validateCharacterSpriteBaseData({
        data: item,
        path: `characters.items.${characterId}.sprites.items.${itemId}`,
      });
      if (result.valid === false) {
        return result;
      }
    }

    {
      const result = validateCharacterSpritesheetData({
        data: item,
        path: `characters.items.${characterId}.sprites.items.${itemId}`,
        requireFileId: true,
        requireAtlas: true,
      });
      if (result.valid === false) {
        return result;
      }
    }

    {
      const result = validateFileReferences({
        state,
        data: item,
        fields: ["fileId", "thumbnailFileId"],
        details: {
          characterId,
          spriteId: itemId,
        },
      });
      if (result.valid === false) {
        return result;
      }
    }

    {
      const result = validateTagReferences({
        state,
        characterId,
        tagIds: item.tagIds,
      });
      if (result.valid === false) {
        return result;
      }
    }

    if (parentId !== null) {
      const parentItem =
        state.characters.items[characterId]?.sprites?.items?.[parentId];
      if (parentItem?.type !== "folder") {
        return createInvalidResult(
          `characters.items.${characterId}.sprites.items.${itemId} parent must be a folder`,
        );
      }
    }
  }

  return VALID_RESULT;
};

const mergeClientModelExtensions = ({
  sourceState,
  targetState,
  commands = [],
} = {}) => {
  const nextState = clone(targetState);
  const skippedCharacterIds = collectSpritesReplacementCharacterIds(commands);

  for (const extension of collectClientModelExtensions(sourceState)) {
    if (skippedCharacterIds.has(extension.characterId)) {
      continue;
    }

    const character = nextState.characters?.items?.[extension.characterId];
    if (!isPlainObject(character) || character.type !== "character") {
      continue;
    }

    const collection = ensureCharacterSpriteCollection({
      state: nextState,
      characterId: extension.characterId,
    });

    if (collection.items[extension.itemId]) {
      continue;
    }

    if (extension.parentId !== null) {
      const parentItem = collection.items[extension.parentId];
      if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
        continue;
      }
    }

    collection.items[extension.itemId] = removeDeletedTagsFromExtensionItem({
      extension,
      commands,
    });
    insertTreeNode({
      tree: collection.tree,
      node: {
        id: extension.itemId,
      },
      parentId: extension.parentId,
      index: extension.index,
      position: "last",
    });
  }

  const extensionResult = validateClientModelStateExtensions(nextState);
  if (extensionResult.valid === false) {
    return extensionResult;
  }

  return {
    valid: true,
    repositoryState: nextState,
  };
};

export const toCreatorModelState = (state) => {
  return normalizeCreatorModelState({
    state: stripClientModelExtensions(state),
  });
};

export const normalizeRepositoryStateWithCreatorModel = (state) => {
  const creatorModelState = toCreatorModelState(state);
  const extendedState = mergeClientModelExtensions({
    sourceState: state,
    targetState: creatorModelState,
  });
  if (extendedState.valid === false) {
    throw new CreatorModelAdapterError(extendedState.error?.message);
  }

  return extendedState.repositoryState;
};

const toCreatorModelCommand = (command) => {
  return clone(command);
};

const toCreatorModelInvalidResult = (error) => {
  const normalizedError = {
    code: error?.code || "validation_failed",
    message: error?.message || "validation failed",
  };

  if (error?.kind) {
    normalizedError.kind = error.kind;
  }

  if (error?.details && typeof error.details === "object") {
    normalizedError.details = error.details;
  }

  if (error) {
    normalizedError.creatorModelError = error;
  }

  return {
    valid: false,
    error: normalizedError,
  };
};

const toCreatorModelResult = (result) => {
  if (result?.valid === false) {
    return toCreatorModelInvalidResult(result.error);
  }

  return result ?? VALID_RESULT;
};

const captureCreatorModelResult = (callback) => {
  try {
    return toCreatorModelResult(callback());
  } catch (error) {
    if (error instanceof CreatorModelAdapterError) {
      return toCreatorModelInvalidResult({
        code: error.code,
        message: error.message,
      });
    }

    throw error;
  }
};

export const commandToCreatorModelCommand = ({ command } = {}) => {
  const normalizedCommand = toCreatorModelCommand(command);

  if (!isPlainObject(normalizedCommand)) {
    throw new CreatorModelAdapterError("command must be an object");
  }

  return normalizedCommand;
};

export const commandsToCreatorModelCommands = ({ commands } = {}) => {
  if (!Array.isArray(commands)) {
    throw new CreatorModelAdapterError("commands must be an array");
  }

  return commands.map((command) =>
    commandToCreatorModelCommand({
      command,
    }),
  );
};

const validateCharacterSpriteCommandCommonPayload = ({ payload }) => {
  if (!isPlainObject(payload)) {
    return createInvalidResult("payload must be an object");
  }

  if (!isNonEmptyString(payload.characterId)) {
    return createInvalidResult(
      "payload.characterId must be a non-empty string",
    );
  }

  return VALID_RESULT;
};

const validatePlacementFields = ({ payload }) => {
  if (
    payload.parentId !== undefined &&
    payload.parentId !== null &&
    !isNonEmptyString(payload.parentId)
  ) {
    return createInvalidResult(
      "payload.parentId must be a non-empty string when provided",
    );
  }

  if (payload.index !== undefined && !Number.isInteger(payload.index)) {
    return createInvalidResult(
      "payload.index must be an integer when provided",
    );
  }

  if (
    payload.positionTargetId !== undefined &&
    !isNonEmptyString(payload.positionTargetId)
  ) {
    return createInvalidResult(
      "payload.positionTargetId must be a non-empty string when provided",
    );
  }

  return VALID_RESULT;
};

const validateCharacterSpritePlacementAgainstState = ({
  collection,
  payload,
}) => {
  const parentId = payload.parentId ?? null;
  if (parentId !== null) {
    const parentItem = collection.items[parentId];
    if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
      return createInvalidResult(
        "payload.parentId must reference a folder sprite item",
      );
    }
  }

  if (payload.positionTargetId !== undefined) {
    if (!isPlainObject(collection.items[payload.positionTargetId])) {
      return createInvalidResult(
        "payload.positionTargetId must reference an existing sprite item",
      );
    }

    const targetParentId =
      findTreeParentId({
        nodes: collection.tree,
        nodeId: payload.positionTargetId,
      }) ?? null;
    if (targetParentId !== parentId) {
      return createInvalidResult(
        "payload.positionTargetId must reference a sibling under payload.parentId",
      );
    }
  }

  return VALID_RESULT;
};

const validateCharacterSpriteCreateCommand = ({ state, payload }) => {
  {
    const result = validateRequiredKeys({
      value: payload,
      keys: ["characterId", "spriteId", "data"],
      path: "payload",
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteCommandCommonPayload({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(payload.spriteId)) {
    return createInvalidResult("payload.spriteId must be a non-empty string");
  }

  {
    const result = validatePlacementFields({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteCreateData({
      data: payload.data,
    });
    if (result.valid === false) {
      return result;
    }
  }

  const collection = getCharacterSpriteCollection({
    state,
    characterId: payload.characterId,
  });
  if (!isPlainObject(collection)) {
    return createInvalidResult(
      "payload.characterId must reference an existing character",
    );
  }

  if (isPlainObject(collection.items?.[payload.spriteId])) {
    return createInvalidResult("payload.spriteId must not already exist");
  }

  {
    const result = validateCharacterSpritePlacementAgainstState({
      collection,
      payload,
    });
    if (result.valid === false) {
      return result;
    }
  }

  if (payload.data.type === "image" || payload.data.type === "spritesheet") {
    {
      const result = validateFileReferences({
        state,
        data: payload.data,
        fields: ["fileId", "thumbnailFileId"],
        details: {
          characterId: payload.characterId,
          spriteId: payload.spriteId,
        },
      });
      if (result.valid === false) {
        return result;
      }
    }

    return validateTagReferences({
      state,
      characterId: payload.characterId,
      tagIds: payload.data.tagIds,
    });
  }

  return VALID_RESULT;
};

const validateCharacterSpriteUpdateCommand = ({ state, payload }) => {
  {
    const result = validateRequiredKeys({
      value: payload,
      keys: ["characterId", "spriteId", "data"],
      path: "payload",
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteCommandCommonPayload({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(payload.spriteId)) {
    return createInvalidResult("payload.spriteId must be a non-empty string");
  }

  const collection = getCharacterSpriteCollection({
    state,
    characterId: payload.characterId,
  });
  if (!isPlainObject(collection)) {
    return createInvalidResult(
      "payload.characterId must reference an existing character",
    );
  }

  const currentItem = collection.items?.[payload.spriteId];
  if (!isPlainObject(currentItem)) {
    return createInvalidResult(
      "payload.spriteId must reference an existing sprite item",
    );
  }

  {
    const result = validateCharacterSpriteUpdateData({
      data: payload.data,
      currentItem,
    });
    if (result.valid === false) {
      return result;
    }
  }

  if (currentItem.type === "image" || currentItem.type === "spritesheet") {
    {
      const result = validateFileReferences({
        state,
        data: payload.data,
        fields: ["fileId", "thumbnailFileId"],
        details: {
          characterId: payload.characterId,
          spriteId: payload.spriteId,
        },
      });
      if (result.valid === false) {
        return result;
      }
    }

    return validateTagReferences({
      state,
      characterId: payload.characterId,
      tagIds: payload.data.tagIds,
    });
  }

  return VALID_RESULT;
};

const validateCharacterSpriteDeleteCommand = ({ state, payload }) => {
  {
    const result = validateRequiredKeys({
      value: payload,
      keys: ["characterId", "spriteIds"],
      path: "payload",
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteCommandCommonPayload({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  if (!Array.isArray(payload.spriteIds) || payload.spriteIds.length === 0) {
    return createInvalidResult("payload.spriteIds must be a non-empty array");
  }

  const seen = new Set();
  for (const spriteId of payload.spriteIds) {
    if (!isNonEmptyString(spriteId)) {
      return createInvalidResult(
        "payload.spriteIds must contain non-empty strings",
      );
    }
    if (seen.has(spriteId)) {
      return createInvalidResult("payload.spriteIds must be unique");
    }
    seen.add(spriteId);
  }

  const collection = getCharacterSpriteCollection({
    state,
    characterId: payload.characterId,
  });
  if (!isPlainObject(collection)) {
    return createInvalidResult(
      "payload.characterId must reference an existing character",
    );
  }

  for (const spriteId of payload.spriteIds) {
    if (!isPlainObject(collection.items?.[spriteId])) {
      return createInvalidResult(
        "payload.spriteIds must reference existing sprite items",
        {
          spriteId,
        },
      );
    }
  }

  return VALID_RESULT;
};

const validateCharacterSpriteMoveCommand = ({ state, payload }) => {
  {
    const result = validateRequiredKeys({
      value: payload,
      keys: ["characterId", "spriteId"],
      path: "payload",
    });
    if (result.valid === false) {
      return result;
    }
  }

  {
    const result = validateCharacterSpriteCommandCommonPayload({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  if (!isNonEmptyString(payload.spriteId)) {
    return createInvalidResult("payload.spriteId must be a non-empty string");
  }

  {
    const result = validatePlacementFields({ payload });
    if (result.valid === false) {
      return result;
    }
  }

  const collection = getCharacterSpriteCollection({
    state,
    characterId: payload.characterId,
  });
  if (!isPlainObject(collection)) {
    return createInvalidResult(
      "payload.characterId must reference an existing character",
    );
  }

  const currentItem = collection.items?.[payload.spriteId];
  if (!isPlainObject(currentItem)) {
    return createInvalidResult(
      "payload.spriteId must reference an existing sprite item",
    );
  }

  const currentNode = findTreeNode({
    nodes: collection.tree,
    nodeId: payload.spriteId,
  });

  if (!currentNode) {
    return createInvalidResult(
      "character sprite move target missing from tree",
    );
  }

  if (payload.parentId !== undefined && payload.parentId !== null) {
    const parentItem = collection.items[payload.parentId];
    if (!isPlainObject(parentItem) || parentItem.type !== "folder") {
      return createInvalidResult(
        "payload.parentId must reference a folder sprite item",
      );
    }

    const descendantIds = new Set(
      collectTreeDescendantIds({
        node: currentNode,
      }),
    );
    if (descendantIds.has(payload.parentId)) {
      return createInvalidResult(
        "payload.parentId must not target the moved sprite item or its descendants",
      );
    }
  }

  if (payload.positionTargetId !== undefined) {
    if (payload.positionTargetId === payload.spriteId) {
      return createInvalidResult(
        "payload.positionTargetId must not reference the moved sprite item",
      );
    }

    const result = validateCharacterSpritePlacementAgainstState({
      collection,
      payload,
    });
    if (result.valid === false) {
      return result;
    }
  }

  return VALID_RESULT;
};

export const validateClientModelExtensionCommand = ({
  command,
  state,
} = {}) => {
  if (!isCharacterSpriteCommand(command)) {
    return VALID_RESULT;
  }

  const payload = command.payload;
  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.CREATE) {
    if (!state && payload?.data?.type !== "spritesheet") {
      return VALID_RESULT;
    }
    if (!state) {
      return validateCharacterSpriteCreatePayloadShape({ payload });
    }
    return validateCharacterSpriteCreateCommand({
      state,
      payload,
    });
  }

  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.UPDATE) {
    if (!state && !hasSpritesheetOnlyUpdateFields(payload?.data)) {
      return VALID_RESULT;
    }
    if (!state) {
      return validateCharacterSpritesheetUpdatePayloadShape({ payload });
    }
    return validateCharacterSpriteUpdateCommand({
      state,
      payload,
    });
  }

  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.DELETE) {
    return state
      ? validateCharacterSpriteDeleteCommand({
          state,
          payload,
        })
      : VALID_RESULT;
  }

  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.MOVE) {
    return state
      ? validateCharacterSpriteMoveCommand({
          state,
          payload,
        })
      : VALID_RESULT;
  }

  return VALID_RESULT;
};

const applyTagIdsUpdate = ({ currentItem, data }) => {
  const nextItem = {
    ...clone(currentItem),
    ...clone(data),
  };

  if (data.tagIds !== undefined && data.tagIds.length === 0) {
    delete nextItem.tagIds;
  }

  return nextItem;
};

const reduceCharacterSpriteCommand = ({ repositoryState, command }) => {
  const state = clone(repositoryState);
  const payload = command.payload;

  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.CREATE) {
    const validationResult = validateCharacterSpriteCreateCommand({
      state,
      payload,
    });
    if (validationResult.valid === false) {
      return validationResult;
    }

    const collection = ensureCharacterSpriteCollection({
      state,
      characterId: payload.characterId,
    });
    const nextSprite = {
      id: payload.spriteId,
      ...clone(payload.data),
    };
    if (payload.data.tagIds !== undefined && payload.data.tagIds.length === 0) {
      delete nextSprite.tagIds;
    }

    collection.items[payload.spriteId] = nextSprite;
    insertTreeNode({
      tree: collection.tree,
      node: {
        id: payload.spriteId,
      },
      parentId: payload.parentId ?? null,
      index: payload.index,
      position: payload.position,
      positionTargetId: payload.positionTargetId,
    });

    return {
      valid: true,
      repositoryState: state,
    };
  }

  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.UPDATE) {
    const validationResult = validateCharacterSpriteUpdateCommand({
      state,
      payload,
    });
    if (validationResult.valid === false) {
      return validationResult;
    }

    const collection = ensureCharacterSpriteCollection({
      state,
      characterId: payload.characterId,
    });
    const currentItem = collection.items[payload.spriteId];
    collection.items[payload.spriteId] = applyTagIdsUpdate({
      currentItem,
      data: payload.data,
    });

    return {
      valid: true,
      repositoryState: state,
    };
  }

  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.DELETE) {
    const validationResult = validateCharacterSpriteDeleteCommand({
      state,
      payload,
    });
    if (validationResult.valid === false) {
      return validationResult;
    }

    const collection = ensureCharacterSpriteCollection({
      state,
      characterId: payload.characterId,
    });
    const deletedIds = new Set();
    for (const spriteId of payload.spriteIds) {
      const removedNode = removeTreeNode({
        nodes: collection.tree,
        nodeId: spriteId,
      });
      if (!removedNode) {
        continue;
      }

      for (const deletedId of collectTreeDescendantIds({ node: removedNode })) {
        deletedIds.add(deletedId);
      }
    }

    for (const spriteId of deletedIds) {
      delete collection.items[spriteId];
    }

    return {
      valid: true,
      repositoryState: state,
    };
  }

  if (command.type === CHARACTER_SPRITE_COMMAND_TYPES.MOVE) {
    const validationResult = validateCharacterSpriteMoveCommand({
      state,
      payload,
    });
    if (validationResult.valid === false) {
      return validationResult;
    }

    const collection = ensureCharacterSpriteCollection({
      state,
      characterId: payload.characterId,
    });
    const removedNode = removeTreeNode({
      nodes: collection.tree,
      nodeId: payload.spriteId,
    });
    if (!removedNode) {
      return createInvalidResult(
        "character sprite move target missing from tree",
      );
    }

    insertTreeNode({
      tree: collection.tree,
      node: removedNode,
      parentId: payload.parentId ?? null,
      index: payload.index,
      position: payload.position,
      positionTargetId: payload.positionTargetId,
    });

    return {
      valid: true,
      repositoryState: state,
    };
  }

  return createInvalidResult(
    `No client model projection handler for command type '${command?.type || "unknown"}'`,
  );
};

export const applyCommandToRepositoryStateWithCreatorModel = ({
  repositoryState,
  command,
} = {}) => {
  return captureCreatorModelResult(() => {
    const creatorModelCommand = commandToCreatorModelCommand({
      command,
    });

    if (
      requiresClientModelCharacterSpriteProjection({
        command,
        repositoryState,
      })
    ) {
      const extensionResult = reduceCharacterSpriteCommand({
        repositoryState,
        command,
      });
      if (extensionResult.valid === false) {
        return extensionResult;
      }

      const validationResult = validateClientModelStateExtensions(
        extensionResult.repositoryState,
      );
      if (validationResult.valid === false) {
        return validationResult;
      }

      return {
        valid: true,
        creatorModelCommand,
        nextCreatorModelState: toCreatorModelState(
          extensionResult.repositoryState,
        ),
        repositoryState: extensionResult.repositoryState,
      };
    }

    const creatorModelState = toCreatorModelState(repositoryState);
    const processResult = toCreatorModelResult(
      processCreatorModelCommand({
        state: creatorModelState,
        command: creatorModelCommand,
      }),
    );
    if (!processResult.valid) {
      return processResult;
    }
    const extendedState = mergeClientModelExtensions({
      sourceState: repositoryState,
      targetState: processResult.state,
      commands: [command],
    });
    if (extendedState.valid === false) {
      return extendedState;
    }

    return {
      valid: true,
      creatorModelCommand,
      nextCreatorModelState: processResult.state,
      repositoryState: extendedState.repositoryState,
    };
  });
};

export const applyCommandsToRepositoryStateWithCreatorModel = ({
  repositoryState,
  commands,
} = {}) => {
  return captureCreatorModelResult(() => {
    const normalizedCommands = Array.isArray(commands) ? commands : [];
    const requiresSequentialProjection = normalizedCommands.some((command) =>
      requiresClientModelCharacterSpriteProjection({
        command,
        repositoryState,
      }),
    );

    if (requiresSequentialProjection) {
      const creatorModelCommands = commandsToCreatorModelCommands({
        commands: normalizedCommands,
      });
      let nextState = repositoryState;
      for (const command of normalizedCommands) {
        const applyResult = applyCommandToRepositoryStateWithCreatorModel({
          repositoryState: nextState,
          command,
        });
        if (applyResult.valid === false) {
          return applyResult;
        }
        nextState = applyResult.repositoryState;
      }

      return {
        valid: true,
        creatorModelCommands,
        nextCreatorModelState: toCreatorModelState(nextState),
        repositoryState: nextState,
      };
    }

    const creatorModelState = toCreatorModelState(repositoryState);
    const creatorModelCommands = commandsToCreatorModelCommands({
      commands: normalizedCommands,
    });
    const replayResult = toCreatorModelResult(
      replayCreatorModelCommands({
        state: creatorModelState,
        commands: creatorModelCommands,
      }),
    );
    if (!replayResult.valid) {
      return replayResult;
    }
    const extendedState = mergeClientModelExtensions({
      sourceState: repositoryState,
      targetState: replayResult.state,
      commands: normalizedCommands,
    });
    if (extendedState.valid === false) {
      return extendedState;
    }

    return {
      valid: true,
      creatorModelCommands,
      nextCreatorModelState: replayResult.state,
      repositoryState: extendedState.repositoryState,
    };
  });
};
