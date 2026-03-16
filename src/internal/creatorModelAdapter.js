import {
  processCommand as processCreatorModelCommand,
  validateAgainstState as validateCreatorModelAgainstState,
  validatePayload as validateCreatorModelPayload,
} from "@routevn/creator-model";
import { DomainValidationError, normalizeCommand } from "./project/commands.js";

const MODEL_COLLECTION_KEYS = [
  "scenes",
  "images",
  "sounds",
  "videos",
  "animations",
  "characters",
  "fonts",
  "transforms",
  "colors",
  "textStyles",
  "variables",
  "layouts",
];

const RESOURCE_TYPE_TO_MODEL_COLLECTION = Object.freeze({
  images: "images",
  sounds: "sounds",
  videos: "videos",
  animations: "animations",
  tweens: "animations",
  characters: "characters",
  fonts: "fonts",
  transforms: "transforms",
  colors: "colors",
  textStyles: "textStyles",
  typography: "textStyles",
  variables: "variables",
  layouts: "layouts",
});

const MODEL_COLLECTION_TO_RESOURCE_TYPE = Object.freeze({
  images: "images",
  sounds: "sounds",
  videos: "videos",
  animations: "animations",
  characters: "characters",
  fonts: "fonts",
  transforms: "transforms",
  colors: "colors",
  textStyles: "textStyles",
  variables: "variables",
  layouts: "layouts",
});

const RESOURCE_TYPE_TO_MODEL_FAMILY = Object.freeze({
  images: "image",
  sounds: "sound",
  videos: "video",
  animations: "animation",
  tweens: "animation",
  characters: "character",
  fonts: "font",
  transforms: "transform",
  colors: "color",
  textStyles: "textStyle",
  typography: "textStyle",
  variables: "variable",
  layouts: "layout",
});

const MODEL_FAMILY_TO_RESOURCE_TYPE = Object.freeze({
  image: "images",
  sound: "sounds",
  video: "videos",
  animation: "tweens",
  character: "characters",
  font: "fonts",
  transform: "transforms",
  color: "colors",
  textStyle: "typography",
  variable: "variables",
  layout: "layouts",
});

const MODEL_FAMILY_TO_ID_FIELD = Object.freeze({
  image: "imageId",
  sound: "soundId",
  video: "videoId",
  animation: "animationId",
  character: "characterId",
  font: "fontId",
  transform: "transformId",
  color: "colorId",
  textStyle: "textStyleId",
  variable: "variableId",
  layout: "layoutId",
});

const VALID_RESULT = Object.freeze({
  valid: true,
});

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
    if (error instanceof DomainValidationError) {
      return toCreatorModelInvalidResult({
        code: error.code,
        message: error.message,
        details: error.details,
      });
    }

    throw error;
  }
};

const MODEL_FAMILY_TO_DELETE_FIELD = Object.freeze({
  image: "imageIds",
  sound: "soundIds",
  video: "videoIds",
  animation: "animationIds",
  character: "characterIds",
  font: "fontIds",
  transform: "transformIds",
  color: "colorIds",
  textStyle: "textStyleIds",
  variable: "variableIds",
  layout: "layoutIds",
});

const MODEL_NATIVE_COMMAND_TYPES = new Set(
  Object.keys(MODEL_FAMILY_TO_ID_FIELD).flatMap((family) => [
    `${family}.create`,
    `${family}.update`,
    `${family}.move`,
    `${family}.delete`,
  ]),
);

const TEXT_STYLE_FIELDS = [
  "name",
  "fontId",
  "colorId",
  "fontSize",
  "lineHeight",
  "fontWeight",
  "previewText",
  "fontStyle",
  "breakWords",
  "align",
  "wordWrap",
  "wordWrapWidth",
  "strokeColorId",
  "strokeAlpha",
  "strokeWidth",
];

const COLOR_FIELDS = ["name", "hex"];
const TRANSFORM_FIELDS = [
  "name",
  "x",
  "y",
  "scaleX",
  "scaleY",
  "anchorX",
  "anchorY",
  "rotation",
];
const CHARACTER_FIELDS = [
  "name",
  "description",
  "shortcut",
  "fileId",
  "fileType",
  "fileSize",
];
const LAYOUT_ELEMENT_FIELDS = [
  "type",
  "name",
  "x",
  "y",
  "width",
  "height",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "opacity",
  "text",
  "style",
  "displaySpeed",
  "imageId",
  "hoverImageId",
  "clickImageId",
  "textStyleId",
  "hoverTextStyleId",
  "clickTextStyleId",
  "direction",
  "gap",
  "containerType",
  "scroll",
  "anchorToBottom",
  "thumbImageId",
  "barImageId",
  "hoverThumbImageId",
  "hoverBarImageId",
  "min",
  "max",
  "step",
  "initialValue",
  "variableId",
  "$when",
  "click",
  "change",
];
const LAYOUT_ELEMENT_STYLE_FIELDS = ["align", "wordWrapWidth"];
const LAYOUT_ELEMENT_NON_STYLE_FIELDS = LAYOUT_ELEMENT_FIELDS.filter(
  (field) => field !== "style",
);

const VARIABLE_TYPE_KEYS = new Set(["string", "number", "boolean"]);

const createEmptyCollection = () => ({
  items: {},
  tree: [],
});

const isPlainObject = (value) =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normalizeTreeNodes = (nodes = []) => {
  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .filter((node) => typeof node?.id === "string" && node.id.length > 0)
    .map((node) => {
      const children = normalizeTreeNodes(node.children || []);
      return children.length > 0 ? { id: node.id, children } : { id: node.id };
    });
};

const flattenTreeIds = (nodes = [], output = []) => {
  if (!Array.isArray(nodes)) {
    return output;
  }

  for (const node of nodes) {
    if (typeof node?.id !== "string" || node.id.length === 0) {
      continue;
    }
    output.push(node.id);
    flattenTreeIds(node.children || [], output);
  }

  return output;
};

const uniqueIdsInOrder = (orderedIds = [], existingIds = []) => {
  const existing = new Set(existingIds);
  const seen = new Set();
  const output = [];

  for (const id of orderedIds) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (!existing.has(id) || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }

  for (const id of existingIds) {
    if (typeof id !== "string" || id.length === 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(id);
  }

  return output;
};

const pickDefined = (source, fields) => {
  const result = {};
  for (const field of fields) {
    if (source?.[field] === undefined) continue;
    result[field] = structuredClone(source[field]);
  }
  return result;
};

const setAliasedField = ({
  source,
  target,
  targetField,
  sourceFields = [],
} = {}) => {
  for (const sourceField of sourceFields) {
    if (source?.[sourceField] === undefined) continue;
    target[targetField] = structuredClone(source[sourceField]);
    return;
  }
};

const normalizeImageData = (data = {}) => {
  const nextData = pickDefined(data, [
    "name",
    "description",
    "fileType",
    "fileSize",
    "width",
    "height",
  ]);
  setAliasedField({
    source: data,
    target: nextData,
    targetField: "fileId",
    sourceFields: ["fileId", "src"],
  });
  setAliasedField({
    source: data,
    target: nextData,
    targetField: "thumbnailFileId",
    sourceFields: ["thumbnailFileId", "thumbnailSrc"],
  });
  return nextData;
};

const toFiniteTimestamp = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
};

