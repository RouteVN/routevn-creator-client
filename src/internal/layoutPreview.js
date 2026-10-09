import { parseAndRender } from "jempl";
import { formatDate, resolveLayoutReferences } from "route-engine-js";
import { getFontFaceWeightDescriptor } from "./fontCapabilities.js";
import { PARTICLE_PREVIEW_SETTLE_MS } from "./particlePreview.js";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "./project/layout.js";
import { toHierarchyStructure } from "./project/tree.js";
import { requireProjectResolution } from "./projectResolution.js";

// What a layout draws with its preview data, as the layout editor shows it.
// The editor's canvas adds its selection chrome on top, and a layout's
// thumbnail is drawn from it.

export const formatLayoutPreviewDate = formatDate;
const jemplFunctions = {
  formatDate: formatLayoutPreviewDate,
};

const toElementList = (elements) => {
  if (Array.isArray(elements)) {
    return elements.filter(Boolean);
  }

  return elements ? [elements] : [];
};

const toPlainObject = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
};

const toArray = (value) => {
  return Array.isArray(value) ? value : [];
};

const resolveFontAssetType = (fileName = "") => {
  if (fileName.endsWith(".woff2")) {
    return "font/woff2";
  }

  if (fileName.endsWith(".woff")) {
    return "font/woff";
  }

  if (fileName.endsWith(".ttf")) {
    return "font/ttf";
  }

  if (fileName.endsWith(".otf")) {
    return "font/otf";
  }

  return "font/ttf";
};

export const createFontAssetMetadataByFileId = (fontsItems = {}) => {
  const fontAssetMetadataByFileId = {};

  for (const fontItem of Object.values(fontsItems)) {
    const fileId = fontItem?.fileId;
    if (!fileId) {
      continue;
    }

    fontAssetMetadataByFileId[fileId] = {
      type: resolveFontAssetType(fontItem.name || ""),
      fontWeightDescriptor: getFontFaceWeightDescriptor(fontItem),
    };
  }

  return fontAssetMetadataByFileId;
};

const normalizeHistoryDialogueItem = (item) => {
  const nextItem = toPlainObject(item);
  const nextContent = toArray(nextItem.content);
  const firstContentItem = toPlainObject(nextContent[0]);

  return {
    ...nextItem,
    characterName: nextItem.characterName ?? "",
    text: nextItem.text ?? firstContentItem.text ?? "",
  };
};

