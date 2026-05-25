const BACKGROUND_TRANSFORM_EDITOR_TRANSFORM_ID =
  "__background_transform_editor__";

const TRANSFORM_EDITOR_TARGET_TYPE = {
  BACKGROUND: "background",
  VISUAL: "visual",
  CHARACTER: "character",
};

const BACKGROUND_RESOURCE_TARGET_IDS = [
  "bg-cg-background-sprite",
  "bg-cg-background-video",
  "bg-cg-background-container",
];

export const BACKGROUND_TRANSFORM_FIELDS = [
  "x",
  "y",
  "anchorX",
  "anchorY",
  "scaleX",
  "scaleY",
  "rotation",
  "originX",
  "originY",
];

export const ACTION_TRANSFORM_TARGET_TYPES = TRANSFORM_EDITOR_TARGET_TYPE;

const BACKGROUND_COLOR_TARGET_IDS = ["bg-cg-background-color"];

const RUNTIME_INTERACTION_FIELD_NAMES = [
  "click",
  "rightClick",
  "scrollUp",
  "scrollDown",
  "hover",
  "drag",
  "change",
  "submit",
  "focusEvent",
  "blurEvent",
  "selectionChange",
  "compositionStart",
  "compositionUpdate",
  "compositionEnd",
];

const DEFAULT_TRANSFORM = {
  x: 0,
  y: 0,
  anchorX: 0.5,
  anchorY: 0.5,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  originX: 0,
  originY: 0,
};

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
const RESIZE_EDGES = ["left", "right", "top", "bottom"];

const toPlainObject = (value) => {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
};

const toFiniteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const normalizeBackgroundTransformEditorTransform = (
  value = {},
  defaults = DEFAULT_TRANSFORM,
) => {
  const source = toPlainObject(value);
  const fallback = {
    ...DEFAULT_TRANSFORM,
    ...toPlainObject(defaults),
  };

  return {
    x: toFiniteNumber(source.x, fallback.x),
    y: toFiniteNumber(source.y, fallback.y),
    anchorX: toFiniteNumber(source.anchorX, fallback.anchorX),
    anchorY: toFiniteNumber(source.anchorY, fallback.anchorY),
    rotation: toFiniteNumber(source.rotation, fallback.rotation),
    scaleX: toFiniteNumber(source.scaleX, fallback.scaleX),
    scaleY: toFiniteNumber(source.scaleY, fallback.scaleY),
    originX: toFiniteNumber(source.originX, fallback.originX),
    originY: toFiniteNumber(source.originY, fallback.originY),
  };
};

export const createBackgroundWithInlineTransform = (
  background = {},
  transform = {},
) => {
  const nextBackground = { ...toPlainObject(background) };
  const normalizedTransform =
    normalizeBackgroundTransformEditorTransform(transform);

  delete nextBackground.transformId;
  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    nextBackground[field] = normalizedTransform[field];
  }

  return nextBackground;
};

export const hasInlineTransform = (value = {}) => {
  const source = toPlainObject(value);
  return BACKGROUND_TRANSFORM_FIELDS.some((field) =>
    Object.prototype.hasOwnProperty.call(source, field),
  );
};

export const createActionItemWithInlineTransform = (
  item = {},
  transform = {},
  { preserveTransformId = false } = {},
) => {
  const nextItem = { ...toPlainObject(item) };
  const normalizedTransform =
    normalizeBackgroundTransformEditorTransform(transform);

  if (!preserveTransformId) {
    delete nextItem.transformId;
  }

  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    nextItem[field] = normalizedTransform[field];
  }

  return nextItem;
};

export const removeInlineTransformFields = (item = {}) => {
  const nextItem = { ...toPlainObject(item) };

  for (const field of BACKGROUND_TRANSFORM_FIELDS) {
    delete nextItem[field];
  }

  return nextItem;
};

export const formatBackgroundTransformEditorMetric = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "0";
  }

  return String(Math.round(parsed * 100) / 100);
};

const findSelectedLine = (projectData, { sceneId, sectionId, lineId } = {}) => {
  if (!sceneId || !sectionId || !lineId) {
    return undefined;
  }

  return projectData?.story?.scenes?.[sceneId]?.sections?.[
    sectionId
  ]?.lines?.find((line) => line?.id === lineId);
};

const getTransformEditorTargetType = (editorState = {}) => {
  const targetType =
    editorState.targetType ?? TRANSFORM_EDITOR_TARGET_TYPE.BACKGROUND;
  return Object.values(TRANSFORM_EDITOR_TARGET_TYPE).includes(targetType)
    ? targetType
    : TRANSFORM_EDITOR_TARGET_TYPE.BACKGROUND;
};

