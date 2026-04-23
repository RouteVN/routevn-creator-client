const ACCENT_FILL = "#b45309";

const SAMPLE_SEGMENTS = [
  { text: "Segmented editing ", textStyle: { fontWeight: "bold" } },
  { text: "should keep ", textStyle: { fontStyle: "italic" } },
  {
    text: "format boundaries",
    textStyle: { fill: ACCENT_FILL },
  },
  { text: " stable while you type across them." },
];

const BLOCK_ELEMENT_NAMES = new Set([
  "DIV",
  "P",
  "LI",
  "UL",
  "OL",
  "SECTION",
  "ARTICLE",
]);

const SHADOW_STYLES = `
  :host {
    display: block;
    width: 100%;
    color: #1f2937;
  }

  * {
    box-sizing: border-box;
  }

  .shell {
    display: grid;
    gap: 16px;
    width: 100%;
  }

  .intro {
    display: grid;
    gap: 6px;
    padding: 18px 20px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 16px;
    background:
      linear-gradient(145deg, rgba(255, 251, 235, 0.92), rgba(255, 255, 255, 0.98));
  }

  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #9a3412;
  }

  .intro-text {
    font-size: 14px;
    line-height: 1.6;
    color: #4b5563;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .tool {
    appearance: none;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 999px;
    background: #fff;
    color: #1f2937;
    padding: 9px 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      transform 120ms ease;
  }

  .tool:hover:not(:disabled) {
    border-color: rgba(154, 52, 18, 0.35);
    background: #fff7ed;
    color: #9a3412;
    transform: translateY(-1px);
  }

  .tool:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .tool-accent {
    color: #9a3412;
  }

  .tool-sample {
    margin-left: auto;
  }

  .surface {
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 18px;
    background:
      radial-gradient(circle at top left, rgba(255, 247, 237, 0.9), rgba(255, 255, 255, 0.98) 55%);
    overflow: hidden;
  }

  .surface-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    font-size: 12px;
    color: #6b7280;
    background: rgba(255, 255, 255, 0.72);
  }

  .editor {
    min-height: 180px;
    padding: 20px;
    outline: none;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 18px;
    line-height: 1.7;
    caret-color: #9a3412;
  }

  .editor:empty::before {
    content: "Type here to test segmented editing.";
    color: #9ca3af;
  }

  .segment {
    white-space: pre-wrap;
  }

  .panes {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .panel {
    min-width: 0;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 16px;
    background: #ffffff;
    overflow: hidden;
  }

  .panel-title {
    padding: 10px 14px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.18);
    background: #f8fafc;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #64748b;
  }

  .panel-body {
    margin: 0;
    padding: 14px;
    min-height: 132px;
    font-family:
      "SFMono-Regular",
      "Consolas",
      "Liberation Mono",
      monospace;
    font-size: 12px;
    line-height: 1.6;
    color: #334155;
    background: #ffffff;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

const cloneTextStyle = (textStyle) => {
  if (!textStyle || typeof textStyle !== "object" || Array.isArray(textStyle)) {
    return undefined;
  }

  const nextStyle = {};

  if (textStyle.fontWeight === "bold") {
    nextStyle.fontWeight = "bold";
  }

  if (textStyle.fontStyle === "italic") {
    nextStyle.fontStyle = "italic";
  }

  if (typeof textStyle.fill === "string" && textStyle.fill.length > 0) {
    nextStyle.fill = textStyle.fill;
  }

  return Object.keys(nextStyle).length > 0 ? nextStyle : undefined;
};

const cloneSegments = (segments = []) => {
  return segments
    .map((segment) => {
      const nextSegment = {
        text: String(segment?.text ?? ""),
      };
      const nextTextStyle = cloneTextStyle(segment?.textStyle);
      if (nextTextStyle) {
        nextSegment.textStyle = nextTextStyle;
      }
      return nextSegment;
    })
    .filter((segment) => segment.text.length > 0);
};

const getTextStyleKey = (textStyle) => {
  return JSON.stringify(cloneTextStyle(textStyle) ?? {});
};

const mergeAdjacentSegments = (segments = []) => {
  const result = [];

  for (const segment of cloneSegments(segments)) {
    if (segment.text.length === 0) {
      continue;
    }

    const previousSegment = result[result.length - 1];
    if (
      previousSegment &&
      getTextStyleKey(previousSegment.textStyle) ===
        getTextStyleKey(segment.textStyle)
    ) {
      previousSegment.text += segment.text;
      continue;
    }

    result.push(segment);
  }

  return result;
};

const getPlainText = (segments = []) => {
  return mergeAdjacentSegments(segments)
    .map((segment) => segment.text)
    .join("");
};

const pushSegment = (segments, text, textStyle) => {
  const nextText = String(text ?? "");
  if (nextText.length === 0) {
    return;
  }

  const nextTextStyle = cloneTextStyle(textStyle);
  const nextSegment = {
    text: nextText,
  };
  if (nextTextStyle) {
    nextSegment.textStyle = nextTextStyle;
  }
  const previousSegment = segments[segments.length - 1];

  if (
    previousSegment &&
    getTextStyleKey(previousSegment.textStyle) ===
      getTextStyleKey(nextSegment.textStyle)
  ) {
    previousSegment.text += nextSegment.text;
    return;
  }

  segments.push(nextSegment);
};

const normalizeSelection = (selection, maxOffset) => {
  if (!selection) {
    return { start: 0, end: 0 };
  }

  const nextStart = Number(selection.start);
  const nextEnd = Number(selection.end);
  const clampedStart = Number.isFinite(nextStart)
    ? Math.max(0, Math.min(maxOffset, nextStart))
    : 0;
  const clampedEnd = Number.isFinite(nextEnd)
    ? Math.max(0, Math.min(maxOffset, nextEnd))
    : clampedStart;

  return {
    start: Math.min(clampedStart, clampedEnd),
    end: Math.max(clampedStart, clampedEnd),
  };
};

const parseSegmentStyle = (segmentStyleValue, inheritedTextStyle) => {
  if (typeof segmentStyleValue !== "string" || segmentStyleValue.length === 0) {
    return inheritedTextStyle;
  }

  try {
    return cloneTextStyle(JSON.parse(segmentStyleValue));
  } catch {
    return inheritedTextStyle;
  }
};

const getSelectionRange = (element) => {
  const root = element?.getRootNode?.();
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
      // Fall back to the default selection path.
    }
  }

  const range = selection.getRangeAt(0);
  if (element.contains(range.startContainer)) {
    return range;
  }

  return null;
};

const setSelectionFromRange = (element, range) => {
  const root = element?.getRootNode?.();
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

const walkTextNodes = (node, visitor) => {
  if (!node) {
    return false;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    return visitor(node);
  }

  for (const childNode of node.childNodes) {
    if (walkTextNodes(childNode, visitor)) {
      return true;
    }
  }

  return false;
};

const createRangePointAtOffset = (element, targetOffset) => {
  const normalizedTargetOffset = Math.max(0, Number(targetOffset) || 0);
  let currentOffset = 0;
  let lastTextNode;
  let lastTextNodeLength = 0;
  let point;

  walkTextNodes(element, (node) => {
    const nodeLength = node.textContent?.length ?? 0;
    lastTextNode = node;
    lastTextNodeLength = nodeLength;

    if (currentOffset + nodeLength >= normalizedTargetOffset) {
      point = {
        node,
        offset: normalizedTargetOffset - currentOffset,
      };
      return true;
    }

    currentOffset += nodeLength;
    return false;
  });

  if (point) {
    return point;
  }

  if (lastTextNode) {
    return {
      node: lastTextNode,
      offset: lastTextNodeLength,
    };
  }

  return {
    node: element,
    offset: 0,
  };
};

const createRangeFromOffsets = (element, startOffset, endOffset) => {
  const range = document.createRange();
  const startPoint = createRangePointAtOffset(element, startOffset);
  const endPoint = createRangePointAtOffset(element, endOffset);
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
};

const getOffsetsFromRange = (element, range) => {
  const startRange = document.createRange();
  startRange.selectNodeContents(element);
  startRange.setEnd(range.startContainer, range.startOffset);

  const endRange = document.createRange();
  endRange.selectNodeContents(element);
  endRange.setEnd(range.endContainer, range.endOffset);

  return {
    start: startRange.toString().length,
    end: endRange.toString().length,
  };
};

const getSelectionOffsets = (element) => {
  const range = getSelectionRange(element);
  if (!range) {
    return null;
  }

  return getOffsetsFromRange(element, range);
};

const collectSegmentsFromDomNode = (
  node,
  inheritedTextStyle,
  segments,
  { shouldPrefixNewline = false } = {},
) => {
  if (!node) {
    return;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (shouldPrefixNewline) {
      pushSegment(segments, `\n${text}`, inheritedTextStyle);
      return;
    }

    pushSegment(segments, text, inheritedTextStyle);
    return;
  }

  if (!(node instanceof Element)) {
    return;
  }

  if (node.tagName === "BR") {
    pushSegment(segments, "\n", inheritedTextStyle);
    return;
  }

  const nextTextStyle = parseSegmentStyle(
    node.dataset.segmentStyle,
    inheritedTextStyle,
  );
  const shouldInsertNewlineBefore =
    shouldPrefixNewline ||
    (BLOCK_ELEMENT_NAMES.has(node.tagName) && segments.length > 0);

  let hasInsertedBlockNewline = false;

  for (const childNode of node.childNodes) {
    collectSegmentsFromDomNode(childNode, nextTextStyle, segments, {
      shouldPrefixNewline:
        shouldInsertNewlineBefore && hasInsertedBlockNewline === false,
    });
    hasInsertedBlockNewline = true;
  }
};

const parseSegmentsFromDom = (element) => {
  const segments = [];

  for (const childNode of element.childNodes) {
    collectSegmentsFromDomNode(childNode, undefined, segments);
  }

  return mergeAdjacentSegments(segments);
};

const mapSegmentsInRange = (segments, { start, end }, transformTextStyle) => {
  const nextSegments = [];
  let currentOffset = 0;

  for (const segment of mergeAdjacentSegments(segments)) {
    const nextOffset = currentOffset + segment.text.length;

    if (nextOffset <= start || currentOffset >= end) {
      pushSegment(nextSegments, segment.text, segment.textStyle);
      currentOffset = nextOffset;
      continue;
    }

    const leftBoundary = Math.max(0, start - currentOffset);
    const rightBoundary = Math.min(segment.text.length, end - currentOffset);

    if (leftBoundary > 0) {
      pushSegment(
        nextSegments,
        segment.text.slice(0, leftBoundary),
        segment.textStyle,
      );
    }

    if (rightBoundary > leftBoundary) {
      pushSegment(
        nextSegments,
        segment.text.slice(leftBoundary, rightBoundary),
        transformTextStyle(segment.textStyle),
      );
    }

    if (rightBoundary < segment.text.length) {
      pushSegment(
        nextSegments,
        segment.text.slice(rightBoundary),
        segment.textStyle,
      );
    }

    currentOffset = nextOffset;
  }

  return mergeAdjacentSegments(nextSegments);
};

const doesSelectionMatch = (segments, { start, end }, predicate) => {
  if (start === end) {
    return false;
  }

  let currentOffset = 0;
  let hasMatchedSegment = false;

  for (const segment of mergeAdjacentSegments(segments)) {
    const nextOffset = currentOffset + segment.text.length;
    const overlaps = currentOffset < end && nextOffset > start;
    if (!overlaps) {
      currentOffset = nextOffset;
      continue;
    }

    hasMatchedSegment = true;
    if (!predicate(segment.textStyle)) {
      return false;
    }

    currentOffset = nextOffset;
  }

  return hasMatchedSegment;
};

const createEditorShell = () => {
  const template = document.createElement("template");
  template.innerHTML = `
    <style>${SHADOW_STYLES}</style>
    <div class="shell">
      <div class="intro">
        <div class="eyebrow">Segmented Editor POC</div>
        <div class="intro-text">
          This editor lets the browser handle live text input inside styled
          spans, then normalizes the DOM back into a segment model after edits.
          Use the toolbar or Cmd/Ctrl+B and Cmd/Ctrl+I on a selection.
        </div>
      </div>
      <div class="toolbar" id="toolbar">
        <button class="tool" type="button" data-action="bold">Bold</button>
        <button class="tool" type="button" data-action="italic">Italic</button>
        <button class="tool tool-accent" type="button" data-action="accent">
          Accent
        </button>
        <button class="tool" type="button" data-action="clear">
          Clear Style
        </button>
        <button class="tool tool-sample" type="button" data-action="sample">
          Reset Sample
        </button>
      </div>
      <div class="surface">
        <div class="surface-meta">
          <span id="selectionLabel">Selection 0..0</span>
          <span id="plainTextLengthLabel">0 chars</span>
          <span id="compositionLabel">Composition idle</span>
        </div>
        <div
          id="editor"
          class="editor"
          contenteditable="true"
          spellcheck="false"
        ></div>
      </div>
      <div class="panes">
        <section class="panel">
          <div class="panel-title">Segments</div>
          <pre id="segmentsDebug" class="panel-body"></pre>
        </section>
        <section class="panel">
          <div class="panel-title">State</div>
          <pre id="stateDebug" class="panel-body"></pre>
        </section>
        <section class="panel">
          <div class="panel-title">Plain Text</div>
          <pre id="plainTextDebug" class="panel-body"></pre>
        </section>
      </div>
    </div>
  `;

  return template.content.cloneNode(true);
};

export const SEGMENTED_TEXT_POC_TAG_NAME = "rvn-segmented-text-editor-poc";

export class SegmentedTextPocElement extends HTMLElement {
  constructor() {
    super();

    this.state = {
      segments: cloneSegments(SAMPLE_SEGMENTS),
      selection: { start: 0, end: 0 },
      isComposing: false,
    };

    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(createEditorShell());

    this.refs = {
      toolbar: this.shadowRoot.getElementById("toolbar"),
      editor: this.shadowRoot.getElementById("editor"),
      segmentsDebug: this.shadowRoot.getElementById("segmentsDebug"),
      stateDebug: this.shadowRoot.getElementById("stateDebug"),
      plainTextDebug: this.shadowRoot.getElementById("plainTextDebug"),
      selectionLabel: this.shadowRoot.getElementById("selectionLabel"),
      plainTextLengthLabel: this.shadowRoot.getElementById(
        "plainTextLengthLabel",
      ),
      compositionLabel: this.shadowRoot.getElementById("compositionLabel"),
    };

    this.handleToolbarMouseDown = this.handleToolbarMouseDown.bind(this);
    this.handleToolbarClick = this.handleToolbarClick.bind(this);
    this.handleEditorBeforeInput = this.handleEditorBeforeInput.bind(this);
    this.handleEditorInput = this.handleEditorInput.bind(this);
    this.handleEditorKeyDown = this.handleEditorKeyDown.bind(this);
    this.handleEditorMouseUp = this.handleEditorMouseUp.bind(this);
    this.handleEditorKeyUp = this.handleEditorKeyUp.bind(this);
    this.handleEditorFocus = this.handleEditorFocus.bind(this);
    this.handleCompositionStart = this.handleCompositionStart.bind(this);
    this.handleCompositionEnd = this.handleCompositionEnd.bind(this);
  }

  connectedCallback() {
    this.refs.toolbar.addEventListener(
      "mousedown",
      this.handleToolbarMouseDown,
    );
    this.refs.toolbar.addEventListener("click", this.handleToolbarClick);
    this.refs.editor.addEventListener(
      "beforeinput",
      this.handleEditorBeforeInput,
    );
    this.refs.editor.addEventListener("input", this.handleEditorInput);
    this.refs.editor.addEventListener("keydown", this.handleEditorKeyDown);
    this.refs.editor.addEventListener("keyup", this.handleEditorKeyUp);
    this.refs.editor.addEventListener("mouseup", this.handleEditorMouseUp);
    this.refs.editor.addEventListener("focus", this.handleEditorFocus);
    this.refs.editor.addEventListener(
      "compositionstart",
      this.handleCompositionStart,
    );
    this.refs.editor.addEventListener(
      "compositionend",
      this.handleCompositionEnd,
    );

    this.renderEditor({
      selection: {
        start: getPlainText(this.state.segments).length,
        end: getPlainText(this.state.segments).length,
      },
      shouldFocus: false,
    });
  }

  disconnectedCallback() {
    this.refs.toolbar.removeEventListener(
      "mousedown",
      this.handleToolbarMouseDown,
    );
    this.refs.toolbar.removeEventListener("click", this.handleToolbarClick);
    this.refs.editor.removeEventListener(
      "beforeinput",
      this.handleEditorBeforeInput,
    );
    this.refs.editor.removeEventListener("input", this.handleEditorInput);
    this.refs.editor.removeEventListener("keydown", this.handleEditorKeyDown);
    this.refs.editor.removeEventListener("keyup", this.handleEditorKeyUp);
    this.refs.editor.removeEventListener("mouseup", this.handleEditorMouseUp);
    this.refs.editor.removeEventListener("focus", this.handleEditorFocus);
    this.refs.editor.removeEventListener(
      "compositionstart",
      this.handleCompositionStart,
    );
    this.refs.editor.removeEventListener(
      "compositionend",
      this.handleCompositionEnd,
    );
  }

  getSegments() {
    return cloneSegments(this.state.segments);
  }

  getPlainText() {
    return getPlainText(this.state.segments);
  }

  getSelectionState() {
    return { ...this.state.selection };
  }

  loadSample() {
    const sampleSegments = cloneSegments(SAMPLE_SEGMENTS);
    const sampleTextLength = getPlainText(sampleSegments).length;
    this.state.segments = sampleSegments;
    this.renderEditor({
      selection: {
        start: sampleTextLength,
        end: sampleTextLength,
      },
      shouldFocus: true,
    });
  }

  handleToolbarMouseDown(event) {
    const button = event.target?.closest?.("button[data-action]");
    if (!button) {
      return;
    }

    event.preventDefault();
  }

  handleToolbarClick(event) {
    const button = event.target?.closest?.("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;

    if (action === "sample") {
      this.loadSample();
      return;
    }

    if (action === "bold") {
      this.toggleStyle(
        (textStyle) => textStyle?.fontWeight === "bold",
        (textStyle, shouldUnset) => {
          const nextTextStyle = cloneTextStyle(textStyle) ?? {};
          if (shouldUnset) {
            delete nextTextStyle.fontWeight;
          } else {
            nextTextStyle.fontWeight = "bold";
          }
          return nextTextStyle;
        },
      );
      return;
    }

    if (action === "italic") {
      this.toggleStyle(
        (textStyle) => textStyle?.fontStyle === "italic",
        (textStyle, shouldUnset) => {
          const nextTextStyle = cloneTextStyle(textStyle) ?? {};
          if (shouldUnset) {
            delete nextTextStyle.fontStyle;
          } else {
            nextTextStyle.fontStyle = "italic";
          }
          return nextTextStyle;
        },
      );
      return;
    }

    if (action === "accent") {
      this.toggleStyle(
        (textStyle) => textStyle?.fill === ACCENT_FILL,
        (textStyle, shouldUnset) => {
          const nextTextStyle = cloneTextStyle(textStyle) ?? {};
          if (shouldUnset) {
            delete nextTextStyle.fill;
          } else {
            nextTextStyle.fill = ACCENT_FILL;
          }
          return nextTextStyle;
        },
      );
      return;
    }

    if (action === "clear") {
      const selection = this.readSelection();
      if (!selection || selection.start === selection.end) {
        return;
      }

      this.state.segments = mapSegmentsInRange(
        this.state.segments,
        selection,
        () => undefined,
      );
      this.renderEditor({
        selection,
        shouldFocus: true,
      });
    }
  }

  handleEditorBeforeInput(event) {
    if (event.inputType === "insertFromPaste") {
      event.preventDefault();
      const pastedText =
        event.dataTransfer?.getData("text/plain") ||
        event.clipboardData?.getData("text/plain") ||
        "";
      this.insertPlainTextAtSelection(pastedText);
      return;
    }

    if (
      event.inputType === "insertParagraph" ||
      event.inputType === "insertLineBreak"
    ) {
      event.preventDefault();
      this.insertPlainTextAtSelection("\n");
      return;
    }

    if (event.inputType === "formatBold") {
      event.preventDefault();
      this.handleToolbarClick({
        target: this.refs.toolbar.querySelector('[data-action="bold"]'),
      });
      return;
    }

    if (event.inputType === "formatItalic") {
      event.preventDefault();
      this.handleToolbarClick({
        target: this.refs.toolbar.querySelector('[data-action="italic"]'),
      });
    }
  }

  handleEditorInput() {
    if (this.state.isComposing) {
      this.syncSelectionDebugOnly();
      return;
    }

    this.syncModelFromDom();
  }

  handleEditorKeyDown(event) {
    const isPrimaryShortcut = event.metaKey || event.ctrlKey;

    if (!isPrimaryShortcut || event.altKey) {
      return;
    }

    if (String(event.key).toLowerCase() === "b") {
      event.preventDefault();
      this.handleToolbarClick({
        target: this.refs.toolbar.querySelector('[data-action="bold"]'),
      });
      return;
    }

    if (String(event.key).toLowerCase() === "i") {
      event.preventDefault();
      this.handleToolbarClick({
        target: this.refs.toolbar.querySelector('[data-action="italic"]'),
      });
    }
  }

  handleEditorKeyUp() {
    this.queueSelectionSync();
  }

  handleEditorMouseUp() {
    this.queueSelectionSync();
  }

  handleEditorFocus() {
    this.queueSelectionSync();
  }

  handleCompositionStart() {
    this.state.isComposing = true;
    this.renderDebug();
  }

  handleCompositionEnd() {
    this.state.isComposing = false;
    requestAnimationFrame(() => {
      this.syncModelFromDom();
    });
  }

  queueSelectionSync() {
    requestAnimationFrame(() => {
      this.syncSelectionDebugOnly();
    });
  }

  syncSelectionDebugOnly() {
    const selection = this.readSelection();
    if (!selection) {
      return;
    }

    this.state.selection = selection;
    this.renderDebug();
    this.dispatchStateChange();
  }

  readSelection() {
    const selection = getSelectionOffsets(this.refs.editor);
    if (!selection) {
      return null;
    }

    return normalizeSelection(
      selection,
      getPlainText(this.state.segments).length,
    );
  }

  syncModelFromDom() {
    const parsedSegments = parseSegmentsFromDom(this.refs.editor);
    const nextPlainTextLength = getPlainText(parsedSegments).length;
    const selection = normalizeSelection(
      getSelectionOffsets(this.refs.editor) ?? this.state.selection,
      nextPlainTextLength,
    );

    this.state.segments = parsedSegments;
    this.renderEditor({
      selection,
      shouldFocus: true,
    });
  }

  insertPlainTextAtSelection(text) {
    const editor = this.refs.editor;
    const nextText = String(text ?? "");
    const range = getSelectionRange(editor);

    if (!range) {
      return;
    }

    range.deleteContents();
    const textNode = document.createTextNode(nextText);
    range.insertNode(textNode);

    const nextRange = document.createRange();
    nextRange.setStart(textNode, nextText.length);
    nextRange.setEnd(textNode, nextText.length);
    setSelectionFromRange(editor, nextRange);

    this.syncModelFromDom();
  }

  toggleStyle(isActive, updateTextStyle) {
    const selection = this.readSelection();
    if (!selection || selection.start === selection.end) {
      return;
    }

    const shouldUnset = doesSelectionMatch(
      this.state.segments,
      selection,
      isActive,
    );
    this.state.segments = mapSegmentsInRange(
      this.state.segments,
      selection,
      (textStyle) => updateTextStyle(textStyle, shouldUnset),
    );
    this.renderEditor({
      selection,
      shouldFocus: true,
    });
  }

  renderEditor({ selection, shouldFocus = false } = {}) {
    const editor = this.refs.editor;
    const normalizedSegments = mergeAdjacentSegments(this.state.segments);
    const maxOffset = getPlainText(normalizedSegments).length;
    const nextSelection = normalizeSelection(
      selection ?? this.state.selection,
      maxOffset,
    );

    this.state.segments = normalizedSegments;
    this.state.selection = nextSelection;

    editor.replaceChildren();

    for (const segment of normalizedSegments) {
      const span = document.createElement("span");
      span.className = "segment";
      span.dataset.segmentStyle = JSON.stringify(
        cloneTextStyle(segment.textStyle) ?? {},
      );
      span.textContent = segment.text;

      if (segment.textStyle?.fontWeight === "bold") {
        span.style.fontWeight = "700";
      }

      if (segment.textStyle?.fontStyle === "italic") {
        span.style.fontStyle = "italic";
      }

      if (segment.textStyle?.fill) {
        span.style.color = segment.textStyle.fill;
      }

      editor.append(span);
    }

    if (shouldFocus) {
      editor.focus({ preventScroll: true });
    }

    const restoreSelection = () => {
      if (editor !== editor.getRootNode()?.activeElement && !shouldFocus) {
        return false;
      }

      const range = createRangeFromOffsets(
        editor,
        nextSelection.start,
        nextSelection.end,
      );
      setSelectionFromRange(editor, range);
      return true;
    };

    const didRestoreSelection = restoreSelection();

    requestAnimationFrame(() => {
      if (!didRestoreSelection && !restoreSelection()) {
        this.renderDebug();
        this.dispatchStateChange();
        return;
      }
      this.renderDebug();
      this.dispatchStateChange();
    });
  }

  renderDebug() {
    const plainText = getPlainText(this.state.segments);
    const selection = normalizeSelection(
      this.state.selection,
      plainText.length,
    );

    this.refs.segmentsDebug.textContent = JSON.stringify(
      this.state.segments,
      null,
      2,
    );
    this.refs.stateDebug.textContent = JSON.stringify(
      {
        selection,
        isComposing: this.state.isComposing,
        activeStyleAtCaret: this.getActiveStyleAtCaret(selection),
      },
      null,
      2,
    );
    this.refs.plainTextDebug.textContent = plainText;
    this.refs.selectionLabel.textContent = `Selection ${selection.start}..${selection.end}`;
    this.refs.plainTextLengthLabel.textContent = `${plainText.length} chars`;
    this.refs.compositionLabel.textContent = this.state.isComposing
      ? "Composition active"
      : "Composition idle";

    const hasSelection = selection.start !== selection.end;
    for (const button of this.refs.toolbar.querySelectorAll("button")) {
      if (button.dataset.action === "sample") {
        button.disabled = false;
        continue;
      }

      button.disabled = !hasSelection;
    }
  }

  getActiveStyleAtCaret(selection) {
    if (selection.start !== selection.end) {
      return undefined;
    }

    if (this.state.segments.length === 0) {
      return undefined;
    }

    const offset = selection.start;
    let currentOffset = 0;

    for (const segment of this.state.segments) {
      const nextOffset = currentOffset + segment.text.length;

      if (offset === 0) {
        return cloneTextStyle(this.state.segments[0]?.textStyle);
      }

      if (offset <= nextOffset) {
        return cloneTextStyle(segment.textStyle);
      }

      currentOffset = nextOffset;
    }

    return cloneTextStyle(this.state.segments.at(-1)?.textStyle);
  }

  dispatchStateChange() {
    this.dispatchEvent(
      new CustomEvent("state-change", {
        detail: {
          segments: cloneSegments(this.state.segments),
          plainText: getPlainText(this.state.segments),
          selection: { ...this.state.selection },
          isComposing: this.state.isComposing,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