const normalizeSoundData = (data = {}) => {
  const nextData = pickDefined(data, [
    "name",
    "description",
    "fileType",
    "fileSize",
    "waveformDataFileId",
    "duration",
  ]);
  setAliasedField({
    source: data,
    target: nextData,
    targetField: "fileId",
    sourceFields: ["fileId", "src"],
  });
  return nextData;
};

const normalizeVideoData = (data = {}) => {
  const nextData = pickDefined(data, [
    "name",
    "description",
    "fileType",
    "fileSize",
    "width",
    "height",
  ]);
  setAliasedField({
    source: data,
    target: nextData,
    targetField: "fileId",
    sourceFields: ["fileId", "src"],
  });
  setAliasedField({
    source: data,
    target: nextData,
    targetField: "thumbnailFileId",
    sourceFields: ["thumbnailFileId", "thumbnailSrc"],
  });
  return nextData;
};

const normalizeFontData = (data = {}) => {
  const nextData = pickDefined(data, [
    "name",
    "fontFamily",
    "fileType",
    "fileSize",
  ]);
  setAliasedField({
    source: data,
    target: nextData,
    targetField: "fileId",
    sourceFields: ["fileId", "src"],
  });
  return nextData;
};

const normalizeCharacterSpriteData = (data = {}) => {
  const nextData = pickDefined(data, [
    "name",
    "description",
    "fileType",
    "fileSize",
    "width",
    "height",
  ]);
  setAliasedField({
    source: data,
    target: nextData,
    targetField: "fileId",
    sourceFields: ["fileId", "src"],
  });
  return nextData;
};

const normalizeLayoutTypeToModel = (layoutType) => {
  if (
    layoutType === "scene" ||
    layoutType === "overlay" ||
    layoutType === "visual"
  ) {
    return "normal";
  }

  return layoutType;
};

const normalizeLayoutElementData = ({
  data = {},
  elementId,
  existingData,
  replace = false,
} = {}) => {
  const nextData = pickDefined(data, LAYOUT_ELEMENT_NON_STYLE_FIELDS);

  if (data.typographyId !== undefined && nextData.textStyleId === undefined) {
    nextData.textStyleId = structuredClone(data.typographyId);
  }

  if (data.textStyle !== undefined && nextData.style === undefined) {
    nextData.style = pickDefined(data.textStyle, LAYOUT_ELEMENT_STYLE_FIELDS);
  }

  if (
    nextData.style !== undefined &&
    Object.keys(nextData.style).length === 0
  ) {
    delete nextData.style;
  }

  if (replace) {
    if (nextData.type === undefined && existingData?.type !== undefined) {
      nextData.type = structuredClone(existingData.type);
    }

    if (nextData.name === undefined) {
      if (existingData?.name !== undefined) {
        nextData.name = structuredClone(existingData.name);
      } else {
        nextData.name = `${nextData.type ?? existingData?.type ?? "element"} ${elementId}`;
      }
    }
  } else if (
    nextData.name === undefined &&
    nextData.type !== undefined &&
    existingData === undefined
  ) {
    nextData.name = `${nextData.type} ${elementId}`;
  }

  return nextData;
};

const normalizeLayoutData = (data = {}) => {
  const nextData = pickDefined(data, ["name"]);

  if (data.layoutType !== undefined) {
    nextData.layoutType = normalizeLayoutTypeToModel(data.layoutType);
  }

  return nextData;
};

const forEachRepositorySection = (repositoryState, callback) => {
  for (const [sceneId, scene] of Object.entries(
    repositoryState?.scenes?.items || {},
  )) {
    for (const [sectionId, section] of Object.entries(
      scene?.sections?.items || {},
    )) {
      callback({
        sceneId,
        scene,
        sectionId,
        section,
      });
    }
  }
};

const findRepositorySection = (repositoryState, sectionId) => {
  let match;
  forEachRepositorySection(repositoryState, (entry) => {
    if (!match && entry.sectionId === sectionId) {
      match = entry;
    }
  });
  return match;
};

const findRepositoryLine = (repositoryState, lineId) => {
  let match;
  forEachRepositorySection(
    repositoryState,
    ({ sceneId, sectionId, section }) => {
      const line = section?.lines?.items?.[lineId];
      if (!match && line) {
        match = {
          sceneId,
          sectionId,
          section,
          line,
        };
      }
    },
  );
  return match;
};

const preserveStoryRepositoryMetadata = ({
  repositoryState,
  nextRepositoryState,
} = {}) => {
  for (const [sceneId, nextScene] of Object.entries(
    nextRepositoryState?.scenes?.items || {},
  )) {
    const previousScene = repositoryState?.scenes?.items?.[sceneId];
    if (!previousScene) {
      continue;
    }

    if (
      nextScene.createdAt === undefined &&
      previousScene.createdAt !== undefined
    ) {
      nextScene.createdAt = previousScene.createdAt;
    }
    if (
      nextScene.updatedAt === undefined &&
      previousScene.updatedAt !== undefined
    ) {
      nextScene.updatedAt = previousScene.updatedAt;
    }

    for (const [sectionId, nextSection] of Object.entries(
      nextScene?.sections?.items || {},
    )) {
      const previousSection =
        previousScene?.sections?.items?.[sectionId] ??
        findRepositorySection(repositoryState, sectionId)?.section;
      if (!previousSection) {
        continue;
      }

      if (
        nextSection.createdAt === undefined &&
        previousSection.createdAt !== undefined
      ) {
        nextSection.createdAt = previousSection.createdAt;
      }
      if (
        nextSection.updatedAt === undefined &&
        previousSection.updatedAt !== undefined
      ) {
        nextSection.updatedAt = previousSection.updatedAt;
      }

      for (const [lineId, nextLine] of Object.entries(
        nextSection?.lines?.items || {},
      )) {
        const previousLine =
          previousSection?.lines?.items?.[lineId] ??
          findRepositoryLine(repositoryState, lineId)?.line;
        if (!previousLine) {
          continue;
        }

        if (
          nextLine.createdAt === undefined &&
          previousLine.createdAt !== undefined
        ) {
          nextLine.createdAt = previousLine.createdAt;
        }
        if (
          nextLine.updatedAt === undefined &&
          previousLine.updatedAt !== undefined
        ) {
          nextLine.updatedAt = previousLine.updatedAt;
        }
      }
    }
  }
};

