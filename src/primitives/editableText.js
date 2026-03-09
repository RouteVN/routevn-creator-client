const getSelectionRange = (element) => {
  const root = element.getRootNode();
  const isShadowRoot = root instanceof ShadowRoot;

  let selection = window.getSelection();

  if (isShadowRoot && typeof root.getSelection === "function") {
    const shadowSelection = root.getSelection();
    if (shadowSelection && shadowSelection.rangeCount > 0) {
      const range = shadowSelection.getRangeAt(0);
      if (element.contains(range.startContainer)) {
        return range;
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
        const staticRange = ranges[0];
        if (element.contains(staticRange.startContainer)) {
          const range = document.createRange();
          range.setStart(staticRange.startContainer, staticRange.startOffset);
          range.setEnd(staticRange.endContainer, staticRange.endOffset);
          return range;
        }
      }
    } catch {
      // Fall back to the standard selection path.
    }
  }

  const range = selection.getRangeAt(0);
  if (element.contains(range.startContainer)) {
    return range;
  }

  return null;
};

const walkTextNodes = (node, visitor) => {
  if (node.nodeType === Node.TEXT_NODE) {
    return visitor(node);
  }

  for (const child of node.childNodes) {
    if (walkTextNodes(child, visitor)) {
      return true;
    }
  }

  return false;
};

const createCollapsedRangeAtPosition = (element, targetPosition) => {
  const range = document.createRange();
  const normalizedTargetPosition = Math.max(0, Number(targetPosition) || 0);
  let currentPosition = 0;
  let lastTextNode;
  let lastTextNodeLength = 0;
  let actualPosition = 0;
  let foundNode = false;

  walkTextNodes(element, (node) => {
    const nodeLength = node.textContent.length;
    lastTextNode = node;
    lastTextNodeLength = nodeLength;

    if (currentPosition + nodeLength >= normalizedTargetPosition) {
      const offset = normalizedTargetPosition - currentPosition;
      range.setStart(node, offset);
      range.setEnd(node, offset);
      actualPosition = normalizedTargetPosition;
      foundNode = true;
      return true;
    }

    currentPosition += nodeLength;
    return false;
  });

  if (!foundNode && lastTextNode) {
    range.setStart(lastTextNode, lastTextNodeLength);
    range.setEnd(lastTextNode, lastTextNodeLength);
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

const setSelectionFromRange = (element, range) => {
  const root = element.getRootNode();
  let selection = window.getSelection();

  if (root instanceof ShadowRoot && typeof root.getSelection === "function") {
    selection = root.getSelection() || selection;
  }

  if (!selection) {
    return;
  }

  if (typeof selection.setBaseAndExtent === "function") {
    selection.setBaseAndExtent(
      range.startContainer,
      range.startOffset,
      range.endContainer,
      range.endOffset,
    );
    return;
  }

  selection.removeAllRanges();
  selection.addRange(range);
};

export const EDITABLE_TEXT_TAG_NAME = "rvn-editable-text";

export class EditableTextElement extends HTMLElement {
  connectedCallback() {
    this.contentEditable = "plaintext-only";
    this.setAttribute("contenteditable", "plaintext-only");
    if (!this.style.display) {
      this.style.display = "block";
    }
  }

  getContent() {
    return this.textContent ?? "";
  }

  updateContent(content = "") {
    const nextContent = content ?? "";
    if (this.textContent !== nextContent) {
      this.textContent = nextContent;
    }
  }

  getCaretPosition() {
    const range = getSelectionRange(this);
    if (!range) {
      return 0;
    }

    const preCaretRange = document.createRange();
    preCaretRange.selectNodeContents(this);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }

  setCaretPosition(position, { preventScroll = true } = {}) {
    const { range, actualPosition } = createCollapsedRangeAtPosition(
      this,
      position,
    );

    this.focus({ preventScroll });
    setSelectionFromRange(this, range);
    return actualPosition;
  }

  moveCaretToFirst(options) {
    return this.setCaretPosition(0, options);
  }

  moveCaretToLast(options) {
    return this.setCaretPosition(this.getContent().length, options);
  }

  findLastLinePosition(goalColumn) {
    const textLength = this.getContent().length;
    if (textLength === 0 || goalColumn >= textLength) {
      return textLength;
    }

    let lastLineStartPosition = 0;
    let lastLineTop;

    for (let position = textLength; position >= 0; position--) {
      try {
        const { range } = createCollapsedRangeAtPosition(this, position);
        const rect = range.getBoundingClientRect();

        if (lastLineTop === undefined) {
          lastLineTop = rect.top;
          lastLineStartPosition = position;
        } else if (Math.abs(rect.top - lastLineTop) > 5) {
          break;
        } else {
          lastLineStartPosition = position;
        }
      } catch {
        continue;
      }
    }

    const lastLineLength = textLength - lastLineStartPosition;
    const positionOnLastLine = Math.min(goalColumn, lastLineLength);
    return lastLineStartPosition + positionOnLastLine;
  }

  isCaretOnFirstLine() {
    const range = getSelectionRange(this);
    if (!range) {
      return false;
    }

    const cursorRect = range.getBoundingClientRect();
    const startRange = document.createRange();
    const { range: firstRange } = createCollapsedRangeAtPosition(this, 0);

    startRange.setStart(firstRange.startContainer, firstRange.startOffset);
    startRange.setEnd(firstRange.endContainer, firstRange.endOffset);

    return (
      Math.abs(cursorRect.top - startRange.getBoundingClientRect().top) <= 5
    );
  }

  isCaretOnLastLine() {
    const elementHeight = this.scrollHeight;
    const lineHeight =
      parseFloat(window.getComputedStyle(this).lineHeight) || 20;
    const hasMultipleLines = elementHeight > lineHeight * 1.5;

    if (!hasMultipleLines) {
      return true;
    }

    const range = getSelectionRange(this);
    if (!range) {
      return false;
    }

    const cursorRect = range.getBoundingClientRect();
    const { range: endRange } = createCollapsedRangeAtPosition(
      this,
      this.getContent().length,
    );

    return Math.abs(cursorRect.top - endRange.getBoundingClientRect().top) <= 5;
  }
}
