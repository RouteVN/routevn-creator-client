import {
  $applyNodeReplacement,
  $createLineBreakNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  TextNode,
} from "lexical";
import { $getSelectionStyleValueForProperty } from "@lexical/selection";
import {
  ACCENT_FILL,
  cloneContentItems,
  cloneFurigana,
  cloneReferenceItem,
  cloneTextStyle,
  cloneTextStyleId,
  createMentionText,
  getReferenceDisplayText,
  getReferenceResourceId,
  getPlainTextFromContent,
  mergeAdjacentContentItems,
  normalizeDialogueText,
  normalizeMentionLabel,
} from "../internal/ui/sceneEditorLexical/contentModel.js";

const TEXT_STYLE_ID_PROPERTY = "--rvn-text-style-id";
export const FURIGANA_TEXT_PROPERTY = "--rvn-furigana-text";
export const FURIGANA_TEXT_STYLE_ID_PROPERTY = "--rvn-furigana-text-style-id";

const ACTIVE_ELEMENT_PATCH_COUNTS = new WeakMap();
const DOCUMENT_SELECTION_PATCH_COUNTS = new WeakMap();
const DOCUMENT_SELECTION_PATCH_STATE = new WeakMap();
const WINDOW_SELECTION_PATCH_COUNTS = new WeakMap();
const WINDOW_SELECTION_PATCH_STATE = new WeakMap();

export const LEXICAL_EDITOR_THEME = {
  paragraph: "editor-paragraph",
  text: {
    bold: "text-bold",
    italic: "text-italic",
    underline: "text-underline",
  },
};

const parseStyleText = (styleText) => {
  const styleObject = {};

  for (const entry of String(styleText ?? "").split(";")) {
    if (!entry) {
      continue;
    }

    const [propertyName, ...rest] = entry.split(":");
    if (!propertyName || rest.length === 0) {
      continue;
    }

    styleObject[propertyName.trim()] = rest.join(":").trim();
  }

  return styleObject;
};

const encodeCustomStyleValue = (value) => {
  return encodeURIComponent(String(value ?? ""));
};

const decodeCustomStyleValue = (value) => {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const setNodeCustomStyleProperties = (node, properties = {}) => {
  const propertyNames = Object.keys(properties);
  const styleParts = String(node.getStyle() ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) {
        return false;
      }

      const propertyName = part.split(":")[0]?.trim();
      return !propertyNames.includes(propertyName);
    });

  for (const [propertyName, value] of Object.entries(properties)) {
    if (value !== undefined && value !== null && value !== "") {
      styleParts.push(`${propertyName}: ${value}`);
    }
  }

  node.setStyle(styleParts.length > 0 ? `${styleParts.join("; ")};` : "");
};

export const getTextStyleFromNode = (node) => {
  const nextTextStyle = {};

  if (node.hasFormat("bold")) {
    nextTextStyle.fontWeight = "bold";
  }

  if (node.hasFormat("italic")) {
    nextTextStyle.fontStyle = "italic";
  }

  if (node.hasFormat("underline")) {
    nextTextStyle.textDecoration = "underline";
  }

  const color = parseStyleText(node.getStyle()).color;
  if (color) {
    nextTextStyle.fill = color;
  }

  return Object.keys(nextTextStyle).length > 0 ? nextTextStyle : undefined;
};

export const getTextStyleIdFromNode = (node) => {
  return cloneTextStyleId(
    parseStyleText(node.getStyle())[TEXT_STYLE_ID_PROPERTY],
  );
};

export const getFuriganaFromNode = (node) => {
  const styleObject = parseStyleText(node.getStyle());
  const text = decodeCustomStyleValue(styleObject[FURIGANA_TEXT_PROPERTY]);
  if (!text) {
    return undefined;
  }

  return cloneFurigana({
    text,
    textStyleId: decodeCustomStyleValue(
      styleObject[FURIGANA_TEXT_STYLE_ID_PROPERTY],
    ),
  });
};

