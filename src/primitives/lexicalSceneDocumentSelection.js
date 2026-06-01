import {
  $createRangeSelection,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $setSelection,
} from "lexical";
import { EDITOR_CARET_TEXT } from "../internal/ui/sceneEditorLexical/contentModel.js";

const REFERENCE_CHIP_SELECTOR =
  '[data-rvn-mention="true"][data-rvn-reference-key]';
const REFERENCE_NODE_TYPE = "rvn-mention";

const isReferenceTextNode = (node) => {
  return $isTextNode(node) && node.getType?.() === REFERENCE_NODE_TYPE;
};

const getLogicalText = (text) => {
  return String(text ?? "").replaceAll(EDITOR_CARET_TEXT, "");
};

const getLogicalTextLength = (text) => {
  return getLogicalText(text).length;
};

const getTextNodeOffsetFromLogicalOffset = (text, targetOffset) => {
  const normalizedTargetOffset = Math.max(0, Number(targetOffset) || 0);
  let logicalOffset = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === EDITOR_CARET_TEXT) {
      continue;
    }

    if (logicalOffset >= normalizedTargetOffset) {
      return index;
    }

    logicalOffset += 1;
  }

  return text.length;
};

export const walkTextUnits = (node, visitor) => {
  if (
    node.nodeType === Node.ELEMENT_NODE &&
    node.matches?.(REFERENCE_CHIP_SELECTOR)
  ) {
    return visitor({
      type: "reference",
      length: node.textContent?.length ?? 0,
      setRangeAtOffset: (range, offset) => {
        const parent = node.parentNode;
        const childIndex = Array.from(parent.childNodes).indexOf(node);
        const pointOffset = childIndex + (offset > 0 ? 1 : 0);
        range.setStart(parent, pointOffset);
        range.setEnd(parent, pointOffset);
      },
    });
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return visitor({
      type: "text",
      length: getLogicalTextLength(text),
      setRangeAtOffset: (range, offset) => {
        const textOffset = getTextNodeOffsetFromLogicalOffset(text, offset);
        range.setStart(node, textOffset);
        range.setEnd(node, textOffset);
      },
    });
  }

  if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === "BR") {
    return visitor({
      type: "line-break",
      length: 1,
      setRangeAtOffset: (range, offset) => {
        const parent = node.parentNode;
        const childIndex = Array.from(parent.childNodes).indexOf(node);
        const pointOffset = childIndex + (offset > 0 ? 1 : 0);
        range.setStart(parent, pointOffset);
        range.setEnd(parent, pointOffset);
      },
    });
  }

  for (const child of node.childNodes) {
    if (walkTextUnits(child, visitor)) {
      return true;
    }
  }

  return false;
};

const collectTextUnits = (element) => {
  const units = [];
  walkTextUnits(element, (unit) => {
    units.push(unit);
    return false;
  });
  return units;
};

export const createCollapsedRangeAtPosition = (element, targetPosition) => {
  const range = document.createRange();
  const normalizedTargetPosition = Math.max(0, Number(targetPosition) || 0);
  const units = collectTextUnits(element);
  let currentPosition = 0;
  let lastUnit;
  let actualPosition = 0;
  let foundNode = false;

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const nodeLength = unit.length;
    lastUnit = unit;
    const unitEnd = currentPosition + nodeLength;

    if (
      normalizedTargetPosition < unitEnd ||
      (normalizedTargetPosition === unitEnd &&
        (unit.type !== "reference" || units[index + 1]?.type !== "text"))
    ) {
      const offset = normalizedTargetPosition - currentPosition;
      unit.setRangeAtOffset(range, offset);
      actualPosition = normalizedTargetPosition;
      foundNode = true;
      break;
    }

    currentPosition = unitEnd;
  }

  if (!foundNode && lastUnit) {
    lastUnit.setRangeAtOffset(range, lastUnit.length);
    actualPosition = currentPosition;
    foundNode = true;
  }

  if (!foundNode) {
    range.selectNodeContents(element);
    range.collapse(true);
  }

  return {
    range,
    actualPosition,
  };
};

export const clampDomPointOffset = (node, offset) => {
  const numericOffset = Math.max(0, Number(offset) || 0);
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.min(numericOffset, node.textContent?.length ?? 0);
  }

  return Math.min(numericOffset, node.childNodes?.length ?? 0);
};

export const createSafeRange = (element, range) => {
  if (
    !element ||
    !range ||
    !range.startContainer?.isConnected ||
    !range.endContainer?.isConnected ||
    !element.contains(range.startContainer) ||
    !element.contains(range.endContainer)
  ) {
    return undefined;
  }

  const nextRange = document.createRange();
  const startOffset = clampDomPointOffset(
    range.startContainer,
    range.startOffset,
  );
  const endOffset = clampDomPointOffset(range.endContainer, range.endOffset);

  try {
    nextRange.setStart(range.startContainer, startOffset);
    nextRange.setEnd(range.endContainer, endOffset);
  } catch {
    return undefined;
  }

  return nextRange;
};

