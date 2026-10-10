import { extractFileIdsFromRenderState } from "../../../internal/project/layout.js";
import { getLayoutEditorItemResizeEdges } from "../../../internal/layoutEditorElementRegistry.js";
import {
  createFontAssetMetadataByFileId,
  createLayoutPreviewElements,
  createLayoutPreviewRenderState,
  formatLayoutPreviewDate,
} from "../../../internal/layoutPreview.js";
import {
  createTransformSelectionAnchor,
  createTransformSelectionHitArea,
  createTransformSelectionResizeHandle,
} from "../../../internal/transformSelectionChrome.js";
import {
  createLayoutEditorSelectionElementMapper,
  extractLayoutEditorSelectionOccurrences,
} from "./layoutEditorCanvasSelection.js";
import {
  LAYOUT_EDITOR_ROTATE_CURSOR,
  LAYOUT_EDITOR_ROTATION_TARGET_ID,
} from "./layoutEditorCanvasRotation.js";

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
const OVERLAY_FILL = "transparent";
const OVERLAY_ANCHOR_CIRCLE_FILL = {
  type: "radial-gradient",
  innerCenter: { x: 0.5, y: 0.5 },
  innerRadius: 0,
  outerCenter: { x: 0.5, y: 0.5 },
  outerRadius: 0.5,
  coordinateSpace: "local",
  stops: [
    { offset: 0, color: "#ffffff" },
    { offset: 0.74, color: "#ffffff" },
    { offset: 0.75, color: OVERLAY_INNER_COLOR },
    { offset: 0.99, color: OVERLAY_INNER_COLOR },
    { offset: 1, color: "transparent" },
  ],
};
const OVERLAY_ANCHOR_SIZE = 8;
// The renderer draws one pixel per canvas unit, at the project resolution.
// Zoomed in past that, a CSS pixel is under one unit and a line that thin
// fades out, so overlay strokes stay at least one unit wide.
const MIN_OVERLAY_STROKE_UNITS = 1;
const getOverlayStrokeUnits = (canvasUnitsPerCssPixel) =>
  Math.max(canvasUnitsPerCssPixel, MIN_OVERLAY_STROKE_UNITS);
const OVERLAY_RESIZE_HANDLE_SIZE = 12;
const OVERLAY_ROTATION_HANDLE_SIZE = 16;
export const formatLayoutEditorPreviewDate = formatLayoutPreviewDate;

const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