export const applyTextStyleToNode = (node, textStyle) => {
  const nextTextStyle = cloneTextStyle(textStyle);
  if (!nextTextStyle) {
    return node;
  }

  if (nextTextStyle.fontWeight === "bold") {
    node.toggleFormat("bold");
  }

  if (nextTextStyle.fontStyle === "italic") {
    node.toggleFormat("italic");
  }

  if (nextTextStyle.textDecoration === "underline") {
    node.toggleFormat("underline");
  }

  if (nextTextStyle.fill) {
    node.setStyle(`color: ${nextTextStyle.fill};`);
  }

  return node;
};

export const applyTextStyleIdToNode = (node, textStyleId) => {
  const nextTextStyleId = cloneTextStyleId(textStyleId);
  if (!nextTextStyleId) {
    return node;
  }

  setNodeCustomStyleProperties(node, {
    [TEXT_STYLE_ID_PROPERTY]: nextTextStyleId,
  });
  return node;
};

export const applyFuriganaToNode = (node, furigana) => {
  const nextFurigana = cloneFurigana(furigana);
  if (!nextFurigana) {
    return node;
  }

  setNodeCustomStyleProperties(node, {
    [FURIGANA_TEXT_PROPERTY]: encodeCustomStyleValue(nextFurigana.text),
    [FURIGANA_TEXT_STYLE_ID_PROPERTY]: encodeCustomStyleValue(
      nextFurigana.textStyleId,
    ),
  });
  return node;
};

export const removeNodeCustomStyleProperties = (node, propertyNames = []) => {
  const styleParts = String(node.getStyle() ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => {
      if (!part) {
        return false;
      }

      const propertyName = part.split(":")[0]?.trim();
      return !propertyNames.includes(propertyName);
    });

  node.setStyle(styleParts.length > 0 ? `${styleParts.join("; ")};` : "");
  return node;
};

export const removeTextStyleIdFromNode = (node) => {
  return removeNodeCustomStyleProperties(node, [TEXT_STYLE_ID_PROPERTY]);
};

export const removeFuriganaFromNode = (node) => {
  return removeNodeCustomStyleProperties(node, [
    FURIGANA_TEXT_PROPERTY,
    FURIGANA_TEXT_STYLE_ID_PROPERTY,
  ]);
};

export class MentionNode extends TextNode {
  static getType() {
    return "rvn-mention";
  }

  static clone(node) {
    return new MentionNode(
      node.__resourceId,
      node.__referenceLabel,
      node.__text,
      node.__key,
    );
  }

  static importJSON(serializedNode) {
    return $createMentionNode({
      resourceId: serializedNode?.resourceId ?? serializedNode?.mentionId,
      label: serializedNode?.referenceLabel ?? serializedNode?.mentionLabel,
    }).updateFromJSON(serializedNode);
  }

  static importDOM() {
    return {
      span: (domNode) => {
        if (!domNode.hasAttribute("data-rvn-mention")) {
          return null;
        }

        return {
          conversion: () => {
            const label = domNode.getAttribute("data-rvn-mention-label");
            const resourceId =
              domNode.getAttribute("data-rvn-reference-resource-id") ??
              domNode.getAttribute("data-rvn-mention-id");
            return {
              node: $createMentionNode({ resourceId, label }),
            };
          },
          priority: 1,
        };
      },
    };
  }

