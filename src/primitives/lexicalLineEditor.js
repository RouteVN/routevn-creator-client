import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
  createEditor,
} from "lexical";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import { registerRichText } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { mergeRegister } from "@lexical/utils";
import {
  ACCENT_FILL,
  areContentsEqual,
  createEmptyContent,
  ensureContentArray,
  getPlainTextFromContent,
  splitContentRange,
} from "../internal/ui/sceneEditorLexical/contentModel.js";
import {
  $createMentionNode,
  $isMentionNode,
  LEXICAL_EDITOR_THEME,
  MentionNode,
  createNodesFromContent,
  createSnapshotFromEditorState,
  filterMentionSuggestions,
  getMentionMenuPosition,
  getSelectionRange,
  patchDocumentActiveElement,
  patchDocumentGetSelection,
  patchWindowGetSelection,
  unpatchDocumentActiveElement,
  unpatchDocumentGetSelection,
  unpatchWindowGetSelection,
} from "./lexicalRichTextShared.js";

const LINE_TOP_TOLERANCE_PX = 5;
const DEFAULT_PLACEHOLDER = "Type dialogue and use @ for mentions";

const STYLES = `
  rvn-lexical-line-editor {
    display: block;
    width: 100%;
  }

  rvn-lexical-line-editor * {
    box-sizing: border-box;
  }

  .surface {
    position: relative;
    width: 100%;
  }

  .editor {
    min-height: 24px;
    width: 100%;
    outline: none;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    caret-color: #0f766e;
  }

  .editor-paragraph {
    margin: 0;
  }

  .text-bold {
    font-weight: 700;
  }

  .text-italic {
    font-style: italic;
  }

  .text-underline {
    text-decoration: underline;
  }

  .mention-chip {
    display: inline-block;
    padding: 0.08em 0.48em;
    border-radius: 999px;
    border: 1px solid rgba(8, 145, 178, 0.22);
    background: rgba(103, 232, 249, 0.18);
    color: #0f766e;
    font-weight: 700;
    white-space: nowrap;
  }

  .placeholder {
    position: absolute;
    inset: 0 auto auto 0;
    color: rgba(148, 163, 184, 0.92);
    pointer-events: none;
    user-select: none;
  }

  .placeholder[hidden] {
    display: none;
  }

  .mention-menu {
    position: absolute;
    z-index: 12;
    width: min(260px, calc(100vw - 48px));
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.24);
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16);
  }

  .mention-menu[hidden] {
    display: none;
  }

  .mention-item {
    display: grid;
    gap: 4px;
    width: 100%;
    border: 0;
    border-bottom: 1px solid rgba(226, 232, 240, 0.92);
    background: transparent;
    padding: 10px 12px;
    text-align: left;
    font: inherit;
    cursor: pointer;
  }

  .mention-item:last-child {
    border-bottom: 0;
  }

  .mention-item:hover,
  .mention-item[data-active="true"] {
    background: #f0f9ff;
  }

  .mention-item-label {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
  }

  .mention-item-meta {
    font-size: 11px;
    color: #64748b;
  }
`;

const createClosedMentionMenuState = () => ({
  isOpen: false,
  query: "",
  items: [],
  highlightedIndex: 0,
  left: 12,
  top: 18,
  nodeKey: "",
  startOffset: 0,
  endOffset: 0,
});

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

const createRangeFromOffsets = (element, start, end = start) => {
  const startPoint = createCollapsedRangeAtPosition(element, start);
  const endPoint = createCollapsedRangeAtPosition(element, end);
  const range = document.createRange();
  range.setStart(startPoint.range.startContainer, startPoint.range.startOffset);
  range.setEnd(endPoint.range.endContainer, endPoint.range.endOffset);
  return range;
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

  selection.removeAllRanges();
  selection.addRange(range);
};

const createShell = () => {
  const template = document.createElement("template");
  template.innerHTML = `
    <style>${STYLES}</style>
    <div class="surface" id="surface">
      <div class="placeholder" id="placeholder"></div>
      <div
        id="editor"
        class="editor"
        contenteditable="true"
        role="textbox"
        aria-multiline="false"
      ></div>
      <div id="mentionMenu" class="mention-menu" hidden></div>
    </div>
  `;

  return template.content.cloneNode(true);
};

export const LEXICAL_LINE_EDITOR_TAG_NAME = "rvn-lexical-line-editor";