const sortTreeNodesByCreatedAt = (nodes = [], items = {}) => {
  if (!Array.isArray(nodes)) {
    return;
  }

  nodes.sort((left, right) => {
    const leftCreatedAt = items[left?.id]?.createdAt ?? 0;
    const rightCreatedAt = items[right?.id]?.createdAt ?? 0;

    if (leftCreatedAt !== rightCreatedAt) {
      return leftCreatedAt - rightCreatedAt;
    }

    if (left?.id === right?.id) {
      return 0;
    }

    return left?.id < right?.id ? -1 : 1;
  });

  for (const node of nodes) {
    sortTreeNodesByCreatedAt(node?.children || [], items);
  }
};

const stampStoryRepositoryMetadataForCommand = ({
  repositoryState,
  command,
} = {}) => {
  const normalizedCommand = normalizeCommand(command);
  const payload = normalizedCommand?.payload || {};
  const timestamp = toFiniteTimestamp(
    normalizedCommand?.clientTs,
    repositoryState?.project?.updatedAt ?? 0,
  );

  if (repositoryState?.project) {
    repositoryState.project.updatedAt = timestamp;
  }

  if (
    normalizedCommand?.type === "scene.create" ||
    normalizedCommand?.type === "scene.update" ||
    normalizedCommand?.type === "scene.move"
  ) {
    const scene = repositoryState?.scenes?.items?.[payload.sceneId];
    if (scene) {
      scene.createdAt ??= timestamp;
      scene.updatedAt = timestamp;
    }
    if (normalizedCommand?.type === "scene.create") {
      sortTreeNodesByCreatedAt(
        repositoryState?.scenes?.tree,
        repositoryState?.scenes?.items || {},
      );
    }
    return;
  }

  if (
    normalizedCommand?.type === "section.create" ||
    normalizedCommand?.type === "section.update" ||
    normalizedCommand?.type === "section.move"
  ) {
    const sectionEntry = findRepositorySection(
      repositoryState,
      payload.sectionId,
    );
    if (sectionEntry?.section) {
      sectionEntry.section.createdAt ??= timestamp;
      sectionEntry.section.updatedAt = timestamp;
    }
    if (normalizedCommand?.type === "section.create") {
      const scene = repositoryState?.scenes?.items?.[payload.sceneId];
      sortTreeNodesByCreatedAt(
        scene?.sections?.tree,
        scene?.sections?.items || {},
      );
    }
    return;
  }

  if (normalizedCommand?.type === "line.create") {
    for (const lineEntry of payload.lines || []) {
      const nextLine = findRepositoryLine(
        repositoryState,
        lineEntry?.lineId,
      )?.line;
      if (!nextLine) {
        continue;
      }
      nextLine.createdAt ??= timestamp;
      nextLine.updatedAt = timestamp;
    }
    const sectionEntry = findRepositorySection(
      repositoryState,
      payload.sectionId,
    );
    sortTreeNodesByCreatedAt(
      sectionEntry?.section?.lines?.tree,
      sectionEntry?.section?.lines?.items || {},
    );
    return;
  }

  if (
    normalizedCommand?.type === "line.update_actions" ||
    normalizedCommand?.type === "line.move"
  ) {
    const line = findRepositoryLine(repositoryState, payload.lineId)?.line;
    if (line) {
      line.createdAt ??= timestamp;
      line.updatedAt = timestamp;
    }
  }
};

const mapVariableScopeToModel = (scope) => {
  if (scope === "global") {
    return "global-device";
  }
  if (typeof scope === "string" && scope.length > 0) {
    return scope;
  }
  return "context";
};

const normalizeLegacyVariableType = (item = {}) => {
  const type = item.variableType ?? item.type;
  if (VARIABLE_TYPE_KEYS.has(type)) {
    return type;
  }
  if (item.type === "folder") {
    return "folder";
  }
  return type;
};

const toModelCollectionItem = ({ collectionKey, item = {}, itemId }) => {
  if (item?.type === "folder") {
    if (collectionKey === "images") {
      return {
        id: itemId,
        type: "folder",
        name: item.name ?? `Folder ${itemId}`,
        ...pickDefined(item, ["description"]),
      };
    }

    if (collectionKey === "sounds" || collectionKey === "videos") {
      return {
        id: itemId,
        type: "folder",
        name: item.name ?? `Folder ${itemId}`,
        ...pickDefined(item, ["description"]),
      };
    }

    return {
      id: itemId,
      type: "folder",
      name: item.name ?? `Folder ${itemId}`,
    };
  }

  if (collectionKey === "images") {
    return {
      id: itemId,
      type: "image",
      ...normalizeImageData(item),
    };
  }

  if (collectionKey === "sounds") {
    return {
      id: itemId,
      type: "sound",
      ...normalizeSoundData(item),
    };
  }

  if (collectionKey === "videos") {
    return {
      id: itemId,
      type: "video",
      ...normalizeVideoData(item),
    };
  }

  if (collectionKey === "animations") {
    return {
      id: itemId,
      type: "animation",
      name: item?.name ?? `Animation ${itemId}`,
      animation: structuredClone(
        item?.animation ?? {
          type: "live",
          tween: structuredClone(item?.properties || {}),
        },
      ),
    };
  }

  if (collectionKey === "fonts") {
    return {
      id: itemId,
      type: "font",
      ...normalizeFontData(item),
    };
  }

  if (collectionKey === "colors") {
    return {
      id: itemId,
      type: "color",
      ...pickDefined(item, COLOR_FIELDS),
    };
  }

  if (collectionKey === "transforms") {
    return {
      id: itemId,
      type: "transform",
      ...pickDefined(item, TRANSFORM_FIELDS),
    };
  }

  if (collectionKey === "variables") {
    const defaultValue = structuredClone(item?.default);
    return {
      id: itemId,
      type: normalizeLegacyVariableType(item),
      name: item?.name ?? `Variable ${itemId}`,
      scope: mapVariableScopeToModel(item?.scope),
      default: defaultValue,
      value: structuredClone(item?.value ?? item?.default),
    };
  }

  if (collectionKey === "textStyles") {
    return {
      id: itemId,
      type: "textStyle",
      ...pickDefined(item, TEXT_STYLE_FIELDS),
    };
  }

  if (collectionKey === "characters") {
    return {
      id: itemId,
      type: "character",
      ...pickDefined(item, CHARACTER_FIELDS),
      sprites: repositoryNestedCollectionToCreatorModelCollection({
        collectionKey: "characterSprites",
        collection: item?.sprites,
      }),
    };
  }

  if (collectionKey === "layouts") {
    return {
      id: itemId,
      type: "layout",
      ...normalizeLayoutData(item),
      elements: repositoryNestedCollectionToCreatorModelCollection({
        collectionKey: "layoutElements",
        collection: item?.elements,
      }),
    };
  }

  return {
    id: itemId,
    ...structuredClone(item),
  };
};