  constructor(resourceId, referenceLabel, text, key) {
    super(text ?? createMentionText(referenceLabel ?? resourceId), key);
    this.__resourceId = String(
      resourceId ?? normalizeMentionLabel(referenceLabel),
    );
    this.__referenceLabel = normalizeMentionLabel(referenceLabel ?? resourceId);
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      resourceId: this.__resourceId,
      referenceLabel: this.__referenceLabel,
      type: MentionNode.getType(),
      version: 1,
    };
  }

  createDOM(config) {
    const dom = super.createDOM(config);
    this.syncDOMAttributes(dom);
    return dom;
  }

  updateDOM(prevNode, dom, config) {
    const shouldReplace = super.updateDOM(prevNode, dom, config);
    if (shouldReplace) {
      return true;
    }

    this.syncDOMAttributes(dom);
    return false;
  }

  syncDOMAttributes(dom) {
    dom.className = "mention-chip";
    dom.contentEditable = "false";
    dom.draggable = false;
    dom.dataset.rvnMention = "true";
    dom.dataset.rvnReferenceKey = this.getKey();
    dom.dataset.rvnReferenceResourceId = this.__resourceId;
    dom.dataset.rvnMentionLabel = this.__referenceLabel;
    dom.setAttribute("contenteditable", "false");
    dom.setAttribute("draggable", "false");
    dom.setAttribute("aria-label", this.__referenceLabel);
    dom.spellcheck = false;
  }

  exportDOM() {
    const element = document.createElement("span");
    element.setAttribute("data-rvn-mention", "true");
    element.setAttribute("data-rvn-reference-resource-id", this.__resourceId);
    element.setAttribute("data-rvn-mention-label", this.__referenceLabel);
    element.textContent = this.getTextContent();
    return { element };
  }

  isTextEntity() {
    return true;
  }

  canInsertTextBefore() {
    return false;
  }

  canInsertTextAfter() {
    return false;
  }

  getReferenceData() {
    return {
      resourceId: this.__resourceId,
      label: this.__referenceLabel,
    };
  }
}

export const $createMentionNode = ({ id, resourceId, label } = {}) => {
  const referenceResourceId = String(resourceId ?? id ?? label ?? "");
  const referenceLabel = normalizeMentionLabel(label ?? referenceResourceId);
  const mentionNode = new MentionNode(
    referenceResourceId,
    referenceLabel,
    createMentionText(referenceLabel),
  );
  mentionNode.setMode("token").toggleDirectionless();
  return $applyNodeReplacement(mentionNode);
};

export const $isMentionNode = (node) => {
  return node instanceof MentionNode;
};

export const collectContentItemsFromNode = (node, items) => {
  if ($isMentionNode(node)) {
    const nextItem = {
      reference: node.getReferenceData(),
    };
    const textStyle = getTextStyleFromNode(node);
    if (textStyle) {
      nextItem.textStyle = textStyle;
    }
    const textStyleId = getTextStyleIdFromNode(node);
    if (textStyleId) {
      nextItem.textStyleId = textStyleId;
    }
    const furigana = getFuriganaFromNode(node);
    if (furigana) {
      nextItem.furigana = furigana;
    }

    const referenceItem = cloneReferenceItem({
      ...nextItem,
    });
    if (referenceItem) {
      items.push(referenceItem);
    }
    return;
  }

  if ($isLineBreakNode(node)) {
    items.push({ text: "\n" });
    return;
  }

  if ($isTextNode(node)) {
    const text = normalizeDialogueText(node.getTextContent());
    if (text.length === 0) {
      return;
    }

    const nextItem = { text };
    const textStyle = getTextStyleFromNode(node);
    if (textStyle) {
      nextItem.textStyle = textStyle;
    }
    const textStyleId = getTextStyleIdFromNode(node);
    if (textStyleId) {
      nextItem.textStyleId = textStyleId;
    }
    const furigana = getFuriganaFromNode(node);
    if (furigana) {
      nextItem.furigana = furigana;
    }
    items.push(nextItem);
    return;
  }

  if ($isElementNode(node)) {
    for (const childNode of node.getChildren()) {
      collectContentItemsFromNode(childNode, items);
    }
  }
};

