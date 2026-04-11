import { parseAndRender } from "jempl";
import { resolveLayoutReferences } from "route-engine-js";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "../../../internal/project/layout.js";
import { getLayoutEditorItemResizeEdges } from "../../../internal/layoutEditorElementRegistry.js";
import { toHierarchyStructure } from "../../../internal/project/tree.js";

const OVERLAY_BORDER = {
  color: "#ffffff",
  width: 2,
  alpha: 1,
};
const OVERLAY_FILL = {
  color: "#ffffff",
  alpha: 0.001,
};
const OVERLAY_ANCHOR_FILL = {
  color: "#ffffff",
  alpha: 1,
};
const OVERLAY_ANCHOR_BORDER = {
  color: "#111111",
  width: 1,
  alpha: 1,
};
const OVERLAY_ANCHOR_SIZE = 8;
const OVERLAY_RESIZE_HANDLE_SIZE = 12;
const jemplFunctions = {
  formatDate: (timestamp, format = "DD/MM/YYYY - HH:mm") => {
    if (!timestamp) {
      return "";
    }

    const date = new Date(timestamp);
    const pad = (value) => String(value).padStart(2, "0");

    return format
      .replace("DD", pad(date.getDate()))
      .replace("MM", pad(date.getMonth() + 1))
      .replace("YYYY", date.getFullYear())
      .replace("YY", String(date.getFullYear()).slice(-2))
      .replace("HH", pad(date.getHours()))
      .replace("mm", pad(date.getMinutes()))
      .replace("ss", pad(date.getSeconds()));
  },
};

