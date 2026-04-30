import { $isElementNode, $isRangeSelection, $isTextNode } from "lexical";
import {
  $isMentionNode,
  getFuriganaFromNode,
  getTextStyleIdFromNode,
} from "./lexicalRichTextShared.js";
import { getLexicalTextLength } from "./lexicalSceneDocumentSelection.js";

export const REFERENCE_CHIP_SELECTOR =
  '[data-rvn-mention="true"][data-rvn-reference-key]';
export const TEXT_STYLE_SEGMENT_SELECTOR =
  '[style*="--rvn-text-style-id"], [style*="--rvn-furigana-text"]';

const getClosestContainedElementFromContextEvent = (
  event,
  editorElement,
  selector,
) => {
  const path = event.composedPath?.() ?? [];

  for (const target of path) {
    const element =
      target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    const matchedElement = element?.closest?.(selector);
    if (matchedElement && editorElement?.contains(matchedElement)) {
      return matchedElement;
    }

    if (target === editorElement) {
      break;
    }
  }

  return undefined;
};

export const getReferenceElementFromContextEvent = (event, editorElement) => {
  return getClosestContainedElementFromContextEvent(
    event,
    editorElement,
    REFERENCE_CHIP_SELECTOR,
  );
};

export const getTextStyleSegmentElementFromContextEvent = (
  event,
  editorElement,
) => {
  return getClosestContainedElementFromContextEvent(
    event,
    editorElement,
    TEXT_STYLE_SEGMENT_SELECTOR,
  );
};

export const getReferenceSnapshotFromMentionNode = (node) => {
  const reference = node.getReferenceData();
  return {
    nodeKey: node.getKey(),
    resourceId: reference.resourceId,
    label: reference.label,
  };
};

export const getReferenceRichTextStateFromNode = (node) => {
  if (!$isMentionNode(node)) {
    return {
      textStyleId: undefined,
      furigana: undefined,
    };
  }

  return {
    textStyleId: getTextStyleIdFromNode(node),
    furigana: getFuriganaFromNode(node),
  };
};

export const getReferenceSelectionInfo = (selection) => {
  if (!$isRangeSelection(selection)) {
    return undefined;
  }

  const points = selection.getStartEndPoints();
  if (!points) {
    return undefined;
  }

  const [startPoint, endPoint] = points;
  if (
    startPoint.type === "element" &&
    endPoint.type === "element" &&
    startPoint.key === endPoint.key &&
    endPoint.offset === startPoint.offset + 1
  ) {
    const parentNode = startPoint.getNode();
    const childNode = $isElementNode(parentNode)
      ? parentNode.getChildAtIndex(startPoint.offset)
      : undefined;
    if ($isMentionNode(childNode)) {
      return {
        node: childNode,
        isCollapsed: false,
        isWhole: true,
      };
    }
  }

  const startNode = startPoint.getNode();
  const endNode = endPoint.getNode();
  if (!$isMentionNode(startNode) || startNode !== endNode) {
    return undefined;
  }

  const textLength = getLexicalTextLength(startNode);
  const isCollapsed = selection.isCollapsed();
  return {
    node: startNode,
    isCollapsed,
    isWhole:
      !isCollapsed && startPoint.offset === 0 && endPoint.offset === textLength,
  };
};

export const selectReferenceNodeAsElement = (node) => {
  const parentNode = node.getParent();
  if (!$isElementNode(parentNode)) {
    node.select(0, getLexicalTextLength(node));
    return;
  }

  const index = node.getIndexWithinParent();
  parentNode.select(index, index + 1);
};

export const placeCaretAroundReferenceNode = (node, direction) => {
  const parentNode = node.getParent();
  if (!$isElementNode(parentNode)) {
    if (direction < 0) {
      node.selectStart();
      return;
    }

    node.selectEnd();
    return;
  }

  const referenceIndex = node.getIndexWithinParent();
  const caretIndex = referenceIndex + (direction > 0 ? 1 : 0);
  parentNode.select(caretIndex, caretIndex);
};

export const isCollapsedReferenceCaretMovingIntoNode = (
  selection,
  node,
  direction,
) => {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return false;
  }

  const point = selection.anchor;
  if (point.getNode() !== node) {
    return false;
  }

  const textLength = getLexicalTextLength(node);
  if (point.offset > 0 && point.offset < textLength) {
    return true;
  }

  return (
    (direction > 0 && point.offset <= 0) ||
    (direction < 0 && point.offset >= textLength)
  );
};

export const getAdjacentReferenceNodeForCollapsedSelection = (
  selection,
  direction,
) => {
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return undefined;
  }

  const point = selection.anchor;
  const node = point.getNode();
  let candidate;

  if ($isMentionNode(node)) {
    candidate = isCollapsedReferenceCaretMovingIntoNode(
      selection,
      node,
      direction,
    )
      ? node
      : undefined;
  } else if (point.type === "text" && $isTextNode(node)) {
    const textLength = getLexicalTextLength(node);
    if (direction < 0 && point.offset === 0) {
      candidate = node.getPreviousSibling();
    } else if (direction > 0 && point.offset >= textLength) {
      candidate = node.getNextSibling();
    }
  } else if (point.type === "element" && $isElementNode(node)) {
    const childIndex = direction < 0 ? point.offset - 1 : point.offset;
    candidate =
      childIndex >= 0 && childIndex < node.getChildrenSize()
        ? node.getChildAtIndex(childIndex)
        : undefined;
  }

  return $isMentionNode(candidate) ? candidate : undefined;
};