export class LexicalLineEditorElement extends HTMLElement {
  constructor() {
    super();

    this.state = {
      content: createEmptyContent(),
      plainText: "",
      selection: { start: 0, end: 0 },
      activeFormats: {
        bold: false,
        italic: false,
        underline: false,
        accent: false,
      },
      mentionMenu: createClosedMentionMenuState(),
      placeholder: DEFAULT_PLACEHOLDER,
    };

    this.refs = {};
    this.isInitialized = false;
    this.isApplyingExternalContent = false;
    this.didPatchActiveElement = false;
    this.didPatchDocumentSelection = false;
    this.didPatchWindowSelection = false;
    this.renderFrame = 0;

    this.editor = createEditor({
      namespace: "routevn-lexical-line-editor",
      nodes: [MentionNode],
      onError: (error) => {
        console.error(error);
      },
      theme: LEXICAL_EDITOR_THEME,
    });

    this.unregister = undefined;

    this.handleNativeKeyDown = this.handleNativeKeyDown.bind(this);
    this.handleNativeFocus = this.handleNativeFocus.bind(this);
    this.handleNativeBlur = this.handleNativeBlur.bind(this);
    this.handleCompositionStart = this.handleCompositionStart.bind(this);
    this.handleCompositionEnd = this.handleCompositionEnd.bind(this);
    this.handleMentionMenuMouseDown =
      this.handleMentionMenuMouseDown.bind(this);
    this.handleMentionMenuClick = this.handleMentionMenuClick.bind(this);
  }

