import { parseAndRender } from "jempl";
import { resolveLayoutReferences } from "route-engine-js";
import {
  buildLayoutElements,
  extractFileIdsFromRenderState,
} from "./project/layout.js";
import { toHierarchyStructure } from "./project/tree.js";
import { getSystemVariableItems } from "./systemVariables.js";
import {
  LINE_COMPLETED_CONDITION_ID,
  getFixedVisibilityStateItems,
} from "./layoutVisibilityCondition.js";

const DEFAULT_DIALOGUE_CHARACTER_NAME = "Character";
const DEFAULT_DIALOGUE_CONTENT = "This is a sample dialogue content.";
const DEFAULT_DIALOGUE_REVEALING_SPEED = 50;
const OVERLAY_BORDER = {
  color: "#ffffff",
  width: 2,
  alpha: 1,
};
const OVERLAY_FILL = {
  color: "#ffffff",
  alpha: 0.001,
};

const isBlobUrl = (url) => typeof url === "string" && url.startsWith("blob:");

const toPreviewVariableValue = (variable = {}) => {
  const value = variable.value ?? variable.default;

  if (variable.type === "number") {
    const parsedValue = Number(value);
    return Number.isFinite(parsedValue) ? parsedValue : 0;
  }

  if (variable.type === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      return value === "true";
    }

    return Boolean(value);
  }

  if (variable.type === "object") {
    return value && typeof value === "object" ? value : {};
  }

  return value ?? "";
};

const createPreviewVariables = (variablesData = {}) => {
  const variableItems = {
    ...variablesData.items,
    ...getSystemVariableItems(),
  };

  return Object.entries(variableItems).reduce(
    (variables, [variableId, variable]) => {
      if (!variableId || variable?.type === "folder") {
        return variables;
      }

      variables[variableId] = toPreviewVariableValue(variable);
      return variables;
    },
    {},
  );
};

const applyPreviewVariableOverrides = (
  previewVariables,
  variablesData = {},
  previewVariableValues = {},
) => {
  const variableItems = {
    ...variablesData.items,
    ...getSystemVariableItems(),
  };
  const nextPreviewVariables = {
    ...previewVariables,
  };

  for (const [variableId, value] of Object.entries(previewVariableValues)) {
    const variable = variableItems[variableId];

    nextPreviewVariables[variableId] = toPreviewVariableValue({
      ...variable,
      value,
    });
  }

  return nextPreviewVariables;
};

const createPreviewFixedStateValues = (previewVariableValues = {}) => {
  const fixedStateItems = getFixedVisibilityStateItems();

  return {
    isLineCompleted:
      previewVariableValues[LINE_COMPLETED_CONDITION_ID] ??
      fixedStateItems[LINE_COMPLETED_CONDITION_ID]?.value ??
      fixedStateItems[LINE_COMPLETED_CONDITION_ID]?.default ??
      false,
  };
};

const createChoiceItems = (choicesData = {}) => {
  const choiceItems = Array.isArray(choicesData.items) ? choicesData.items : [];

  return choiceItems.map((choice, index) => {
    return {
      content: choice?.content ?? `Choice ${index + 1}`,
      events: {
        click: {
          actions: {},
        },
      },
    };
  });
};

const createSaveLoadSlots = (saveLoadData = {}) => {
  const slots = Array.isArray(saveLoadData.slots) ? saveLoadData.slots : [];

  return slots.map((slot, index) => {
    const slotNumber =
      Number.isFinite(Number(slot?.slotNumber)) && Number(slot?.slotNumber) > 0
        ? Number(slot.slotNumber)
        : index + 1;

    return {
      slotNumber,
      image: slot?.image ?? slot?.saveImageId,
      date: slot?.date ?? slot?.saveDate ?? "",
      state: slot?.state,
      isAvailable: slot?.isAvailable === true,
    };
  });
};

const createDialogueLines = ({ characterName, dialogueContent }) => {
  return [
    {
      characterName,
      content: [{ text: dialogueContent }],
    },
    {
      content: [{ text: dialogueContent }],
    },
    {
      characterName: "Narrator",
      content: [{ text: dialogueContent }],
    },
  ];
};

const createNvlLines = (nvlDefaultValues = {}) => {
  const linesNum = Number(nvlDefaultValues.linesNum);
  const lineCount = Number.isFinite(linesNum) && linesNum > 0 ? linesNum : 0;
  const sourceCharacterNames = Array.isArray(nvlDefaultValues.characterNames)
    ? nvlDefaultValues.characterNames
    : [];
  const sourceLines = Array.isArray(nvlDefaultValues.lines)
    ? nvlDefaultValues.lines
    : [];

  return Array.from({ length: lineCount }, (_unused, index) => {
    const characterName = sourceCharacterNames[index] ?? "";
    const line = {
      content: [{ text: sourceLines[index] ?? `Line ${index + 1}` }],
    };

    if (characterName) {
      line.characterName = characterName;
    }

    return line;
  });
};

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
  const characterName =
    dialogueDefaultValues?.["dialogue-character-name"] ??
    DEFAULT_DIALOGUE_CHARACTER_NAME;
  const dialogueContent =
    dialogueDefaultValues?.["dialogue-content"] ?? DEFAULT_DIALOGUE_CONTENT;
  const parsedPreviewRevealingSpeed = Number(previewRevealingSpeed);
  const dialogueRevealingSpeed =
    Number.isFinite(parsedPreviewRevealingSpeed) &&
    parsedPreviewRevealingSpeed > 0
      ? parsedPreviewRevealingSpeed
      : DEFAULT_DIALOGUE_REVEALING_SPEED;

  return {
    variables: {
      ...applyPreviewVariableOverrides(
        createPreviewVariables(variablesData),
        variablesData,
        previewVariableValues,
      ),
      _dialogueTextSpeed: dialogueRevealingSpeed,
    },
    ...createPreviewFixedStateValues(previewVariableValues),
    dialogue: {
      character: {
        name: characterName,
      },
      content: [{ text: dialogueContent }],
      lines:
        layoutType === "nvl"
          ? createNvlLines(nvlDefaultValues)
          : createDialogueLines({
              characterName,
              dialogueContent,
            }),
    },
    choice: {
      items: createChoiceItems(choicesData),
    },
    saveSlots:
      hasSaveLoadPreview === true ||
      layoutType === "save" ||
      layoutType === "load"
        ? createSaveLoadSlots(saveLoadData)
        : [],
  };
};