const toRepositoryCollectionItem = ({ collectionKey, item = {}, itemId }) => {
  if (item?.type === "folder") {
    if (collectionKey === "images") {
      return {
        id: itemId,
        type: "folder",
        name: item.name ?? `Folder ${itemId}`,
        ...pickDefined(item, ["description"]),
      };
    }

    if (collectionKey === "sounds" || collectionKey === "videos") {
      return {
        id: itemId,
        type: "folder",
        name: item.name ?? `Folder ${itemId}`,
        ...pickDefined(item, ["description"]),
      };
    }

    return {
      id: itemId,
      type: "folder",
      name: item.name ?? `Folder ${itemId}`,
    };
  }

  if (collectionKey === "images") {
    return {
      id: itemId,
      type: "image",
      ...normalizeImageData(item),
    };
  }

  if (collectionKey === "sounds") {
    return {
      id: itemId,
      type: "sound",
      ...normalizeSoundData(item),
    };
  }

  if (collectionKey === "videos") {
    return {
      id: itemId,
      type: "video",
      ...normalizeVideoData(item),
    };
  }

  if (collectionKey === "animations") {
    const animation = item?.animation;
    if (animation?.type === "live") {
      return {
        id: itemId,
        type: "tween",
        name: item.name ?? `Tween ${itemId}`,
        properties: structuredClone(animation.tween || {}),
      };
    }

    return {
      id: itemId,
      type: "animation",
      name: item.name ?? `Animation ${itemId}`,
      animation: structuredClone(animation),
    };
  }

  if (collectionKey === "fonts") {
    return {
      id: itemId,
      type: "font",
      ...normalizeFontData(item),
    };
  }

  if (collectionKey === "colors") {
    return {
      id: itemId,
      type: "color",
      ...pickDefined(item, COLOR_FIELDS),
    };
  }

  if (collectionKey === "transforms") {
    return {
      id: itemId,
      type: "transform",
      ...pickDefined(item, TRANSFORM_FIELDS),
    };
  }

  if (collectionKey === "variables") {
    return {
      id: itemId,
      type: item.type,
      name: item.name ?? `Variable ${itemId}`,
      scope: item.scope,
      default: structuredClone(item.default),
      value: structuredClone(item.value),
    };
  }

  if (collectionKey === "textStyles") {
    return {
      id: itemId,
      type: "typography",
      ...pickDefined(item, TEXT_STYLE_FIELDS),
    };
  }

  if (collectionKey === "characters") {
    return {
      id: itemId,
      type: "character",
      ...pickDefined(item, CHARACTER_FIELDS),
      sprites: creatorModelNestedCollectionToRepositoryCollection({
        collectionKey: "characterSprites",
        collection: item?.sprites,
      }),
    };
  }

  if (collectionKey === "layouts") {
    return {
      id: itemId,
      type: "layout",
      ...normalizeLayoutData(item),
      elements: creatorModelNestedCollectionToRepositoryCollection({
        collectionKey: "layoutElements",
        collection: item?.elements,
      }),
    };
  }

  return {
    id: itemId,
    ...structuredClone(item),
  };
};

const repositoryNestedCollectionToCreatorModelCollection = ({
  collectionKey,
  collection,
}) => {
  const items = {};
  for (const [itemId, item] of Object.entries(collection?.items || {})) {
    if (collectionKey === "sections") {
      items[itemId] = {
        id: itemId,
        name: item?.name ?? `Section ${itemId}`,
        lines: repositoryNestedCollectionToCreatorModelCollection({
          collectionKey: "lines",
          collection: item?.lines,
        }),
      };
      continue;
    }

    if (collectionKey === "lines") {
      items[itemId] = {
        id: itemId,
        actions: structuredClone(item?.actions || {}),
      };
      continue;
    }

    if (collectionKey === "characterSprites") {
      if (item?.type === "folder") {
        items[itemId] = {
          id: itemId,
          type: "folder",
          name: item.name ?? `Folder ${itemId}`,
          ...pickDefined(item, ["description"]),
        };
        continue;
      }

      items[itemId] = {
        id: itemId,
        type: "image",
        ...normalizeCharacterSpriteData(item),
      };
      continue;
    }

    if (collectionKey === "layoutElements") {
      items[itemId] = {
        id: itemId,
        ...normalizeLayoutElementData({
          data: item,
          elementId: itemId,
          replace: true,
        }),
      };
    }
  }

  return {
    items,
    tree: normalizeTreeNodes(collection?.tree || []),
  };
};

const creatorModelNestedCollectionToRepositoryCollection = ({
  collectionKey,
  collection,
}) => {
  const items = {};
  for (const [itemId, item] of Object.entries(collection?.items || {})) {
    if (collectionKey === "sections") {
      items[itemId] = {
        id: itemId,
        name: item?.name ?? `Section ${itemId}`,
        lines: creatorModelNestedCollectionToRepositoryCollection({
          collectionKey: "lines",
          collection: item?.lines,
        }),
      };
      continue;
    }

    if (collectionKey === "lines") {
      items[itemId] = {
        id: itemId,
        actions: structuredClone(item?.actions || {}),
      };
      continue;
    }

    if (collectionKey === "characterSprites") {
      if (item?.type === "folder") {
        items[itemId] = {
          id: itemId,
          type: "folder",
          name: item.name ?? `Folder ${itemId}`,
          ...pickDefined(item, ["description"]),
        };
        continue;
      }

      items[itemId] = {
        id: itemId,
        type: "image",
        ...normalizeCharacterSpriteData(item),
      };
      continue;
    }

    if (collectionKey === "layoutElements") {
      const nextItem = {
        id: itemId,
        ...pickDefined(item, LAYOUT_ELEMENT_NON_STYLE_FIELDS),
      };

      if (item?.textStyleId !== undefined) {
        nextItem.typographyId = structuredClone(item.textStyleId);
        delete nextItem.textStyleId;
      }

      if (item?.style !== undefined) {
        nextItem.style = pickDefined(item.style, LAYOUT_ELEMENT_STYLE_FIELDS);
        if (Object.keys(nextItem.style).length === 0) {
          delete nextItem.style;
        }
      }

      items[itemId] = nextItem;
    }
  }

  return {
    items,
    tree: normalizeTreeNodes(collection?.tree || []),
  };
};

