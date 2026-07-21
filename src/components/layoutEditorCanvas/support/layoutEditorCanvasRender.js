import { parseAndRender } from "jempl";
import { resolveLayoutReferences } from "route-engine-js";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "../../../internal/project/layout.js";
import { getLayoutEditorItemResizeEdges } from "../../../internal/layoutEditorElementRegistry.js";
import { toHierarchyStructure } from "../../../internal/project/tree.js";
import {
  createLayoutEditorSelectionElementMapper,
  extractLayoutEditorSelectionOccurrences,
} from "./layoutEditorCanvasSelection.js";

const OVERLAY_INNER_COLOR = "#b3b3b3";
const OVERLAY_INNER_BORDER = {
  color: OVERLAY_INNER_COLOR,
  width: 1,
  alpha: 1,
};
const OVERLAY_OUTER_BORDER = {
  color: "#ffffff",
  width: 1,
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
  color: OVERLAY_INNER_COLOR,
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

const dedupeFileReferences = (fileReferences = []) => {
  const seenFileIds = new Set();
  const nextFileReferences = [];

  for (const fileReference of fileReferences) {
    const fileId = fileReference?.url;
    if (!fileId || seenFileIds.has(fileId)) {
      continue;
    }

    seenFileIds.add(fileId);
    nextFileReferences.push(fileReference);
  }

  return nextFileReferences;
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

const createFontAssetTypeByFileId = (fontsItems = {}) => {
  const fontAssetTypeByFileId = {};

  for (const fontItem of Object.values(fontsItems)) {
    const fileId = fontItem?.fileId;
    if (!fileId) {
      continue;
    }

    fontAssetTypeByFileId[fileId] = resolveFontAssetType(fontItem.name || "");
  }

  return fontAssetTypeByFileId;
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

const collectMatchingPaths = (
  elements,
  occurrenceId,
  parentPath = [],
  matchingPaths = [],
) => {
  toElementList(elements).forEach((element) => {
    const path = [...parentPath, element];

    if (element.id === occurrenceId) {
      matchingPaths.push(path);
    }

    if (Array.isArray(element.children) && element.children.length > 0) {
      collectMatchingPaths(element.children, occurrenceId, path, matchingPaths);
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

const buildOverlayOuterRect = ({
  element,
  overlayId,
  canvasUnitsPerCssPixel,
}) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const borderWidth = OVERLAY_OUTER_BORDER.width * canvasUnitsPerCssPixel;
  const borderOffset = borderWidth / 2;

  return {
    id: `${overlayId}-outer`,
    type: "rect",
    x: -borderOffset,
    y: -borderOffset,
    width: element.width + borderWidth,
    height: element.height + borderWidth,
    fill: OVERLAY_FILL,
    border: {
      ...OVERLAY_OUTER_BORDER,
      width: borderWidth,
    },
  };
};

const buildOverlayInnerRect = ({
  element,
  overlayId,
  canvasUnitsPerCssPixel,
}) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  return {
    id: `${overlayId}-inner`,
    type: "rect",
    x: canvasUnitsPerCssPixel / 2,
    y: canvasUnitsPerCssPixel / 2,
    width: Math.max(0, element.width - canvasUnitsPerCssPixel),
    height: Math.max(0, element.height - canvasUnitsPerCssPixel),
    fill: OVERLAY_FILL,
    border: {
      ...OVERLAY_INNER_BORDER,
      width: OVERLAY_INNER_BORDER.width * canvasUnitsPerCssPixel,
    },
  };
};

const buildOverlayAnchorMarker = ({
  element,
  overlayId,
  canvasUnitsPerCssPixel,
}) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const { x: originX, y: originY } = getElementOrigin(element);
  const anchorSize = OVERLAY_ANCHOR_SIZE * canvasUnitsPerCssPixel;

  return {
    id: `${overlayId}-anchor`,
    type: "rect",
    x: originX - anchorSize / 2,
    y: originY - anchorSize / 2,
    width: anchorSize,
    height: anchorSize,
    fill: OVERLAY_ANCHOR_FILL,
    border: {
      ...OVERLAY_ANCHOR_BORDER,
      width: OVERLAY_ANCHOR_BORDER.width * canvasUnitsPerCssPixel,
    },
  };
};

const buildOverlayResizeHandle = ({
  element,
  overlayId,
  edge,
  canvasUnitsPerCssPixel,
}) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const vertical = edge === "left" || edge === "right";
  const resizeHandleSize = OVERLAY_RESIZE_HANDLE_SIZE * canvasUnitsPerCssPixel;
  const resizeHandle = {
    id: `${overlayId}-resize-${edge}`,
    type: "rect",
    x:
      edge === "left"
        ? -resizeHandleSize / 2
        : edge === "right"
          ? element.width - resizeHandleSize / 2
          : 0,
    y:
      edge === "top"
        ? -resizeHandleSize / 2
        : edge === "bottom"
          ? element.height - resizeHandleSize / 2
          : 0,
    width: vertical ? resizeHandleSize : element.width,
    height: vertical ? element.height : resizeHandleSize,
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

const buildOverlayResizeHandles = ({
  element,
  overlayId,
  selectedItem,
  canvasUnitsPerCssPixel,
}) => {
  const edges = getLayoutEditorItemResizeEdges(selectedItem ?? element);

  return edges
    .map((edge) =>
      buildOverlayResizeHandle({
        element,
        overlayId,
        edge,
        canvasUnitsPerCssPixel,
      }),
    )
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

const buildOverlayTree = ({
  path,
  overlayId,
  draggable,
  selectedItem,
  canvasUnitsPerCssPixel,
}) => {
  const selectedElement = path[path.length - 1];
  const overlayRect = buildOverlayRect({
    element: selectedElement,
    overlayId,
    draggable,
  });
  const overlayOuterRect = buildOverlayOuterRect({
    element: selectedElement,
    overlayId,
    canvasUnitsPerCssPixel,
  });
  const overlayInnerRect = buildOverlayInnerRect({
    element: selectedElement,
    overlayId,
    canvasUnitsPerCssPixel,
  });
  const anchorMarker = buildOverlayAnchorMarker({
    element: selectedElement,
    overlayId,
    canvasUnitsPerCssPixel,
  });
  let overlayTree;

  if (!overlayRect || !overlayOuterRect || !overlayInnerRect || !anchorMarker) {
    return undefined;
  }

  overlayTree = buildOverlayElementContainer({
    element: selectedElement,
    overlayId: `${overlayId}-group`,
    children: [
      overlayOuterRect,
      overlayInnerRect,
      overlayRect,
      ...buildOverlayResizeHandles({
        element: selectedElement,
        overlayId,
        selectedItem,
        canvasUnitsPerCssPixel,
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

const selectPrimaryMatchingPath = ({
  parsedElements,
  selectedItemId,
  selectedOccurrenceId,
  occurrencesById,
  occurrenceIdsByOwner,
}) => {
  if (!selectedItemId) {
    return undefined;
  }

  const selectedOccurrence = occurrencesById[selectedOccurrenceId];
  const occurrenceId =
    selectedOccurrence?.ownerItemId === selectedItemId
      ? selectedOccurrenceId
      : occurrenceIdsByOwner[selectedItemId]?.[0];
  const matchingPaths = collectMatchingPaths(
    parsedElements,
    occurrenceId,
  ).filter((path) => hasRenderableBounds(path[path.length - 1]));

  if (matchingPaths.length === 0) {
    return undefined;
  }

  return matchingPaths[0];
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

export const createLayoutEditorSelectionOverlay = ({
  parsedElements,
  selectedItemId,
  selectedOccurrenceId,
  occurrencesById = {},
  occurrenceIdsByOwner = {},
  selectedItem,
  disableMoveDrag = false,
  canvasUnitsPerCssPixel = 1,
} = {}) => {
  const primaryPath = selectPrimaryMatchingPath({
    parsedElements,
    selectedItemId,
    selectedOccurrenceId,
    occurrencesById,
    occurrenceIdsByOwner,
  });
  if (!primaryPath) {
    return [];
  }

  const primaryOverlay = buildOverlayTree({
    path: primaryPath,
    overlayId: "selected-border",
    draggable: disableMoveDrag !== true,
    selectedItem,
    canvasUnitsPerCssPixel,
  });

  if (!primaryOverlay) {
    return [];
  }

  return [primaryOverlay];
};

export const createLayoutEditorSelectionRenderState = ({
  baseElements = [],
  parsedElements = [],
  selectedItemId,
  selectedOccurrenceId,
  occurrencesById = {},
  occurrenceIdsByOwner = {},
  selectedItem,
  disableMoveDrag = false,
  canvasUnitsPerCssPixel = 1,
} = {}) => {
  const overlayElements = createLayoutEditorSelectionOverlay({
    parsedElements,
    selectedItemId,
    selectedOccurrenceId,
    occurrencesById,
    occurrenceIdsByOwner,
    selectedItem,
    disableMoveDrag,
    canvasUnitsPerCssPixel,
  });
  const primaryMatchingPath = selectPrimaryMatchingPath({
    parsedElements,
    selectedItemId,
    selectedOccurrenceId,
    occurrencesById,
    occurrenceIdsByOwner,
  });

  return {
    elements: [...baseElements, ...overlayElements],
    selectedElementMetrics: toSelectedElementMetrics(primaryMatchingPath),
  };
};

export const createLayoutEditorHoverOverlay = ({
  bounds,
  canvasUnitsPerCssPixel = 1,
} = {}) => {
  const corners = bounds?.corners ?? [];
  if (corners.length !== 4) {
    return [];
  }

  const [topLeft, topRight, , bottomLeft] = corners;
  const width = Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y);
  const height = Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  if (width <= 0 || height <= 0) {
    return [];
  }

  const unitX = {
    x: (topRight.x - topLeft.x) / width,
    y: (topRight.y - topLeft.y) / width,
  };
  const unitY = {
    x: (bottomLeft.x - topLeft.x) / height,
    y: (bottomLeft.y - topLeft.y) / height,
  };
  const rotation = (Math.atan2(unitX.y, unitX.x) * 180) / Math.PI;
  const halfStroke = canvasUnitsPerCssPixel / 2;
  const toOffsetPoint = (distance) => ({
    x: topLeft.x + unitX.x * distance + unitY.x * distance,
    y: topLeft.y + unitX.y * distance + unitY.y * distance,
  });
  const outerPosition = toOffsetPoint(-halfStroke);
  const innerPosition = toOffsetPoint(halfStroke);

  return [
    {
      id: "hover-border-outer",
      type: "rect",
      x: outerPosition.x,
      y: outerPosition.y,
      width: width + canvasUnitsPerCssPixel,
      height: height + canvasUnitsPerCssPixel,
      rotation,
      fill: OVERLAY_FILL,
      border: {
        color: "#ffffff",
        width: canvasUnitsPerCssPixel,
        alpha: 1,
      },
    },
    {
      id: "hover-border-inner",
      type: "rect",
      x: innerPosition.x,
      y: innerPosition.y,
      width: Math.max(0, width - canvasUnitsPerCssPixel),
      height: Math.max(0, height - canvasUnitsPerCssPixel),
      rotation,
      fill: OVERLAY_FILL,
      border: {
        color: OVERLAY_INNER_COLOR,
        width: canvasUnitsPerCssPixel,
        alpha: 1,
      },
    },
  ];
};

export const loadLayoutEditorAssets = async ({
  projectService,
  selectCachedFileContent,
  clearCachedFileContent,
  cacheFileContent,
  hasLoadedAsset,
  fileReferences,
  fontsItems,
} = {}) => {
  const assets = {};
  const uniqueFileReferences = dedupeFileReferences(fileReferences);
  const fontAssetTypeByFileId = createFontAssetTypeByFileId(fontsItems);

  const assetEntries = await Promise.all(
    uniqueFileReferences.map(async (fileReference) => {
      const { url: fileId, type: fileType } = fileReference;
      const cacheKey = fileId;
      const alreadyLoaded = hasLoadedAsset?.(fileId) === true;
      let url;

      let type = fileType || "image/png";
      const fontAssetType = fontAssetTypeByFileId[fileId];
      if (fontAssetType) {
        type = fontAssetType;
      }

      if (alreadyLoaded) {
        return {
          alreadyLoaded: true,
          fileId,
          type,
          url: undefined,
        };
      }

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

      return {
        fileId,
        type,
        url,
      };
    }),
  );

  for (const assetEntry of assetEntries) {
    if (assetEntry.alreadyLoaded) {
      continue;
    }

    assets[`${assetEntry.fileId}`] = {
      url: assetEntry.url,
      type: assetEntry.type,
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
      mapElement: createLayoutEditorSelectionElementMapper({
        layoutId: layoutState?.id,
      }),
    },
  );

  return {
    renderStateElements: elements,
    resources,
    fontsItems,
  };
};

const createLayoutEditorResolvedElements = ({
  layoutState,
  repositoryState,
  previewData,
  resolution,
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
  const selectionOccurrences = extractLayoutEditorSelectionOccurrences(
    resolvedFinalElements,
  );
  const previewBackgroundElement = createLayoutEditorPreviewBackgroundElement({
    previewData: normalizedPreviewData,
    repositoryState,
    resolution,
  });
  return {
    renderedElements: previewBackgroundElement
      ? [previewBackgroundElement, ...selectionOccurrences.elements]
      : selectionOccurrences.elements,
    occurrencesById: selectionOccurrences.occurrencesById,
    occurrenceIdsByOwner: selectionOccurrences.occurrenceIdsByOwner,
  };
};

export const createLayoutEditorAssetReferences = ({
  layoutState,
  repositoryState,
  previewData,
  resolution,
} = {}) => {
  const { renderedElements } = createLayoutEditorResolvedElements({
    layoutState,
    repositoryState,
    previewData,
    resolution,
  });
  const fileReferences = extractFileIdsFromRenderState(renderedElements);

  return {
    fileReferences,
    renderedElements,
  };
};

export const createLayoutEditorRenderedElements = ({
  layoutState,
  repositoryState,
  previewData,
  resolution,
  selectedItemId,
  selectedOccurrenceId,
  disableMoveDrag,
  canvasUnitsPerCssPixel,
  graphicsService,
} = {}) => {
  const { renderedElements, occurrencesById, occurrenceIdsByOwner } =
    createLayoutEditorResolvedElements({
      layoutState,
      repositoryState,
      previewData,
      resolution,
    });
  const parsedState = graphicsService.parse({
    elements: renderedElements,
  });
  const selectionRenderState = createLayoutEditorSelectionRenderState({
    baseElements: renderedElements,
    parsedElements: parsedState.elements,
    selectedItemId,
    selectedOccurrenceId,
    occurrencesById,
    occurrenceIdsByOwner,
    selectedItem: layoutState?.elements?.items?.[selectedItemId],
    disableMoveDrag,
    canvasUnitsPerCssPixel,
  });
  const fileReferences = extractFileIdsFromRenderState(renderedElements);

  return {
    ...selectionRenderState,
    baseElements: renderedElements,
    parsedElements: parsedState.elements,
    fileReferences,
    occurrencesById,
    occurrenceIdsByOwner,
  };
};