const normalizeLayoutEditorPreviewData = (previewData = {}) => {
  const nextPreviewData = toPlainObject(previewData);
  const nextRuntime = toPlainObject(nextPreviewData.runtime);
  const nextDialogue = toPlainObject(nextPreviewData.dialogue);
  const nextDialogueCharacter = toPlainObject(nextDialogue.character);
  const nextChoice = toPlainObject(nextPreviewData.choice);
  const nextConfirmDialog = toPlainObject(nextPreviewData.confirmDialog);
  const nextForm = toPlainObject(nextPreviewData.form);
  const dialogueContent = toArray(nextDialogue.content);
  const historyDialogue = toArray(nextPreviewData.historyDialogue);

  return {
    ...nextPreviewData,
    backgroundImageId:
      typeof nextPreviewData.backgroundImageId === "string" &&
      nextPreviewData.backgroundImageId.length > 0
        ? nextPreviewData.backgroundImageId
        : undefined,
    variables: toPlainObject(nextPreviewData.variables),
    form: {
      ...nextForm,
      values: toPlainObject(nextForm.values),
    },
    runtime: {
      ...nextRuntime,
      dialogueTextSpeed: nextRuntime.dialogueTextSpeed ?? 50,
      autoMode: nextRuntime.autoMode ?? false,
      skipMode: nextRuntime.skipMode ?? false,
      dialogueUIHidden: nextRuntime.dialogueUIHidden ?? false,
      isLineCompleted: nextRuntime.isLineCompleted ?? false,
      saveLoadPagination: nextRuntime.saveLoadPagination ?? 1,
      menuPage: nextRuntime.menuPage ?? "",
      menuEntryPoint: nextRuntime.menuEntryPoint ?? "",
      autoForwardDelay: nextRuntime.autoForwardDelay ?? 1000,
      skipUnseenText: nextRuntime.skipUnseenText ?? false,
      skipTransitionsAndAnimations:
        nextRuntime.skipTransitionsAndAnimations ?? false,
      soundVolume: nextRuntime.soundVolume ?? 50,
      musicVolume: nextRuntime.musicVolume ?? 50,
      muteAll: nextRuntime.muteAll ?? false,
    },
    dialogue: {
      ...nextDialogue,
      characterId:
        typeof nextDialogue.characterId === "string"
          ? nextDialogue.characterId
          : "",
      character: {
        ...nextDialogueCharacter,
        name: nextDialogueCharacter.name ?? "",
      },
      content:
        dialogueContent.length > 0
          ? dialogueContent
          : [
              {
                text: "",
              },
            ],
      lines: toArray(nextDialogue.lines),
    },
    choice: {
      ...nextChoice,
      items: toArray(nextChoice.items),
    },
    confirmDialog: {
      ...nextConfirmDialog,
      confirmActions: toPlainObject(nextConfirmDialog.confirmActions),
      cancelActions: toPlainObject(nextConfirmDialog.cancelActions),
    },
    historyDialogue:
      historyDialogue.length > 0
        ? historyDialogue.map(normalizeHistoryDialogueItem)
        : [
            {
              characterName: "Alice",
              text: "First history line",
            },
            {
              characterName: "Bob",
              text: "Second history line",
            },
          ],
    saveSlots: toArray(nextPreviewData.saveSlots),
  };
};

const applyInputPreviewValues = (elements, formValues = {}) => {
  return toElementList(elements).map((element) => {
    const nextElement = {
      ...element,
    };

    if (
      nextElement.type === "input" &&
      typeof nextElement.field === "string" &&
      Object.hasOwn(formValues, nextElement.field)
    ) {
      nextElement.value = formValues[nextElement.field];
    }

    if (Array.isArray(nextElement.children)) {
      nextElement.children = applyInputPreviewValues(
        nextElement.children,
        formValues,
      );
    }

    return nextElement;
  });
};

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const createLayoutEditorPreviewBackgroundElement = ({
  previewData,
  repositoryState,
  resolution,
} = {}) => {
  const backgroundImageId = previewData?.backgroundImageId;
  if (!backgroundImageId) {
    return undefined;
  }

  const imageItem = repositoryState?.images?.items?.[backgroundImageId];
  if (imageItem?.type && imageItem.type !== "image") {
    return undefined;
  }

  const fileId = imageItem?.fileId;
  if (typeof fileId !== "string" || fileId.length === 0) {
    return undefined;
  }

  const resolutionWidth = toPositiveNumber(resolution?.width, undefined);
  const resolutionHeight = toPositiveNumber(resolution?.height, undefined);
  if (resolutionWidth === undefined || resolutionHeight === undefined) {
    return undefined;
  }

  return {
    id: "layout-editor-preview-background",
    type: "sprite",
    src: fileId,
    fileType: imageItem?.fileType ?? "image/png",
    x: Math.round(resolutionWidth / 2),
    y: Math.round(resolutionHeight / 2),
    width: toPositiveNumber(imageItem?.width, resolutionWidth),
    height: toPositiveNumber(imageItem?.height, resolutionHeight),
    anchorX: 0.5,
    anchorY: 0.5,
  };
};

