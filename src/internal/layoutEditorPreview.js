import { parseAndRender } from "jempl";
import { resolveLayoutReferences } from "route-engine-js";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "./project/layout.js";
import { toHierarchyStructure } from "./project/tree.js";
import {
  applyPreviewVariableOverrides,
  createChoicePreviewItems,
  createConfirmDialogPreviewData,
  createDialoguePreviewData,
  createPreviewFixedStateValues,
  createPreviewVariables,
  createRuntimeSaveSlots,
} from "./ui/layoutEditor/preview/index.js";

const OVERLAY_BORDER = {
  color: "#ffffff",
  width: 2,
  alpha: 1,
};
const OVERLAY_FILL = {
  color: "#ffffff",
  alpha: 0.001,
};

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

const buildOverlayRect = ({ element, overlayId, draggable }) => {
  if (!hasRenderableBounds(element)) {
    return undefined;
  }

  const overlayRect = {
    id: overlayId,
    type: "rect",
    x: element.x ?? 0,
    y: element.y ?? 0,
    width: element.width,
    height: element.height,
    fill: OVERLAY_FILL,
    border: OVERLAY_BORDER,
  };

  if (typeof element.rotation === "number") {
    overlayRect.rotation = element.rotation;
  }

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

const buildOverlayTree = ({ path, overlayId, draggable }) => {
  const selectedElement = path[path.length - 1];
  let overlayTree = buildOverlayRect({
    element: selectedElement,
    overlayId,
    draggable,
  });

  if (!overlayTree) {
    return undefined;
  }

  for (let index = path.length - 2; index >= 0; index -= 1) {
    const ancestor = path[index];

    overlayTree = {
      id: `${overlayId}-container-${index}`,
      type: "container",
      x: ancestor.x ?? 0,
      y: ancestor.y ?? 0,
      ...(Number.isFinite(ancestor.width) ? { width: ancestor.width } : {}),
      ...(Number.isFinite(ancestor.height) ? { height: ancestor.height } : {}),
      ...(typeof ancestor.rotation === "number"
        ? { rotation: ancestor.rotation }
        : {}),
      ...(ancestor.anchorToBottom ? { anchorToBottom: true } : {}),
      children: [overlayTree],
    };
  }

  return overlayTree;
};

export const createLayoutEditorPreviewData = ({
  layoutType,
  hasSaveLoadPreview,
  variablesData,
  previewVariableValues,
  dialogueDefaultValues,
  nvlDefaultValues,
  previewRevealingSpeed,
  choicesData,
  saveLoadData,
} = {}) => {
  const { dialogue, dialogueRevealingSpeed } = createDialoguePreviewData({
    layoutType,
    dialogueDefaultValues,
    nvlDefaultValues,
    previewRevealingSpeed,
  });

  return {
    variables: {
      ...applyPreviewVariableOverrides(
        createPreviewVariables(variablesData),
        variablesData,
        previewVariableValues,
      ),
      _dialogueTextSpeed: dialogueRevealingSpeed,
    },
    ...createPreviewFixedStateValues(
      previewVariableValues,
      dialogueDefaultValues,
    ),
    dialogue,
    choice: {
      items: createChoicePreviewItems(choicesData),
    },
    confirmDialog: createConfirmDialogPreviewData(),
    saveSlots:
      hasSaveLoadPreview === true ||
      layoutType === "save" ||
      layoutType === "load"
        ? createRuntimeSaveSlots(saveLoadData)
        : [],
  };
};

const resolveLayoutPreviewElements = ({ elements, previewData } = {}) => {
  return toElementList(
    parseAndRender(toElementList(elements), previewData ?? {}, {
      functions: jemplFunctions,
    }),
  );
};

export const createLayoutEditorSelectionOverlay = ({
  parsedElements,
  selectedItemId,
} = {}) => {
  if (!selectedItemId) {
    return [];
  }

  const matchingPaths = collectMatchingPaths(
    parsedElements,
    selectedItemId,
  ).filter((path) => hasRenderableBounds(path[path.length - 1]));

  if (matchingPaths.length === 0) {
    return [];
  }

  const primaryPath =
    matchingPaths.find(
      (path) =>
        path[path.length - 1]?.id === selectedItemId ||
        path[path.length - 1]?.id === `${selectedItemId}-instance-0`,
    ) ?? matchingPaths[0];
  const primaryOverlay = buildOverlayTree({
    path: primaryPath,
    overlayId: "selected-border",
    draggable: true,
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
  selectedItemId,
  graphicsService,
} = {}) => {
  const { renderStateElements, resources } = createLayoutEditorRenderState({
    layoutState,
    repositoryState,
  });
  const finalElements = resolveLayoutPreviewElements({
    elements: renderStateElements,
    previewData,
  });
  const resolvedFinalElements = resolveLayoutReferences(finalElements, {
    resources,
  });
  const parsedState = graphicsService.parse({
    elements: resolvedFinalElements,
  });
  const overlayElements = createLayoutEditorSelectionOverlay({
    parsedElements: parsedState.elements,
    selectedItemId,
  });

  return {
    elements: [...resolvedFinalElements, ...overlayElements],
    fileReferences: extractFileIdsFromRenderState(resolvedFinalElements),
  };
};