const getActionKeyForTransformEditorTarget = (editorState = {}) => {
  const targetType = getTransformEditorTargetType(editorState);

  if (targetType === TRANSFORM_EDITOR_TARGET_TYPE.VISUAL) {
    return "visual";
  }

  if (targetType === TRANSFORM_EDITOR_TARGET_TYPE.CHARACTER) {
    return "character";
  }

  return "background";
};

const resolveActionItemIndex = (items = [], editorState = {}) => {
  const targetType = getTransformEditorTargetType(editorState);
  const editorItem = toPlainObject(editorState.item);

  if (targetType === TRANSFORM_EDITOR_TARGET_TYPE.VISUAL && editorItem.id) {
    const visualIndex = items.findIndex((item) => item?.id === editorItem.id);
    if (visualIndex >= 0) {
      return visualIndex;
    }
  }

  return Number.isInteger(editorState.itemIndex) ? editorState.itemIndex : -1;
};

const applyActionItemTransformEditorToLine = (
  selectedLine,
  editorState = {},
) => {
  const actionKey = getActionKeyForTransformEditorTarget(editorState);
  if (actionKey === "background") {
    const inlineBackground = createBackgroundWithInlineTransform(
      selectedLine.actions?.background,
      editorState.transform,
    );

    selectedLine.actions.background = {
      ...inlineBackground,
      transformId: BACKGROUND_TRANSFORM_EDITOR_TRANSFORM_ID,
    };
    return;
  }

  const action = toPlainObject(selectedLine.actions?.[actionKey]);
  const items = Array.isArray(action.items) ? [...action.items] : [];
  const itemIndex = resolveActionItemIndex(items, editorState);
  const item = items[itemIndex];
  if (!item) {
    return;
  }

  const inlineItem = createActionItemWithInlineTransform(
    item,
    editorState.transform,
    { preserveTransformId: true },
  );
  inlineItem.transformId =
    inlineItem.transformId ?? BACKGROUND_TRANSFORM_EDITOR_TRANSFORM_ID;

  items[itemIndex] = inlineItem;
  selectedLine.actions[actionKey] = {
    ...action,
    items,
  };
};

export const createProjectDataWithBackgroundTransformEditor = (
  projectData,
  selection,
  editorState = {},
) => {
  if (editorState?.isOpen !== true) {
    return projectData;
  }

  const selectedLine = findSelectedLine(projectData, selection);
  if (!selectedLine) {
    return projectData;
  }

  const nextProjectData = structuredClone(projectData);
  const nextSelectedLine = findSelectedLine(nextProjectData, selection);
  const nextResources = toPlainObject(nextProjectData.resources);
  const nextTransforms = toPlainObject(nextResources.transforms);

  nextProjectData.resources = nextResources;
  nextResources.transforms = nextTransforms;
  nextTransforms[BACKGROUND_TRANSFORM_EDITOR_TRANSFORM_ID] =
    normalizeBackgroundTransformEditorTransform(editorState.transform);

  nextSelectedLine.actions = toPlainObject(nextSelectedLine.actions);
  applyActionItemTransformEditorToLine(nextSelectedLine, editorState);

  return nextProjectData;
};

const stripElementRuntimeInteractions = (element) => {
  if (!element || typeof element !== "object") {
    return element;
  }

  const nextElement = { ...element };
  for (const fieldName of RUNTIME_INTERACTION_FIELD_NAMES) {
    delete nextElement[fieldName];
  }

  if (Array.isArray(nextElement.children)) {
    nextElement.children = nextElement.children.map(
      stripElementRuntimeInteractions,
    );
  }

  return nextElement;
};

const stripRenderStateGlobalInteractions = (global = {}) => {
  if (!global || typeof global !== "object" || Array.isArray(global)) {
    return global;
  }

  const nextGlobal = { ...global };
  delete nextGlobal.keyboard;
  return nextGlobal;
};

const toElementList = (elements) => {
  if (Array.isArray(elements)) {
    return elements.filter(Boolean);
  }

  return elements ? [elements] : [];
};

const collectMatchingPaths = (
  elements,
  selectedIds,
  parentPath = [],
  matchingPaths = [],
) => {
  toElementList(elements).forEach((element) => {
    const path = [...parentPath, element];

    if (selectedIds.includes(element?.id)) {
      matchingPaths.push(path);
    }

    if (Array.isArray(element?.children) && element.children.length > 0) {
      collectMatchingPaths(element.children, selectedIds, path, matchingPaths);
    }
  });

  return matchingPaths;
};

const getRenderableWidth = (element = {}) => {
  const width = Number(element.width ?? element.measuredWidth);
  return Number.isFinite(width) && width > 0 ? width : undefined;
};