const createLayoutEditorPreviewCharacterSprite = ({
  previewData,
  repositoryState,
} = {}) => {
  const sprite = previewData.dialogue?.character?.sprite;
  if (!sprite?.items?.length) {
    return undefined;
  }

  const transform = repositoryState?.transforms?.items?.[sprite.transformId];
  const characters = Object.values(repositoryState?.characters?.items ?? {});
  const images = {};
  const spritesheets = {};
  const children = [];
  for (const item of sprite.items) {
    const resource = characters
      .map((character) => character.sprites?.items?.[item.resourceId])
      .find(Boolean);
    if (!resource?.fileId) {
      continue;
    }

    const child = {
      id: `layout-editor-preview-character-sprite-${item.id}`,
      x: 0,
      y: 0,
    };
    if (resource.type === "image") {
      images[item.resourceId] = resource;
      child.type = "sprite";
      child.imageId = item.resourceId;
      child.width = resource.width;
      child.height = resource.height;
    } else if (resource.type === "spritesheet") {
      spritesheets[item.resourceId] = resource;
      child.type = "spritesheet-animation";
      child.resourceId = item.resourceId;
      child.width = resource.width;
      child.height = resource.height;
    } else {
      continue;
    }
    children.push(child);
  }
  if (children.length === 0) {
    return undefined;
  }

  const { elements, resources } = buildLayoutElements(
    [
      {
        id: "layout-editor-preview-character-sprite",
        type: "container",
        x: transform?.x ?? 0,
        y: transform?.y ?? 0,
        anchorX: transform?.anchorX ?? 0,
        anchorY: transform?.anchorY ?? 0,
        scaleX: transform?.scaleX ?? 1,
        scaleY: transform?.scaleY ?? 1,
        rotation: transform?.rotation ?? 0,
        children,
      },
    ],
    images,
    { items: {} },
    { items: {} },
    { items: {} },
    {
      spritesheetsData: { items: spritesheets },
      filesData: repositoryState?.files,
    },
  );
  return resolveLayoutReferences(elements, { resources })[0];
};

const resolveLayoutPreviewElements = ({ elements, previewData } = {}) => {
  const normalizedPreviewData = normalizeLayoutEditorPreviewData(previewData);
  const renderedElements = toElementList(
    parseAndRender(toElementList(elements), normalizedPreviewData, {
      functions: jemplFunctions,
    }),
  );

  return applyInputPreviewValues(
    renderedElements,
    normalizedPreviewData.form.values,
  );
};

// The layout's elements, before its preview data fills them in. `mapElement`
// sees each element as it is built, as the editor's canvas uses to tell which
// authored element drew it.
export const createLayoutPreviewRenderState = ({
  layoutState,
  repositoryState,
  mapElement,
} = {}) => {
  const imageItems = repositoryState?.images?.items || {};
  const spritesheetsData = repositoryState?.spritesheets || {
    items: {},
    tree: [],
  };
  const soundsData = repositoryState?.sounds || {
    items: {},
    tree: [],
  };
  const particlesData = repositoryState?.particles || {
    items: {},
    tree: [],
  };
  const textStyleItems = repositoryState?.textStyles?.items || {};
  const colorsItems = repositoryState?.colors?.items || {};
  const fontsItems = repositoryState?.fonts?.items || {};
  const layoutHierarchyStructure = toHierarchyStructure(
    layoutState?.elements ?? { items: {}, tree: [] },
  );
  const { elements, resources } = buildLayoutElements(
    layoutHierarchyStructure,
    imageItems,
    { items: textStyleItems },
    { items: colorsItems },
    { items: fontsItems },
    {
      layoutId: layoutState?.id,
      layoutType: layoutState?.layoutType,
      layoutSchemaVersion: layoutState?.layoutSchemaVersion,
      filesData: repositoryState?.files,
      soundsData,
      particlesData,
      spritesheetsData,
      layoutsData: repositoryState?.layouts?.items || {},
      mapElement,
    },
  );

  return {
    renderStateElements: elements,
    resources,
    fontsItems,
  };
};