const resolveLayoutPreviewElements = ({ elements, previewData } = {}) => {
  return toElementList(
    parseAndRender(toElementList(elements), previewData ?? {}),
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

const loadLayoutEditorAssets = async (deps, fileReferences, fontsItems) => {
  const { projectService, store } = deps;
  const assets = {};

  for (const fileReference of fileReferences) {
    const { url: fileId, type: fileType } = fileReference;
    const cacheKey = fileId;
    let url;

    const cachedUrl = store.selectCachedFileContent({ fileId: cacheKey });
    if (cachedUrl) {
      if (!isBlobUrl(cachedUrl)) {
        url = cachedUrl;
      } else {
        store.clearCachedFileContent({ fileId: cacheKey });
      }
    }

    if (!url) {
      const result = await projectService.getFileContent(fileId);
      url = result.url;
      if (!isBlobUrl(url)) {
        store.cacheFileContent({ fileId: cacheKey, url });
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

export const createLayoutEditorRenderState = (deps) => {
  const { store, projectService } = deps;
  const repositoryState = projectService.getRepositoryState();
  const {
    layouts,
    controls,
    images: { items: imageItems },
    textStyles: textStylesData,
    colors: colorsData,
    fonts: fontsData,
    variables: variablesData,
  } = repositoryState;
  const textStyleItems = textStylesData?.items || {};
  const colorsItems = colorsData?.items || {};
  const fontsItems = fontsData?.items || {};
  const layoutId = store.selectLayoutId();
  const resourceType = store.selectLayoutResourceType();
  const storeElements = store.selectItems();
  const resourceCollection = resourceType === "controls" ? controls : layouts;
  const layoutElements =
    storeElements || resourceCollection?.items?.[layoutId]?.elements;
  const layoutHierarchyStructure = toHierarchyStructure(layoutElements);
  const { elements, resources } = buildLayoutElements(
    layoutHierarchyStructure,
    imageItems,
    { items: textStyleItems },
    { items: colorsItems },
    { items: fontsItems },
    {
      layoutId,
      layoutType: store.selectCurrentLayoutType(),
      layoutsData: repositoryState.layouts?.items || {},
    },
  );

  return {
    renderStateElements: elements,
    resources,
    fontsItems,
    variablesData,
  };
};

export const renderLayoutEditorPreview = async (
  deps,
  { clearFirst = false } = {},
) => {
  try {
    const { store, graphicsService } = deps;
    const { renderStateElements, resources, fontsItems, variablesData } =
      createLayoutEditorRenderState(deps);
    const selectedItem = store.selectSelectedItemData();
    const finalElements = resolveLayoutPreviewElements({
      elements: renderStateElements,
      previewData: createLayoutEditorPreviewData({
        layoutType: store.selectCurrentLayoutType(),
        variablesData,
        previewVariableValues: store.selectPreviewVariableValues(),
        dialogueDefaultValues: store.selectDialogueDefaultValues(),
        nvlDefaultValues: store.selectNvlDefaultValues(),
        previewRevealingSpeed: store.selectPreviewRevealingSpeed(),
        choicesData: store.selectChoicesData(),
        saveLoadData: store.selectSaveLoadData(),
        hasSaveLoadPreview: store.selectHasSaveLoadPreview(),
      }),
    });
    const resolvedFinalElements = resolveLayoutReferences(finalElements, {
      resources,
    });
    const fileReferences = extractFileIdsFromRenderState(resolvedFinalElements);

    if (clearFirst) {
      graphicsService.render({
        id: `layout-editor-preview-clear-${Date.now()}`,
        elements: [],
        animations: [],
      });
    }

    let assets = await loadLayoutEditorAssets(deps, fileReferences, fontsItems);
    try {
      await graphicsService.loadAssets(assets);
    } catch {
      deps.store.clearFileContentCache();
      assets = await loadLayoutEditorAssets(deps, fileReferences, fontsItems);
      await graphicsService.loadAssets(assets);
    }

    const parsedState = graphicsService.parse({
      elements: resolvedFinalElements,
    });
    const overlayElements = createLayoutEditorSelectionOverlay({
      parsedElements: parsedState.elements,
      selectedItemId: selectedItem?.id,
    });

    graphicsService.render({
      elements: [...resolvedFinalElements, ...overlayElements],
      animations: [],
    });
  } catch (error) {
    console.error("[layoutEditor] Failed to render preview", error);
  }
};