const repositoryCollectionToCreatorModelCollection = ({
  repositoryCollection,
  collectionKey,
}) => {
  const items = {};
  for (const [itemId, item] of Object.entries(
    repositoryCollection?.items || {},
  )) {
    items[itemId] = toModelCollectionItem({
      collectionKey,
      item,
      itemId,
    });
  }

  return {
    items,
    tree: normalizeTreeNodes(repositoryCollection?.tree || []),
  };
};

const creatorModelCollectionToRepositoryCollection = ({
  creatorModelCollection,
  collectionKey,
}) => {
  const items = {};
  for (const [itemId, item] of Object.entries(
    creatorModelCollection?.items || {},
  )) {
    items[itemId] = toRepositoryCollectionItem({
      collectionKey,
      item,
      itemId,
    });
  }

  return {
    items,
    tree: normalizeTreeNodes(creatorModelCollection?.tree || []),
  };
};

const looksLikeCreatorModelState = (state) => {
  if (!isPlainObject(state)) return false;
  if (!isPlainObject(state.scenes)) {
    return false;
  }
  return MODEL_COLLECTION_KEYS.every((key) => isPlainObject(state[key]));
};

const normalizeExistingCreatorModelState = (state = {}) => {
  const nextState = structuredClone(state);

  for (const item of Object.values(nextState?.variables?.items || {})) {
    if (!isPlainObject(item) || item.type === "folder") {
      continue;
    }

    if (item.value !== undefined || item.default === undefined) {
      continue;
    }

    item.value = structuredClone(item.default);
  }

  return nextState;
};

export const repositoryStateToCreatorModelState = ({
  repositoryState = {},
} = {}) => {
  const scenesItems = {};

  for (const [sceneId, scene] of Object.entries(
    repositoryState?.scenes?.items || {},
  )) {
    const isFolder = scene?.type === "folder";
    const sectionItems = {};

    for (const [sectionId, section] of Object.entries(
      scene?.sections?.items || {},
    )) {
      const lineItems = {};

      for (const [lineId, line] of Object.entries(
        section?.lines?.items || {},
      )) {
        lineItems[lineId] = {
          id: lineId,
          actions: structuredClone(line?.actions || {}),
        };
      }

      sectionItems[sectionId] = {
        id: sectionId,
        name: section?.name ?? `Section ${sectionId}`,
        lines: {
          items: lineItems,
          tree: normalizeTreeNodes(section?.lines?.tree || []),
        },
      };
    }

    scenesItems[sceneId] = {
      id: sceneId,
      type: isFolder ? "folder" : "scene",
      name: scene?.name ?? `Scene ${sceneId}`,
      ...pickDefined(scene, ["position"]),
      ...(isFolder
        ? {}
        : {
            sections: {
              items: sectionItems,
              tree: normalizeTreeNodes(scene?.sections?.tree || []),
            },
          }),
    };
  }

  return {
    project: repositoryState?.project?.resolution
      ? {
          resolution: structuredClone(repositoryState.project.resolution),
        }
      : {},
    story: {
      initialSceneId: repositoryState?.story?.initialSceneId || null,
    },
    scenes: {
      items: scenesItems,
      tree: normalizeTreeNodes(repositoryState?.scenes?.tree || []),
    },
    images: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.images,
      collectionKey: "images",
    }),
    sounds: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.sounds,
      collectionKey: "sounds",
    }),
    videos: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.videos,
      collectionKey: "videos",
    }),
    animations: repositoryCollectionToCreatorModelCollection({
      repositoryCollection:
        repositoryState?.animations ?? repositoryState?.tweens,
      collectionKey: "animations",
    }),
    characters: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.characters,
      collectionKey: "characters",
    }),
    fonts: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.fonts,
      collectionKey: "fonts",
    }),
    transforms: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.transforms,
      collectionKey: "transforms",
    }),
    colors: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.colors,
      collectionKey: "colors",
    }),
    textStyles: repositoryCollectionToCreatorModelCollection({
      repositoryCollection:
        repositoryState?.textStyles ?? repositoryState?.typography,
      collectionKey: "textStyles",
    }),
    variables: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.variables,
      collectionKey: "variables",
    }),
    layouts: repositoryCollectionToCreatorModelCollection({
      repositoryCollection: repositoryState?.layouts,
      collectionKey: "layouts",
    }),
  };
};

const buildRepositorySectionsForScene = ({ creatorModelState, sceneId }) => {
  const scene = creatorModelState?.scenes?.items?.[sceneId];
  const sections = scene?.sections;
  if (!isPlainObject(sections)) {
    return createEmptyCollection();
  }

  const sectionItems = {};
  const orderedSectionIds = uniqueIdsInOrder(
    flattenTreeIds(sections?.tree || []),
    Object.keys(sections?.items || {}),
  );

  for (const sectionId of orderedSectionIds) {
    const section = sections?.items?.[sectionId];
    if (!section) continue;

    const orderedLineIds = uniqueIdsInOrder(
      flattenTreeIds(section?.lines?.tree || []),
      Object.keys(section?.lines?.items || {}),
    );

    const lineItems = {};
    for (const lineId of orderedLineIds) {
      const line = section?.lines?.items?.[lineId];
      if (!line) continue;
      lineItems[lineId] = {
        id: lineId,
        actions: structuredClone(line.actions || {}),
      };
    }

    sectionItems[sectionId] = {
      id: sectionId,
      type: "section",
      name: section.name ?? `Section ${sectionId}`,
      lines: {
        items: lineItems,
        tree: orderedLineIds.map((id) => ({ id })),
      },
    };
  }

  return {
    items: sectionItems,
    tree: normalizeTreeNodes(sections?.tree || []),
  };
};