  connectedCallback() {
    if (!this.isInitialized) {
      this.append(createShell());
      this.refs = {
        surface: this.querySelector("#surface"),
        editor: this.querySelector("#editor"),
        placeholder: this.querySelector("#placeholder"),
        mentionMenu: this.querySelector("#mentionMenu"),
      };
      this.isInitialized = true;
    }

    this.style.display = "block";
    this.style.width = "100%";
    this.didPatchActiveElement = patchDocumentActiveElement(document);
    this.didPatchDocumentSelection = patchDocumentGetSelection(document);
    this.didPatchWindowSelection = patchWindowGetSelection(window);
    this.refs.editor.spellcheck = false;
    this.refs.editor.contentEditable = "true";
    this.refs.editor.setAttribute("contenteditable", "true");
    this.editor.setRootElement(this.refs.editor);

    this.unregister = mergeRegister(
      registerRichText(this.editor),
      registerHistory(this.editor, createEmptyHistoryState(), 300),
      this.editor.registerUpdateListener(({ editorState }) => {
        this.syncFromEditorState(editorState);
      }),
      this.editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          event?.preventDefault?.();

          if (
            this.state.mentionMenu.isOpen &&
            this.state.mentionMenu.items.length > 0
          ) {
            this.selectMentionByIndex(this.state.mentionMenu.highlightedIndex);
            return true;
          }

          this.dispatchSplitRequest();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      this.editor.registerCommand(
        KEY_ARROW_DOWN_COMMAND,
        (event) => {
          if (!this.state.mentionMenu.isOpen) {
            return false;
          }

          event?.preventDefault?.();
          this.moveMentionHighlight(1);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      this.editor.registerCommand(
        KEY_ARROW_UP_COMMAND,
        (event) => {
          if (!this.state.mentionMenu.isOpen) {
            return false;
          }

          event?.preventDefault?.();
          this.moveMentionHighlight(-1);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      this.editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (!this.state.mentionMenu.isOpen) {
            return false;
          }

          event?.preventDefault?.();
          this.closeMentionMenu({ shouldRender: true });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      this.editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          event?.preventDefault?.();
          this.handlePasteEvent(event);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );

    this.refs.editor.addEventListener("keydown", this.handleNativeKeyDown);
    this.refs.editor.addEventListener("focus", this.handleNativeFocus);
    this.refs.editor.addEventListener("blur", this.handleNativeBlur);
    this.refs.editor.addEventListener(
      "compositionstart",
      this.handleCompositionStart,
    );
    this.refs.editor.addEventListener(
      "compositionend",
      this.handleCompositionEnd,
    );
    this.refs.mentionMenu.addEventListener(
      "mousedown",
      this.handleMentionMenuMouseDown,
    );
    this.refs.mentionMenu.addEventListener(
      "click",
      this.handleMentionMenuClick,
    );

    this.loadContent(this.state.content, { focusAtEnd: false, emitChange: false });
    this.render();
  }

  disconnectedCallback() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = 0;
    }

    this.refs.editor?.removeEventListener("keydown", this.handleNativeKeyDown);
    this.refs.editor?.removeEventListener("focus", this.handleNativeFocus);
    this.refs.editor?.removeEventListener("blur", this.handleNativeBlur);
    this.refs.editor?.removeEventListener(
      "compositionstart",
      this.handleCompositionStart,
    );
    this.refs.editor?.removeEventListener(
      "compositionend",
      this.handleCompositionEnd,
    );
    this.refs.mentionMenu?.removeEventListener(
      "mousedown",
      this.handleMentionMenuMouseDown,
    );
    this.refs.mentionMenu?.removeEventListener(
      "click",
      this.handleMentionMenuClick,
    );

    this.unregister?.();
    this.unregister = undefined;
    this.editor.setRootElement(null);

    if (this.didPatchActiveElement) {
      unpatchDocumentActiveElement(document);
      this.didPatchActiveElement = false;
    }

    if (this.didPatchDocumentSelection) {
      unpatchDocumentGetSelection(document);
      this.didPatchDocumentSelection = false;
    }

    if (this.didPatchWindowSelection) {
      unpatchWindowGetSelection(window);
      this.didPatchWindowSelection = false;
    }
  }

  set content(value) {
    if (!this.isConnected || !this.refs.editor) {
      this.state.content = ensureContentArray(value);
      this.state.plainText = getPlainTextFromContent(this.state.content);
      return;
    }

    this.updateContent(value, {
      preserveSelection: document.activeElement === this.refs.editor,
      emitChange: false,
    });
  }

  get content() {
    return this.getContent();
  }

  set placeholder(value) {
    this.state.placeholder = String(value ?? DEFAULT_PLACEHOLDER);
    this.scheduleRender();
  }

  get placeholder() {
    return this.state.placeholder;
  }

  focus(options = {}) {
    this.refs.editor?.focus(options);
  }

  getContent() {
    return ensureContentArray(this.state.content);
  }

  getPlainText() {
    return this.state.plainText;
  }

  getCaretPosition() {
    const range = getSelectionRange(this.refs.editor);
    if (!range) {
      return 0;
    }

    const preCaretRange = document.createRange();
    preCaretRange.selectNodeContents(this.refs.editor);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  }

  hasSelectionRange() {
    return Boolean(getSelectionRange(this.refs.editor));
  }

  getSelectionOffsets() {
    return { ...this.state.selection };
  }

  setSelectionOffsets(
    { start = 0, end = start, preventScroll = true } = {},
  ) {
    const range = createRangeFromOffsets(this.refs.editor, start, end);
    this.focus({ preventScroll });
    setSelectionFromRange(this.refs.editor, range);
  }

  setCaretPosition(position, { preventScroll = true } = {}) {
    const { range, actualPosition } = createCollapsedRangeAtPosition(
      this.refs.editor,
      position,
    );

    this.focus({ preventScroll });
    setSelectionFromRange(this.refs.editor, range);
    return actualPosition;
  }

  moveCaretToFirst(options) {
    return this.setCaretPosition(0, options);
  }

  moveCaretToLast(options) {
    return this.setCaretPosition(this.getPlainText().length, options);
  }

  findLastLinePosition(goalColumn) {
    const textLength = this.getPlainText().length;
    if (textLength === 0 || goalColumn >= textLength) {
      return textLength;
    }

    let lastLineStartPosition = 0;
    let lastLineTop;

    for (let position = textLength; position >= 0; position -= 1) {
      try {
        const { range } = createCollapsedRangeAtPosition(
          this.refs.editor,
          position,
        );
        const rect = range.getBoundingClientRect();

        if (lastLineTop === undefined) {
          lastLineTop = rect.top;
          lastLineStartPosition = position;
        } else if (Math.abs(rect.top - lastLineTop) > LINE_TOP_TOLERANCE_PX) {
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
    const range = getSelectionRange(this.refs.editor);
    if (!range) {
      return false;
    }

    const cursorRect = range.getBoundingClientRect();
    const { range: firstRange } = createCollapsedRangeAtPosition(
      this.refs.editor,
      0,
    );

    return (
      Math.abs(cursorRect.top - firstRange.getBoundingClientRect().top) <=
      LINE_TOP_TOLERANCE_PX
    );
  }

  isCaretOnLastLine() {
    const elementHeight = this.refs.editor.scrollHeight;
    const lineHeight =
      parseFloat(window.getComputedStyle(this.refs.editor).lineHeight) || 20;
    const hasMultipleLines = elementHeight > lineHeight * 1.5;

    if (!hasMultipleLines) {
      return true;
    }

    const range = getSelectionRange(this.refs.editor);
    if (!range) {
      return false;
    }

    const cursorRect = range.getBoundingClientRect();
    const { range: endRange } = createCollapsedRangeAtPosition(
      this.refs.editor,
      this.getPlainText().length,
    );

    return (
      Math.abs(cursorRect.top - endRange.getBoundingClientRect().top) <=
      LINE_TOP_TOLERANCE_PX
    );
  }

  applyTextFormat(format) {
    if (
      format === "bold" ||
      format === "italic" ||
      format === "underline"
    ) {
      this.editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
      this.focus({ preventScroll: true });
      return;
    }

    if (format === "accent") {
      this.editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }

          const currentColor = $getSelectionStyleValueForProperty(
            selection,
            "color",
            "",
          );

          $patchStyleText(selection, {
            color: currentColor === ACCENT_FILL ? null : ACCENT_FILL,
          });
        },
        { discrete: true },
      );
      this.focus({ preventScroll: true });
    }
  }

  handleNativeFocus() {
    this.dispatchEvent(
      new CustomEvent("editor-focus", {
        detail: {
          selection: this.getSelectionOffsets(),
        },
        bubbles: true,
      }),
    );
  }

  handleNativeBlur() {
    this.dispatchEvent(
      new CustomEvent("editor-blur", {
        detail: {
          selection: this.getSelectionOffsets(),
          content: this.getContent(),
        },
        bubbles: true,
      }),
    );
  }

  handleCompositionStart() {
    this.dispatchEvent(
      new CustomEvent("composition-state-changed", {
        detail: {
          isComposing: true,
        },
        bubbles: true,
      }),
    );
  }

  handleCompositionEnd() {
    this.dispatchEvent(
      new CustomEvent("composition-state-changed", {
        detail: {
          isComposing: false,
        },
        bubbles: true,
      }),
    );
  }

  handleMentionMenuMouseDown(event) {
    if (event.target?.closest?.("button[data-index]")) {
      event.preventDefault();
    }
  }

  handleMentionMenuClick(event) {
    const button = event.target?.closest?.("button[data-index]");
    if (!button) {
      return;
    }

    const index = Number(button.dataset.index);
    if (!Number.isInteger(index)) {
      return;
    }

    this.selectMentionByIndex(index);
  }

  handleNativeKeyDown(event) {
    if (event.key === "Backspace") {
      const selection = this.getSelectionOffsets();
      if (selection.start === 0 && selection.end === 0 && !event.isComposing) {
        event.preventDefault();
        this.dispatchEvent(
          new CustomEvent("line-merge-request", {
            detail: {},
            bubbles: true,
          }),
        );
        return;
      }
    }

    if (event.key === "ArrowLeft") {
      if (this.getCaretPosition() <= 0) {
        event.preventDefault();
        this.dispatchNavigateRequest({
          direction: "previous",
          cursorPosition: -1,
        });
      }
      return;
    }

    if (event.key === "ArrowRight") {
      if (this.getCaretPosition() >= this.getPlainText().length) {
        event.preventDefault();
        this.dispatchNavigateRequest({
          direction: "next",
          cursorPosition: 0,
        });
      }
      return;
    }

    if (event.key === "ArrowUp" && this.isCaretOnFirstLine()) {
      event.preventDefault();
      this.dispatchNavigateRequest({
        direction: "previous",
        cursorPosition: this.getCaretPosition(),
      });
      return;
    }

    if (event.key === "ArrowDown" && this.isCaretOnLastLine()) {
      event.preventDefault();
      this.dispatchNavigateRequest({
        direction: "next",
        cursorPosition: this.getCaretPosition(),
      });
    }
  }

  dispatchNavigateRequest({ direction, cursorPosition }) {
    this.dispatchEvent(
      new CustomEvent("line-navigate-request", {
        detail: {
          direction,
          cursorPosition,
        },
        bubbles: true,
      }),
    );
  }

  handlePasteEvent(event) {
    const pastedText = event?.clipboardData?.getData("text/plain") ?? "";
    const normalizedLines = pastedText
      .replace(/\r\n?/g, "\n")
      .split("\n");

    if (normalizedLines.length <= 1) {
      this.insertPlainText(pastedText);
      return;
    }

    const selection = this.getSelectionOffsets();
    const { before, after } = splitContentRange(
      this.state.content,
      selection.start,
      selection.end,
    );

    this.dispatchEvent(
      new CustomEvent("line-paste-request", {
        detail: {
          leftContent: before,
          rightContent: after,
          lines: normalizedLines.map((line) => ensureContentArray([{ text: line }])),
        },
        bubbles: true,
      }),
    );
  }

  insertPlainText(text) {
    const nextText = String(text ?? "").replace(/\r\n?/g, "\n").replace(/\n/g, " ");

    this.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        selection.insertText(nextText);
      },
      { discrete: true },
    );

    this.focus({ preventScroll: true });
  }