export const createNodesFromContent = (
  items = [],
  { resolveReferenceLabel } = {},
) => {
  const nodes = [];

  for (const item of mergeAdjacentContentItems(items)) {
    const referenceItem = cloneReferenceItem(item);
    if (referenceItem) {
      const resourceId = getReferenceResourceId(referenceItem);
      const mentionNode = $createMentionNode({
        resourceId,
        label:
          resolveReferenceLabel?.(resourceId) ??
          getReferenceDisplayText(referenceItem),
      });
      applyTextStyleToNode(mentionNode, referenceItem.textStyle);
      applyTextStyleIdToNode(mentionNode, referenceItem.textStyleId);
      applyFuriganaToNode(mentionNode, referenceItem.furigana);
      nodes.push(mentionNode);
      continue;
    }

    const text = normalizeDialogueText(item?.text);
    if (text.length === 0) {
      continue;
    }

    const textParts = text.split("\n");
    textParts.forEach((textPart, index) => {
      if (index > 0) {
        nodes.push($createLineBreakNode());
      }

      if (textPart.length === 0) {
        return;
      }

      const textNode = $createTextNode(textPart);
      applyTextStyleToNode(textNode, item?.textStyle);
      applyTextStyleIdToNode(textNode, item?.textStyleId);
      applyFuriganaToNode(textNode, item?.furigana);
      nodes.push(textNode);
    });
  }

  return nodes;
};

const getTextLengthOfNode = (node) => {
  if ($isLineBreakNode(node)) {
    return 1;
  }

  if ($isTextNode(node)) {
    return node.getTextContentSize?.() ?? node.getTextContent().length;
  }

  if ($isElementNode(node)) {
    return node.getChildren().reduce((total, childNode) => {
      return total + getTextLengthOfNode(childNode);
    }, 0);
  }

  return 0;
};

const getOffsetBeforeNodeKey = (node, targetKey) => {
  if (node.getKey() === targetKey) {
    return { found: true, offset: 0 };
  }

  if (!$isElementNode(node)) {
    return { found: false, offset: getTextLengthOfNode(node) };
  }

  let offset = 0;

  for (const childNode of node.getChildren()) {
    const result = getOffsetBeforeNodeKey(childNode, targetKey);
    if (result.found) {
      return {
        found: true,
        offset: offset + result.offset,
      };
    }
    offset += result.offset;
  }

  return { found: false, offset };
};

const getPointAbsoluteOffset = (rootNode, point) => {
  if (point.type === "text") {
    const result = getOffsetBeforeNodeKey(rootNode, point.key);
    const pointNode = point.getNode();
    const textLength = getTextLengthOfNode(pointNode);
    return (
      result.offset +
      Math.max(0, Math.min(Number(point.offset) || 0, textLength))
    );
  }

  const elementNode = point.getNode();
  const baseOffset = getOffsetBeforeNodeKey(
    rootNode,
    elementNode.getKey(),
  ).offset;
  let childOffset = 0;
  const childCount = Math.max(
    0,
    Math.min(point.offset, elementNode.getChildrenSize?.() ?? 0),
  );

  for (let index = 0; index < childCount; index += 1) {
    childOffset += getTextLengthOfNode(elementNode.getChildAtIndex(index));
  }

  return baseOffset + childOffset;
};

export const getSelectionOffsets = (rootNode, selection) => {
  if (!$isRangeSelection(selection)) {
    return { start: 0, end: 0 };
  }

  const anchorOffset = getPointAbsoluteOffset(rootNode, selection.anchor);
  const focusOffset = getPointAbsoluteOffset(rootNode, selection.focus);

  return {
    start: Math.min(anchorOffset, focusOffset),
    end: Math.max(anchorOffset, focusOffset),
  };
};

export const getMentionTriggerMatch = (selection) => {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return undefined;
  }

  const anchorNode = selection.anchor.getNode();
  if (!$isTextNode(anchorNode) || $isMentionNode(anchorNode)) {
    return undefined;
  }

  const anchorOffset = selection.anchor.offset;
  const text = anchorNode.getTextContent();
  const beforeCaret = text.slice(0, anchorOffset);
  const match = beforeCaret.match(/(?:^|\s)\/([a-z0-9._-]*)$/i);

  if (!match) {
    return undefined;
  }

  const query = match[1] ?? "";
  const startOffset = beforeCaret.lastIndexOf(`/${query}`);
  if (startOffset === -1) {
    return undefined;
  }

  return {
    nodeKey: anchorNode.getKey(),
    startOffset,
    endOffset: anchorOffset,
    query,
  };
};

