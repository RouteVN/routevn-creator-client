import {
  $createRangeSelection,
  $isElementNode,
  $isLineBreakNode,
  $isTextNode,
  $setSelection,
} from "lexical";

const REFERENCE_CHIP_SELECTOR =
  '[data-rvn-mention="true"][data-rvn-reference-key]';

export const walkTextUnits = (node, visitor) => {
  if (
    node.nodeType === Node.ELEMENT_NODE &&
    node.matches?.(REFERENCE_CHIP_SELECTOR)
  ) {
    return visitor({
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
    return visitor({
      length: node.textContent.length,
      setRangeAtOffset: (range, offset) => {
        range.setStart(node, offset);
        range.setEnd(node, offset);
      },
    });
  }

  if (node.nodeType === Node.ELEMENT_NODE && node.nodeName === "BR") {
    return visitor({
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

export const createCollapsedRangeAtPosition = (element, targetPosition) => {
  const range = document.createRange();
  const normalizedTargetPosition = Math.max(0, Number(targetPosition) || 0);
  let currentPosition = 0;
  let lastUnit;
  let actualPosition = 0;
  let foundNode = false;

  walkTextUnits(element, (unit) => {
    const nodeLength = unit.length;
    lastUnit = unit;

    if (currentPosition + nodeLength >= normalizedTargetPosition) {
      const offset = normalizedTargetPosition - currentPosition;
      unit.setRangeAtOffset(range, offset);
      actualPosition = normalizedTargetPosition;
      foundNode = true;
      return true;
    }

    currentPosition += nodeLength;
    return false;
  });

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
    return;
  }

  const root = element.getRootNode();
  let selection = window.getSelection();

  if (root instanceof ShadowRoot && typeof root.getSelection === "function") {
    selection = root.getSelection() || selection;
  }

  if (!selection) {
    return;
  }

  selection.removeAllRanges();
  selection.addRange(safeRange);
};

export const getLexicalTextLength = (node) => {
  if ($isLineBreakNode(node)) {
    return 1;
  }

  if ($isTextNode(node)) {
    return node.getTextContentSize?.() ?? node.getTextContent().length;
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

  if ($isTextNode(node)) {
    const textLength = getLexicalTextLength(node);
    return {
      key: node.getKey(),
      offset: Math.min(targetOffset, textLength),
      type: "text",
    };
  }

  if (!$isElementNode(node)) {
    return undefined;
  }

  const children = node.getChildren();
  let remainingOffset = targetOffset;

  for (const childNode of children) {
    const childLength = getLexicalTextLength(childNode);
    if ($isLineBreakNode(childNode) && remainingOffset <= childLength) {
      return {
        key: node.getKey(),
        offset:
          childNode.getIndexWithinParent() + (remainingOffset > 0 ? 1 : 0),
        type: "element",
      };
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