  loadContent(
    content,
    { focusAtEnd = false, emitChange = false, selectionOffsets } = {},
  ) {
    this.renderContent(content, {
      focusAtEnd,
      emitChange,
      selectionOffsets,
    });
  }

  updateContent(
    content,
    { preserveSelection = false, emitChange = false } = {},
  ) {
    if (!this.isConnected || !this.refs.editor) {
      this.state.content = ensureContentArray(content);
      this.state.plainText = getPlainTextFromContent(this.state.content);
      return;
    }

    const nextContent = ensureContentArray(content);
    if (areContentsEqual(this.state.content, nextContent)) {
      return;
    }

    const selection = preserveSelection ? this.getSelectionOffsets() : undefined;
    this.renderContent(nextContent, {
      focusAtEnd: false,
      emitChange,
      selectionOffsets: selection,
    });
  }

  renderContent(
    content,
    { focusAtEnd = false, emitChange = false, selectionOffsets } = {},
  ) {
    const nextContent = ensureContentArray(content);
    this.isApplyingExternalContent = emitChange !== true;

    this.editor.update(
      () => {
        const root = $getRoot();
        root.clear();

        const paragraphNode = $createParagraphNode();
        const nodes = createNodesFromContent(nextContent);
        if (nodes.length > 0) {
          paragraphNode.append(...nodes);
        }
        root.append(paragraphNode);

        if (focusAtEnd) {
          paragraphNode.selectEnd();
          return;
        }

        paragraphNode.selectStart();
      },
      { discrete: true },
    );

    requestAnimationFrame(() => {
      if (selectionOffsets) {
        this.setSelectionOffsets(selectionOffsets);
      } else if (focusAtEnd) {
        this.moveCaretToLast({ preventScroll: true });
      }

      this.isApplyingExternalContent = false;
    });
  }