export const creatorModelStateToRepositoryState = ({
  creatorModelState = {},
  repositoryState = {},
  projectId,
} = {}) => {
  const nextState = structuredClone(repositoryState || {});
  nextState.model_version = 2;
  nextState.project = {
    ...structuredClone(repositoryState?.project || {}),
    ...(projectId ? { id: projectId } : {}),
    ...(creatorModelState?.project?.resolution
      ? {
          resolution: structuredClone(creatorModelState.project.resolution),
        }
      : {}),
  };
  nextState.story = {
    ...structuredClone(repositoryState?.story || {}),
    initialSceneId: creatorModelState?.story?.initialSceneId ?? null,
  };

  const sceneItems = {};
  const orderedSceneIds = uniqueIdsInOrder(
    flattenTreeIds(creatorModelState?.scenes?.tree || []),
    Object.keys(creatorModelState?.scenes?.items || {}),
  );

  for (const sceneId of orderedSceneIds) {
    const scene = creatorModelState?.scenes?.items?.[sceneId];
    if (!scene) continue;

    if (scene.type === "folder") {
      sceneItems[sceneId] = {
        id: sceneId,
        type: "folder",
        name: scene.name ?? `Folder ${sceneId}`,
        ...pickDefined(scene, ["position"]),
        sections: {
          items: {},
          tree: [],
        },
      };
      continue;
    }

    sceneItems[sceneId] = {
      id: sceneId,
      type: "scene",
      name: scene.name ?? `Scene ${sceneId}`,
      ...pickDefined(scene, ["position"]),
      sections: buildRepositorySectionsForScene({
        creatorModelState,
        sceneId,
      }),
    };
  }

  nextState.scenes = {
    items: sceneItems,
    tree: normalizeTreeNodes(creatorModelState?.scenes?.tree || []),
  };

  for (const collectionKey of MODEL_COLLECTION_KEYS) {
    if (collectionKey === "scenes") {
      continue;
    }

    const resourceType = MODEL_COLLECTION_TO_RESOURCE_TYPE[collectionKey];
    if (!resourceType) continue;

    const nextCollection = creatorModelCollectionToRepositoryCollection({
      creatorModelCollection: creatorModelState?.[collectionKey],
      collectionKey,
    });

    nextState[resourceType] = structuredClone(nextCollection);

    if (collectionKey === "animations" && isPlainObject(nextState.tweens)) {
      nextState.tweens = structuredClone(nextCollection);
    }

    if (collectionKey === "textStyles" && isPlainObject(nextState.typography)) {
      nextState.typography = structuredClone(nextCollection);
    }
  }

  return nextState;
};

const toModelAnimationData = (data = {}) => {
  if (data.type === "folder") {
    return {
      type: "folder",
      name: data.name,
    };
  }

  if (data.type === "animation") {
    return {
      type: "animation",
      name: data.name,
      animation: structuredClone(data.animation),
    };
  }

  return {
    type: "animation",
    name: data.name,
    animation: structuredClone(
      data.animation ?? {
        type: "live",
        tween: structuredClone(data.properties || {}),
      },
    ),
  };
};

const toModelTextStyleData = (data = {}) => {
  if (data.type === "folder") {
    return {
      type: "folder",
      name: data.name,
    };
  }

  return {
    type: "textStyle",
    ...pickDefined(data, [
      "name",
      ...TEXT_STYLE_FIELDS.filter((field) => field !== "name"),
    ]),
  };
};

const toModelVariableCreateData = (data = {}) => {
  if (data.type === "folder") {
    return {
      type: "folder",
      name: data.name,
    };
  }

  const type = normalizeLegacyVariableType(data);
  const defaultValue = structuredClone(data.default);
  return {
    type,
    name: data.name,
    scope: mapVariableScopeToModel(data.scope),
    default: defaultValue,
    value: structuredClone(data.value ?? data.default),
  };
};

const toModelVariableUpdateData = (data = {}) => {
  return {
    ...pickDefined(data, ["name", "default", "value"]),
    ...(data.scope !== undefined
      ? { scope: mapVariableScopeToModel(data.scope) }
      : {}),
  };
};

const toModelCharacterData = (data = {}) => {
  if (data.type === "folder") {
    return {
      type: "folder",
      name: data.name,
    };
  }

  return {
    type: "character",
    ...pickDefined(data, CHARACTER_FIELDS),
    ...(data.sprites !== undefined
      ? {
          sprites: repositoryNestedCollectionToCreatorModelCollection({
            collectionKey: "characterSprites",
            collection: data.sprites,
          }),
        }
      : {}),
  };
};

const toModelLayoutData = (data = {}) => {
  if (data.type === "folder") {
    return {
      type: "folder",
      name: data.name,
    };
  }

  return {
    type: "layout",
    ...normalizeLayoutData(data),
    ...(data.elements !== undefined
      ? {
          elements: repositoryNestedCollectionToCreatorModelCollection({
            collectionKey: "layoutElements",
            collection: data.elements,
          }),
        }
      : {}),
  };
};

const toModelResourceCreateData = ({ resourceType, data = {} }) => {
  if (resourceType === "images") {
    return data.type === "folder"
      ? {
          type: "folder",
          name: data.name,
          ...pickDefined(data, ["description"]),
        }
      : { type: "image", ...normalizeImageData(data) };
  }

  if (resourceType === "sounds") {
    return data.type === "folder"
      ? {
          type: "folder",
          name: data.name,
          ...pickDefined(data, ["description"]),
        }
      : { type: "sound", ...normalizeSoundData(data) };
  }

  if (resourceType === "videos") {
    return data.type === "folder"
      ? {
          type: "folder",
          name: data.name,
          ...pickDefined(data, ["description"]),
        }
      : { type: "video", ...normalizeVideoData(data) };
  }

  if (resourceType === "tweens") {
    return toModelAnimationData(data);
  }

  if (resourceType === "fonts") {
    return data.type === "folder"
      ? { type: "folder", name: data.name }
      : { type: "font", ...normalizeFontData(data) };
  }

  if (resourceType === "colors") {
    return data.type === "folder"
      ? { type: "folder", name: data.name }
      : { type: "color", ...pickDefined(data, COLOR_FIELDS) };
  }

  if (resourceType === "transforms") {
    return data.type === "folder"
      ? { type: "folder", name: data.name }
      : { type: "transform", ...pickDefined(data, TRANSFORM_FIELDS) };
  }

  if (resourceType === "typography") {
    return toModelTextStyleData(data);
  }

  if (resourceType === "variables") {
    return toModelVariableCreateData(data);
  }

  if (resourceType === "characters") {
    return toModelCharacterData(data);
  }

  if (resourceType === "layouts") {
    return toModelLayoutData(data);
  }

  throw new DomainValidationError(`Unsupported resourceType: ${resourceType}`);
};

