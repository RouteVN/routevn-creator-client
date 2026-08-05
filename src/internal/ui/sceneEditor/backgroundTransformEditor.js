import {
  createTransformSelectionAnchor,
  createTransformSelectionHitArea,
  createTransformSelectionResizeHandle,
} from "../../transformSelectionChrome.js";

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
  width: 4,
  alpha: 1,
};

const OVERLAY_FILL = "transparent";

const OVERLAY_ANCHOR_FILL = "#ffffff";

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

export const applyBackgroundTransformAnchorOrigin = ({
  transform,
  selectedElementMetrics,
} = {}) => {
  const normalizedTransform =
    normalizeBackgroundTransformEditorTransform(transform);
  const width = Number(selectedElementMetrics?.width);
  const height = Number(selectedElementMetrics?.height);

  if (Number.isFinite(width) && width > 0) {
    normalizedTransform.originX = normalizedTransform.anchorX * width;
  }
  if (Number.isFinite(height) && height > 0) {
    normalizedTransform.originY = normalizedTransform.anchorY * height;
  }

  return normalizedTransform;
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
    selectedLine.actions.background = createBackgroundWithInlineTransform(
      selectedLine.actions?.background,
      editorState.transform,
    );
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
  if (
    getTransformEditorTargetType(editorState) !==
    TRANSFORM_EDITOR_TARGET_TYPE.BACKGROUND
  ) {
    nextTransforms[BACKGROUND_TRANSFORM_EDITOR_TRANSFORM_ID] =
      normalizeBackgroundTransformEditorTransform(editorState.transform);
  }

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
  const width = getRenderableWidth(element);
  const height = getRenderableHeight(element);
  const inset = Math.min(OVERLAY_BORDER.width, width / 4, height / 4);
  const overlayRect = createTransformSelectionHitArea({
    id: "selected-border",
    width: width - inset * 2,
    height: height - inset * 2,
    fill: OVERLAY_FILL,
    border: OVERLAY_BORDER,
    draggable,
  });

  if (overlayRect) {
    overlayRect.x = inset;
    overlayRect.y = inset;
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

  return createTransformSelectionAnchor({
    id: "selected-border-anchor",
    height,
    width,
    anchorX,
    anchorY,
    size: OVERLAY_ANCHOR_SIZE,
    fill: OVERLAY_ANCHOR_FILL,
    border: OVERLAY_ANCHOR_BORDER,
  });
};

const buildOverlayResizeHandle = ({ element, edge }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  return createTransformSelectionResizeHandle({
    id: `selected-border-resize-${edge}`,
    width: getRenderableWidth(element),
    height: getRenderableHeight(element),
    edge,
    size: OVERLAY_RESIZE_HANDLE_SIZE,
    fill: OVERLAY_FILL,
  });
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

const createBackgroundBoundsSamplePoints = ({ width, height }) => {
  const xValues = [1, width / 2, width - 1];
  const yValues = [1, height / 2, height - 1];

  return yValues.flatMap((y) => xValues.map((x) => ({ x, y })));
};

export const selectBackgroundTransformEditorRenderedBounds = ({
  graphicsService,
  editorState = {},
  projectResolution = {},
} = {}) => {
  const width = Number(projectResolution.width);
  const height = Number(projectResolution.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return undefined;
  }

  const targetIds = getTransformEditorTargetIds(editorState);
  const samplePoints = createBackgroundBoundsSamplePoints({ width, height });

  for (const point of samplePoints) {
    const hits = graphicsService?.hitTestElementBounds?.(point) ?? [];
    for (const targetId of targetIds) {
      for (const hit of hits) {
        const target = hit.path?.find((entry) => entry.id === targetId);
        if (target?.bounds?.corners?.length === 4) {
          return target.bounds;
        }
      }
    }
  }

  return undefined;
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

  if (pathsWithBounds[0]) {
    return pathsWithBounds[0];
  }

  for (const targetId of targetIds) {
    const exactMatch = matchingPaths.find(
      (path) => path[path.length - 1]?.id === targetId,
    );
    if (exactMatch) {
      return exactMatch;
    }
  }

  return matchingPaths[0];
};

const applyLayoutBackgroundBounds = (path, parsedElements) => {
  const element = path?.[path.length - 1];
  if (
    !element ||
    hasRenderableBounds(element) ||
    element.id !== "bg-cg-background-container"
  ) {
    return path;
  }

  const backgroundColorPath = collectMatchingPaths(
    parsedElements,
    BACKGROUND_COLOR_TARGET_IDS,
  ).find((candidatePath) =>
    hasRenderableBounds(candidatePath[candidatePath.length - 1]),
  );
  const backgroundColor = backgroundColorPath?.[backgroundColorPath.length - 1];
  if (!backgroundColor) {
    return path;
  }

  return [
    ...path.slice(0, -1),
    {
      ...element,
      width: getRenderableWidth(backgroundColor),
      height: getRenderableHeight(backgroundColor),
    },
  ];
};

const selectBackgroundElementPath = (parsedElements, editorState = {}) => {
  const targetIds = getTransformEditorTargetIds(editorState);
  const matchingPaths = collectMatchingPaths(parsedElements, targetIds);
  const selectedPath = selectPrimaryMatchingPath(matchingPaths, targetIds);

  return applyLayoutBackgroundBounds(selectedPath, parsedElements);
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
    renderedX: Number.isFinite(element.x) ? element.x : 0,
    renderedY: Number.isFinite(element.y) ? element.y : 0,
    renderedOriginX: Number.isFinite(element.originX) ? element.originX : 0,
    renderedOriginY: Number.isFinite(element.originY) ? element.originY : 0,
    renderedRotation: Number.isFinite(element.rotation) ? element.rotation : 0,
    renderedScaleX: Number.isFinite(element.scaleX) ? element.scaleX : 1,
    renderedScaleY: Number.isFinite(element.scaleY) ? element.scaleY : 1,
  };
};

const createTransformEditorRenderStateId = (renderState, editorState) => {
  const targetType = getTransformEditorTargetType(editorState);
  const targetIds = getTransformEditorTargetIds(editorState);
  const transform = normalizeBackgroundTransformEditorTransform(
    editorState.transform,
  );
  const transformKey = BACKGROUND_TRANSFORM_FIELDS.map(
    (field) => transform[field],
  ).join(",");

  return `${renderState.id ?? "scene-editor"}:action-transform:${targetType}:${targetIds.join(",")}:${transformKey}`;
};

const addOverlayToRenderedElements = ({ elements, path, overlayElement }) => {
  if (!overlayElement) {
    return elements;
  }

  if (path.length <= 1) {
    return [...elements, overlayElement];
  }

  const ancestorId = path[0]?.id;
  let appended = false;
  const nextElements = elements.map((element) => {
    if (appended || element?.id !== ancestorId) {
      return element;
    }

    appended = true;
    return {
      ...element,
      children: [...toElementList(element.children), overlayElement],
    };
  });

  return appended ? nextElements : [...elements, overlayElement];
};

const updateElementById = (elements, targetId, updateElement) => {
  let updated = false;
  const visit = (element) => {
    if (updated || !element || typeof element !== "object") {
      return element;
    }

    if (element.id === targetId) {
      updated = true;
      return updateElement(element);
    }

    if (!Array.isArray(element.children)) {
      return element;
    }

    const children = element.children.map(visit);
    return updated ? { ...element, children } : element;
  };

  const nextElements = toElementList(elements).map(visit);
  return { elements: nextElements, updated };
};

const applyTransformEditorTargetAnchorOrigin = (
  elements,
  selectedPath,
  editorState,
) => {
  const selectedElement = selectedPath?.[selectedPath.length - 1];
  if (!selectedElement) {
    return elements;
  }

  const transform = applyBackgroundTransformAnchorOrigin({
    transform: editorState.transform,
    selectedElementMetrics: {
      width: getRenderableWidth(selectedElement),
      height: getRenderableHeight(selectedElement),
    },
  });

  return updateElementById(elements, selectedElement.id, (element) => ({
    ...element,
    originX: transform.originX,
    originY: transform.originY,
  })).elements;
};

const translateTransformEditorTarget = (
  elements,
  editorState,
  { x, y } = {},
) => {
  for (const targetId of getTransformEditorTargetIds(editorState)) {
    const result = updateElementById(elements, targetId, (element) => ({
      ...element,
      x: (Number.isFinite(element.x) ? element.x : 0) + x,
      y: (Number.isFinite(element.y) ? element.y : 0) + y,
    }));
    if (result.updated) {
      return result.elements;
    }
  }

  return elements;
};

export const createBackgroundTransformEditorPositionPreviewCanvasState = ({
  renderState = {},
  graphicsService,
  editorState = {},
  startTransform = {},
} = {}) => {
  const transform = normalizeBackgroundTransformEditorTransform(
    editorState.transform,
  );
  const initialTransform =
    normalizeBackgroundTransformEditorTransform(startTransform);
  const elements = translateTransformEditorTarget(
    renderState.elements,
    editorState,
    {
      x: transform.x - initialTransform.x,
      y: transform.y - initialTransform.y,
    },
  );

  return createBackgroundTransformEditorCanvasState({
    renderState: { ...renderState, elements },
    graphicsService,
    editorState,
  });
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
  const initialSelectedPath = selectBackgroundElementPath(
    parsedState?.elements,
    editorState,
  );
  const originAdjustedElements = applyTransformEditorTargetAnchorOrigin(
    renderedElements,
    initialSelectedPath,
    editorState,
  );
  const originAdjustedState = initialSelectedPath
    ? graphicsService?.parse?.({ elements: originAdjustedElements })
    : parsedState;
  const selectedPath = selectBackgroundElementPath(
    originAdjustedState?.elements,
    editorState,
  );
  const overlayPath =
    selectedPath?.length > 1 ? selectedPath.slice(1) : selectedPath;
  const overlayElement = selectedPath
    ? buildOverlayTree({
        path: overlayPath,
        draggable: true,
        editorState,
      })
    : undefined;
  const elementsWithOverlay = addOverlayToRenderedElements({
    elements: originAdjustedElements,
    path: selectedPath ?? [],
    overlayElement,
  });

  return {
    renderState: {
      ...renderState,
      id: createTransformEditorRenderStateId(renderState, editorState),
      global: stripRenderStateGlobalInteractions(renderState.global),
      audio: [],
      animations: [],
      elements: elementsWithOverlay,
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