const toElementList = (elements) => {
  if (Array.isArray(elements)) {
    return elements.filter(Boolean);
  }

  return elements ? [elements] : [];
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
  const overlayRect = createTransformSelectionHitArea({
    id: overlayId,
    width: element.width,
    height: element.height,
    fill: OVERLAY_FILL,
    draggable: false,
  });

  if (overlayRect && draggable) {
    overlayRect.hover = {
      cursor: "all-scroll",
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

  const borderWidth =
    OVERLAY_OUTER_BORDER.width * getOverlayStrokeUnits(canvasUnitsPerCssPixel);
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

  const strokeUnits = getOverlayStrokeUnits(canvasUnitsPerCssPixel);
  return {
    id: `${overlayId}-inner`,
    type: "rect",
    x: strokeUnits / 2,
    y: strokeUnits / 2,
    width: Math.max(0, element.width - strokeUnits),
    height: Math.max(0, element.height - strokeUnits),
    fill: OVERLAY_FILL,
    border: {
      ...OVERLAY_INNER_BORDER,
      width: OVERLAY_INNER_BORDER.width * strokeUnits,
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

  const { anchorX, anchorY } = getElementAnchorRatios(element);
  const anchorSize = OVERLAY_ANCHOR_SIZE * canvasUnitsPerCssPixel;

  return createTransformSelectionAnchor({
    id: `${overlayId}-anchor`,
    width: element.width,
    height: element.height,
    anchorX,
    anchorY,
    size: anchorSize,
    fill: OVERLAY_ANCHOR_CIRCLE_FILL,
  });
};

const transformOverlayPoint = (point, element = {}) => {
  const { x: originX, y: originY } = getElementOrigin(element);
  const radians = ((element.rotation ?? 0) * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const localX = point.x - originX;
  const localY = point.y - originY;

  return {
    x: Math.round((element.x ?? 0) + originX) + localX * cosine - localY * sine,
    y: Math.round((element.y ?? 0) + originY) + localX * sine + localY * cosine,
  };
};

const getOverlayWorldPoint = (path, localPoint) => {
  let point = localPoint;

  for (let index = path.length - 1; index >= 0; index -= 1) {
    point = transformOverlayPoint(point, path[index]);
  }

  return point;
};

const buildOverlayRotationHandle = ({
  element,
  path,
  canvasUnitsPerCssPixel,
}) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const { x: originX, y: originY } = getElementOrigin(element);
  const handleSize = OVERLAY_ROTATION_HANDLE_SIZE * canvasUnitsPerCssPixel;
  const fallbackPivot = getOverlayWorldPoint(path, {
    x: originX,
    y: originY,
  });

  const dragPayload = {
    rotationPivotX: fallbackPivot.x,
    rotationPivotY: fallbackPivot.y,
  };

  return {
    id: LAYOUT_EDITOR_ROTATION_TARGET_ID,
    type: "rect",
    x: originX - handleSize / 2,
    y: originY - handleSize / 2,
    width: handleSize,
    height: handleSize,
    cornerRadius: handleSize / 2,
    fill: OVERLAY_FILL,
    hover: {
      cursor: LAYOUT_EDITOR_ROTATE_CURSOR,
    },
    drag: {
      start: {
        payload: dragPayload,
      },
      move: {
        payload: dragPayload,
      },
      end: {
        payload: dragPayload,
      },
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

  const resizeHandleSize = OVERLAY_RESIZE_HANDLE_SIZE * canvasUnitsPerCssPixel;
  return createTransformSelectionResizeHandle({
    id: `${overlayId}-resize-${edge}`,
    width: element.width,
    height: element.height,
    edge,
    size: resizeHandleSize,
    fill: OVERLAY_FILL,
  });
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
  const rotationHandle = buildOverlayRotationHandle({
    element: selectedElement,
    path,
    canvasUnitsPerCssPixel,
  });
  let overlayTree;

  if (
    !overlayRect ||
    !overlayOuterRect ||
    !overlayInnerRect ||
    !anchorMarker ||
    !rotationHandle
  ) {
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
      rotationHandle,
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
  const strokeUnits = getOverlayStrokeUnits(canvasUnitsPerCssPixel);
  const halfStroke = strokeUnits / 2;
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
      width: width + strokeUnits,
      height: height + strokeUnits,
      rotation,
      fill: OVERLAY_FILL,
      border: {
        color: "#ffffff",
        width: strokeUnits,
        alpha: 1,
      },
    },
    {
      id: "hover-border-inner",
      type: "rect",
      x: innerPosition.x,
      y: innerPosition.y,
      width: Math.max(0, width - strokeUnits),
      height: Math.max(0, height - strokeUnits),
      rotation,
      fill: OVERLAY_FILL,
      border: {
        color: OVERLAY_INNER_COLOR,
        width: strokeUnits,
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
  const fontAssetMetadataByFileId = createFontAssetMetadataByFileId(fontsItems);

  const assetEntries = await Promise.allSettled(
    uniqueFileReferences.map(async (fileReference) => {
      const { url: fileId, type: fileType } = fileReference;
      const cacheKey = fileId;
      const alreadyLoaded = hasLoadedAsset?.(fileId) === true;
      let url;

      let type = fileType || "image/png";
      const fontAssetMetadata = fontAssetMetadataByFileId[fileId];
      if (fontAssetMetadata) {
        type = fontAssetMetadata.type;
      }

      if (alreadyLoaded) {
        return {
          alreadyLoaded: true,
          fileId,
          type,
          fontWeightDescriptor: fontAssetMetadata?.fontWeightDescriptor,
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
        const result = await projectService.getFileContent(fileId, {
          verifyImageIntegrity: true,
        });
        url = result.url;
        if (!isBlobUrl(url)) {
          cacheFileContent?.({ fileId: cacheKey, url });
        }
      }

      return {
        fileId,
        type,
        fontWeightDescriptor: fontAssetMetadata?.fontWeightDescriptor,
        url,
      };
    }),
  );

  const failures = [];
  for (const [index, result] of assetEntries.entries()) {
    if (result.status === "rejected") {
      failures.push({
        fileId: uniqueFileReferences[index].url,
        error: result.reason,
      });
      continue;
    }
    const assetEntry = result.value;
    if (assetEntry.alreadyLoaded) {
      continue;
    }

    assets[`${assetEntry.fileId}`] = {
      url: assetEntry.url,
      type: assetEntry.type,
      fontWeightDescriptor: assetEntry.fontWeightDescriptor,
    };
  }

  return { assets, failures };
};

export const omitUnavailableLayoutElements = (elements, failedFileIds) => {
  const failed = new Set(failedFileIds);
  const filterElements = (items) =>
    items.flatMap((element) => {
      const { children, ...ownProperties } = element;
      if (
        extractFileIdsFromRenderState(ownProperties).some(({ url }) =>
          failed.has(url),
        )
      )
        return [];
      if (!Array.isArray(children)) return [element];
      return [{ ...element, children: filterElements(children) }];
    });
  return filterElements(elements);
};

export const createLayoutEditorRenderState = ({
  layoutState,
  repositoryState,
} = {}) =>
  createLayoutPreviewRenderState({
    layoutState,
    repositoryState,
    mapElement: createLayoutEditorSelectionElementMapper({
      layoutId: layoutState?.id,
    }),
  });

const createLayoutEditorResolvedElements = ({
  layoutState,
  repositoryState,
  previewData,
  resolution,
} = {}) => {
  const { elements, backgroundElement, characterSprite } =
    createLayoutPreviewElements({
      layoutState,
      repositoryState,
      previewData,
      resolution,
      mapElement: createLayoutEditorSelectionElementMapper({
        layoutId: layoutState?.id,
      }),
    });
  const selectionOccurrences =
    extractLayoutEditorSelectionOccurrences(elements);
  const renderedElements = [...selectionOccurrences.elements];
  if (backgroundElement) {
    renderedElements.unshift(backgroundElement);
  }
  if (characterSprite) {
    renderedElements.push(characterSprite);
  }
  return {
    renderedElements,
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