const normalizeMentionSuggestion = (option = {}) => {
  const label = normalizeMentionLabel(option.label);
  if (!label) {
    return undefined;
  }

  const suggestion = {
    id: String(option.id ?? label),
    label,
  };

  if (typeof option.variableType === "string" && option.variableType) {
    suggestion.variableType = option.variableType;
  }

  return suggestion;
};

export const filterMentionSuggestions = (query, suggestions = []) => {
  const normalizedSuggestions = (Array.isArray(suggestions) ? suggestions : [])
    .map((option) => normalizeMentionSuggestion(option))
    .filter(Boolean);
  const normalizedQuery = String(query ?? "").toLowerCase();
  if (!normalizedQuery) {
    return normalizedSuggestions;
  }

  return normalizedSuggestions.filter((option) => {
    const label = option.label.toLowerCase();
    const id = option.id.toLowerCase();
    return label.startsWith(normalizedQuery) || id.startsWith(normalizedQuery);
  });
};

export const createSnapshotFromEditorState = (editorState) => {
  return editorState.read(() => {
    const root = $getRoot();
    const selection = $getSelection();
    const content = [];

    for (const childNode of root.getChildren()) {
      collectContentItemsFromNode(childNode, content);
    }

    const normalizedContent = mergeAdjacentContentItems(content);
    const plainText = getPlainTextFromContent(normalizedContent);
    const activeFormats = {
      bold: $isRangeSelection(selection) ? selection.hasFormat("bold") : false,
      italic: $isRangeSelection(selection)
        ? selection.hasFormat("italic")
        : false,
      underline: $isRangeSelection(selection)
        ? selection.hasFormat("underline")
        : false,
      accent:
        $isRangeSelection(selection) &&
        $getSelectionStyleValueForProperty(selection, "color", "") ===
          ACCENT_FILL,
    };

    return {
      content:
        normalizedContent.length > 0
          ? normalizedContent
          : cloneContentItems([]),
      plainText,
      selection: getSelectionOffsets(root, selection),
      activeFormats,
      mentionTrigger: getMentionTriggerMatch(selection),
    };
  });
};

const getDeepActiveElement = (documentObject, fallbackActiveElement) => {
  let activeElement = fallbackActiveElement;

  if (activeElement === undefined) {
    activeElement = documentObject?.activeElement ?? null;
  }

  while (activeElement?.shadowRoot?.activeElement) {
    activeElement = activeElement.shadowRoot.activeElement;
  }

  return activeElement ?? null;
};

const isDomSelectionPointValid = (node, offset) => {
  if (!node?.isConnected) {
    return false;
  }

  const numericOffset = Number(offset);
  if (!Number.isInteger(numericOffset) || numericOffset < 0) {
    return false;
  }

  const maxOffset =
    node.nodeType === Node.TEXT_NODE
      ? (node.textContent?.length ?? 0)
      : (node.childNodes?.length ?? 0);

  return numericOffset <= maxOffset;
};

const isDomRangeValidInsideElement = (element, range) => {
  return (
    !!element &&
    !!range &&
    element.contains(range.startContainer) &&
    element.contains(range.endContainer) &&
    isDomSelectionPointValid(range.startContainer, range.startOffset) &&
    isDomSelectionPointValid(range.endContainer, range.endOffset)
  );
};

const resolveDeepShadowSelection = (windowObject) => {
  const documentObject = windowObject?.document;
  const deepActiveElement = getDeepActiveElement(
    documentObject,
    documentObject?.activeElement,
  );
  const root = deepActiveElement?.getRootNode?.();

  if (
    !(root instanceof ShadowRoot) ||
    typeof root.getSelection !== "function"
  ) {
    return undefined;
  }

  const shadowSelection = root.getSelection();
  if (!shadowSelection || shadowSelection.rangeCount === 0) {
    return undefined;
  }

  const anchorNode = shadowSelection.anchorNode;
  const focusNode = shadowSelection.focusNode;

  if (
    !anchorNode ||
    !focusNode ||
    anchorNode.getRootNode?.() !== root ||
    focusNode.getRootNode?.() !== root
  ) {
    return undefined;
  }

  if (
    !isDomSelectionPointValid(anchorNode, shadowSelection.anchorOffset) ||
    !isDomSelectionPointValid(focusNode, shadowSelection.focusOffset)
  ) {
    return undefined;
  }

  return shadowSelection;
};