// What the layout draws with `previewData`: its elements, and the preview's
// background and character sprite, when it has them, to draw under and over
// them.
export const createLayoutPreviewElements = ({
  layoutState,
  repositoryState,
  previewData,
  resolution,
  mapElement,
} = {}) => {
  const { renderStateElements, resources } = createLayoutPreviewRenderState({
    layoutState,
    repositoryState,
    mapElement,
  });
  const normalizedPreviewData = normalizeLayoutEditorPreviewData(previewData);
  const elements = resolveLayoutReferences(
    resolveLayoutPreviewElements({
      elements: renderStateElements,
      previewData: normalizedPreviewData,
    }),
    { resources },
  );

  return {
    elements,
    backgroundElement: createLayoutEditorPreviewBackgroundElement({
      previewData: normalizedPreviewData,
      repositoryState,
      resolution,
    }),
    characterSprite: createLayoutEditorPreviewCharacterSprite({
      previewData: normalizedPreviewData,
      repositoryState,
    }),
  };
};

// The type a layout is drawn as. Save and load screens share one.
export const toLayoutPreviewType = (layoutType) => {
  if (layoutType === "save" || layoutType === "load") {
    return "save-load";
  }

  return layoutType ?? "general";
};

// Text that types itself out is drawn in full, as the editor shows it once it
// has typed.
const showFullText = (elements) =>
  elements.map((element) => {
    const nextElement = { ...element };
    if (nextElement.type === "text-revealing") {
      nextElement.revealEffect = "none";
    }
    if (Array.isArray(nextElement.children)) {
      nextElement.children = showFullText(nextElement.children);
    }
    return nextElement;
  });

const hasElementOfType = (elements, type) =>
  elements.some(
    (element) =>
      element.type === type ||
      (Array.isArray(element.children) &&
        hasElementOfType(element.children, type)),
  );

// Bump when a layout's preview starts drawing the same saved layout
// differently, so saved thumbnails are drawn again.
export const LAYOUT_THUMBNAIL_VERSION = 1;

// What a saved layout's thumbnail shows: the layout with its saved preview
// data, as the layout editor's canvas draws it without its selection chrome,
// at the project's resolution, and the files that draws. Sounds are left out,
// since a still picture plays none.
export const createLayoutThumbnailSource = ({ item, repositoryState }) => {
  const resolution = requireProjectResolution(
    repositoryState.project?.resolution,
    "Project resolution",
  );
  const { elements, backgroundElement, characterSprite } =
    createLayoutPreviewElements({
      layoutState: {
        id: item.id,
        layoutType: toLayoutPreviewType(item.layoutType),
        layoutSchemaVersion: item.layoutSchemaVersion,
        elements: item.elements,
      },
      repositoryState,
      previewData: item.preview,
      resolution,
    });
  const renderedElements = showFullText(
    [backgroundElement, ...elements, characterSprite].filter(Boolean),
  );
  const fontAssets = createFontAssetMetadataByFileId(
    repositoryState.fonts?.items,
  );
  const assets = [];
  for (const {
    url: fileId,
    type,
    fontWeightDescriptor,
  } of extractFileIdsFromRenderState(renderedElements)) {
    const fontAsset = fontAssets[fileId];
    const fileType = fontAsset?.type ?? type;
    if (fileType.startsWith("audio/")) {
      continue;
    }
    const asset = { fileId, fileType };
    const weight = fontAsset?.fontWeightDescriptor ?? fontWeightDescriptor;
    if (weight !== undefined) {
      asset.fontWeightDescriptor = weight;
    }
    assets.push(asset);
  }

  const source = {
    width: resolution.width,
    height: resolution.height,
    renderState: { elements: renderedElements, animations: [] },
    assets,
  };
  // Particles move on the renderer's own clock, so they run for a while
  // before the thumbnail is taken.
  if (hasElementOfType(renderedElements, "particles")) {
    source.settleMs = PARTICLE_PREVIEW_SETTLE_MS;
  }
  return source;
};