export const setSelectionFromRange = (element, range) => {
  const safeRange = createSafeRange(element, range);
  if (!safeRange) {
    return false;
  }

  const root = element.getRootNode();
  const selections = [];
  const windowSelection = window.getSelection();
  if (windowSelection) {
    selections.push(windowSelection);
  }

  if (root instanceof ShadowRoot && typeof root.getSelection === "function") {
    const shadowSelection = root.getSelection();
    if (shadowSelection && !selections.includes(shadowSelection)) {
      selections.unshift(shadowSelection);
    }
  }

  let didSetSelection = false;
  for (const selection of selections) {
    try {
      selection.setBaseAndExtent(
        safeRange.startContainer,
        safeRange.startOffset,
        safeRange.endContainer,
        safeRange.endOffset,
      );
      didSetSelection = true;
      continue;
    } catch {
      // Fall back to Range APIs below.
    }

    try {
      selection.removeAllRanges();
      selection.addRange(safeRange.cloneRange());
      didSetSelection = true;
    } catch {
      // Some engines reject shadow-DOM ranges on the document selection.
    }
  }

  return didSetSelection;
};

export const getLexicalTextLength = (node) => {
  if ($isLineBreakNode(node)) {
    return 1;
  }

  if ($isTextNode(node)) {
    return getLogicalTextLength(node.getTextContent());
  }

  if ($isElementNode(node)) {
    return node.getChildren().reduce((total, childNode) => {
      return total + getLexicalTextLength(childNode);
    }, 0);
  }

  return 0;
};

export const getLexicalOffsetBeforeNode = (node, targetKey) => {
  if (node.getKey() === targetKey) {
    return { found: true, offset: 0 };
  }

  if (!$isElementNode(node)) {
    return { found: false, offset: getLexicalTextLength(node) };
  }

  let offset = 0;

  for (const childNode of node.getChildren()) {
    const result = getLexicalOffsetBeforeNode(childNode, targetKey);
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

export const resolvePointAtOffset = (node, offset) => {
  const targetOffset = Math.max(0, Number(offset) || 0);

  if ($isLineBreakNode(node)) {
    const parent = node.getParent();
    if (!parent) {
      return undefined;
    }

    return {
      key: parent.getKey(),
      offset: node.getIndexWithinParent() + (targetOffset > 0 ? 1 : 0),
      type: "element",
    };
  }

  if (isReferenceTextNode(node)) {
    const parent = node.getParent();
    if (!$isElementNode(parent)) {
      return undefined;
    }

    return {
      key: parent.getKey(),
      offset: node.getIndexWithinParent() + (targetOffset > 0 ? 1 : 0),
      type: "element",
    };
  }

  if ($isTextNode(node)) {
    const textLength = getLexicalTextLength(node);
    return {
      key: node.getKey(),
      offset: getTextNodeOffsetFromLogicalOffset(
        node.getTextContent(),
        Math.min(targetOffset, textLength),
      ),
      type: "text",
    };
  }

  if (!$isElementNode(node)) {
    return undefined;
  }

  const children = node.getChildren();
  let remainingOffset = targetOffset;

  for (let index = 0; index < children.length; index += 1) {
    const childNode = children[index];
    const childLength = getLexicalTextLength(childNode);
    if ($isLineBreakNode(childNode) && remainingOffset <= childLength) {
      return {
        key: node.getKey(),
        offset:
          childNode.getIndexWithinParent() + (remainingOffset > 0 ? 1 : 0),
        type: "element",
      };
    }

    if (
      isReferenceTextNode(childNode) &&
      remainingOffset === childLength &&
      $isTextNode(children[index + 1]) &&
      !isReferenceTextNode(children[index + 1])
    ) {
      return resolvePointAtOffset(children[index + 1], 0);
    }

    if (remainingOffset <= childLength) {
      const point = resolvePointAtOffset(childNode, remainingOffset);
      if (point) {
        return point;
      }
    }
    remainingOffset -= childLength;
  }

  const lastChild = children.at(-1);
  if (lastChild) {
    return resolvePointAtOffset(lastChild, getLexicalTextLength(lastChild));
  }

  return {
    key: node.getKey(),
    offset: 0,
    type: "element",
  };
};

export const applySelectionToLineNode = (lineNode, selectionSnapshot = {}) => {
  const startPoint = resolvePointAtOffset(lineNode, selectionSnapshot.start);
  const endPoint = resolvePointAtOffset(
    lineNode,
    selectionSnapshot.end ?? selectionSnapshot.start,
  );

  if (!startPoint || !endPoint) {
    lineNode.selectStart();
    return;
  }

  const selection = $createRangeSelection();
  selection.anchor.set(startPoint.key, startPoint.offset, startPoint.type);
  selection.focus.set(endPoint.key, endPoint.offset, endPoint.type);
  $setSelection(selection);
};

export const clearSelectionTextFormatting = (selection) => {
  selection.format = 0;
  selection.setStyle("");

  const anchorNode = selection.anchor.getNode();
  if ($isTextNode(anchorNode)) {
    anchorNode.setFormat(0);
    anchorNode.setStyle("");
  }
};