export const patchDocumentActiveElement = (documentObject) => {
  if (!documentObject) {
    return false;
  }

  const currentCount = ACTIVE_ELEMENT_PATCH_COUNTS.get(documentObject) ?? 0;
  if (currentCount > 0) {
    ACTIVE_ELEMENT_PATCH_COUNTS.set(documentObject, currentCount + 1);
    return true;
  }

  const descriptor = Object.getOwnPropertyDescriptor(
    Document.prototype,
    "activeElement",
  );

  if (!descriptor?.get || descriptor.configurable === false) {
    return false;
  }

  Object.defineProperty(documentObject, "activeElement", {
    configurable: true,
    get() {
      const baseActiveElement = descriptor.get.call(documentObject);
      return getDeepActiveElement(documentObject, baseActiveElement);
    },
  });

  ACTIVE_ELEMENT_PATCH_COUNTS.set(documentObject, 1);
  return true;
};

export const unpatchDocumentActiveElement = (documentObject) => {
  if (!documentObject) {
    return;
  }

  const currentCount = ACTIVE_ELEMENT_PATCH_COUNTS.get(documentObject) ?? 0;
  if (currentCount <= 1) {
    delete documentObject.activeElement;
    ACTIVE_ELEMENT_PATCH_COUNTS.delete(documentObject);
    return;
  }

  ACTIVE_ELEMENT_PATCH_COUNTS.set(documentObject, currentCount - 1);
};

export const patchDocumentGetSelection = (documentObject) => {
  if (!documentObject) {
    return false;
  }

  const currentCount = DOCUMENT_SELECTION_PATCH_COUNTS.get(documentObject) ?? 0;
  if (currentCount > 0) {
    DOCUMENT_SELECTION_PATCH_COUNTS.set(documentObject, currentCount + 1);
    return true;
  }

  const originalGetSelection = documentObject.getSelection;
  if (typeof originalGetSelection !== "function") {
    return false;
  }

  try {
    Object.defineProperty(documentObject, "getSelection", {
      configurable: true,
      writable: true,
      value() {
        const shadowSelection = resolveDeepShadowSelection(
          documentObject.defaultView,
        );
        if (shadowSelection) {
          return shadowSelection;
        }

        return originalGetSelection.call(documentObject);
      },
    });
  } catch {
    return false;
  }

  DOCUMENT_SELECTION_PATCH_STATE.set(documentObject, originalGetSelection);
  DOCUMENT_SELECTION_PATCH_COUNTS.set(documentObject, 1);
  return true;
};

export const unpatchDocumentGetSelection = (documentObject) => {
  if (!documentObject) {
    return;
  }

  const currentCount = DOCUMENT_SELECTION_PATCH_COUNTS.get(documentObject) ?? 0;
  if (currentCount > 1) {
    DOCUMENT_SELECTION_PATCH_COUNTS.set(documentObject, currentCount - 1);
    return;
  }

  const originalGetSelection =
    DOCUMENT_SELECTION_PATCH_STATE.get(documentObject);
  if (typeof originalGetSelection === "function") {
    try {
      Object.defineProperty(documentObject, "getSelection", {
        configurable: true,
        writable: true,
        value: originalGetSelection,
      });
    } catch {
      documentObject.getSelection = originalGetSelection;
    }
  }

  DOCUMENT_SELECTION_PATCH_COUNTS.delete(documentObject);
  DOCUMENT_SELECTION_PATCH_STATE.delete(documentObject);
};