  dispatchSplitRequest() {
    const selection = this.getSelectionOffsets();
    const { before, after } = splitContentRange(
      this.state.content,
      selection.start,
      selection.end,
    );

    this.dispatchEvent(
      new CustomEvent("line-split-request", {
        detail: {
          leftContent: before,
          rightContent: after,
          selection,
        },
        bubbles: true,
      }),
    );
  }

  moveMentionHighlight(delta) {
    const optionCount = this.state.mentionMenu.items.length;
    if (optionCount === 0) {
      return;
    }

    const nextIndex =
      (this.state.mentionMenu.highlightedIndex + delta + optionCount) %
      optionCount;

    this.state.mentionMenu.highlightedIndex = nextIndex;
    this.renderMentionMenu();
  }

  closeMentionMenu({ shouldRender = false } = {}) {
    this.state.mentionMenu = createClosedMentionMenuState();
    if (shouldRender) {
      this.renderMentionMenu();
    }
  }

  selectMentionByIndex(index) {
    const mention = this.state.mentionMenu.items[index];
    if (!mention) {
      return;
    }

    const triggerState = { ...this.state.mentionMenu };
    this.closeMentionMenu();

    this.editor.update(
      () => {
        const queryNode = $getNodeByKey(triggerState.nodeKey);
        if (!$isTextNode(queryNode) || $isMentionNode(queryNode)) {
          return;
        }

        const textLength = queryNode.getTextContent().length;
        const startOffset = Math.max(
          0,
          Math.min(textLength, triggerState.startOffset),
        );
        const endOffset = Math.max(
          startOffset,
          Math.min(textLength, triggerState.endOffset),
        );

        let replaceNode = queryNode;

        if (startOffset > 0 && endOffset < textLength) {
          const splitNodes = queryNode.splitText(startOffset, endOffset);
          replaceNode = splitNodes[1];
        } else if (startOffset > 0) {
          const splitNodes = queryNode.splitText(startOffset);
          replaceNode = splitNodes[1];
        } else if (endOffset < textLength) {
          const splitNodes = queryNode.splitText(endOffset);
          replaceNode = splitNodes[0];
        }

        const mentionNode = $createMentionNode(mention);
        replaceNode.replace(mentionNode);

        const nextSibling = mentionNode.getNextSibling();
        const nextText = $isTextNode(nextSibling)
          ? nextSibling.getTextContent()
          : "";
        const shouldAddSpacer = !/^[\s,.!?;:]/.test(nextText);

        if (shouldAddSpacer) {
          const spacerNode = $createTextNode(" ");
          mentionNode.insertAfter(spacerNode);
          spacerNode.selectEnd();
          return;
        }

        if ($isTextNode(nextSibling)) {
          nextSibling.select(0, 0);
          return;
        }

        mentionNode.selectEnd();
      },
      { discrete: true },
    );

    this.focus({ preventScroll: true });
  }

