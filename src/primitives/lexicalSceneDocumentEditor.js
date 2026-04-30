import {
  $createRangeSelection,
  $createParagraphNode,
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isLineBreakNode,
  $isRangeSelection,
  $isTextNode,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
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
import { generateId } from "../internal/id.js";
import {
  areSceneEditorLinesEqual,
  cloneSceneEditorLine,
  cloneSceneEditorLines,
} from "../internal/ui/sceneEditorLexical/draftSection.js";
import {
  ACCENT_FILL,
  EDITOR_CARET_TEXT,
  appendContentArrays,
  areContentsEqual,
  createEmptyContent,
  ensureContentArray,
  getContentLength,
  getLineDialogueContent,
  getPlainTextFromContent,
  normalizeSingleLineText,
  setLineDialogueContent,
  splitContentRange,
} from "../internal/ui/sceneEditorLexical/contentModel.js";
import {
  $createMentionNode,
  $isMentionNode,
  FURIGANA_TEXT_PROPERTY,
  FURIGANA_TEXT_STYLE_ID_PROPERTY,
  LEXICAL_EDITOR_THEME,
  MentionNode,
  collectContentItemsFromNode,
  createNodesFromContent,
  filterMentionSuggestions,
  getFuriganaFromNode,
  getMentionMenuPosition,
  getSelectionRange,
  getSelectionOffsets,
  patchDocumentActiveElement,
  patchDocumentGetSelection,
  patchWindowGetSelection,
  unpatchDocumentActiveElement,
  unpatchDocumentGetSelection,
  unpatchWindowGetSelection,
} from "./lexicalRichTextShared.js";

const DEFAULT_PLACEHOLDER = "";
const LEFT_GUTTER_WIDTH_WITH_NUMBERS = 60;
const LEFT_GUTTER_WIDTH_WITHOUT_NUMBERS = 26;
const DEFAULT_RIGHT_GUTTER_WIDTH = 24;
const MIN_EDITOR_TEXT_WIDTH = 160;
const BLOCK_ROW_BACKGROUND = "var(--muted)";
const DELETE_SHORTCUT_TIMEOUT_MS = 1200;

const STYLES = `
  rvn-lexical-scene-document-editor {
    display: block;
    width: 100%;
    --left-gutter-width: ${LEFT_GUTTER_WIDTH_WITH_NUMBERS}px;
    --right-gutter-width: ${DEFAULT_RIGHT_GUTTER_WIDTH}px;
    --editor-inline-padding: 0px;
    --editor-top-padding: 0px;
  }

  rvn-lexical-scene-document-editor * {
    box-sizing: border-box;
    -webkit-user-drag: none;
  }

  .surface {
    position: relative;
    width: 100%;
    min-width: 0;
    max-width: 100%;
    min-height: 280px;
    outline: none;
  }

  .editor {
    min-height: 280px;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    outline: none;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: rgba(248, 250, 252, 0.96);
    font-family: inherit;
    font-size: 16px;
    font-weight: 400;
    line-height: 1.5;
    padding: 0 0 0 calc(var(--left-gutter-width) + var(--editor-inline-padding));
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    caret-color: var(--primary);
  }

  .editor:focus {
    border: 0;
    box-shadow: none;
  }

  .editor-paragraph {
    position: relative;
    margin: 0;
    min-width: 0;
    max-width: 100%;
    min-height: 24px;
    padding: 0;
    border-radius: 0;
    overflow-wrap: anywhere;
  }

  .editor-paragraph[data-selected="true"][data-mode="block"] {
    background: ${BLOCK_ROW_BACKGROUND};
  }

  .gutter {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
  }

  .gutter-left {
    left: 0;
    width: var(--left-gutter-width);
  }

  .gutter-right {
    right: 0;
    width: var(--right-gutter-width);
  }

  .gutter-row {
    position: absolute;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-height: 24px;
    border-radius: 0;
  }

  .gutter-left .gutter-row {
    width: 100%;
    gap: 0;
    justify-content: flex-start;
  }

  .gutter-right .gutter-row {
    right: 0;
    width: max-content;
    max-width: none;
    justify-content: flex-start;
    padding-left: 0;
    padding-right: 0;
  }

  .gutter-right .gutter-row[data-constrained="true"] {
    width: var(--line-right-gutter-width);
    max-width: var(--line-right-gutter-width);
  }

  .gutter-row[data-selected="true"] .line-number {
    color: var(--muted-foreground);
  }

  .gutter-row[data-selected="true"][data-mode="block"] {
    background: ${BLOCK_ROW_BACKGROUND};
  }

  .line-number {
    align-self: flex-start;
    width: 32px;
    color: var(--muted-foreground);
    font-size: 12px;
    font-weight: 600;
    line-height: 1.5;
    text-align: right;
    margin-right: 2px;
  }

  .speaker-slot {
    width: 24px;
    min-width: 24px;
    height: 24px;
    border-radius: 999px;
    overflow: hidden;
    margin-right: 2px;
    background: transparent;
  }

  .speaker-slot rvn-file-image {
    display: block;
  }

  .preview-items {
    display: inline-flex;
    flex-wrap: nowrap;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 8px;
    min-width: 0;
    width: max-content;
    max-width: none;
  }

  .gutter-right .gutter-row[data-constrained="true"] .preview-items {
    display: flex;
    flex-wrap: wrap;
    width: 100%;
    max-width: 100%;
  }

  .preview-item {
    display: inline-flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    min-height: 24px;
  }

  .preview-item[data-overlay="true"] {
    position: relative;
  }

  .preview-thumb {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    background: transparent;
    color: inherit;
  }

  .preview-thumb[data-round="true"] {
    border-radius: 999px;
  }

  .preview-thumb[data-size="bg"],
  .preview-thumb[data-size="visual"] {
    width: 36px;
    height: 24px;
  }

  .preview-thumb[data-size="sprite"] {
    width: 20px;
    height: 24px;
  }

  .preview-thumb[data-size="icon"] {
    width: 24px;
    height: 24px;
  }

  .preview-image-stack {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }

  .preview-group-delete-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(220, 38, 38, 0.92);
    color: #ffffff;
  }

  .preview-thumb rvn-file-image {
    display: block;
  }

  .preview-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }

  .preview-delete-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #dc2626;
    color: #ffffff;
  }

  .preview-dialogue-label {
    color: rgba(148, 163, 184, 0.92);
    font-size: 12px;
    line-height: 1;
  }

  .surface[data-mode="block"] .editor {
    caret-color: transparent;
  }

  .text-bold {
    font-weight: inherit;
  }

  .text-italic {
    font-style: normal;
  }

  .text-underline {
    text-decoration: none;
  }

  .editor [style*="color"] {
    color: inherit !important;
  }

  .editor [style*="--rvn-text-style-id"] {
    display: inline;
    margin-inline: 0.5px;
    padding-inline: 0.5px;
    color: inherit;
    text-decoration-line: underline;
    text-decoration-color: var(--foreground);
    text-decoration-thickness: 1px;
    text-underline-offset: 4px;
    text-decoration-skip-ink: none;
  }

  .editor [style*="--rvn-furigana-text"] {
    display: inline;
    margin-inline: 0.5px;
    padding-inline: 0.5px;
    color: inherit;
    text-decoration-line: underline;
    text-decoration-style: dotted;
    text-decoration-color: var(--foreground);
    text-decoration-thickness: 1px;
    text-underline-offset: 4px;
    text-decoration-skip-ink: none;
  }

  .mention-chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    min-height: 20px;
    margin-inline: 1px;
    padding: 0 8px;
    box-sizing: border-box;
    border: 1px solid var(--border);
    border-radius: var(--tag-border-radius, 9999px);
    background: var(--muted);
    color: var(--muted-foreground);
    font-size: 0.88em;
    font-weight: 500;
    line-height: 1.35;
    white-space: nowrap;
    vertical-align: baseline;
  }

  .placeholder {
    position: absolute;
    left: calc(var(--left-gutter-width) + var(--editor-inline-padding));
    top: 4px;
    color: rgba(148, 163, 184, 0.88);
    pointer-events: none;
    user-select: none;
  }

  .placeholder[hidden] {
    display: none;
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

const isShortcutDigit = (key) => {
  return /^[0-9]$/.test(String(key || ""));
};

const isPlainShortcutKey = (event, key) => {
  return (
    String(event?.key || "").toLowerCase() === key &&
    !event?.ctrlKey &&
    !event?.metaKey &&
    !event?.altKey &&
    !event?.shiftKey
  );
};

const cloneControlAction = (action) => {
  if (!action || typeof action !== "object") {
    return undefined;
  }

  return structuredClone(action);
};

const createNewLineActions = (templateActions = {}) => {
  const nextActions = {
    dialogue: {
      content: createEmptyContent(),
    },
  };
  const controlAction = cloneControlAction(templateActions?.control);

  if (controlAction) {
    nextActions.control = controlAction;
  }

  return nextActions;
};

const toFiniteTimestamp = (value, fallback = 0) => {
  return Number.isFinite(value) ? value : fallback;
};

const haveSameLineOrder = (leftLines = [], rightLines = []) => {
  if (leftLines.length !== rightLines.length) {
    return false;
  }

  for (let index = 0; index < leftLines.length; index += 1) {
    if (leftLines[index]?.id !== rightLines[index]?.id) {
      return false;
    }
  }

  return true;
};

const createLineMeta = (line = {}) => {
  const nextLine = cloneSceneEditorLine(line);

  nextLine.id =
    typeof nextLine?.id === "string" && nextLine.id.length > 0
      ? nextLine.id
      : generateId();
  nextLine.actions = structuredClone(nextLine?.actions || {});
  nextLine.createdAt = toFiniteTimestamp(nextLine?.createdAt, 0);
  nextLine.updatedAt = toFiniteTimestamp(
    nextLine?.updatedAt,
    nextLine.createdAt,
  );

  return nextLine;
};

const createNewLineMeta = (templateMeta = {}) => {
  return {
    id: generateId(),
    sectionId: templateMeta?.sectionId,
    createdAt: toFiniteTimestamp(templateMeta?.createdAt, 0),
    updatedAt: toFiniteTimestamp(
      templateMeta?.updatedAt,
      toFiniteTimestamp(templateMeta?.createdAt, 0),
    ),
    actions: createNewLineActions(templateMeta?.actions),
  };
};

const createShell = () => {
  const template = document.createElement("template");
  template.innerHTML = `
    <style>${STYLES}</style>
    <div class="surface" id="surface" tabindex="0">
      <div class="gutter gutter-left" id="leftGutter"></div>
      <div class="gutter gutter-right" id="rightGutter"></div>
      <div class="placeholder" id="placeholder"></div>
      <div
        id="editor"
        class="editor"
        contenteditable="true"
        draggable="false"
        role="textbox"
        aria-multiline="true"
      ></div>
      <rtgl-dropdown-menu id="mentionMenu"></rtgl-dropdown-menu>
      <rtgl-dropdown-menu id="selectionMenu"></rtgl-dropdown-menu>
    </div>
  `;

  return template.content.cloneNode(true);
};

const walkTextUnits = (node, visitor) => {
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

const createCollapsedRangeAtPosition = (element, targetPosition) => {
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

const clampDomPointOffset = (node, offset) => {
  const numericOffset = Math.max(0, Number(offset) || 0);
  if (node.nodeType === Node.TEXT_NODE) {
    return Math.min(numericOffset, node.textContent?.length ?? 0);
  }

  return Math.min(numericOffset, node.childNodes?.length ?? 0);
};

const createSafeRange = (element, range) => {
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

const setSelectionFromRange = (element, range) => {
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

const getLexicalTextLength = (node) => {
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

const getLexicalOffsetBeforeNode = (node, targetKey) => {
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

const resolvePointAtOffset = (node, offset) => {
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

const applySelectionToLineNode = (lineNode, selectionSnapshot = {}) => {
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

const clearSelectionTextFormatting = (selection) => {
  selection.format = 0;
  selection.setStyle("");

  const anchorNode = selection.anchor.getNode();
  if ($isTextNode(anchorNode)) {
    anchorNode.setFormat(0);
    anchorNode.setStyle("");
  }
};

export const LEXICAL_SCENE_DOCUMENT_EDITOR_TAG_NAME =
  "rvn-lexical-scene-document-editor";

export class LexicalSceneDocumentEditorElement extends HTMLElement {
  constructor() {
    super();

    this.state = {
      lines: [],
      lineDecorations: [],
      textStyles: [],
      selectedLineId: undefined,
      showLineNumbers: true,
      mode: "block",
      plainText: "",
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
    this.isApplyingExternalLines = false;
    this.isEditorFocused = false;
    this.isComposing = false;
    this.didPatchActiveElement = false;
    this.didPatchDocumentSelection = false;
    this.didPatchWindowSelection = false;
    this.renderFrame = 0;
    this.lineMetaByKey = new Map();
    this.lineKeyById = new Map();
    this.pendingChangeReason = "text";
    this.pendingSelectionSnapshot = undefined;
    this.selectionMenuIsOpen = false;
    this.furiganaDialogIsPending = false;
    this.selectionMenuPosition = { x: "0", y: "0" };
    this.rightGutterWidth = DEFAULT_RIGHT_GUTTER_WIDTH;
    this.leftGutterRowsByLineId = new Map();
    this.rightGutterRowsByLineId = new Map();
    this.pendingSoftLineBreakBeforeInput = false;
    this.pendingParagraphSplitBeforeInput = false;

    this.editor = createEditor({
      namespace: "routevn-lexical-scene-document-editor",
      nodes: [MentionNode],
      onError: (error) => {
        console.error(error);
      },
      theme: LEXICAL_EDITOR_THEME,
    });

    this.unregister = undefined;
    this.awaitingCharacterShortcut = false;
    this.awaitingDeleteShortcut = false;
    this.deleteShortcutTimerId = undefined;

    this.handleSurfaceKeyDown = this.handleSurfaceKeyDown.bind(this);
    this.handleNativeFocus = this.handleNativeFocus.bind(this);
    this.handleNativeBlur = this.handleNativeBlur.bind(this);
    this.handleNativeKeyDown = this.handleNativeKeyDown.bind(this);
    this.handleNativeBeforeInput = this.handleNativeBeforeInput.bind(this);
    this.handleNativeDragEvent = this.handleNativeDragEvent.bind(this);
    this.handleNativeMouseUp = this.handleNativeMouseUp.bind(this);
    this.handleNativeContextMenu = this.handleNativeContextMenu.bind(this);
    this.handleCompositionStart = this.handleCompositionStart.bind(this);
    this.handleCompositionEnd = this.handleCompositionEnd.bind(this);
    this.handleMentionMenuMouseDown =
      this.handleMentionMenuMouseDown.bind(this);
    this.handleMentionMenuItemClick =
      this.handleMentionMenuItemClick.bind(this);
    this.handleMentionMenuClose = this.handleMentionMenuClose.bind(this);
    this.handleSelectionMenuMouseDown =
      this.handleSelectionMenuMouseDown.bind(this);
    this.handleSelectionMenuItemClick =
      this.handleSelectionMenuItemClick.bind(this);
    this.handleSelectionMenuClose = this.handleSelectionMenuClose.bind(this);
  }

  connectedCallback() {
    if (!this.isInitialized) {
      this.append(createShell());
      this.refs = {
        surface: this.querySelector("#surface"),
        editor: this.querySelector("#editor"),
        leftGutter: this.querySelector("#leftGutter"),
        placeholder: this.querySelector("#placeholder"),
        mentionMenu: this.querySelector("#mentionMenu"),
        selectionMenu: this.querySelector("#selectionMenu"),
        rightGutter: this.querySelector("#rightGutter"),
      };
      this.isInitialized = true;
    }

    this.style.display = "block";
    this.style.width = "100%";
    this.refs.surface.tabIndex = 0;
    this.didPatchActiveElement = patchDocumentActiveElement(document);
    this.didPatchDocumentSelection = patchDocumentGetSelection(document);
    this.didPatchWindowSelection = patchWindowGetSelection(window);
    this.refs.editor.spellcheck = false;
    this.refs.editor.contentEditable = "true";
    this.refs.editor.setAttribute("contenteditable", "true");
    this.refs.selectionMenu.items = [];
    this.refs.selectionMenu.open = false;
    this.refs.selectionMenu.place = "bs";
    this.refs.mentionMenu.items = [];
    this.refs.mentionMenu.open = false;
    this.refs.mentionMenu.place = "bs";
    this.refs.mentionMenu.w = "260";
    this.refs.mentionMenu.h = "240";
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
          if (event?.isComposing || this.isComposing) {
            return false;
          }

          if (
            this.state.mentionMenu.isOpen &&
            this.state.mentionMenu.items.length > 0
          ) {
            event?.preventDefault?.();
            this.selectMentionByIndex(this.state.mentionMenu.highlightedIndex);
            return true;
          }

          if (event?.shiftKey) {
            event.preventDefault();
            event.stopPropagation?.();
            this.pendingSoftLineBreakBeforeInput = true;
            this.insertSoftLineBreak();
            requestAnimationFrame(() => {
              this.pendingSoftLineBreakBeforeInput = false;
            });
            return true;
          }

          event?.preventDefault?.();
          event?.stopPropagation?.();
          this.pendingParagraphSplitBeforeInput = true;
          this.splitCurrentLine();
          requestAnimationFrame(() => {
            this.pendingParagraphSplitBeforeInput = false;
          });
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
        () => {
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );

    this.refs.editor.addEventListener("focus", this.handleNativeFocus);
    this.refs.editor.addEventListener("blur", this.handleNativeBlur);
    this.refs.editor.addEventListener("keydown", this.handleNativeKeyDown);
    this.refs.editor.addEventListener("mouseup", this.handleNativeMouseUp);
    this.refs.editor.addEventListener("dragstart", this.handleNativeDragEvent);
    this.refs.editor.addEventListener("dragenter", this.handleNativeDragEvent);
    this.refs.editor.addEventListener("dragover", this.handleNativeDragEvent);
    this.refs.editor.addEventListener("drop", this.handleNativeDragEvent);
    this.refs.editor.addEventListener(
      "contextmenu",
      this.handleNativeContextMenu,
    );
    this.refs.surface.addEventListener("keydown", this.handleSurfaceKeyDown);
    this.refs.editor.addEventListener(
      "beforeinput",
      this.handleNativeBeforeInput,
      true,
    );
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
      "item-click",
      this.handleMentionMenuItemClick,
    );
    this.refs.mentionMenu.addEventListener(
      "close",
      this.handleMentionMenuClose,
    );
    this.refs.selectionMenu.addEventListener(
      "mousedown",
      this.handleSelectionMenuMouseDown,
    );
    this.refs.selectionMenu.addEventListener(
      "item-click",
      this.handleSelectionMenuItemClick,
    );
    this.refs.selectionMenu.addEventListener(
      "close",
      this.handleSelectionMenuClose,
    );

    this.loadLines(this.state.lines, { emitChange: false });
    this.scheduleRender();
    requestAnimationFrame(() => {
      if (!this.isConnected) {
        return;
      }

      this.focusContainer();
    });
  }

  disconnectedCallback() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = 0;
    }

    this.refs.editor?.removeEventListener("focus", this.handleNativeFocus);
    this.refs.editor?.removeEventListener("blur", this.handleNativeBlur);
    this.refs.editor?.removeEventListener("keydown", this.handleNativeKeyDown);
    this.refs.editor?.removeEventListener("mouseup", this.handleNativeMouseUp);
    this.refs.editor?.removeEventListener(
      "dragstart",
      this.handleNativeDragEvent,
    );
    this.refs.editor?.removeEventListener(
      "dragenter",
      this.handleNativeDragEvent,
    );
    this.refs.editor?.removeEventListener(
      "dragover",
      this.handleNativeDragEvent,
    );
    this.refs.editor?.removeEventListener("drop", this.handleNativeDragEvent);
    this.refs.editor?.removeEventListener(
      "contextmenu",
      this.handleNativeContextMenu,
    );
    this.refs.surface?.removeEventListener(
      "keydown",
      this.handleSurfaceKeyDown,
    );
    this.refs.editor?.removeEventListener(
      "beforeinput",
      this.handleNativeBeforeInput,
      true,
    );
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
      "item-click",
      this.handleMentionMenuItemClick,
    );
    this.refs.mentionMenu?.removeEventListener(
      "close",
      this.handleMentionMenuClose,
    );
    this.refs.selectionMenu?.removeEventListener(
      "mousedown",
      this.handleSelectionMenuMouseDown,
    );
    this.refs.selectionMenu?.removeEventListener(
      "item-click",
      this.handleSelectionMenuItemClick,
    );
    this.refs.selectionMenu?.removeEventListener(
      "close",
      this.handleSelectionMenuClose,
    );

    this.unregister?.();
    this.unregister = undefined;
    this.editor.setRootElement(null);
    this.awaitingCharacterShortcut = false;
    this.clearDeleteShortcutState();

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

  set lines(value) {
    const nextLines = cloneSceneEditorLines(value);
    if (areSceneEditorLinesEqual(this.state.lines, nextLines)) {
      return;
    }

    if (!this.isConnected || !this.refs.editor) {
      this.state.lines = nextLines;
      return;
    }

    if (
      (this.isEditorFocused || this.isComposing) &&
      haveSameLineOrder(this.state.lines, nextLines)
    ) {
      this.mergeExternalLineMetadata(nextLines);
      return;
    }

    this.loadLines(nextLines, {
      emitChange: false,
      restoreSelection: this.getCurrentSelectionSnapshot(),
    });
  }

  get lines() {
    return cloneSceneEditorLines(this.state.lines);
  }

  set lineDecorations(value) {
    this.state.lineDecorations = Array.isArray(value) ? value : [];
    if (!this.isConnected || !this.refs.editor) {
      return;
    }
    this.scheduleRender();
  }

  get lineDecorations() {
    return this.state.lineDecorations;
  }

  set textStyles(value) {
    this.state.textStyles = Array.isArray(value) ? value : [];
  }

  get textStyles() {
    return this.state.textStyles;
  }

  set selectedLineId(value) {
    this.state.selectedLineId = value;
    if (!this.isConnected || !this.refs.editor) {
      return;
    }
    this.scheduleRender();
  }

  get selectedLineId() {
    return this.state.selectedLineId;
  }

  set showLineNumbers(value) {
    this.state.showLineNumbers = value !== false;
    if (!this.isConnected || !this.refs.editor) {
      return;
    }
    this.scheduleRender();
  }

  get showLineNumbers() {
    return this.state.showLineNumbers;
  }

  setMode(mode) {
    this.state.mode = mode === "text-editor" ? "text-editor" : "block";

    if (this.state.mode !== "block") {
      this.awaitingCharacterShortcut = false;
      this.clearDeleteShortcutState();
    }

    this.scheduleRender();
  }

  focus(options = {}) {
    this.refs.editor?.focus(options);
  }

  focusLine(payload = {}) {
    const { lineId, cursorPosition } = payload;
    const lineKey = this.lineKeyById.get(lineId);
    if (!lineKey) {
      return false;
    }

    const lineElement = this.editor.getElementByKey(lineKey);
    if (!lineElement) {
      return false;
    }

    const targetPosition =
      typeof cursorPosition === "number"
        ? cursorPosition < 0
          ? (lineElement.textContent?.length ?? 0)
          : cursorPosition
        : (lineElement.textContent?.length ?? 0);

    const { range } = createCollapsedRangeAtPosition(
      lineElement,
      targetPosition,
    );
    this.focus({ preventScroll: true });
    setSelectionFromRange(this.refs.editor, range);
    lineElement.scrollIntoView({
      behavior: "auto",
      block: "nearest",
      inline: "nearest",
    });
    return true;
  }

  focusContainer() {
    const selectedLineId = this.state.selectedLineId || this.state.lines[0]?.id;
    this.enterBlockMode({
      focusSurface: true,
      lineId: selectedLineId,
      emitSelectionChange: false,
    });
  }

  scrollLineIntoView({
    lineId,
    behavior = "auto",
    block = "nearest",
    inline = "nearest",
  } = {}) {
    const lineKey = this.lineKeyById.get(lineId);
    const lineElement = lineKey
      ? this.editor.getElementByKey(lineKey)
      : undefined;
    lineElement?.scrollIntoView({
      behavior,
      block,
      inline,
    });
  }

  hardRefresh() {
    this.loadLines(this.state.lines, {
      emitChange: false,
      restoreSelection: this.getCurrentSelectionSnapshot(),
    });
  }

  applyTextFormat(format) {
    if (format === "bold" || format === "italic" || format === "underline") {
      this.editor.update(
        () => {
          const selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }

          selection.formatText(format);
        },
        { discrete: true },
      );
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

  enterBlockMode({
    focusSurface = true,
    lineId = this.state.selectedLineId || this.state.lines[0]?.id,
    emitSelectionChange = false,
  } = {}) {
    if (lineId) {
      this.state.selectedLineId = lineId;
      this.scrollLineIntoView({ lineId });
    }

    this.setMode("block");

    if (emitSelectionChange && lineId) {
      this.dispatchSelectedLineChanged(lineId, {
        cursorPosition: undefined,
        isCollapsed: false,
        mode: "block",
      });
    }

    if (focusSurface) {
      requestAnimationFrame(() => {
        this.refs.surface?.focus({ preventScroll: true });
      });
    }
  }

  enterTextMode({ lineId, cursorPosition } = {}) {
    if (!lineId) {
      return;
    }

    this.setMode("text-editor");
    this.focusLine({
      lineId,
      cursorPosition,
    });
  }

  moveBlockSelection(delta = 0) {
    const lines = this.state.lines;
    if (lines.length === 0) {
      return;
    }

    const currentIndex = Math.max(
      0,
      lines.findIndex((line) => line.id === this.state.selectedLineId),
    );
    const nextIndex = Math.min(
      lines.length - 1,
      Math.max(0, currentIndex + delta),
    );
    const nextLineId = lines[nextIndex]?.id;

    if (!nextLineId) {
      return;
    }

    this.state.selectedLineId = nextLineId;
    this.scheduleRender();
    this.scrollLineIntoView({ lineId: nextLineId });
    this.dispatchSelectedLineChanged(nextLineId, {
      cursorPosition: undefined,
      isCollapsed: false,
      mode: "block",
    });
  }

  dispatchShortcutEvent(eventName, detail = {}) {
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: true,
      }),
    );
  }

  clearDeleteShortcutState() {
    this.awaitingDeleteShortcut = false;

    if (this.deleteShortcutTimerId !== undefined) {
      clearTimeout(this.deleteShortcutTimerId);
      this.deleteShortcutTimerId = undefined;
    }
  }

  armDeleteShortcutState() {
    this.clearDeleteShortcutState();
    this.awaitingDeleteShortcut = true;
    this.deleteShortcutTimerId = setTimeout(() => {
      this.clearDeleteShortcutState();
    }, DELETE_SHORTCUT_TIMEOUT_MS);
  }

  handleBlockModeCharacterShortcut(event, lineId) {
    if (this.awaitingCharacterShortcut) {
      this.awaitingCharacterShortcut = false;
      event.preventDefault();
      event.stopPropagation();

      if (!isShortcutDigit(event.key) || !lineId) {
        return true;
      }

      this.dispatchShortcutEvent("dialogue-character-shortcut", {
        lineId,
        shortcut: event.key,
      });
      return true;
    }

    if (!isPlainShortcutKey(event, "c")) {
      return false;
    }

    this.awaitingCharacterShortcut = true;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  handleBlockModeDeleteShortcut(event, lineId) {
    const isDeleteShortcutKey = isPlainShortcutKey(event, "d");

    if (this.awaitingDeleteShortcut) {
      this.clearDeleteShortcutState();

      if (!isDeleteShortcutKey) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      if (!lineId) {
        return true;
      }

      this.dispatchShortcutEvent("delete-line-shortcut", {
        lineId,
      });
      return true;
    }

    if (!isDeleteShortcutKey) {
      return false;
    }

    this.armDeleteShortcutState();
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  handleNativeFocus() {
    this.isEditorFocused = true;
    this.state.mode = "text-editor";
    this.dataset.mode = "text-editor";
    if (this.refs.surface) {
      this.refs.surface.dataset.mode = "text-editor";
    }
  }

  handleNativeBlur() {
    if (this.selectionMenuIsOpen || this.furiganaDialogIsPending) {
      return;
    }

    this.isEditorFocused = false;
    this.hideSelectionPopover();
    this.pendingSelectionSnapshot = undefined;
    this.enterBlockMode({
      focusSurface: false,
      emitSelectionChange: false,
      lineId: this.state.selectedLineId,
    });
    this.dispatchEvent(
      new CustomEvent("editor-blur", {
        detail: {},
        bubbles: true,
      }),
    );
  }

  handleNativeKeyDown(event) {
    this.hideSelectionPopover();

    if (event.key === "Escape" && !event.isComposing) {
      if (this.state.mentionMenu.isOpen) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.enterBlockMode({
        focusSurface: true,
        lineId: this.getSelectedLineIdSnapshot(),
        emitSelectionChange: true,
      });
      return;
    }

    if (event.key === "Backspace" && !event.isComposing) {
      const didMerge = this.mergeCurrentLineBackward();
      if (didMerge) {
        event.preventDefault();
      }
    }
  }

  handleNativeMouseUp() {
    const range = getSelectionRange(this.refs.editor);
    const lineId = this.getLineIdFromRange(range);
    if (!lineId) {
      this.scheduleRender();
      return;
    }

    const didLineChange = this.state.selectedLineId !== lineId;
    this.state.selectedLineId = lineId;
    this.scheduleRender();

    if (didLineChange) {
      this.dispatchSelectedLineChanged(lineId, {
        cursorPosition: undefined,
        isCollapsed: false,
        mode: "text-editor",
      });
    }
  }

  handleNativeDragEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    if (event.dataTransfer) {
      try {
        event.dataTransfer.dropEffect = "none";
        event.dataTransfer.effectAllowed = "none";
      } catch {
        // Some browsers restrict DataTransfer writes outside dragstart.
      }
    }
  }

  handleNativeContextMenu(event) {
    const range = getSelectionRange(this.refs.editor);
    if (
      range &&
      !range.collapsed &&
      this.isContextMenuEventInsideRange(event, range)
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.showSelectionPopover(event);
      return;
    }

    const segmentSnapshot =
      this.getTextStyleSegmentSnapshotFromContextEvent(event);
    if (segmentSnapshot) {
      event.preventDefault();
      event.stopPropagation();
      this.selectSnapshot(segmentSnapshot);
      this.showSelectionPopover(event, {
        selectionSnapshot: segmentSnapshot,
      });
      return;
    }

    if (!range || range.collapsed) {
      this.hideSelectionPopover();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.showSelectionPopover(event);
  }

  isContextMenuEventInsideRange(event, range) {
    const target = event.composedPath?.()[0] ?? event.target;
    const node =
      target?.nodeType === Node.TEXT_NODE ? target : target?.closest?.("*");
    if (!node || !this.refs.editor?.contains(node)) {
      return false;
    }

    try {
      return range.intersectsNode(node);
    } catch {
      return false;
    }
  }

  getTextStyleSegmentSnapshotFromContextEvent(event) {
    const element = this.getTextStyleSegmentElementFromContextEvent(event);
    if (!element) {
      return undefined;
    }

    return this.getTextStyleSegmentSnapshotFromElement(element);
  }

  getTextStyleSegmentElementFromContextEvent(event) {
    const selector =
      '[style*="--rvn-text-style-id"], [style*="--rvn-furigana-text"]';
    const path = event.composedPath?.() ?? [];

    for (const target of path) {
      const element =
        target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
      const segmentElement = element?.closest?.(selector);
      if (segmentElement && this.refs.editor?.contains(segmentElement)) {
        return segmentElement;
      }

      if (target === this.refs.editor) {
        break;
      }
    }

    return undefined;
  }

  getTextStyleSegmentSnapshotFromElement(element) {
    return this.editor.read(() => {
      const node = $getNearestNodeFromDOMNode(element);
      if (!$isTextNode(node) || $isMentionNode(node)) {
        return undefined;
      }

      const style = node.getStyle();
      const hasTextStyleId = /(?:^|;)\s*--rvn-text-style-id\s*:/.test(style);
      const hasFurigana = /(?:^|;)\s*--rvn-furigana-text\s*:/.test(style);
      if (!hasTextStyleId && !hasFurigana) {
        return undefined;
      }

      const root = $getRoot();
      let lineNode = node;
      while (lineNode?.getParent?.() && lineNode.getParent() !== root) {
        lineNode = lineNode.getParent();
      }

      if (!lineNode || lineNode === root || lineNode.getParent?.() !== root) {
        return undefined;
      }

      const lineMeta = this.lineMetaByKey.get(lineNode.getKey());
      if (!lineMeta) {
        return undefined;
      }

      const result = getLexicalOffsetBeforeNode(lineNode, node.getKey());
      if (!result.found) {
        return undefined;
      }

      const start = result.offset;
      return {
        lineId: lineMeta.id,
        start,
        end: start + getLexicalTextLength(node),
      };
    });
  }

  handleSurfaceKeyDown(event) {
    this.hideSelectionPopover();

    if (this.state.mode !== "block") {
      return;
    }

    const currentLineId = this.state.selectedLineId || this.state.lines[0]?.id;
    if (!currentLineId && this.state.lines.length === 0) {
      return;
    }

    if (this.handleBlockModeCharacterShortcut(event, currentLineId)) {
      return;
    }

    if (this.handleBlockModeDeleteShortcut(event, currentLineId)) {
      return;
    }

    let key = event.key;
    if (event.shiftKey && event.code === "KeyI") {
      key = "Shift+I";
    } else if (event.shiftKey && event.code === "KeyA") {
      key = "Shift+A";
    } else if (event.altKey && event.code === "KeyJ") {
      key = "Alt+J";
    } else if (event.altKey && event.code === "KeyK") {
      key = "Alt+K";
    } else if (event.altKey && event.code === "ArrowDown") {
      key = "Alt+ArrowDown";
    } else if (event.altKey && event.code === "ArrowUp") {
      key = "Alt+ArrowUp";
    }

    const hasModifierKey = event.ctrlKey || event.metaKey || event.altKey;
    if (!hasModifierKey) {
      if (key === "j" || key === "J") {
        key = "ArrowDown";
      } else if (key === "k" || key === "K") {
        key = "ArrowUp";
      }
    }

    switch (key) {
      case "ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        this.moveBlockSelection(-1);
        return;
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        this.moveBlockSelection(1);
        return;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        this.enterTextMode({
          lineId: currentLineId,
          cursorPosition: -1,
        });
        return;
      case "Shift+I":
        event.preventDefault();
        event.stopPropagation();
        this.enterTextMode({
          lineId: currentLineId,
          cursorPosition: 0,
        });
        return;
      case "Shift+A":
        event.preventDefault();
        event.stopPropagation();
        this.enterTextMode({
          lineId: currentLineId,
          cursorPosition: -1,
        });
        return;
      case "o":
        event.preventDefault();
        event.stopPropagation();
        this.dispatchShortcutEvent("newLine", {
          lineId: currentLineId || null,
          position: "after",
        });
        return;
      case "O":
        event.preventDefault();
        event.stopPropagation();
        this.dispatchShortcutEvent("newLine", {
          lineId: currentLineId || null,
          position: "before",
        });
        return;
      case "p":
      case "P":
        event.preventDefault();
        event.stopPropagation();
        this.dispatchShortcutEvent("preview-shortcut", {});
        return;
      case "Alt+J":
      case "Alt+ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        if (currentLineId) {
          this.dispatchShortcutEvent("swapLine", {
            lineId: currentLineId,
            direction: "down",
          });
        }
        return;
      case "Alt+K":
      case "Alt+ArrowUp":
        event.preventDefault();
        event.stopPropagation();
        if (currentLineId) {
          this.dispatchShortcutEvent("swapLine", {
            lineId: currentLineId,
            direction: "up",
          });
        }
        return;
      default:
        return;
    }
  }

  handleNativeBeforeInput(event) {
    this.hideSelectionPopover();

    if (event.defaultPrevented || event.isComposing || this.isComposing) {
      return;
    }

    const inputType = String(event.inputType ?? "");
    if (inputType === "insertParagraph") {
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      if (this.pendingParagraphSplitBeforeInput) {
        this.pendingParagraphSplitBeforeInput = false;
        return;
      }

      this.splitCurrentLine();
      return;
    }

    if (inputType === "insertLineBreak") {
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      if (this.pendingSoftLineBreakBeforeInput) {
        this.pendingSoftLineBreakBeforeInput = false;
        return;
      }

      this.insertSoftLineBreak();
      return;
    }

    if (inputType === "insertText" || inputType === "insertReplacementText") {
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      this.insertPlainText(event.data ?? "");
      return;
    }

    if (inputType === "deleteContentBackward") {
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      this.deleteCharacterBackward();
      return;
    }

    if (inputType === "deleteContentForward") {
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      this.deleteCharacterForward();
      return;
    }

    if (inputType === "insertFromDrop" || inputType === "deleteByDrag") {
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      return;
    }

    if (inputType === "deleteByCut") {
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      this.removeSelectedText();
      return;
    }
  }

  handleCompositionStart() {
    this.isComposing = true;
    this.hideSelectionPopover();
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
    this.isComposing = false;
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
    event.preventDefault();
    event.stopPropagation();
  }

  handleMentionMenuItemClick(event) {
    const index = Number(event.detail?.index);
    if (!Number.isInteger(index)) {
      return;
    }

    this.selectMentionByIndex(index);
  }

  handleMentionMenuClose() {
    if (!this.state.mentionMenu.isOpen) {
      return;
    }

    this.closeMentionMenu();
  }

  applyTextStyleIdToSelection(textStyleId) {
    if (!textStyleId) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        this.restorePendingSelectionSnapshot();
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          return;
        }

        $patchStyleText(selection, {
          "--rvn-text-style-id": textStyleId,
        });
      },
      { discrete: true },
    );
    this.pendingSelectionSnapshot = undefined;
  }

  removeTextStyleIdFromSelection() {
    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        this.restorePendingSelectionSnapshot();
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          return;
        }

        $patchStyleText(selection, {
          "--rvn-text-style-id": null,
        });
      },
      { discrete: true },
    );
    this.pendingSelectionSnapshot = undefined;
  }

  applyFuriganaToSelection({ text, textStyleId } = {}) {
    const furiganaText = normalizeSingleLineText(text).trim();
    if (!furiganaText || !textStyleId) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        this.restorePendingSelectionSnapshot();
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          return;
        }

        $patchStyleText(selection, {
          [FURIGANA_TEXT_PROPERTY]: encodeURIComponent(furiganaText),
          [FURIGANA_TEXT_STYLE_ID_PROPERTY]: encodeURIComponent(textStyleId),
        });
      },
      { discrete: true },
    );

    this.clearPendingRichTextSelection();
  }

  removeFuriganaFromSelection() {
    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        this.restorePendingSelectionSnapshot();
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          return;
        }

        $patchStyleText(selection, {
          [FURIGANA_TEXT_PROPERTY]: null,
          [FURIGANA_TEXT_STYLE_ID_PROPERTY]: null,
        });
      },
      { discrete: true },
    );

    this.clearPendingRichTextSelection();
  }

  clearPendingRichTextSelection() {
    this.furiganaDialogIsPending = false;
    this.pendingSelectionSnapshot = undefined;
    this.selectionMenuIsOpen = false;

    if (this.refs.selectionMenu) {
      this.refs.selectionMenu.open = false;
      this.refs.selectionMenu.render?.();
    }
  }

  restorePendingSelectionSnapshot() {
    const snapshot = this.pendingSelectionSnapshot;
    if (!snapshot?.lineId) {
      return;
    }

    const lineKey = this.lineKeyById.get(snapshot.lineId);
    const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
    if (!lineNode) {
      return;
    }

    applySelectionToLineNode(lineNode, snapshot);
  }

  selectSnapshot(snapshot) {
    if (!snapshot?.lineId) {
      return;
    }

    this.editor.update(
      () => {
        const lineKey = this.lineKeyById.get(snapshot.lineId);
        const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
        if (!lineNode) {
          return;
        }

        applySelectionToLineNode(lineNode, snapshot);
      },
      { discrete: true },
    );
  }

  selectionContainsTextStyleId() {
    return this.editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return false;
      }

      return selection.getNodes().some((node) => {
        return (
          $isTextNode(node) &&
          !$isMentionNode(node) &&
          /(?:^|;)\s*--rvn-text-style-id\s*:/.test(node.getStyle())
        );
      });
    });
  }

  getSelectionFurigana() {
    return this.editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        return undefined;
      }

      for (const node of selection.getNodes()) {
        if (!$isTextNode(node) || $isMentionNode(node)) {
          continue;
        }

        const furigana = getFuriganaFromNode(node);
        if (furigana) {
          return furigana;
        }
      }

      return undefined;
    });
  }

  getTextStyleMenuItems() {
    if (this.state.textStyles.length === 0) {
      return [
        {
          id: "no-text-styles",
          type: "item",
          label: "No text styles",
          disabled: true,
        },
      ];
    }

    return this.state.textStyles.map((textStyle) => ({
      id: `text-style:${textStyle.id}`,
      type: "item",
      label: textStyle.name || textStyle.id,
      textStyleId: textStyle.id,
    }));
  }

  showTextStyleSelectionMenu() {
    const menu = this.refs.selectionMenu;
    if (!menu) {
      return;
    }

    menu.items = this.getTextStyleMenuItems();
    menu.x = this.selectionMenuPosition.x;
    menu.y = this.selectionMenuPosition.y;
    menu.place = "bs";
    menu.open = true;
    menu.render?.();
  }

  showSelectionPopover(event, { selectionSnapshot } = {}) {
    const menu = this.refs.selectionMenu;
    if (!menu) {
      return;
    }

    this.selectionMenuIsOpen = true;
    this.pendingSelectionSnapshot =
      selectionSnapshot ?? this.getCurrentSelectionSnapshot();

    const hasTextStyle = this.selectionContainsTextStyleId();
    const hasFurigana = !!this.getSelectionFurigana();
    const actions = [
      {
        id: hasTextStyle ? "edit-text-style" : "add-text-style",
        type: "item",
        label: hasTextStyle ? "Edit text style" : "Add text style",
      },
      {
        id: hasFurigana ? "edit-furigana" : "add-furigana",
        type: "item",
        label: hasFurigana ? "Edit furigana" : "Add furigana",
      },
    ];

    if (hasTextStyle) {
      actions.push({
        id: "remove-text-style",
        type: "item",
        label: "Remove text style",
      });
    }

    if (hasFurigana) {
      actions.push({
        id: "remove-furigana",
        type: "item",
        label: "Remove furigana",
      });
    }

    this.selectionMenuPosition = {
      x: String(event.clientX),
      y: String(event.clientY),
    };

    menu.items = actions;
    menu.x = this.selectionMenuPosition.x;
    menu.y = this.selectionMenuPosition.y;
    menu.place = "bs";
    menu.open = true;
    menu.render?.();
  }

  handleSelectionMenuMouseDown(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  handleSelectionMenuItemClick(event) {
    const item = event.detail?.item || {};
    const action = event.detail?.id ?? item.id;

    if (action === "add-text-style" || action === "edit-text-style") {
      this.showTextStyleSelectionMenu();
      return;
    }

    if (action === "add-furigana" || action === "edit-furigana") {
      this.requestFuriganaDialog();
      return;
    }

    if (item.textStyleId) {
      this.applyTextStyleIdToSelection(item.textStyleId);
    }

    if (action === "remove-text-style") {
      this.removeTextStyleIdFromSelection();
    }

    if (action === "remove-furigana") {
      this.removeFuriganaFromSelection();
    }

    this.hideSelectionPopover();
    this.focus({ preventScroll: true });
  }

  handleSelectionMenuClose() {
    if (this.furiganaDialogIsPending) {
      if (this.refs.selectionMenu) {
        this.refs.selectionMenu.open = false;
        this.refs.selectionMenu.render?.();
      }
      return;
    }

    this.hideSelectionPopover();
  }

  requestFuriganaDialog() {
    const snapshot =
      this.pendingSelectionSnapshot ?? this.getCurrentSelectionSnapshot();
    if (!snapshot || snapshot.start === snapshot.end) {
      this.hideSelectionPopover();
      return;
    }

    this.pendingSelectionSnapshot = snapshot;
    this.furiganaDialogIsPending = true;
    this.selectionMenuIsOpen = false;

    if (this.refs.selectionMenu) {
      this.refs.selectionMenu.open = false;
      this.refs.selectionMenu.render?.();
    }

    const furigana = this.getSelectionFurigana() ?? {};
    this.dispatchEvent(
      new CustomEvent("furigana-dialog-request", {
        detail: {
          furigana,
          defaultTextStyleId:
            furigana.textStyleId ?? this.state.textStyles[0]?.id ?? "",
          textStyles: this.state.textStyles,
        },
        bubbles: true,
      }),
    );
  }

  hideSelectionPopover() {
    this.selectionMenuIsOpen = false;
    this.pendingSelectionSnapshot = undefined;
    this.furiganaDialogIsPending = false;

    if (this.refs.selectionMenu) {
      this.refs.selectionMenu.open = false;
      this.refs.selectionMenu.render?.();
    }
  }

  getLineSelectionContext() {
    return this.editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) {
        return undefined;
      }

      const lineNode = this.getLineNodeFromSelection(selection);
      if (!lineNode) {
        return undefined;
      }

      const lineMeta = this.lineMetaByKey.get(lineNode.getKey());
      if (!lineMeta) {
        return undefined;
      }

      return {
        lineKey: lineNode.getKey(),
        lineId: lineMeta.id,
        selection: getSelectionOffsets(lineNode, selection),
        lineContent: this.serializeLineContent(lineNode),
      };
    });
  }

  getLineNodeFromSelection(selection) {
    if (!$isRangeSelection(selection)) {
      return undefined;
    }

    const root = $getRoot();
    let node = selection.anchor.getNode();
    if (node === root) {
      return undefined;
    }

    while (node?.getParent?.() && node.getParent() !== root) {
      node = node.getParent();
    }

    if (!node || node === root || node.getParent?.() !== root) {
      return undefined;
    }

    return node;
  }

  getCurrentSelectionSnapshot() {
    const context = this.getLineSelectionContext();
    if (context) {
      return {
        lineId: context.lineId,
        start: context.selection.start,
        end: context.selection.end,
      };
    }

    const lineId = this.state.selectedLineId || this.state.lines[0]?.id;
    if (!lineId) {
      return undefined;
    }

    return {
      lineId,
      start: 0,
      end: 0,
    };
  }

  mergeExternalLineMetadata(nextLines = []) {
    const externalLinesById = new Map();
    for (const line of cloneSceneEditorLines(nextLines)) {
      if (line?.id) {
        externalLinesById.set(line.id, line);
      }
    }

    const mergedLines = cloneSceneEditorLines(this.state.lines).map((line) => {
      const externalLine = externalLinesById.get(line.id);
      if (!externalLine) {
        return line;
      }

      const mergedLine = cloneSceneEditorLine(externalLine);
      setLineDialogueContent(mergedLine, getLineDialogueContent(line));
      return mergedLine;
    });

    this.state.lines = mergedLines;

    for (const line of mergedLines) {
      const lineKey = this.lineKeyById.get(line.id);
      if (!lineKey) {
        continue;
      }

      this.lineMetaByKey.set(lineKey, createLineMeta(line));
    }

    this.scheduleRender();
  }

  serializeLineContent(lineNode) {
    const content = [];
    collectContentItemsFromNode(lineNode, content);
    return ensureContentArray(content);
  }

  reconcileLineMetaMap(editorState = this.editor.getEditorState()) {
    editorState.read(() => {
      const root = $getRoot();
      const nextMetaByKey = new Map();
      const nextLineKeyById = new Map();

      for (const childNode of root.getChildren()) {
        const childKey = childNode.getKey();
        let lineMeta = this.lineMetaByKey.get(childKey);
        if (!lineMeta) {
          const previousSibling = childNode.getPreviousSibling();
          const nextSibling = childNode.getNextSibling();
          const previousMeta = previousSibling
            ? nextMetaByKey.get(previousSibling.getKey()) ||
              this.lineMetaByKey.get(previousSibling.getKey())
            : undefined;
          const nextMeta = nextSibling
            ? this.lineMetaByKey.get(nextSibling.getKey())
            : undefined;
          const templateMeta = previousMeta || nextMeta;

          lineMeta = createNewLineMeta(templateMeta);
        }

        nextMetaByKey.set(childKey, lineMeta);
        nextLineKeyById.set(lineMeta.id, childKey);
      }

      this.lineMetaByKey = nextMetaByKey;
      this.lineKeyById = nextLineKeyById;
    });
  }

  readEditorSnapshot(editorState = this.editor.getEditorState()) {
    this.reconcileLineMetaMap(editorState);
    return editorState.read(() => {
      const root = $getRoot();
      const selection = $getSelection();
      const lines = [];
      let selectedLineId = this.state.selectedLineId;

      for (const childNode of root.getChildren()) {
        const lineMeta = this.lineMetaByKey.get(childNode.getKey());
        if (!lineMeta) {
          continue;
        }

        lines.push(this.createPersistableLine(lineMeta, childNode));
      }

      if ($isRangeSelection(selection)) {
        const selectedLineNode = this.getLineNodeFromSelection(selection);
        selectedLineId =
          this.lineMetaByKey.get(selectedLineNode?.getKey())?.id ??
          selectedLineId;
      }

      const activeFormats = {
        bold: $isRangeSelection(selection)
          ? selection.hasFormat("bold")
          : false,
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
        lines,
        selectedLineId,
        activeFormats,
        mentionTrigger: $isRangeSelection(selection)
          ? (() => {
              const anchorNode = selection.anchor.getNode();
              if (!$isTextNode(anchorNode) || $isMentionNode(anchorNode)) {
                return undefined;
              }

              const anchorOffset = selection.anchor.offset;
              const text = anchorNode.getTextContent();
              const beforeCaret = text.slice(0, anchorOffset);
              const match = beforeCaret.match(/(?:^|\s)@([a-z0-9._-]*)$/i);
              if (!match) {
                return undefined;
              }

              const query = match[1] ?? "";
              const startOffset = beforeCaret.lastIndexOf(`@${query}`);
              if (startOffset === -1) {
                return undefined;
              }

              return {
                nodeKey: anchorNode.getKey(),
                startOffset,
                endOffset: anchorOffset,
                query,
              };
            })()
          : undefined,
      };
    });
  }

  getLinesSnapshot() {
    return cloneSceneEditorLines(this.readEditorSnapshot().lines);
  }

  getSelectedLineIdSnapshot() {
    return this.readEditorSnapshot().selectedLineId;
  }

  createPersistableLine(lineMeta, lineNode) {
    const line = createLineMeta(lineMeta);
    setLineDialogueContent(line, this.serializeLineContent(lineNode));
    return line;
  }

  appendParagraphContent(lineNode, content) {
    const nodes = createNodesFromContent(content);
    if (nodes.length > 0) {
      lineNode.append(...nodes);
      return;
    }

    lineNode.append($createTextNode(EDITOR_CARET_TEXT));
  }

  loadLines(lines, { emitChange = false, restoreSelection } = {}) {
    const nextLines = cloneSceneEditorLines(lines);
    this.isApplyingExternalLines = emitChange !== true;

    this.editor.update(
      () => {
        const root = $getRoot();
        root.clear();
        this.lineMetaByKey.clear();
        this.lineKeyById.clear();

        const workingLines =
          nextLines.length > 0
            ? nextLines
            : [
                {
                  id: generateId(),
                  sectionId: undefined,
                  actions: {
                    dialogue: {
                      content: createEmptyContent(),
                    },
                  },
                },
              ];

        const targetLineId =
          restoreSelection?.lineId ||
          this.state.selectedLineId ||
          workingLines[0]?.id;
        let targetLineNode;

        for (const line of workingLines) {
          const paragraphNode = $createParagraphNode();
          this.appendParagraphContent(
            paragraphNode,
            getLineDialogueContent(line),
          );
          root.append(paragraphNode);

          const meta = createLineMeta(line);
          this.lineMetaByKey.set(paragraphNode.getKey(), meta);
          this.lineKeyById.set(meta.id, paragraphNode.getKey());

          if (meta.id === targetLineId) {
            targetLineNode = paragraphNode;
          }
        }

        if (targetLineNode) {
          applySelectionToLineNode(targetLineNode, {
            lineId: targetLineId,
            start: restoreSelection?.start ?? 0,
            end: restoreSelection?.end ?? restoreSelection?.start ?? 0,
          });
        }
      },
      { discrete: true },
    );

    requestAnimationFrame(() => {
      this.isApplyingExternalLines = false;
    });
  }

  splitCurrentLine() {
    const context = this.getLineSelectionContext();
    if (!context) {
      return;
    }

    const lineMeta = this.lineMetaByKey.get(context.lineKey);
    if (!lineMeta) {
      return;
    }

    const { before, after } = splitContentRange(
      context.lineContent,
      context.selection.start,
      context.selection.end,
    );
    const newLineId = generateId();
    this.pendingChangeReason = "structure";

    this.editor.update(
      () => {
        const lineNode = $getNodeByKey(context.lineKey);
        if (!lineNode) {
          return;
        }

        lineNode.clear();
        this.appendParagraphContent(lineNode, before);

        const nextLineNode = $createParagraphNode();
        this.appendParagraphContent(nextLineNode, after);
        lineNode.insertAfter(nextLineNode);

        this.lineMetaByKey.set(nextLineNode.getKey(), {
          ...createNewLineMeta(lineMeta),
          id: newLineId,
        });
        this.lineKeyById.set(newLineId, nextLineNode.getKey());
        nextLineNode.selectStart();

        const selection = $getSelection();
        if ($isRangeSelection(selection) && getContentLength(after) === 0) {
          clearSelectionTextFormatting(selection);
        }
      },
      { discrete: true },
    );

    requestAnimationFrame(() => {
      const nextLineKey = this.lineKeyById.get(newLineId);
      if (!nextLineKey) {
        return;
      }

      this.editor.update(
        () => {
          const nextLineNode = $getNodeByKey(nextLineKey);
          nextLineNode?.selectStart();

          const selection = $getSelection();
          if (
            nextLineNode &&
            $isRangeSelection(selection) &&
            getContentLength(this.serializeLineContent(nextLineNode)) === 0
          ) {
            clearSelectionTextFormatting(selection);
          }
        },
        { discrete: true },
      );

      this.scrollLineIntoView({
        lineId: newLineId,
      });
      this.focusLine({
        lineId: newLineId,
        cursorPosition: 0,
      });
    });
  }

  mergeCurrentLineBackward() {
    const context = this.getLineSelectionContext();
    if (
      !context ||
      context.selection.start !== 0 ||
      context.selection.end !== 0
    ) {
      return false;
    }

    const currentLineKey = context.lineKey;
    const currentMeta = this.lineMetaByKey.get(currentLineKey);
    if (!currentMeta) {
      return false;
    }

    let previousLineId;
    let cursorPosition = 0;
    this.pendingChangeReason = "structure";

    this.editor.update(
      () => {
        const currentLineNode = $getNodeByKey(currentLineKey);
        const previousLineNode = currentLineNode?.getPreviousSibling();
        if (!currentLineNode || !previousLineNode) {
          return;
        }

        const previousMeta = this.lineMetaByKey.get(previousLineNode.getKey());
        if (!previousMeta) {
          return;
        }

        previousLineId = previousMeta.id;
        const previousContent = this.serializeLineContent(previousLineNode);
        const mergedContent = appendContentArrays(
          previousContent,
          this.serializeLineContent(currentLineNode),
        );
        cursorPosition = getContentLength(previousContent);

        previousLineNode.clear();
        this.appendParagraphContent(previousLineNode, mergedContent);
        currentLineNode.remove();
        this.lineMetaByKey.delete(currentLineKey);
        this.lineKeyById.delete(currentMeta.id);
        previousLineNode.selectEnd();
      },
      { discrete: true },
    );

    if (previousLineId) {
      requestAnimationFrame(() => {
        this.focusLine({
          lineId: previousLineId,
          cursorPosition,
        });
      });
    }

    return previousLineId !== undefined;
  }

  handlePasteEvent(event) {
    const pastedText = event?.clipboardData?.getData("text/plain") ?? "";
    const normalizedLines = pastedText.replace(/\r\n?/g, "\n").split("\n");

    if (normalizedLines.length <= 1) {
      this.insertPlainText(pastedText);
      return;
    }

    const context = this.getLineSelectionContext();
    if (!context) {
      return;
    }

    const lineMeta = this.lineMetaByKey.get(context.lineKey);
    if (!lineMeta) {
      return;
    }

    const { before, after } = splitContentRange(
      context.lineContent,
      context.selection.start,
      context.selection.end,
    );
    let targetLineId = lineMeta.id;
    let targetCursorPosition = getContentLength(
      appendContentArrays(
        before,
        ensureContentArray([{ text: normalizedLines[0] }]),
      ),
    );
    this.pendingChangeReason = "structure";

    this.editor.update(
      () => {
        const currentLineNode = $getNodeByKey(context.lineKey);
        if (!currentLineNode) {
          return;
        }

        currentLineNode.clear();
        this.appendParagraphContent(
          currentLineNode,
          appendContentArrays(
            before,
            ensureContentArray([{ text: normalizedLines[0] }]),
          ),
        );

        let insertAfterNode = currentLineNode;
        for (let index = 1; index < normalizedLines.length; index += 1) {
          const isLastLine = index === normalizedLines.length - 1;
          const nextLineNode = $createParagraphNode();
          const nextContent = isLastLine
            ? appendContentArrays(
                ensureContentArray([{ text: normalizedLines[index] }]),
                after,
              )
            : ensureContentArray([{ text: normalizedLines[index] }]);

          this.appendParagraphContent(nextLineNode, nextContent);
          insertAfterNode.insertAfter(nextLineNode);
          insertAfterNode = nextLineNode;

          const nextLineMeta = createNewLineMeta(lineMeta);
          const nextLineId = nextLineMeta.id;
          this.lineMetaByKey.set(nextLineNode.getKey(), nextLineMeta);
          this.lineKeyById.set(nextLineId, nextLineNode.getKey());
          targetLineId = nextLineId;
          targetCursorPosition = getContentLength(nextContent);
        }

        insertAfterNode.selectEnd();
      },
      { discrete: true },
    );

    requestAnimationFrame(() => {
      this.focusLine({
        lineId: targetLineId,
        cursorPosition: targetCursorPosition,
      });
    });
  }

  insertPlainText(text) {
    const nextText = String(text ?? "").replace(/\r\n?/g, "\n");

    this.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        this.clearEmptyLineInsertionFormatting(selection);

        const anchorNode = selection.anchor.getNode();
        if ($isTextNode(anchorNode)) {
          const anchorText = anchorNode.getTextContent();
          if (anchorText.includes(EDITOR_CARET_TEXT)) {
            const cleanedText = anchorText.replaceAll(EDITOR_CARET_TEXT, "");
            if (cleanedText !== anchorText) {
              anchorNode.setTextContent(cleanedText);
              const nextOffset = Math.min(
                selection.anchor.offset,
                anchorNode.getTextContentSize?.() ?? cleanedText.length,
              );
              selection.anchor.set(anchorNode.getKey(), nextOffset, "text");
              selection.focus.set(anchorNode.getKey(), nextOffset, "text");
            }
          }
        }

        selection.insertText(nextText);
      },
      { discrete: true },
    );
  }

  clearEmptyLineInsertionFormatting(selection) {
    if (!selection.isCollapsed()) {
      return;
    }

    const lineNode = this.getLineNodeFromSelection(selection);
    if (
      !lineNode ||
      getContentLength(this.serializeLineContent(lineNode)) !== 0
    ) {
      return;
    }

    clearSelectionTextFormatting(selection);
  }

  insertSoftLineBreak() {
    this.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        const anchorNode = selection.anchor.getNode();
        if ($isTextNode(anchorNode)) {
          const anchorText = anchorNode.getTextContent();
          if (anchorText.includes(EDITOR_CARET_TEXT)) {
            const cleanedText = anchorText.replaceAll(EDITOR_CARET_TEXT, "");
            if (cleanedText !== anchorText) {
              anchorNode.setTextContent(cleanedText);
              const nextOffset = Math.min(
                selection.anchor.offset,
                anchorNode.getTextContentSize?.() ?? cleanedText.length,
              );
              selection.anchor.set(anchorNode.getKey(), nextOffset, "text");
              selection.focus.set(anchorNode.getKey(), nextOffset, "text");
            }
          }
        }

        selection.insertLineBreak(false);
      },
      { discrete: true },
    );
  }

  deleteCharacterBackward() {
    this.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        if (selection.isCollapsed()) {
          selection.deleteCharacter(true);
          return;
        }

        selection.removeText();
      },
      { discrete: true },
    );
  }

  deleteCharacterForward() {
    this.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        if (selection.isCollapsed()) {
          selection.deleteCharacter(false);
          return;
        }

        selection.removeText();
      },
      { discrete: true },
    );
  }

  removeSelectedText() {
    this.editor.update(
      () => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        selection.removeText();
      },
      { discrete: true },
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

    if (this.refs.mentionMenu) {
      this.refs.mentionMenu.items = [];
      this.refs.mentionMenu.open = false;
      this.refs.mentionMenu.render?.();
    } else if (shouldRender) {
      this.renderMentionMenu();
    }
  }

  keepMentionMenuNonModal({ restoreFocus = false } = {}) {
    const popover =
      this.refs.mentionMenu?.shadowRoot?.querySelector?.("rtgl-popover");
    popover?.setAttribute("no-overlay", "");
    popover?.shadowRoot
      ?.querySelector?.("dialog")
      ?.setAttribute("tabindex", "-1");

    if (!restoreFocus) {
      return;
    }

    setTimeout(() => {
      if (!this.isConnected || !this.state.mentionMenu.isOpen) {
        return;
      }

      this.keepMentionMenuNonModal();
      this.focus({ preventScroll: true });
    }, 0);
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
    const snapshot = this.readEditorSnapshot(editorState);

    const previousLines = this.state.lines;
    const previousSelectedLineId = this.state.selectedLineId;
    this.state.lines = cloneSceneEditorLines(snapshot.lines);
    this.state.selectedLineId = snapshot.selectedLineId;
    this.state.activeFormats = snapshot.activeFormats;
    this.state.plainText = snapshot.lines
      .map((line) => getPlainTextFromContent(getLineDialogueContent(line)))
      .join("\n");

    if (snapshot.mentionTrigger) {
      const items = filterMentionSuggestions(snapshot.mentionTrigger.query);
      this.state.mentionMenu = {
        isOpen: true,
        query: snapshot.mentionTrigger.query,
        items,
        highlightedIndex: Math.min(
          this.state.mentionMenu.highlightedIndex,
          Math.max(0, items.length - 1),
        ),
        left: 12,
        top: 18,
        nodeKey: snapshot.mentionTrigger.nodeKey,
        startOffset: snapshot.mentionTrigger.startOffset,
        endOffset: snapshot.mentionTrigger.endOffset,
      };

      const position = getMentionMenuPosition(
        this.refs.editor,
        this.refs.surface,
      );
      const surfaceRect = this.refs.surface.getBoundingClientRect();
      this.state.mentionMenu.left = surfaceRect.left + position.left;
      this.state.mentionMenu.top = surfaceRect.top + position.top;
    } else {
      this.closeMentionMenu();
    }

    this.scheduleRender();

    const didLinesChange =
      previousLines.length !== this.state.lines.length ||
      previousLines.some((line, index) => {
        const nextLine = this.state.lines[index];
        return (
          line?.id !== nextLine?.id ||
          !areContentsEqual(
            getLineDialogueContent(line),
            getLineDialogueContent(nextLine),
          ) ||
          JSON.stringify(line?.actions || {}) !==
            JSON.stringify(nextLine?.actions || {})
        );
      });

    if (didLinesChange && !this.isApplyingExternalLines) {
      this.dispatchEvent(
        new CustomEvent("scene-lines-changed", {
          detail: {
            lines: cloneSceneEditorLines(this.state.lines),
            selectedLineId: this.state.selectedLineId,
            reason: this.pendingChangeReason,
          },
          bubbles: true,
        }),
      );
    }

    if (previousSelectedLineId !== this.state.selectedLineId) {
      this.dispatchSelectedLineChanged(this.state.selectedLineId);
    }

    this.pendingChangeReason = "text";
  }

  dispatchSelectedLineChanged(lineId, detailOverride) {
    if (!lineId) {
      return;
    }

    const selectionDetail =
      detailOverride ||
      this.editor.getEditorState().read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return undefined;
        }

        const selectedLineNode = this.getLineNodeFromSelection(selection);
        if (!selectedLineNode) {
          return undefined;
        }

        const selectedLineId = this.lineMetaByKey.get(
          selectedLineNode.getKey(),
        )?.id;
        if (selectedLineId !== lineId) {
          return undefined;
        }

        const lineSelection = getSelectionOffsets(selectedLineNode, selection);
        return {
          cursorPosition: lineSelection.start,
          isCollapsed: lineSelection.start === lineSelection.end,
          mode: "text-editor",
        };
      });

    this.dispatchEvent(
      new CustomEvent("selected-line-changed", {
        detail: {
          lineId,
          cursorPosition: selectionDetail?.cursorPosition,
          isCollapsed: selectionDetail?.isCollapsed === true,
          mode: selectionDetail?.mode || this.state.mode,
        },
        bubbles: true,
      }),
    );
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
    this.dataset.showLineNumbers = this.state.showLineNumbers
      ? "true"
      : "false";
    this.dataset.mode = this.state.mode;
    this.refs.surface.dataset.mode = this.state.mode;
    this.style.setProperty(
      "--left-gutter-width",
      `${this.state.showLineNumbers ? LEFT_GUTTER_WIDTH_WITH_NUMBERS : LEFT_GUTTER_WIDTH_WITHOUT_NUMBERS}px`,
    );
    this.style.setProperty(
      "--right-gutter-width",
      `${this.rightGutterWidth}px`,
    );
    this.refs.placeholder.hidden = this.state.plainText.length > 0;
    this.refs.placeholder.textContent = this.state.placeholder;
    this.renderGutters();
    this.renderMentionMenu();
  }

  renderGutters() {
    const lineDecorationsById = new Map();

    for (const lineDecoration of this.state.lineDecorations) {
      if (!lineDecoration?.id) {
        continue;
      }

      lineDecorationsById.set(lineDecoration.id, lineDecoration);
    }

    const surfaceRect = this.refs.surface.getBoundingClientRect();
    const maxRightGutterWidth = this.getMaxRightGutterWidth();
    let maxLineRightGutterWidth = DEFAULT_RIGHT_GUTTER_WIDTH;
    let shouldRenderAgain = false;
    const seenLeftRows = new Set();
    const seenRightRows = new Set();

    this.state.lines.forEach((line, index) => {
      const lineKey = this.lineKeyById.get(line.id);
      const lineElement = lineKey
        ? this.editor.getElementByKey(lineKey)
        : undefined;
      if (!lineElement) {
        return;
      }

      const lineDecoration = lineDecorationsById.get(line.id) || {};
      const lineRect = lineElement.getBoundingClientRect();
      const top = Math.max(0, lineRect.top - surfaceRect.top);
      const height = Math.max(24, lineRect.height);
      const isSelected = line.id === this.state.selectedLineId;
      lineElement.dataset.selected = String(isSelected);
      lineElement.dataset.mode = this.state.mode;
      const leftRow = this.getOrCreateGutterRow(
        this.leftGutterRowsByLineId,
        this.refs.leftGutter,
        line.id,
      );
      this.updateGutterRowLayout(leftRow, {
        top,
        height,
        isSelected,
      });
      this.updateLeftGutterRow(leftRow, lineDecoration, index);
      seenLeftRows.add(line.id);

      const previewItems = this.createPreviewItems(lineDecoration);
      if (previewItems.childNodes.length === 0) {
        this.removeGutterRow(this.rightGutterRowsByLineId, line.id);
        shouldRenderAgain =
          this.setLineRightGutterWidth(lineElement, 0) || shouldRenderAgain;
        return;
      }

      const rightRow = this.getOrCreateGutterRow(
        this.rightGutterRowsByLineId,
        this.refs.rightGutter,
        line.id,
      );
      this.updateGutterRowLayout(rightRow, {
        top,
        height,
        isSelected,
      });
      this.updateRightGutterRow(rightRow, lineDecoration, previewItems);
      const lineRightGutter = this.syncLineRightGutterWidth(
        lineElement,
        rightRow,
        maxRightGutterWidth,
      );
      maxLineRightGutterWidth = Math.max(
        maxLineRightGutterWidth,
        lineRightGutter.width,
      );
      shouldRenderAgain =
        lineRightGutter.didUpdateLinePadding || shouldRenderAgain;
      seenRightRows.add(line.id);
    });

    this.removeStaleGutterRows(this.leftGutterRowsByLineId, seenLeftRows);
    this.removeStaleGutterRows(this.rightGutterRowsByLineId, seenRightRows);
    shouldRenderAgain =
      this.syncRightGutterWidth(maxLineRightGutterWidth) || shouldRenderAgain;

    if (shouldRenderAgain) {
      this.scheduleRender();
    }
  }

  getOrCreateGutterRow(map, container, lineId) {
    let row = map.get(lineId);
    if (row) {
      return row;
    }

    row = document.createElement("div");
    row.className = "gutter-row";
    row.dataset.lineId = lineId;
    container.append(row);
    map.set(lineId, row);
    return row;
  }

  updateGutterRowLayout(row, { top, height, isSelected } = {}) {
    row.dataset.selected = String(isSelected);
    row.dataset.mode = this.state.mode;
    row.style.top = `${top}px`;
    row.style.minHeight = `${height}px`;
  }

  updateLeftGutterRow(row, lineDecoration = {}, index = 0) {
    const signature = JSON.stringify({
      showLineNumbers: this.state.showLineNumbers,
      lineNumber: lineDecoration.lineNumber ?? index + 1,
      characterFileId: lineDecoration.characterFileId || "",
    });

    if (row.dataset.signature === signature) {
      return;
    }

    row.dataset.signature = signature;
    row.replaceChildren();

    if (this.state.showLineNumbers) {
      const lineNumber = document.createElement("div");
      lineNumber.className = "line-number";
      lineNumber.textContent = String(lineDecoration.lineNumber ?? index + 1);
      row.append(lineNumber);
    }

    row.append(this.createSpeakerSlot(lineDecoration));
  }

  updateRightGutterRow(row, lineDecoration = {}, previewItems) {
    const signature = this.buildRightGutterSignature(lineDecoration);
    if (row.dataset.signature === signature) {
      return;
    }

    row.dataset.signature = signature;
    row.replaceChildren(previewItems);
  }

  buildRightGutterSignature(lineDecoration = {}) {
    return JSON.stringify({
      background: lineDecoration.background,
      characterSprites: lineDecoration.characterSprites,
      visual: lineDecoration.visual,
      sectionTransition: Boolean(lineDecoration.sectionTransition),
      hasDialogueLayout: Boolean(lineDecoration.hasDialogueLayout),
      dialogueModeLabel: lineDecoration.dialogueModeLabel || "",
      dialogueChangeType: lineDecoration.dialogueChangeType,
      hasControl: Boolean(lineDecoration.hasControl),
      controlChangeType: lineDecoration.controlChangeType,
      bgm: lineDecoration.bgm,
      hasSfx: Boolean(lineDecoration.hasSfx),
      sfxChangeType: lineDecoration.sfxChangeType,
      hasChoices: Boolean(lineDecoration.hasChoices),
      hasSetNextLineConfig: Boolean(lineDecoration.hasSetNextLineConfig),
      setNextLineConfigChangeType: lineDecoration.setNextLineConfigChangeType,
    });
  }

  removeGutterRow(map, lineId) {
    const row = map.get(lineId);
    if (!row) {
      return;
    }

    row.remove();
    map.delete(lineId);
  }

  removeStaleGutterRows(map, seenLineIds) {
    for (const [lineId, row] of map.entries()) {
      if (seenLineIds.has(lineId)) {
        continue;
      }

      row.remove();
      map.delete(lineId);
    }
  }

  getMaxRightGutterWidth() {
    const surfaceWidth = this.refs.surface.getBoundingClientRect().width;
    const leftGutterWidth = this.state.showLineNumbers
      ? LEFT_GUTTER_WIDTH_WITH_NUMBERS
      : LEFT_GUTTER_WIDTH_WITHOUT_NUMBERS;

    return Math.max(
      DEFAULT_RIGHT_GUTTER_WIDTH,
      surfaceWidth - leftGutterWidth - MIN_EDITOR_TEXT_WIDTH,
    );
  }

  syncLineRightGutterWidth(lineElement, rightRow, maxRightGutterWidth) {
    rightRow.removeAttribute("data-constrained");

    const previewItems = rightRow.firstElementChild;
    const measuredNaturalWidth = Math.max(
      Math.ceil(previewItems?.getBoundingClientRect?.().width ?? 0),
      Math.ceil(previewItems?.scrollWidth ?? 0),
    );
    const isConstrained = measuredNaturalWidth > maxRightGutterWidth;
    const lineRightGutterWidth = Math.min(
      maxRightGutterWidth,
      Math.max(DEFAULT_RIGHT_GUTTER_WIDTH, measuredNaturalWidth),
    );

    rightRow.dataset.constrained = String(isConstrained);
    rightRow.style.setProperty(
      "--line-right-gutter-width",
      `${lineRightGutterWidth}px`,
    );
    const didUpdateLinePadding = this.setLineRightGutterWidth(
      lineElement,
      lineRightGutterWidth,
    );

    return {
      width: lineRightGutterWidth,
      didUpdateLinePadding,
    };
  }

  setLineRightGutterWidth(lineElement, width) {
    const nextWidth = Math.max(0, Math.ceil(Number(width) || 0));
    const nextPaddingRight = `${nextWidth}px`;
    if (lineElement.style.paddingRight === nextPaddingRight) {
      return false;
    }

    lineElement.style.paddingRight = nextPaddingRight;
    return true;
  }

  syncRightGutterWidth(nextWidth = DEFAULT_RIGHT_GUTTER_WIDTH) {
    const normalizedWidth = Math.max(
      DEFAULT_RIGHT_GUTTER_WIDTH,
      Math.ceil(Number(nextWidth) || 0),
    );

    if (Math.abs(normalizedWidth - this.rightGutterWidth) < 1) {
      return false;
    }

    this.rightGutterWidth = normalizedWidth;
    this.style.setProperty("--right-gutter-width", `${normalizedWidth}px`);
    return true;
  }

  createSpeakerSlot(lineDecoration = {}) {
    const slot = document.createElement("div");
    slot.className = "speaker-slot";

    if (!lineDecoration.characterFileId) {
      return slot;
    }

    slot.append(
      this.createFileImage({
        fileId: lineDecoration.characterFileId,
        width: 24,
        height: 24,
        borderRadius: "f",
      }),
    );
    return slot;
  }

  getLineIdFromRange(range) {
    if (!range?.startContainer) {
      return undefined;
    }

    let lineElement;
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      lineElement =
        range.startContainer.parentElement?.closest?.(".editor-paragraph");
    } else {
      lineElement = range.startContainer.closest?.(".editor-paragraph");
    }

    if (!lineElement) {
      return undefined;
    }

    for (const [lineKey, lineMeta] of this.lineMetaByKey.entries()) {
      if (this.editor.getElementByKey(lineKey) === lineElement) {
        return lineMeta?.id;
      }
    }

    return undefined;
  }

  createPreviewItems(lineDecoration = {}) {
    const container = document.createElement("div");
    container.className = "preview-items";

    if (lineDecoration.background) {
      container.append(
        this.createMediaPreview({
          type: "background",
          fileId: lineDecoration.background.fileId,
          placeholderIcon: "image",
          size: "bg",
          isDelete: lineDecoration.background.changeType === "delete",
        }),
      );
    }

    if (lineDecoration.characterSprites) {
      const item = document.createElement("div");
      item.className = "preview-item";
      item.dataset.overlay = "true";
      const stack = document.createElement("div");
      stack.className = "preview-image-stack";
      const sprites = Array.isArray(lineDecoration.characterSprites.items)
        ? lineDecoration.characterSprites.items
        : [];

      if (sprites.length > 0) {
        for (const sprite of sprites) {
          stack.append(
            this.createMediaThumb({
              fileId: sprite.fileId,
              placeholderIcon: "character",
              size: "sprite",
              borderRadius: "true",
            }),
          );
        }
      } else {
        stack.append(
          this.createMediaThumb({
            placeholderIcon: "character",
            size: "bg",
          }),
        );
      }

      item.append(stack);
      if (lineDecoration.characterSprites.changeType === "delete") {
        item.append(this.createPreviewGroupDeleteOverlay());
      }
      container.append(item);
    }

    if (lineDecoration.visual) {
      const item = document.createElement("div");
      item.className = "preview-item";
      item.dataset.overlay = "true";
      const stack = document.createElement("div");
      stack.className = "preview-image-stack";
      const visuals = Array.isArray(lineDecoration.visual.items)
        ? lineDecoration.visual.items
        : [];

      if (visuals.length > 0) {
        for (const visual of visuals) {
          stack.append(
            this.createMediaThumb({
              fileId: visual.fileId,
              placeholderIcon: "image",
              size: "visual",
            }),
          );
        }
      } else {
        stack.append(
          this.createMediaThumb({
            placeholderIcon: "image",
            size: "visual",
          }),
        );
      }

      item.append(stack);
      if (lineDecoration.visual.changeType === "delete") {
        item.append(this.createPreviewGroupDeleteOverlay());
      }
      container.append(item);
    }

    if (lineDecoration.sectionTransition) {
      container.append(
        this.createIconPreview({
          icon: "transition",
        }),
      );
    }

    if (lineDecoration.hasDialogueLayout) {
      const item = document.createElement("div");
      item.className = "preview-item";
      item.append(
        this.createIconPreview({
          icon: "dialogue",
          isDelete: lineDecoration.dialogueChangeType === "delete",
        }),
      );
      const label = document.createElement("div");
      label.className = "preview-dialogue-label";
      label.textContent = lineDecoration.dialogueModeLabel || "ADV";
      item.append(label);
      container.append(item);
    }

    if (lineDecoration.hasControl) {
      container.append(
        this.createIconPreview({
          icon: "control",
          isDelete: lineDecoration.controlChangeType === "delete",
        }),
      );
    }

    if (lineDecoration.bgm) {
      container.append(
        this.createIconPreview({
          icon: "music",
          isDelete: lineDecoration.bgm.changeType === "delete",
        }),
      );
    }

    if (lineDecoration.hasSfx) {
      container.append(
        this.createIconPreview({
          icon: "audio",
          isDelete: lineDecoration.sfxChangeType === "delete",
        }),
      );
    }

    if (lineDecoration.hasChoices) {
      container.append(
        this.createIconPreview({
          icon: "choices",
        }),
      );
    }

    if (lineDecoration.hasSetNextLineConfig) {
      container.append(
        this.createIconPreview({
          icon: "settings",
          isDelete: lineDecoration.setNextLineConfigChangeType === "delete",
        }),
      );
    }

    return container;
  }

  createMediaPreview({
    fileId,
    placeholderIcon,
    size = "bg",
    isDelete = false,
  } = {}) {
    const item = document.createElement("div");
    item.className = "preview-item";
    item.append(
      this.createMediaThumb({
        fileId,
        placeholderIcon,
        size,
        isDelete,
      }),
    );
    return item;
  }

  createMediaThumb({
    fileId,
    placeholderIcon,
    size = "bg",
    borderRadius = "false",
    isDelete = false,
  } = {}) {
    const thumb = document.createElement("div");
    thumb.className = "preview-thumb";
    thumb.dataset.size = size;
    thumb.dataset.round = borderRadius;

    if (fileId) {
      thumb.append(
        this.createFileImage({
          fileId,
          width: size === "sprite" ? 20 : 36,
          height: 24,
          borderRadius: borderRadius === "true" ? "f" : undefined,
        }),
      );
    } else if (placeholderIcon) {
      const placeholder = document.createElement("div");
      placeholder.className = "preview-placeholder";
      placeholder.append(this.createSvgIcon(placeholderIcon, 24));
      thumb.append(placeholder);
    }

    if (isDelete) {
      thumb.append(this.createDeleteOverlay());
    }

    return thumb;
  }

  createIconPreview({ icon, isDelete = false } = {}) {
    const item = document.createElement("div");
    item.className = "preview-item";
    const thumb = document.createElement("div");
    thumb.className = "preview-thumb";
    thumb.dataset.size = "icon";
    thumb.append(this.createSvgIcon(icon, 24));

    if (isDelete) {
      thumb.append(this.createDeleteOverlay());
    }

    item.append(thumb);
    return item;
  }

  createDeleteOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "preview-delete-overlay";
    overlay.append(this.createSvgIcon("x", 16, "white"));
    return overlay;
  }

  createPreviewGroupDeleteOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "preview-group-delete-overlay";
    overlay.append(this.createSvgIcon("x", 16, "white"));
    return overlay;
  }

  createSvgIcon(iconName, size = 24, color) {
    const icon = document.createElement("rtgl-svg");
    icon.setAttribute("svg", iconName);
    icon.setAttribute("wh", String(size));
    if (color) {
      icon.setAttribute("c", color);
    }

    return icon;
  }

  createFileImage({ fileId, width, height, borderRadius } = {}) {
    const image = document.createElement("rvn-file-image");
    image.setAttribute("fileId", fileId);
    image.setAttribute("w", String(width));
    image.setAttribute("h", String(height));
    if (borderRadius) {
      image.setAttribute("br", borderRadius);
    }

    return image;
  }

  renderMentionMenu() {
    const menuState = this.state.mentionMenu;
    const menu = this.refs.mentionMenu;
    if (!menu) {
      return;
    }

    if (!menuState.isOpen || menuState.items.length === 0) {
      menu.items = [];
      menu.open = false;
      menu.render?.();
      return;
    }

    menu.items = menuState.items.map((item, index) => {
      const isHighlighted = index === menuState.highlightedIndex;
      return {
        id: `mention:${item.id}`,
        type: "item",
        label: `${isHighlighted ? "> " : ""}@${item.label}`,
        suffixText: item.id,
      };
    });
    menu.x = String(menuState.left);
    menu.y = String(menuState.top);
    menu.place = "bs";
    menu.w = "260";
    menu.h = "240";
    menu.open = true;
    menu.render?.();
    this.keepMentionMenuNonModal({ restoreFocus: true });
  }
}