const getRenderableHeight = (element = {}) => {
  const height = Number(element.height ?? element.measuredHeight);
  return Number.isFinite(height) && height > 0 ? height : undefined;
};

const hasRenderableBounds = (element = {}) => {
  return (
    getRenderableWidth(element) !== undefined &&
    getRenderableHeight(element) !== undefined
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
    anchorX: Number.isFinite(getRenderableWidth(element))
      ? originX / getRenderableWidth(element)
      : 0,
    anchorY: Number.isFinite(getRenderableHeight(element))
      ? originY / getRenderableHeight(element)
      : 0,
  };
};

const getTransformEditorAnchorRatios = (editorState = {}, element = {}) => {
  const fallback = getElementAnchorRatios(element);
  const transform = toPlainObject(editorState.transform);
  const anchorX = Number(transform.anchorX);
  const anchorY = Number(transform.anchorY);

  return {
    anchorX: Number.isFinite(anchorX) ? anchorX : fallback.anchorX,
    anchorY: Number.isFinite(anchorY) ? anchorY : fallback.anchorY,
  };
};

const buildOverlayRect = ({ element, draggable }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const overlayRect = {
    id: "selected-border",
    type: "rect",
    x: 0,
    y: 0,
    width: getRenderableWidth(element),
    height: getRenderableHeight(element),
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

const buildOverlayAnchorMarker = ({ element, anchorRatios }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const width = getRenderableWidth(element);
  const height = getRenderableHeight(element);
  const anchorX = Number.isFinite(anchorRatios?.anchorX)
    ? anchorRatios.anchorX
    : getElementAnchorRatios(element).anchorX;
  const anchorY = Number.isFinite(anchorRatios?.anchorY)
    ? anchorRatios.anchorY
    : getElementAnchorRatios(element).anchorY;

  return {
    id: "selected-border-anchor",
    type: "rect",
    x: width * anchorX - OVERLAY_ANCHOR_SIZE / 2,
    y: height * anchorY - OVERLAY_ANCHOR_SIZE / 2,
    width: OVERLAY_ANCHOR_SIZE,
    height: OVERLAY_ANCHOR_SIZE,
    fill: OVERLAY_ANCHOR_FILL,
    border: OVERLAY_ANCHOR_BORDER,
  };
};

const buildOverlayResizeHandle = ({ element, edge }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const width = getRenderableWidth(element);
  const height = getRenderableHeight(element);
  const vertical = edge === "left" || edge === "right";

  return {
    id: `selected-border-resize-${edge}`,
    type: "rect",
    x:
      edge === "left"
        ? -OVERLAY_RESIZE_HANDLE_SIZE / 2
        : edge === "right"
          ? width - OVERLAY_RESIZE_HANDLE_SIZE / 2
          : 0,
    y:
      edge === "top"
        ? -OVERLAY_RESIZE_HANDLE_SIZE / 2
        : edge === "bottom"
          ? height - OVERLAY_RESIZE_HANDLE_SIZE / 2
          : 0,
    width: vertical ? OVERLAY_RESIZE_HANDLE_SIZE : width,
    height: vertical ? height : OVERLAY_RESIZE_HANDLE_SIZE,
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
};

const buildOverlayResizeHandles = ({ element }) => {
  return RESIZE_EDGES.map((edge) =>
    buildOverlayResizeHandle({ element, edge }),
  ).filter(Boolean);
};

const buildOverlayElementContainer = ({ element, id, children }) => {
  const { x: originX, y: originY } = getElementOrigin(element);
  const { anchorX, anchorY } = getElementAnchorRatios(element);
  const overlayContainer = {
    id,
    type: "container",
    x: (element.x ?? 0) + originX,
    y: (element.y ?? 0) + originY,
    width: getRenderableWidth(element),
    height: getRenderableHeight(element),
    anchorX,
    anchorY,
    children,
  };

  if (typeof element.rotation === "number") {
    overlayContainer.rotation = element.rotation;
  }

  if (typeof element.scaleX === "number") {
    overlayContainer.scaleX = element.scaleX;
  }

  if (typeof element.scaleY === "number") {
    overlayContainer.scaleY = element.scaleY;
  }

  return overlayContainer;
};

const buildOverlayTree = ({ path, draggable, editorState }) => {
  const selectedElement = path[path.length - 1];
  const overlayRect = buildOverlayRect({
    element: selectedElement,
    draggable,
  });
  const anchorMarker = buildOverlayAnchorMarker({
    element: selectedElement,
    anchorRatios: getTransformEditorAnchorRatios(editorState, selectedElement),
  });

  if (!overlayRect || !anchorMarker) {
    return undefined;
  }

  let overlayTree = buildOverlayElementContainer({
    element: selectedElement,
    id: "selected-border-group",
    children: [
      overlayRect,
      ...buildOverlayResizeHandles({ element: selectedElement }),
      anchorMarker,
    ],
  });

  for (let index = path.length - 2; index >= 0; index -= 1) {
    const ancestor = path[index];

    overlayTree = buildOverlayElementContainer({
      element: ancestor,
      id: `selected-border-container-${index}`,
      children: [overlayTree],
    });
  }

  return overlayTree;
};

const getBackgroundTargetIds = (editorState = {}) => {
  const background = toPlainObject(editorState.background);
  const targetIds = [...BACKGROUND_RESOURCE_TARGET_IDS];

  if (background.resourceId) {
    targetIds.push(`bg-cg-${background.resourceId}`);
  } else if (background.colorId) {
    targetIds.push(...BACKGROUND_COLOR_TARGET_IDS);
  }

  return targetIds;
};

const getActionItemTargetIds = (editorState = {}) => {
  const targetType = getTransformEditorTargetType(editorState);
  const targetIds = [];

  if (editorState.targetId) {
    targetIds.push(editorState.targetId);
  }

  const item = toPlainObject(editorState.item);
  if (targetType === TRANSFORM_EDITOR_TARGET_TYPE.VISUAL && item.id) {
    targetIds.push(`visual-${item.id}`);
  }

  if (targetType === TRANSFORM_EDITOR_TARGET_TYPE.CHARACTER && item.id) {
    targetIds.push(`character-container-${item.id}`);
  }

  return [...new Set(targetIds)];
};

const getTransformEditorTargetIds = (editorState = {}) => {
  if (
    getTransformEditorTargetType(editorState) ===
    TRANSFORM_EDITOR_TARGET_TYPE.BACKGROUND
  ) {
    return getBackgroundTargetIds(editorState);
  }

  return getActionItemTargetIds(editorState);
};

const selectPrimaryMatchingPath = (matchingPaths, targetIds) => {
  const pathsWithBounds = matchingPaths.filter((path) =>
    hasRenderableBounds(path[path.length - 1]),
  );

  for (const targetId of targetIds) {
    const exactMatch = pathsWithBounds.find(
      (path) => path[path.length - 1]?.id === targetId,
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  return pathsWithBounds[0];
};

const selectBackgroundElementPath = (parsedElements, editorState = {}) => {
  const targetIds = getTransformEditorTargetIds(editorState);
  const matchingPaths = collectMatchingPaths(parsedElements, targetIds);
  return selectPrimaryMatchingPath(matchingPaths, targetIds);
};

const toSelectedElementMetrics = (path, editorState = {}) => {
  const element = path?.[path.length - 1];
  if (!element || !hasRenderableBounds(element)) {
    return undefined;
  }
  const { anchorX, anchorY } = getTransformEditorAnchorRatios(
    editorState,
    element,
  );
  const transform = toPlainObject(editorState.transform);
  const scaleX = Number(transform.scaleX);
  const scaleY = Number(transform.scaleY);

  return {
    width: getRenderableWidth(element),
    height: getRenderableHeight(element),
    anchorX,
    anchorY,
    scaleX: Number.isFinite(scaleX)
      ? scaleX
      : Number.isFinite(element.scaleX)
        ? element.scaleX
        : 1,
    scaleY: Number.isFinite(scaleY)
      ? scaleY
      : Number.isFinite(element.scaleY)
        ? element.scaleY
        : 1,
  };
};

export const createBackgroundTransformEditorCanvasState = ({
  renderState = {},
  graphicsService,
  editorState = {},
} = {}) => {
  const renderedElements = toElementList(renderState.elements).map(
    stripElementRuntimeInteractions,
  );
  const parsedState = graphicsService?.parse?.({
    elements: renderedElements,
  });
  const selectedPath = selectBackgroundElementPath(
    parsedState?.elements,
    editorState,
  );
  const overlayElement = selectedPath
    ? buildOverlayTree({
        path: selectedPath,
        draggable: true,
        editorState,
      })
    : undefined;

  return {
    renderState: {
      ...renderState,
      global: stripRenderStateGlobalInteractions(renderState.global),
      audio: [],
      animations: [],
      elements: [...renderedElements, overlayElement].filter(Boolean),
    },
    selectedElementMetrics: toSelectedElementMetrics(selectedPath, editorState),
  };
};

export const createBackgroundTransformEditorRenderState = (payload = {}) => {
  return createBackgroundTransformEditorCanvasState(payload).renderState;
};

export const selectBackgroundTransformEditorElementMetrics = (payload = {}) => {
  return createBackgroundTransformEditorCanvasState(payload)
    .selectedElementMetrics;
};