  syncFromEditorState(editorState) {
    const nextSnapshot = createSnapshotFromEditorState(editorState);
    const nextContent = ensureContentArray(nextSnapshot.content);
    const previousContent = this.state.content;
    const previousSelection = this.state.selection;

    this.state.content = nextContent;
    this.state.plainText = nextSnapshot.plainText;
    this.state.selection = nextSnapshot.selection;
    this.state.activeFormats = nextSnapshot.activeFormats;

    if (nextSnapshot.mentionTrigger) {
      const items = filterMentionSuggestions(nextSnapshot.mentionTrigger.query);
      this.state.mentionMenu = {
        isOpen: true,
        query: nextSnapshot.mentionTrigger.query,
        items,
        highlightedIndex: Math.min(
          this.state.mentionMenu.highlightedIndex,
          Math.max(0, items.length - 1),
        ),
        left: 12,
        top: 18,
        nodeKey: nextSnapshot.mentionTrigger.nodeKey,
        startOffset: nextSnapshot.mentionTrigger.startOffset,
        endOffset: nextSnapshot.mentionTrigger.endOffset,
      };

      const position = getMentionMenuPosition(
        this.refs.editor,
        this.refs.surface,
      );
      this.state.mentionMenu.left = position.left;
      this.state.mentionMenu.top = position.top;
    } else {
      this.closeMentionMenu();
    }

    this.render();

    const didContentChange = !areContentsEqual(previousContent, nextContent);
    const didSelectionChange =
      previousSelection.start !== nextSnapshot.selection.start ||
      previousSelection.end !== nextSnapshot.selection.end;

    if (didContentChange && !this.isApplyingExternalContent) {
      this.dispatchEvent(
        new CustomEvent("content-change", {
          detail: {
            content: nextContent,
            plainText: this.state.plainText,
            selection: nextSnapshot.selection,
          },
          bubbles: true,
        }),
      );
    }

    if (didSelectionChange) {
      this.dispatchEvent(
        new CustomEvent("selection-change", {
          detail: {
            selection: nextSnapshot.selection,
            plainText: this.state.plainText,
            activeFormats: this.state.activeFormats,
          },
          bubbles: true,
        }),
      );
    }
  }

  scheduleRender() {
    if (this.renderFrame) {
      return;
    }

    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = 0;
      this.render();
    });
  }

  render() {
    this.refs.placeholder.hidden = this.state.plainText.length > 0;
    this.refs.placeholder.textContent = this.state.placeholder;
    this.renderMentionMenu();
  }

  renderMentionMenu() {
    const menuState = this.state.mentionMenu;
    this.refs.mentionMenu.hidden =
      !menuState.isOpen || menuState.items.length === 0;

    if (!menuState.isOpen || menuState.items.length === 0) {
      this.refs.mentionMenu.replaceChildren();
      return;
    }

    this.refs.mentionMenu.style.left = `${menuState.left}px`;
    this.refs.mentionMenu.style.top = `${menuState.top}px`;

    const fragment = document.createDocumentFragment();
    menuState.items.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mention-item";
      button.dataset.index = String(index);
      button.dataset.active = String(index === menuState.highlightedIndex);
      button.innerHTML = `
        <span class="mention-item-label">@${item.label}</span>
        <span class="mention-item-meta">${item.id}</span>
      `;
      fragment.append(button);
    });

    this.refs.mentionMenu.replaceChildren(fragment);
  }
}