const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

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
      soundVolume: nextRuntime.soundVolume ?? 500,
      musicVolume: nextRuntime.musicVolume ?? 500,
      muteAll: nextRuntime.muteAll ?? false,
    },
    dialogue: {
      ...nextDialogue,
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

const isSelectableMatch = (elementId, selectedItemId) => {
  if (typeof elementId !== "string" || typeof selectedItemId !== "string") {
    return false;
  }

  if (elementId === selectedItemId) {
    return true;
  }

  return elementId === `${selectedItemId}-instance-0`;
};

const collectMatchingPaths = (
  elements,
  selectedItemId,
  parentPath = [],
  matchingPaths = [],
) => {
  toElementList(elements).forEach((element) => {
    const path = [...parentPath, element];

    if (isSelectableMatch(element.id, selectedItemId)) {
      matchingPaths.push(path);
    }

    if (Array.isArray(element.children) && element.children.length > 0) {
      collectMatchingPaths(
        element.children,
        selectedItemId,
        path,
        matchingPaths,
      );
    }
  });

  return matchingPaths;
};

const hasRenderableBounds = (element = {}) => {
  return (
    Number.isFinite(element.width) &&
    Number.isFinite(element.height) &&
    element.width > 0 &&
    element.height > 0
  );
};

const getElementOrigin = (element = {}) => {
  return {
    x: Number.isFinite(element.originX) ? element.originX : 0,
    y: Number.isFinite(element.originY) ? element.originY : 0,
  };
};

const getElementAnchorRatios = (element = {}) => {
  const { x: originX, y: originY } = getElementOrigin(element);

  return {
    anchorX:
      Number.isFinite(element.width) && element.width > 0
        ? originX / element.width
        : 0,
    anchorY:
      Number.isFinite(element.height) && element.height > 0
        ? originY / element.height
        : 0,
  };
};

const buildOverlayRect = ({ element, overlayId, draggable }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const overlayRect = {
    id: overlayId,
    type: "rect",
    x: 0,
    y: 0,
    width: element.width,
    height: element.height,
    fill: OVERLAY_FILL,
    border: OVERLAY_BORDER,
  };

  if (draggable) {
    overlayRect.hover = {
      cursor: "all-scroll",
    };
    overlayRect.drag = {
      start: {
        payload: {},
      },
      move: {
        payload: {},
      },
      end: {
        payload: {},
      },
    };
  }

  return overlayRect;
};

const buildOverlayAnchorMarker = ({ element, overlayId }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const { x: originX, y: originY } = getElementOrigin(element);

  return {
    id: `${overlayId}-anchor`,
    type: "rect",
    x: originX - OVERLAY_ANCHOR_SIZE / 2,
    y: originY - OVERLAY_ANCHOR_SIZE / 2,
    width: OVERLAY_ANCHOR_SIZE,
    height: OVERLAY_ANCHOR_SIZE,
    fill: OVERLAY_ANCHOR_FILL,
    border: OVERLAY_ANCHOR_BORDER,
  };
};

const buildOverlayResizeHandle = ({ element, overlayId, edge }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const vertical = edge === "left" || edge === "right";
  const resizeHandle = {
    id: `${overlayId}-resize-${edge}`,
    type: "rect",
    x:
      edge === "left"
        ? -OVERLAY_RESIZE_HANDLE_SIZE / 2
        : edge === "right"
          ? element.width - OVERLAY_RESIZE_HANDLE_SIZE / 2
          : 0,
    y:
      edge === "top"
        ? -OVERLAY_RESIZE_HANDLE_SIZE / 2
        : edge === "bottom"
          ? element.height - OVERLAY_RESIZE_HANDLE_SIZE / 2
          : 0,
    width: vertical ? OVERLAY_RESIZE_HANDLE_SIZE : element.width,
    height: vertical ? element.height : OVERLAY_RESIZE_HANDLE_SIZE,
    fill: OVERLAY_FILL,
    hover: {
      cursor: vertical ? "ew-resize" : "ns-resize",
    },
    drag: {
      start: {
        payload: {},
      },
      move: {
        payload: {},
      },
      end: {
        payload: {},
      },
    },
  };

  return resizeHandle;
};

const buildOverlayResizeHandles = ({ element, overlayId, selectedItem }) => {
  const edges = getLayoutEditorItemResizeEdges(selectedItem ?? element);

  return edges
    .map((edge) => buildOverlayResizeHandle({ element, overlayId, edge }))
    .filter(Boolean);
};

const buildOverlayElementContainer = ({ element, overlayId, children }) => {
  const { x: originX, y: originY } = getElementOrigin(element);
  const { anchorX, anchorY } = getElementAnchorRatios(element);
  const overlayContainer = {
    id: overlayId,
    type: "container",
    x: (element.x ?? 0) + originX,
    y: (element.y ?? 0) + originY,
    width: element.width,
    height: element.height,
    anchorX,
    anchorY,
    children,
  };

  if (typeof element.rotation === "number") {
    overlayContainer.rotation = element.rotation;
  }

  if (element.anchorToBottom) {
    overlayContainer.anchorToBottom = true;
  }

  return overlayContainer;
};

const buildOverlayTree = ({ path, overlayId, draggable, selectedItem }) => {
  const selectedElement = path[path.length - 1];
  const overlayRect = buildOverlayRect({
    element: selectedElement,
    overlayId,
    draggable,
  });
  const anchorMarker = buildOverlayAnchorMarker({
    element: selectedElement,
    overlayId,
  });
  let overlayTree;

  if (!overlayRect || !anchorMarker) {
    return undefined;
  }

  overlayTree = buildOverlayElementContainer({
    element: selectedElement,
    overlayId: `${overlayId}-group`,
    children: [
      overlayRect,
      ...buildOverlayResizeHandles({
        element: selectedElement,
        overlayId,
        selectedItem,
      }),
      anchorMarker,
    ],
  });

  for (let index = path.length - 2; index >= 0; index -= 1) {
    const ancestor = path[index];

    overlayTree = buildOverlayElementContainer({
      element: ancestor,
      overlayId: `${overlayId}-container-${index}`,
      children: [overlayTree],
    });
  }

  return overlayTree;
};

const selectPrimaryMatchingPath = (parsedElements, selectedItemId) => {
  if (!selectedItemId) {
    return undefined;
  }

  const matchingPaths = collectMatchingPaths(
    parsedElements,
    selectedItemId,
  ).filter((path) => hasRenderableBounds(path[path.length - 1]));

  if (matchingPaths.length === 0) {
    return undefined;
  }

  return (
    matchingPaths.find(
      (path) =>
        path[path.length - 1]?.id === selectedItemId ||
        path[path.length - 1]?.id === `${selectedItemId}-instance-0`,
    ) ?? matchingPaths[0]
  );
};

const toSelectedElementMetrics = (path) => {
  const element = path?.[path.length - 1];
  if (!element) {
    return undefined;
  }

  return {
    id: element.id,
    type: element.type,
    width: element.width,
    height: element.height,
    measuredWidth: element.measuredWidth,
  };
};

const resolveLayoutPreviewElements = ({ elements, previewData } = {}) => {
  return toElementList(
    parseAndRender(
      toElementList(elements),
      normalizeLayoutEditorPreviewData(previewData),
      {
        functions: jemplFunctions,
      },
    ),
  );
};

export const createLayoutEditorSelectionOverlay = ({
  parsedElements,
  selectedItemId,
  selectedItem,
  disableMoveDrag = false,
} = {}) => {
  const primaryPath = selectPrimaryMatchingPath(parsedElements, selectedItemId);
  if (!primaryPath) {
    return [];
  }

  const primaryOverlay = buildOverlayTree({
    path: primaryPath,
    overlayId: "selected-border",
    draggable: disableMoveDrag !== true,
    selectedItem,
  });

  if (!primaryOverlay) {
    return [];
  }

  return [primaryOverlay];
};

export const loadLayoutEditorAssets = async ({
  projectService,
  selectCachedFileContent,
  clearCachedFileContent,
  cacheFileContent,
  fileReferences,
  fontsItems,
} = {}) => {
  const assets = {};

  for (const fileReference of fileReferences) {
    const { url: fileId, type: fileType } = fileReference;
    const cacheKey = fileId;
    let url;

    const cachedUrl = selectCachedFileContent?.({ fileId: cacheKey });
    if (cachedUrl) {
      if (!isBlobUrl(cachedUrl)) {
        url = cachedUrl;
      } else {
        clearCachedFileContent?.({ fileId: cacheKey });
      }
    }

    if (!url) {
      const result = await projectService.getFileContent(fileId);
      url = result.url;
      if (!isBlobUrl(url)) {
        cacheFileContent?.({ fileId: cacheKey, url });
      }
    }

    let type = fileType || "image/png";
    const fontItem = Object.values(fontsItems).find(
      (font) => font.fileId === fileId,
    );
    if (fontItem) {
      const fileName = fontItem.name || "";
      if (fileName.endsWith(".woff2")) {
        type = "font/woff2";
      } else if (fileName.endsWith(".woff")) {
        type = "font/woff";
      } else if (fileName.endsWith(".ttf")) {
        type = "font/ttf";
      } else if (fileName.endsWith(".otf")) {
        type = "font/otf";
      } else {
        type = "font/ttf";
      }
    }

    assets[`${fileId}`] = {
      url,
      type,
    };
  }

  return assets;
};

export const createLayoutEditorRenderState = ({
  layoutState,
  repositoryState,
} = {}) => {
  const imageItems = repositoryState?.images?.items || {};
  const spritesheetsData = repositoryState?.spritesheets || {
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
      particlesData,
      spritesheetsData,
      layoutsData: repositoryState?.layouts?.items || {},
    },
  );

  return {
    renderStateElements: elements,
    resources,
    fontsItems,
  };
};

