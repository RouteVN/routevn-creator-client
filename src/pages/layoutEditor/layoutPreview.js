import { parseAndRender } from "jempl";

const DEFAULT_DIALOGUE_CHARACTER_NAME = "Character";
const DEFAULT_DIALOGUE_CONTENT = "This is a sample dialogue content.";
const OVERLAY_BORDER = {
  color: "#3b82f6",
  width: 2,
  alpha: 1,
};
const OVERLAY_FILL = {
  color: "#ffffff",
  alpha: 0.001,
};

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

  return value ?? "";
};

const createPreviewVariables = (variablesData = {}) => {
  return Object.entries(variablesData.items ?? {}).reduce(
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

  return (
    elementId === selectedItemId || elementId.startsWith(`${selectedItemId}-`)
  );
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
      collectMatchingPaths(element.children, selectedItemId, path, matchingPaths);
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
    overlayRect.drag = {
      start: {
        actionPayload: {},
      },
      move: {
        actionPayload: {},
      },
      end: {
        actionPayload: {},
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

export const createLayoutPreviewData = ({
  variablesData,
  dialogueDefaultValues,
  choicesData,
} = {}) => {
  const characterName =
    dialogueDefaultValues?.["dialogue-character-name"] ??
    DEFAULT_DIALOGUE_CHARACTER_NAME;
  const dialogueContent =
    dialogueDefaultValues?.["dialogue-content"] ?? DEFAULT_DIALOGUE_CONTENT;
  const choiceItems = createChoiceItems(choicesData);

  return {
    variables: createPreviewVariables(variablesData),
    dialogue: {
      character: {
        name: characterName,
      },
      content: [{ text: dialogueContent }],
      lines: createDialogueLines({
        characterName,
        dialogueContent,
      }),
    },
    choice: {
      items: choiceItems,
    },
  };
};

export const resolveLayoutPreviewElements = ({
  elements,
  previewData,
} = {}) => {
  return toElementList(parseAndRender(toElementList(elements), previewData ?? {}));
};

export const createSelectedLayoutOverlay = ({
  parsedElements,
  selectedItemId,
} = {}) => {
  if (!selectedItemId) {
    return [];
  }

  const matchingPaths = collectMatchingPaths(parsedElements, selectedItemId)
    .filter((path) => hasRenderableBounds(path[path.length - 1]));

  if (matchingPaths.length === 0) {
    return [];
  }

  const primaryPath =
    matchingPaths.find((path) => path[path.length - 1]?.id === selectedItemId) ??
    matchingPaths[0];
  const secondaryPaths = matchingPaths.filter((path) => path !== primaryPath);
  const secondaryOverlays = secondaryPaths
    .map((path, index) => {
      return buildOverlayTree({
        path,
        overlayId: `selected-border-preview-${index}`,
        draggable: false,
      });
    })
    .filter(Boolean);
  const primaryOverlay = buildOverlayTree({
    path: primaryPath,
    overlayId: "selected-border",
    draggable: true,
  });

  if (!primaryOverlay) {
    return secondaryOverlays;
  }

  return [...secondaryOverlays, primaryOverlay];
};