const toModelResourceUpdateData = ({ resourceType, data = {} }) => {
  if (resourceType === "images") {
    return normalizeImageData(data);
  }
  if (resourceType === "sounds") {
    return normalizeSoundData(data);
  }
  if (resourceType === "videos") {
    return normalizeVideoData(data);
  }
  if (resourceType === "tweens") {
    const nextData = {};
    if (data.name !== undefined) {
      nextData.name = data.name;
    }
    if (data.properties !== undefined || data.animation !== undefined) {
      nextData.animation = structuredClone(
        data.animation ?? {
          type: "live",
          tween: structuredClone(data.properties || {}),
        },
      );
    }
    return nextData;
  }
  if (resourceType === "fonts") {
    return normalizeFontData(data);
  }
  if (resourceType === "colors") {
    return pickDefined(data, COLOR_FIELDS);
  }
  if (resourceType === "transforms") {
    return pickDefined(data, TRANSFORM_FIELDS);
  }
  if (resourceType === "typography") {
    return pickDefined(data, TEXT_STYLE_FIELDS);
  }
  if (resourceType === "variables") {
    return toModelVariableUpdateData(data);
  }
  if (resourceType === "characters") {
    const nextData = pickDefined(data, CHARACTER_FIELDS);
    if (data.sprites !== undefined) {
      nextData.sprites = repositoryNestedCollectionToCreatorModelCollection({
        collectionKey: "characterSprites",
        collection: data.sprites,
      });
    }
    return nextData;
  }
  if (resourceType === "layouts") {
    const nextData = normalizeLayoutData(data);
    if (data.elements !== undefined) {
      nextData.elements = repositoryNestedCollectionToCreatorModelCollection({
        collectionKey: "layoutElements",
        collection: data.elements,
      });
    }
    return nextData;
  }

  throw new DomainValidationError(`Unsupported resourceType: ${resourceType}`);
};

const getRepositoryItemByResourceType = ({
  repositoryState,
  resourceType,
  resourceId,
}) => {
  return repositoryState?.[resourceType]?.items?.[resourceId];
};

const toNormalizedNativeResourceCommand = ({ type, payload = {} }) => {
  const [family, operation] = type.split(".");
  const resourceType = MODEL_FAMILY_TO_RESOURCE_TYPE[family];
  const idField = MODEL_FAMILY_TO_ID_FIELD[family];
  const deleteField = MODEL_FAMILY_TO_DELETE_FIELD[family];

  if (!resourceType || !idField || !deleteField) {
    throw new DomainValidationError(`Unsupported command type: ${type}`);
  }

  if (operation === "create") {
    return {
      type,
      payload: {
        [idField]: payload[idField],
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        data: toModelResourceCreateData({
          resourceType,
          data: payload.data,
        }),
      },
    };
  }

  if (operation === "update") {
    return {
      type,
      payload: {
        [idField]: payload[idField],
        data: toModelResourceUpdateData({
          resourceType,
          data: payload.data,
        }),
      },
    };
  }

  if (operation === "move") {
    return {
      type,
      payload: {
        [idField]: payload[idField],
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      },
    };
  }

  if (operation === "delete") {
    return {
      type,
      payload: {
        [deleteField]: structuredClone(payload[deleteField] || []),
      },
    };
  }

  throw new DomainValidationError(`Unsupported command type: ${type}`);
};

const toModelProjectCreateState = ({ state }) => {
  if (looksLikeCreatorModelState(state)) {
    return normalizeExistingCreatorModelState(state);
  }

  return repositoryStateToCreatorModelState({
    repositoryState: state,
  });
};