export const createLayoutEditorRenderedElements = ({
  layoutState,
  repositoryState,
  previewData,
  resolution,
  selectedItemId,
  disableMoveDrag,
  graphicsService,
} = {}) => {
  const { renderStateElements, resources } = createLayoutEditorRenderState({
    layoutState,
    repositoryState,
  });
  const normalizedPreviewData = normalizeLayoutEditorPreviewData(previewData);
  const finalElements = resolveLayoutPreviewElements({
    elements: renderStateElements,
    previewData: normalizedPreviewData,
  });
  const resolvedFinalElements = resolveLayoutReferences(finalElements, {
    resources,
  });
  const previewBackgroundElement = createLayoutEditorPreviewBackgroundElement({
    previewData: normalizedPreviewData,
    repositoryState,
    resolution,
  });
  const renderedElements = previewBackgroundElement
    ? [previewBackgroundElement, ...resolvedFinalElements]
    : resolvedFinalElements;
  const parsedState = graphicsService.parse({
    elements: renderedElements,
  });
  const overlayElements = createLayoutEditorSelectionOverlay({
    parsedElements: parsedState.elements,
    selectedItemId,
    selectedItem: layoutState?.elements?.items?.[selectedItemId],
    disableMoveDrag,
  });
  const selectedElementMetrics = toSelectedElementMetrics(
    selectPrimaryMatchingPath(parsedState.elements, selectedItemId),
  );

  return {
    elements: [...renderedElements, ...overlayElements],
    fileReferences: extractFileIdsFromRenderState(renderedElements),
    selectedElementMetrics,
  };
};