export const patchWindowGetSelection = (windowObject) => {
  if (!windowObject) {
    return false;
  }

  const currentCount = WINDOW_SELECTION_PATCH_COUNTS.get(windowObject) ?? 0;
  if (currentCount > 0) {
    WINDOW_SELECTION_PATCH_COUNTS.set(windowObject, currentCount + 1);
    return true;
  }

  const originalGetSelection = windowObject.getSelection;
  if (typeof originalGetSelection !== "function") {
    return false;
  }

  try {
    Object.defineProperty(windowObject, "getSelection", {
      configurable: true,
      writable: true,
      value() {
        const shadowSelection = resolveDeepShadowSelection(windowObject);
        if (shadowSelection) {
          return shadowSelection;
        }

        return originalGetSelection.call(windowObject);
      },
    });
  } catch {
    return false;
  }

  WINDOW_SELECTION_PATCH_STATE.set(windowObject, originalGetSelection);
  WINDOW_SELECTION_PATCH_COUNTS.set(windowObject, 1);
  return true;
};

export const unpatchWindowGetSelection = (windowObject) => {
  if (!windowObject) {
    return;
  }

  const currentCount = WINDOW_SELECTION_PATCH_COUNTS.get(windowObject) ?? 0;
  if (currentCount > 1) {
    WINDOW_SELECTION_PATCH_COUNTS.set(windowObject, currentCount - 1);
    return;
  }

  const originalGetSelection = WINDOW_SELECTION_PATCH_STATE.get(windowObject);
  if (typeof originalGetSelection === "function") {
    try {
      Object.defineProperty(windowObject, "getSelection", {
        configurable: true,
        writable: true,
        value: originalGetSelection,
      });
    } catch {
      windowObject.getSelection = originalGetSelection;
    }
  }

  WINDOW_SELECTION_PATCH_COUNTS.delete(windowObject);
  WINDOW_SELECTION_PATCH_STATE.delete(windowObject);
};

export const getSelectionRange = (element) => {
  const root = element?.getRootNode?.();
  const isShadowRoot = root instanceof ShadowRoot;

  let selection = window.getSelection();

  if (isShadowRoot && typeof root.getSelection === "function") {
    const shadowSelection = root.getSelection();
    if (shadowSelection && shadowSelection.rangeCount > 0) {
      const shadowRange = shadowSelection.getRangeAt(0);
      if (isDomRangeValidInsideElement(element, shadowRange)) {
        return shadowRange;
      }
    }
  }

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  if (isShadowRoot && typeof selection.getComposedRanges === "function") {
    try {
      const ranges = selection.getComposedRanges(root);
      if (ranges.length > 0) {
        const composedRange = ranges[0];
        if (
          element.contains(composedRange.startContainer) &&
          element.contains(composedRange.endContainer) &&
          isDomSelectionPointValid(
            composedRange.startContainer,
            composedRange.startOffset,
          ) &&
          isDomSelectionPointValid(
            composedRange.endContainer,
            composedRange.endOffset,
          )
        ) {
          const range = document.createRange();
          range.setStart(
            composedRange.startContainer,
            composedRange.startOffset,
          );
          range.setEnd(composedRange.endContainer, composedRange.endOffset);
          return range;
        }
      }
    } catch {
      // Fall through to the standard selection path.
    }
  }

  const range = selection.getRangeAt(0);
  if (isDomRangeValidInsideElement(element, range)) {
    return range;
  }

  return null;
};

export const getMentionMenuPosition = (editorElement, surfaceElement) => {
  const range = getSelectionRange(editorElement);
  const editorRect = editorElement.getBoundingClientRect();
  const surfaceRect = surfaceElement.getBoundingClientRect();
  const rect = range?.getBoundingClientRect?.() ?? editorRect;
  const maxLeft = Math.max(12, surfaceRect.width - 292);

  return {
    left: Math.max(12, Math.min(maxLeft, rect.left - surfaceRect.left)),
    top: Math.max(18, rect.bottom - surfaceRect.top + 12),
  };
};