export const commandToCreatorModelCommand = ({
  command,
  repositoryState,
} = {}) => {
  const normalizedCommand = normalizeCommand(command);

  if (!isPlainObject(normalizedCommand)) {
    throw new DomainValidationError("command must be an object");
  }

  const payload = normalizedCommand.payload || {};

  if (normalizedCommand.type === "project.create") {
    return {
      type: "project.create",
      payload: {
        state: toModelProjectCreateState({
          state: payload.state,
        }),
      },
    };
  }

  if (MODEL_NATIVE_COMMAND_TYPES.has(normalizedCommand.type)) {
    return toNormalizedNativeResourceCommand({
      type: normalizedCommand.type,
      payload,
    });
  }

  if (
    normalizedCommand.type === "story.update" ||
    normalizedCommand.type === "scene.create" ||
    normalizedCommand.type === "scene.update" ||
    normalizedCommand.type === "scene.delete" ||
    normalizedCommand.type === "scene.move" ||
    normalizedCommand.type === "section.create" ||
    normalizedCommand.type === "section.update" ||
    normalizedCommand.type === "section.delete" ||
    normalizedCommand.type === "section.move" ||
    normalizedCommand.type === "line.delete" ||
    normalizedCommand.type === "line.update_actions" ||
    normalizedCommand.type === "layout.element.move" ||
    normalizedCommand.type === "layout.element.delete" ||
    normalizedCommand.type === "character.sprite.delete"
  ) {
    return {
      type: normalizedCommand.type,
      payload: structuredClone(payload),
    };
  }

  if (normalizedCommand.type === "line.create") {
    const nextPayload = structuredClone(payload);
    delete nextPayload.parentId;
    return {
      type: "line.create",
      payload: nextPayload,
    };
  }

  if (normalizedCommand.type === "line.move") {
    return {
      type: "line.move",
      payload: {
        lineId: payload.lineId,
        toSectionId: payload.toSectionId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      },
    };
  }

  if (normalizedCommand.type === "character.sprite.move") {
    return {
      type: "character.sprite.move",
      payload: {
        characterId: payload.characterId,
        spriteId: payload.spriteId,
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      },
    };
  }

  if (normalizedCommand.type === "character.sprite.create") {
    return {
      type: "character.sprite.create",
      payload: {
        characterId: payload.characterId,
        spriteId: payload.spriteId,
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        data:
          payload.data?.type === "folder"
            ? {
                type: "folder",
                name: payload.data.name,
                ...pickDefined(payload.data, ["description"]),
              }
            : {
                type: "image",
                ...normalizeCharacterSpriteData(payload.data),
              },
      },
    };
  }

  if (normalizedCommand.type === "character.sprite.update") {
    return {
      type: "character.sprite.update",
      payload: {
        characterId: payload.characterId,
        spriteId: payload.spriteId,
        data: normalizeCharacterSpriteData(payload.data),
      },
    };
  }

  if (normalizedCommand.type === "layout.element.create") {
    return {
      type: "layout.element.create",
      payload: {
        layoutId: payload.layoutId,
        elementId: payload.elementId,
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        data: normalizeLayoutElementData({
          data: payload.data,
          elementId: payload.elementId,
          replace: true,
        }),
      },
    };
  }

  if (normalizedCommand.type === "layout.element.update") {
    const existingElement =
      repositoryState?.layouts?.items?.[payload.layoutId]?.elements?.items?.[
        payload.elementId
      ];

    return {
      type: "layout.element.update",
      payload: {
        layoutId: payload.layoutId,
        elementId: payload.elementId,
        replace: payload.replace === true,
        data: normalizeLayoutElementData({
          data: payload.data,
          elementId: payload.elementId,
          existingData: existingElement,
          replace: payload.replace === true,
        }),
      },
    };
  }

  if (normalizedCommand.type === "resource.create") {
    const family = RESOURCE_TYPE_TO_MODEL_FAMILY[payload.resourceType];
    const idField = MODEL_FAMILY_TO_ID_FIELD[family];
    if (!family || !idField) {
      throw new DomainValidationError(
        `Unsupported resourceType: ${payload.resourceType}`,
      );
    }

    return {
      type: `${family}.create`,
      payload: {
        [idField]: payload.resourceId,
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        data: toModelResourceCreateData({
          resourceType: payload.resourceType,
          data: payload.data,
        }),
      },
    };
  }

  if (normalizedCommand.type === "resource.update") {
    const family = RESOURCE_TYPE_TO_MODEL_FAMILY[payload.resourceType];
    const idField = MODEL_FAMILY_TO_ID_FIELD[family];
    if (!family || !idField) {
      throw new DomainValidationError(
        `Unsupported resourceType: ${payload.resourceType}`,
      );
    }

    return {
      type: `${family}.update`,
      payload: {
        [idField]: payload.resourceId,
        data: toModelResourceUpdateData({
          resourceType: payload.resourceType,
          data: payload.data,
        }),
      },
    };
  }

  if (normalizedCommand.type === "resource.move") {
    const family = RESOURCE_TYPE_TO_MODEL_FAMILY[payload.resourceType];
    const idField = MODEL_FAMILY_TO_ID_FIELD[family];
    if (!family || !idField) {
      throw new DomainValidationError(
        `Unsupported resourceType: ${payload.resourceType}`,
      );
    }

    return {
      type: `${family}.move`,
      payload: {
        [idField]: payload.resourceId,
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
      },
    };
  }

  if (normalizedCommand.type === "resource.delete") {
    const family = RESOURCE_TYPE_TO_MODEL_FAMILY[payload.resourceType];
    const deleteField = MODEL_FAMILY_TO_DELETE_FIELD[family];
    if (!family || !deleteField) {
      throw new DomainValidationError(
        `Unsupported resourceType: ${payload.resourceType}`,
      );
    }

    return {
      type: `${family}.delete`,
      payload: {
        [deleteField]: structuredClone(payload.resourceIds || []),
      },
    };
  }

  if (normalizedCommand.type === "resource.duplicate") {
    const family = RESOURCE_TYPE_TO_MODEL_FAMILY[payload.resourceType];
    const idField = MODEL_FAMILY_TO_ID_FIELD[family];
    if (!family || !idField) {
      throw new DomainValidationError(
        `Unsupported resourceType: ${payload.resourceType}`,
      );
    }

    const sourceItem = getRepositoryItemByResourceType({
      repositoryState,
      resourceType: payload.resourceType,
      resourceId: payload.sourceId,
    });

    if (!sourceItem) {
      throw new DomainValidationError("duplicate source item not found");
    }

    const modelSource = toModelCollectionItem({
      collectionKey: RESOURCE_TYPE_TO_MODEL_COLLECTION[payload.resourceType],
      item: sourceItem,
      itemId: payload.sourceId,
    });

    const data = structuredClone(modelSource);
    delete data.id;
    if (payload.name !== undefined) {
      data.name = payload.name;
    }

    return {
      type: `${family}.create`,
      payload: {
        [idField]: payload.newId,
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        data,
      },
    };
  }

  if (normalizedCommand.type === "character.sprite.duplicate") {
    const sourceItem =
      repositoryState?.characters?.items?.[payload.characterId]?.sprites
        ?.items?.[payload.sourceId];

    if (!sourceItem) {
      throw new DomainValidationError("duplicate source sprite not found");
    }

    const modelSource =
      sourceItem?.type === "folder"
        ? {
            id: payload.sourceId,
            type: "folder",
            name: sourceItem.name,
            ...pickDefined(sourceItem, ["description"]),
          }
        : {
            id: payload.sourceId,
            type: "image",
            ...normalizeCharacterSpriteData(sourceItem),
          };

    const data = structuredClone(modelSource);
    delete data.id;
    if (payload.name !== undefined) {
      data.name = payload.name;
    }

    return {
      type: "character.sprite.create",
      payload: {
        characterId: payload.characterId,
        spriteId: payload.newId,
        parentId: payload.parentId,
        index: payload.index,
        position: payload.position,
        positionTargetId: payload.positionTargetId,
        data,
      },
    };
  }

  throw new DomainValidationError(
    `Unsupported command type for creator model adapter: ${normalizedCommand.type}`,
  );
};

export const shouldUseCreatorModelForCommand = () => true;

export const validateCommandWithCreatorModelAgainstRepositoryState = ({
  repositoryState,
  command,
} = {}) => {
  return captureCreatorModelResult(() => {
    const creatorModelCommand = commandToCreatorModelCommand({
      command,
      repositoryState,
    });
    const creatorModelState = repositoryStateToCreatorModelState({
      repositoryState,
    });

    const payloadResult = toCreatorModelResult(
      validateCreatorModelPayload(creatorModelCommand),
    );
    if (!payloadResult.valid) {
      return payloadResult;
    }

    const stateResult = toCreatorModelResult(
      validateCreatorModelAgainstState({
        state: creatorModelState,
        command: creatorModelCommand,
      }),
    );
    if (!stateResult.valid) {
      return stateResult;
    }

    return {
      valid: true,
      creatorModelCommand,
      creatorModelState,
    };
  });
};

export const applyCommandToRepositoryStateWithCreatorModel = ({
  repositoryState,
  command,
  projectId,
} = {}) => {
  return captureCreatorModelResult(() => {
    const creatorModelCommand = commandToCreatorModelCommand({
      command,
      repositoryState,
    });

    const creatorModelState = repositoryStateToCreatorModelState({
      repositoryState,
    });

    const processResult = toCreatorModelResult(
      processCreatorModelCommand({
        state: creatorModelState,
        command: creatorModelCommand,
      }),
    );
    if (!processResult.valid) {
      return processResult;
    }

    const nextCreatorModelState = processResult.state;
    const nextRepositoryState = creatorModelStateToRepositoryState({
      creatorModelState: nextCreatorModelState,
      repositoryState,
      projectId: command?.projectId || projectId,
    });
    preserveStoryRepositoryMetadata({
      repositoryState,
      nextRepositoryState,
    });
    stampStoryRepositoryMetadataForCommand({
      repositoryState: nextRepositoryState,
      command,
    });

    return {
      valid: true,
      creatorModelCommand,
      creatorModelState,
      nextCreatorModelState,
      repositoryState: nextRepositoryState,
    };
  });
};
