import {
  $createParagraphNode,
  $createTextNode,
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
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
  createSceneEditorTimingTraceId,
  emitSceneEditorTiming,
  getSceneEditorTimingDurationMs,
  getSceneEditorTimingNow,
} from "../internal/ui/sceneEditor/sceneEditorTiming.js";
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
  mergeAdjacentContentItems,
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
  applyFuriganaToNode,
  applyTextStyleIdToNode,
  collectContentItemsFromNode,
  createNodesFromContent as createLexicalNodesFromContent,
  filterMentionSuggestions,
  getFuriganaFromNode,
  getSelectionRange,
  getSelectionOffsets,
  getTextStyleIdFromNode,
  patchDocumentActiveElement,
  patchDocumentGetSelection,
  removeFuriganaFromNode,
  removeTextStyleIdFromNode,
  patchWindowGetSelection,
  unpatchDocumentActiveElement,
  unpatchDocumentGetSelection,
  unpatchWindowGetSelection,
} from "./lexicalRichTextShared.js";
import {
  applySelectionToLineNode,
  clearSelectionTextFormatting,
  createCollapsedRangeAtPosition,
  getLexicalOffsetBeforeNode,
  getLexicalTextLength,
  setSelectionFromRange,
} from "./lexicalSceneDocumentSelection.js";
import {
  getAdjacentReferenceNodeInfoForCollapsedSelection,
  getReferenceElementFromContextEvent,
  getReferenceRichTextStateFromNode,
  getReferenceSelectionInfo,
  getReferenceSnapshotFromMentionNode,
  getTextStyleSegmentElementFromContextEvent,
  isCollapsedReferenceCaretMovingIntoNode,
  placeCaretAroundReferenceNode,
  selectReferenceNodeAsElement,
} from "./lexicalSceneDocumentReferences.js";

const DEFAULT_PLACEHOLDER = "";
const LEFT_GUTTER_WIDTH_WITH_NUMBERS = 60;
const LEFT_GUTTER_WIDTH_WITHOUT_NUMBERS = 26;
const DEFAULT_RIGHT_GUTTER_WIDTH = 24;
const MIN_EDITOR_TEXT_WIDTH = 160;
const BLOCK_ROW_BACKGROUND = "var(--muted)";
const DELETE_SHORTCUT_TIMEOUT_MS = 1200;
const TEXT_INPUT_FALLBACK_MAX_AGE_MS = 1000;
const TEXT_INPUT_FALLBACK_DUPLICATE_MAX_AGE_MS = 250;
const TYPED_SLASH_MENTION_TRIGGER_WINDOW_MS = 1000;
const PROGRAMMATIC_FOCUS_BLUR_SUPPRESS_MS = 750;
const VERTICAL_NAVIGATION_SELECTION_SYNC_FRAMES = 4;
const EDITOR_FONT_SIZE_VALUES = {
  xs: "13px",
  sm: "14px",
  md: "16px",
  lg: "18px",
  xl: "20px",
};
const DEFAULT_EDITOR_FONT_SIZE = "md";

const normalizeEditorFontSize = (fontSize) =>
  EDITOR_FONT_SIZE_VALUES[fontSize] ? fontSize : DEFAULT_EDITOR_FONT_SIZE;

const isSectionEditorSelectedLineIdBindingFallback = (value) => {
  return /^sectionEditorItems\[\d+\]\.selectedLineId$/.test(
    String(value ?? ""),
  );
};

const isSlashText = (value) => {
  return String(value ?? "") === "/";
};

const isArrowKeyEvent = (event) => {
  const key = String(event?.key ?? "");
  return (
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown"
  );
};

const areNativeLineSelectionContextsEqual = (first, second) => {
  if (!first || !second) {
    return first === second;
  }

  return (
    first.lineId === second.lineId &&
    first.start === second.start &&
    first.end === second.end
  );
};

const MOBILE_KEYBOARD_TOOLBAR_HEIGHT_PX = 48;

const getViewportObscuredBottomInset = () => {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return 0;
  }

  const layoutHeight =
    window.innerHeight || document.documentElement?.clientHeight || 0;
  const virtualKeyboardRect =
    typeof navigator !== "undefined"
      ? navigator.virtualKeyboard?.boundingRect
      : undefined;
  const virtualKeyboardHeight = Number(virtualKeyboardRect?.height) || 0;
  if (virtualKeyboardHeight > 0) {
    return Math.min(virtualKeyboardHeight, layoutHeight);
  }

  const viewport = window.visualViewport;
  if (!viewport) {
    return 0;
  }

  const viewportBottom = Number(viewport.offsetTop) + Number(viewport.height);
  return Number.isFinite(viewportBottom)
    ? Math.max(0, layoutHeight - viewportBottom)
    : 0;
};

const getParentElementAcrossShadowRoot = (element) => {
  if (element?.parentElement) {
    return element.parentElement;
  }

  const root = element?.getRootNode?.();
  if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
    return root.host;
  }

  return undefined;
};

const isScrollableElement = (element) => {
  if (
    !element ||
    element === document.body ||
    element === document.documentElement
  ) {
    return false;
  }

  const overflowY = window.getComputedStyle(element).overflowY;
  const canScrollY =
    overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";

  return canScrollY && element.scrollHeight > element.clientHeight + 1;
};

const getNearestScrollableElement = (element) => {
  let current = getParentElementAcrossShadowRoot(element);

  while (current) {
    if (isScrollableElement(current)) {
      return current;
    }

    current = getParentElementAcrossShadowRoot(current);
  }

  return undefined;
};

const getScrollMarginValue = (element, property) => {
  const value = Number.parseFloat(window.getComputedStyle(element)[property]);
  return Number.isFinite(value) ? value : 0;
};

const scrollElementIntoNearestScrollableView = (
  element,
  { behavior = "auto", block = "nearest" } = {},
) => {
  if (!element || typeof window === "undefined") {
    return;
  }

  const scrollContainer = getNearestScrollableElement(element);
  if (!scrollContainer) {
    return;
  }

  const elementRect = element.getBoundingClientRect();
  const containerRect = scrollContainer.getBoundingClientRect();
  const marginTop = getScrollMarginValue(element, "scrollMarginTop");
  const marginBottom = getScrollMarginValue(element, "scrollMarginBottom");
  const topDelta = elementRect.top - containerRect.top - marginTop;
  const bottomDelta = elementRect.bottom - containerRect.bottom + marginBottom;
  let nextScrollTop = scrollContainer.scrollTop;

  if (block === "start") {
    nextScrollTop += topDelta;
  } else if (block === "end") {
    nextScrollTop += bottomDelta;
  } else if (block === "center") {
    nextScrollTop +=
      elementRect.top -
      containerRect.top -
      (containerRect.height - elementRect.height) / 2;
  } else if (topDelta < 0) {
    nextScrollTop += topDelta;
  } else if (bottomDelta > 0) {
    nextScrollTop += bottomDelta;
  } else {
    return;
  }

  scrollContainer.scrollTo({
    top: Math.max(0, nextScrollTop),
    behavior,
  });
};

const isUsableClientRect = (rect) => {
  if (!rect) {
    return false;
  }

  const top = Number(rect.top);
  const right = Number(rect.right);
  const bottom = Number(rect.bottom);
  const left = Number(rect.left);

  if (
    !Number.isFinite(top) ||
    !Number.isFinite(right) ||
    !Number.isFinite(bottom) ||
    !Number.isFinite(left)
  ) {
    return false;
  }

  return (
    rect.width > 0 ||
    rect.height > 0 ||
    top !== 0 ||
    right !== 0 ||
    bottom !== 0 ||
    left !== 0
  );
};

const scrollRectIntoNearestScrollableView = (
  anchorElement,
  targetRect,
  {
    behavior = "auto",
    block = "nearest",
    paddingTop = 8,
    paddingBottom = 80,
  } = {},
) => {
  if (
    !anchorElement ||
    !isUsableClientRect(targetRect) ||
    typeof window === "undefined"
  ) {
    return false;
  }

  const scrollContainer = getNearestScrollableElement(anchorElement);
  if (!scrollContainer) {
    return false;
  }

  const containerRect = scrollContainer.getBoundingClientRect();
  const topDelta = targetRect.top - containerRect.top - paddingTop;
  const bottomDelta = targetRect.bottom - containerRect.bottom + paddingBottom;
  let nextScrollTop = scrollContainer.scrollTop;

  if (block === "start") {
    nextScrollTop += topDelta;
  } else if (block === "end") {
    nextScrollTop += bottomDelta;
  } else if (block === "center") {
    nextScrollTop +=
      targetRect.top -
      containerRect.top -
      (containerRect.height - targetRect.height) / 2;
  } else if (topDelta < 0) {
    nextScrollTop += topDelta;
  } else if (bottomDelta > 0) {
    nextScrollTop += bottomDelta;
  } else {
    return true;
  }

  scrollContainer.scrollTo({
    top: Math.max(0, nextScrollTop),
    behavior,
  });
  return true;
};

const doesContentEndWithReference = (content = []) => {
  const items = mergeAdjacentContentItems(content);
  return items.at(-1)?.reference !== undefined;
};

const areRenderedMentionMenuItemsEqual = (
  currentItems = [],
  nextItems = [],
) => {
  if (currentItems.length !== nextItems.length) {
    return false;
  }

  return currentItems.every((currentItem, index) => {
    const nextItem = nextItems[index];
    return (
      currentItem?.id === nextItem?.id &&
      currentItem?.type === nextItem?.type &&
      currentItem?.label === nextItem?.label &&
      currentItem?.suffixText === nextItem?.suffixText
    );
  });
};

const getMentionTriggerFromTextNode = (
  anchorNode,
  anchorOffset,
  { source = "lexical" } = {},
) => {
  if (!$isTextNode(anchorNode) || $isMentionNode(anchorNode)) {
    return undefined;
  }

  const text = anchorNode.getTextContent();
  const offset = Math.max(
    0,
    Math.min(
      Number(anchorOffset) || 0,
      anchorNode.getTextContentSize?.() ?? text.length,
    ),
  );
  const beforeCaret = text.slice(0, offset);
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
    endOffset: offset,
    query,
    source,
  };
};

const normalizeMentionTarget = (target = {}) => {
  const label = String(target.label ?? "")
    .trim()
    .replace(/^[@/]+/, "");
  if (!label) {
    return undefined;
  }

  const mentionTarget = {
    id: String(target.id ?? label),
    label,
  };

  if (typeof target.variableType === "string" && target.variableType) {
    mentionTarget.variableType = target.variableType;
  }

  return mentionTarget;
};

const normalizeMentionTargets = (targets = []) => {
  const result = [];
  const seenIds = new Set();

  for (const target of Array.isArray(targets) ? targets : []) {
    const mentionTarget = normalizeMentionTarget(target);
    if (!mentionTarget || seenIds.has(mentionTarget.id)) {
      continue;
    }

    seenIds.add(mentionTarget.id);
    result.push(mentionTarget);
  }

  return result;
};

const areMentionTargetsEqual = (leftTargets = [], rightTargets = []) => {
  if (leftTargets.length !== rightTargets.length) {
    return false;
  }

  for (let index = 0; index < leftTargets.length; index += 1) {
    const left = leftTargets[index];
    const right = rightTargets[index];
    if (
      left?.id !== right?.id ||
      left?.label !== right?.label ||
      left?.variableType !== right?.variableType
    ) {
      return false;
    }
  }

  return true;
};

const hasReferenceContent = (lines = []) => {
  return cloneSceneEditorLines(lines).some((line) => {
    return getLineDialogueContent(line).some((item) => {
      return item?.reference || item?.mention;
    });
  });
};

const STYLES = `
  rvn-lexical-scene-document-editor {
    display: block;
    width: 100%;
    --left-gutter-width: ${LEFT_GUTTER_WIDTH_WITH_NUMBERS}px;
    --right-gutter-width: ${DEFAULT_RIGHT_GUTTER_WIDTH}px;
    --editor-inline-padding: 0px;
    --editor-top-padding: 0px;
    --scene-document-editor-font-size: ${EDITOR_FONT_SIZE_VALUES[DEFAULT_EDITOR_FONT_SIZE]};
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
    outline: none;
  }

  .editor {
    min-width: 0;
    width: 100%;
    max-width: 100%;
    outline: none;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--foreground);
    font-family: inherit;
    font-size: var(--scene-document-editor-font-size);
    font-weight: 400;
    line-height: 1.5;
    padding: 0 0 0 calc(var(--left-gutter-width) + var(--editor-inline-padding));
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
    caret-color: var(--primary);
  }

  .editor[data-rvn-reference-selection-active="true"] {
    caret-color: transparent;
  }

  .editor[data-rvn-reference-selection-active="true"]::selection,
  .editor[data-rvn-reference-selection-active="true"] *::selection {
    background: transparent;
    color: inherit;
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
    z-index: 1;
    pointer-events: none;
  }

  .gutter-left {
    left: 0;
    width: var(--left-gutter-width);
    pointer-events: auto;
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
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    pointer-events: auto;
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
    font-size: var(--scene-document-editor-font-size);
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
    cursor: pointer;
    pointer-events: auto;
    user-select: none;
    -webkit-user-select: none;
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

  .preview-color-swatch {
    position: relative;
    display: inline-flex;
    width: 28px;
    height: 18px;
    align-self: center;
    flex-shrink: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    background: transparent;
  }

  .preview-image-stack {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }

  .preview-image-stack rvn-stacked-file-images {
    display: block;
    flex-shrink: 0;
  }

  .preview-group-delete-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: var(--error);
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
    background: transparent;
    color: var(--error);
  }

  .preview-dialogue-item {
    align-items: center;
  }

  .preview-icon-delete-mark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--foreground);
    pointer-events: none;
  }

  .preview-dialogue-label {
    color: var(--muted-foreground);
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

  .editor [style*="--rvn-text-style-id"]:not(.mention-chip) {
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

  .editor [style*="--rvn-furigana-text"]:not(.mention-chip) {
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
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
  }

  .mention-chip[data-rvn-reference-selected="true"] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .placeholder {
    position: absolute;
    left: calc(var(--left-gutter-width) + var(--editor-inline-padding));
    top: 4px;
    color: var(--muted-foreground);
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

const isPlainSpaceKey = (event) => {
  return (
    !event?.ctrlKey &&
    !event?.metaKey &&
    !event?.altKey &&
    !event?.isComposing &&
    (event?.key === " " || event?.key === "Spacebar" || event?.code === "Space")
  );
};

const getEventTimestamp = (event) => {
  const timestamp = Number(event?.timeStamp);
  return Number.isFinite(timestamp) ? timestamp : undefined;
};

const getPrintableKeyText = (event) => {
  if (
    event?.ctrlKey ||
    event?.metaKey ||
    event?.isComposing ||
    event?.defaultPrevented
  ) {
    return undefined;
  }

  const key = String(event?.key ?? "");
  return [...key].length === 1 ? key : undefined;
};

const isInvisibleLineBoundarySelectionText = (text = "") => {
  const normalizedText = text
    .replaceAll(EDITOR_CARET_TEXT, "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n");
  const lineBreakCount = [...normalizedText].filter((character) => {
    return character === "\n";
  }).length;
  return normalizedText.replaceAll("\n", "") === "" && lineBreakCount <= 1;
};

const getTrailingWordSelectionRange = (text = "") => {
  const visibleText = text.replaceAll(EDITOR_CARET_TEXT, "");
  let end = visibleText.length;
  while (end > 0 && /\s/u.test(visibleText[end - 1])) {
    end -= 1;
  }

  if (end <= 0) {
    return { start: 0, end: 0 };
  }

  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" });
    let lastWordSegment;
    for (const segment of segmenter.segment(visibleText.slice(0, end))) {
      if (segment.isWordLike) {
        lastWordSegment = segment;
      }
    }

    if (lastWordSegment) {
      return {
        start: lastWordSegment.index,
        end: lastWordSegment.index + lastWordSegment.segment.length,
      };
    }
  }

  let start = end;
  while (start > 0 && !/\s/u.test(visibleText[start - 1])) {
    start -= 1;
  }

  return { start, end };
};

const isBlockModeNativeEditorKey = (event) => {
  if (event?.isComposing || event?.ctrlKey || event?.metaKey || event?.altKey) {
    return false;
  }

  const key = String(event?.key ?? "");
  return (
    Boolean(getPrintableKeyText(event)) ||
    key === "Backspace" ||
    key === "Delete" ||
    key === "Enter" ||
    key === "Tab" ||
    key === "ArrowLeft" ||
    key === "ArrowRight" ||
    key === "ArrowUp" ||
    key === "ArrowDown" ||
    key === "Home" ||
    key === "End" ||
    key === "PageUp" ||
    key === "PageDown"
  );
};

const containsDomNode = (container, node) => {
  if (!container?.contains || !node) {
    return false;
  }

  const nodeConstructor = globalThis.Node;
  if (
    typeof nodeConstructor === "function" &&
    !(node instanceof nodeConstructor)
  ) {
    return false;
  }

  return container.contains(node);
};

const isEditorOrSurfaceEventTarget = ({
  activeElement,
  event,
  editorElement,
  surfaceElement,
}) => {
  const eventPath = event?.composedPath?.() ?? [];
  const target = event?.target;
  return (
    activeElement === editorElement ||
    activeElement === surfaceElement ||
    containsDomNode(editorElement, activeElement) ||
    containsDomNode(surfaceElement, activeElement) ||
    target === editorElement ||
    target === surfaceElement ||
    containsDomNode(editorElement, target) ||
    containsDomNode(surfaceElement, target) ||
    eventPath.includes(editorElement) ||
    eventPath.includes(surfaceElement)
  );
};

const getElementDebugLabel = (element) => {
  if (!element) {
    return "";
  }

  if (element.nodeType === 3) {
    return "#text";
  }

  const elementConstructor = globalThis.Element;
  if (
    typeof elementConstructor !== "function" ||
    !(element instanceof elementConstructor)
  ) {
    return String(element.nodeName || typeof element);
  }

  const tagName = element.tagName?.toLowerCase?.() || "element";
  const id = element.id ? `#${element.id}` : "";
  const contentEditable = element.isContentEditable ? "[contenteditable]" : "";

  return `${tagName}${id}${contentEditable}`;
};

const createNewLineActions = () => {
  return {
    dialogue: {
      content: createEmptyContent(),
    },
  };
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
    actions: createNewLineActions(),
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
      selectionActive: true,
      hasPreviousSectionLine: false,
      hasNextSectionLine: false,
      showLineNumbers: true,
      fontSize: DEFAULT_EDITOR_FONT_SIZE,
      mode: "block",
      plainText: "",
      mentionTargets: [],
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
    this.referenceMenuTarget = undefined;
    this.selectedReferenceNodeKey = undefined;
    this.furiganaDialogIsPending = false;
    this.selectionMenuPosition = { x: "0", y: "0" };
    this.rightGutterWidth = DEFAULT_RIGHT_GUTTER_WIDTH;
    this.leftGutterRowsByLineId = new Map();
    this.rightGutterRowsByLineId = new Map();
    this.pendingSoftLineBreakBeforeInput = false;
    this.pendingParagraphSplitBeforeInput = false;
    this.pendingTextInputFallback = undefined;
    this.pendingTextInputFallbackTimerId = undefined;
    this.lastCommittedTextInputFallback = undefined;
    this.pendingFocusTarget = undefined;
    this.pendingHandledBackspaceKeyDown = undefined;
    this.programmaticFocusRestoreUntil = 0;
    this.lastProgrammaticFocusTarget = undefined;
    this.focusRestoreSequenceId = 0;
    this.isPointerDownInsideEditor = false;
    this.pointerDownInsideEditorTimerId = undefined;
    this.pendingPointerFallbackSelection = undefined;
    this.pendingBlockContextMenuSelectedLineId = undefined;
    this.pendingDefaultContextMenuLineId = undefined;
    this.verticalNavigationSelectionSyncId = 0;
    this.pendingVerticalNavigationSelectionSync = undefined;
    this.mentionMenuFocusRestoreTimerId = undefined;
    this.dismissedMentionTrigger = undefined;
    this.dismissedMentionTriggerScope = undefined;
    this.pendingTypedSlashMentionTrigger = undefined;
    this.pendingHandledPasteBeforeInput = false;

    this.editor = createEditor({
      namespace: "routevn-lexical-scene-document-editor",
      nodes: [MentionNode],
      onError: () => undefined,
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
    this.handleNativeInput = this.handleNativeInput.bind(this);
    this.handleWindowKeyDownCapture =
      this.handleWindowKeyDownCapture.bind(this);
    this.handleNativeDragEvent = this.handleNativeDragEvent.bind(this);
    this.handleNativeMouseDown = this.handleNativeMouseDown.bind(this);
    this.handleNativeMouseUp = this.handleNativeMouseUp.bind(this);
    this.handleLeftGutterMouseDown = this.handleLeftGutterMouseDown.bind(this);
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
    this.refs.mentionMenu.render?.();
    this.syncMentionMenuPopover();
    this.editor.setRootElement(this.refs.editor);

    this.unregister = mergeRegister(
      registerRichText(this.editor),
      registerHistory(this.editor, createEmptyHistoryState(), 300),
      this.editor.registerUpdateListener(({ editorState }) => {
        this.syncFromEditorState(editorState);
      }),
      this.editor.registerCommand(
        UNDO_COMMAND,
        () => true,
        COMMAND_PRIORITY_CRITICAL,
      ),
      this.editor.registerCommand(
        REDO_COMMAND,
        () => true,
        COMMAND_PRIORITY_CRITICAL,
      ),
      this.editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          if (event?.isComposing || this.isComposing) {
            return false;
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
        KEY_ESCAPE_COMMAND,
        (event) => {
          if (!this.state.mentionMenu.isOpen) {
            return false;
          }

          event?.preventDefault?.();
          this.handleMentionMenuClose();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
      this.editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          event?.preventDefault?.();
          event?.stopPropagation?.();
          event?.stopImmediatePropagation?.();
          this.handlePasteEvent(event);
          this.pendingHandledPasteBeforeInput = true;
          requestAnimationFrame(() => {
            this.pendingHandledPasteBeforeInput = false;
          });
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );

    this.refs.editor.addEventListener("focus", this.handleNativeFocus);
    this.refs.editor.addEventListener("blur", this.handleNativeBlur);
    this.refs.editor.addEventListener("keydown", this.handleNativeKeyDown);
    this.refs.editor.addEventListener("input", this.handleNativeInput, true);
    window.addEventListener("keydown", this.handleWindowKeyDownCapture, true);
    this.refs.editor.addEventListener(
      "mousedown",
      this.handleNativeMouseDown,
      true,
    );
    this.refs.editor.addEventListener("mouseup", this.handleNativeMouseUp);
    this.refs.leftGutter.addEventListener(
      "mousedown",
      this.handleLeftGutterMouseDown,
      true,
    );
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
  }

  disconnectedCallback() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = 0;
    }

    this.refs.editor?.removeEventListener("focus", this.handleNativeFocus);
    this.refs.editor?.removeEventListener("blur", this.handleNativeBlur);
    this.refs.editor?.removeEventListener("keydown", this.handleNativeKeyDown);
    this.refs.editor?.removeEventListener(
      "input",
      this.handleNativeInput,
      true,
    );
    window.removeEventListener(
      "keydown",
      this.handleWindowKeyDownCapture,
      true,
    );
    this.refs.editor?.removeEventListener(
      "mousedown",
      this.handleNativeMouseDown,
      true,
    );
    this.refs.editor?.removeEventListener("mouseup", this.handleNativeMouseUp);
    this.refs.leftGutter?.removeEventListener(
      "mousedown",
      this.handleLeftGutterMouseDown,
      true,
    );
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
    this.clearPendingTextInputFallback();
    this.clearPendingHandledBackspaceKeyDown();
    this.clearMentionMenuFocusRestore();
    this.pendingFocusTarget = undefined;
    this.pendingVerticalNavigationSelectionSync = undefined;
    this.verticalNavigationSelectionSyncId += 1;
    this.clearPointerDownInsideEditor();

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

  set mentionTargets(value) {
    const nextMentionTargets = normalizeMentionTargets(value);
    if (areMentionTargetsEqual(this.state.mentionTargets, nextMentionTargets)) {
      return;
    }

    this.state.mentionTargets = nextMentionTargets;
    this.refreshReferenceLabels();
  }

  get mentionTargets() {
    return normalizeMentionTargets(this.state.mentionTargets);
  }

  set selectedLineId(value) {
    const nextSelectedLineId =
      typeof value === "string" &&
      value.length > 0 &&
      !isSectionEditorSelectedLineIdBindingFallback(value)
        ? value
        : undefined;
    const previousSelectedLineId = this.state.selectedLineId;
    if (previousSelectedLineId !== nextSelectedLineId) {
      this.invalidatePendingFocusRestore();
    }
    this.state.selectedLineId = nextSelectedLineId;

    if (!nextSelectedLineId) {
      this.isEditorFocused = false;
      this.lastProgrammaticFocusTarget = undefined;
      this.pendingFocusTarget = undefined;
      this.programmaticFocusRestoreUntil = 0;
      this.pendingSelectionSnapshot = undefined;
      this.hideSelectionPopover();
      this.closeMentionMenu();
    }

    if (!this.isConnected || !this.refs.editor) {
      return;
    }

    if (!nextSelectedLineId) {
      this.applyModeState("block");
    }

    this.scheduleRender();
  }

  get selectedLineId() {
    return this.state.selectedLineId;
  }

  set selectionActive(value) {
    const nextSelectionActive = value !== false && value !== "false";
    if (this.state.selectionActive === nextSelectionActive) {
      return;
    }

    this.state.selectionActive = nextSelectionActive;
    if (!nextSelectionActive) {
      this.isEditorFocused = false;
      this.lastProgrammaticFocusTarget = undefined;
      this.pendingFocusTarget = undefined;
      this.programmaticFocusRestoreUntil = 0;
      this.pendingSelectionSnapshot = undefined;
      this.invalidatePendingFocusRestore();
      this.applyModeState("block");
      this.clearRenderedSelectionState();
      this.hideSelectionPopover();
      this.closeMentionMenu();
    }

    if (!this.isConnected || !this.refs.editor) {
      return;
    }

    this.scheduleRender();
  }

  get selectionActive() {
    return this.state.selectionActive !== false;
  }

  set hasPreviousSectionLine(value) {
    this.state.hasPreviousSectionLine = value === true || value === "true";
  }

  get hasPreviousSectionLine() {
    return this.state.hasPreviousSectionLine === true;
  }

  set hasNextSectionLine(value) {
    this.state.hasNextSectionLine = value === true || value === "true";
  }

  get hasNextSectionLine() {
    return this.state.hasNextSectionLine === true;
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

  set fontSize(value) {
    this.state.fontSize = normalizeEditorFontSize(value);
    if (!this.isConnected || !this.refs.editor) {
      return;
    }
    this.scheduleRender();
  }

  get fontSize() {
    return this.state.fontSize;
  }

  setMode(mode) {
    const nextMode = mode === "text-editor" ? "text-editor" : "block";
    this.applyModeState(nextMode);

    if (this.state.mode !== "block") {
      this.awaitingCharacterShortcut = false;
      this.clearDeleteShortcutState();
    }

    this.scheduleRender();
  }

  applyModeState(mode) {
    const nextMode = mode === "text-editor" ? "text-editor" : "block";
    this.state.mode = nextMode;
    this.dataset.mode = nextMode;
    if (this.refs.surface) {
      this.refs.surface.dataset.mode = nextMode;
    }
    if (this.refs.editor) {
      this.refs.editor.dataset.mode = nextMode;
    }
  }

  focus(options = {}) {
    this.refs.editor?.focus(options);
  }

  restoreLineSelection(payload = {}) {
    const { lineId, cursorPosition } = payload;
    const lineKey = this.lineKeyById.get(lineId);
    if (!lineKey) {
      return false;
    }

    const lineElement = this.editor.getElementByKey(lineKey);
    if (!lineElement || !this.refs?.editor) {
      return false;
    }

    const targetPosition =
      typeof cursorPosition === "number"
        ? cursorPosition < 0
          ? this.getLineVisibleTextLength(lineElement)
          : cursorPosition
        : this.getLineVisibleTextLength(lineElement);

    const { range, actualPosition } = createCollapsedRangeAtPosition(
      lineElement,
      targetPosition,
    );
    this.editor.update(
      () => {
        const lineNode = $getNodeByKey(lineKey);
        if (!lineNode) {
          return;
        }

        applySelectionToLineNode(lineNode, {
          lineId,
          start: actualPosition,
          end: actualPosition,
        });
      },
      { discrete: true },
    );
    setSelectionFromRange(this.refs.editor, range);
    scrollElementIntoNearestScrollableView(lineElement, {
      behavior: "auto",
      block: "nearest",
    });
    return true;
  }

  focusLine(payload = {}) {
    const { lineId, cursorPosition } = payload;
    const lineKey = this.lineKeyById.get(lineId);
    if (!lineKey) {
      return false;
    }

    this.state.selectedLineId = lineId;
    this.isEditorFocused = true;
    this.applyModeState("text-editor");
    this.awaitingCharacterShortcut = false;
    this.clearDeleteShortcutState();
    this.markProgrammaticFocusRestore({
      lineId,
      cursorPosition,
    });
    this.focus({ preventScroll: true });
    const didRestoreSelection = this.restoreLineSelection(payload);
    if (!didRestoreSelection) {
      return false;
    }

    this.markProgrammaticFocusRestore({
      lineId,
      cursorPosition,
    });
    this.restoreLineSelectionAfterLexicalFocus(payload);
    return true;
  }

  restoreLineSelectionAfterLexicalFocus(payload = {}) {
    const focusRestoreSequenceId = this.advanceFocusRestoreSequence();
    this.markProgrammaticFocusRestore(payload);
    const restoreSelection = () => {
      if (!this.isConnected) {
        return;
      }

      if (this.focusRestoreSequenceId !== focusRestoreSequenceId) {
        return;
      }

      if (
        this.state &&
        (this.state.selectedLineId !== payload.lineId ||
          this.state.mode !== "text-editor" ||
          this.isEditorFocused !== true)
      ) {
        return;
      }

      const nativeSelection = this.getNativeLineSelectionContext();
      if (this.shouldSkipAsyncLineSelectionRestore(payload, nativeSelection)) {
        return;
      }

      this.markProgrammaticFocusRestore(payload);
      if (!this.isEditorActiveElement()) {
        this.focus({ preventScroll: true });
      }
      this.restoreLineSelection(payload);
    };

    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(restoreSelection);
      return;
    }

    queueMicrotask(restoreSelection);
  }

  shouldSkipAsyncLineSelectionRestore(payload = {}, nativeSelection) {
    if (payload.forceRestore === true) {
      return false;
    }

    if (!nativeSelection?.lineId) {
      return false;
    }

    if (nativeSelection.lineId !== payload.lineId) {
      return true;
    }

    if (
      nativeSelection.start !== nativeSelection.end ||
      typeof nativeSelection.start !== "number" ||
      typeof payload.cursorPosition !== "number" ||
      payload.cursorPosition < 0
    ) {
      return false;
    }

    return nativeSelection.start !== payload.cursorPosition;
  }

  focusContainer({ scrollLine = true } = {}) {
    const selectedLineId = this.state.selectedLineId || this.state.lines[0]?.id;
    this.enterBlockMode({
      focusSurface: true,
      lineId: selectedLineId,
      emitSelectionChange: false,
      scrollLine,
    });
  }

  blurEditor({ lineId = this.state.selectedLineId } = {}) {
    this.clearPointerDownInsideEditor();
    this.lastProgrammaticFocusTarget = undefined;
    this.programmaticFocusRestoreUntil = 0;
    this.invalidatePendingFocusRestore();
    this.refs?.editor?.blur?.();
    this.refs?.surface?.blur?.();
    this.blur?.();
    this.isEditorFocused = false;
    this.hideSelectionPopover();
    this.closeMentionMenu({
      dismissCurrentTrigger: this.state.mentionMenu?.isOpen === true,
    });
    this.pendingSelectionSnapshot = undefined;
    this.enterBlockMode({
      focusSurface: false,
      emitSelectionChange: false,
      lineId,
      scrollLine: false,
    });
  }

  scrollLineIntoView({ lineId, behavior = "auto", block = "nearest" } = {}) {
    const lineKey = this.lineKeyById.get(lineId);
    const lineElement = lineKey
      ? this.editor.getElementByKey(lineKey)
      : undefined;
    scrollElementIntoNearestScrollableView(lineElement, {
      behavior,
      block,
    });
  }

  revealCurrentSelection({ behavior = "auto", direction } = {}) {
    const range = getSelectionRange(this.refs?.editor);
    const nativeSelection = this.getNativeLineSelectionContext(range);
    const lineKey = nativeSelection?.lineId
      ? this.lineKeyById.get(nativeSelection.lineId)
      : undefined;
    const lineElement = lineKey
      ? this.editor.getElementByKey(lineKey)
      : undefined;
    const rangeRect = range?.getBoundingClientRect?.();
    const lineRect = lineElement?.getBoundingClientRect?.();
    const targetRect = isUsableClientRect(rangeRect) ? rangeRect : lineRect;
    const anchorElement = lineElement ?? this.refs?.editor;
    const lineHeight = Math.max(0, Number(lineRect?.height) || 0);
    const paddingTop =
      direction === "up" ? 12 + Math.round(lineHeight * 1.5) : 12;
    const obscuredBottomInset = getViewportObscuredBottomInset();
    const keyboardToolbarInset =
      obscuredBottomInset > 0 ? MOBILE_KEYBOARD_TOOLBAR_HEIGHT_PX : 0;
    const paddingBottom =
      direction === "down"
        ? Math.max(
            112,
            obscuredBottomInset +
              keyboardToolbarInset +
              12 +
              Math.round(lineHeight * 0.5),
          )
        : 112;

    return scrollRectIntoNearestScrollableView(anchorElement, targetRect, {
      behavior,
      block: "nearest",
      paddingTop,
      paddingBottom,
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
    scrollLine = true,
  } = {}) {
    this.clearPendingTextInputFallback();
    this.lastProgrammaticFocusTarget = undefined;
    this.programmaticFocusRestoreUntil = 0;
    this.clearSelectedReferenceNodeKey();

    if (lineId) {
      this.state.selectedLineId = lineId;
      if (scrollLine) {
        this.scrollLineIntoView({ lineId });
      }
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
        if (!this.isConnected) {
          return;
        }

        this.isEditorFocused = true;
        this.applyModeState("block");
        this.focus({ preventScroll: true });
      });
    }
  }

  enterTextMode({ lineId, cursorPosition } = {}) {
    if (!lineId) {
      return;
    }

    const target = {
      lineId,
      cursorPosition,
    };
    this.state.selectedLineId = lineId;
    this.isEditorFocused = true;
    this.applyModeState("text-editor");
    this.awaitingCharacterShortcut = false;
    this.clearDeleteShortcutState();
    this.markProgrammaticFocusRestore(target);
    this.focus({ preventScroll: true });

    this.restoreLineSelection(target);
    this.restoreLineSelectionAfterLexicalFocus(target);

    requestAnimationFrame(() => {
      if (!this.isConnected) {
        return;
      }

      this.restoreTextEditorFocusState();
      this.markProgrammaticFocusRestore(target);
      if (!this.isEditorActiveElement()) {
        this.focus({ preventScroll: true });
      }
      this.restoreLineSelection(target);
      this.scheduleRender();
      this.dispatchSelectedLineChanged(lineId, {
        cursorPosition: cursorPosition >= 0 ? cursorPosition : undefined,
        isCollapsed: true,
        mode: "text-editor",
      });
    });

    this.scheduleRender();
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
    const navigationDirection =
      delta > 0 ? "down" : delta < 0 ? "up" : undefined;
    const isBoundaryNavigation = delta !== 0 && nextIndex === currentIndex;

    if (!nextLineId) {
      return;
    }

    const selectionDetail = {
      cursorPosition: undefined,
      isCollapsed: false,
      mode: "block",
    };
    if (navigationDirection) {
      selectionDetail.navigationDirection = navigationDirection;
    }
    if (isBoundaryNavigation) {
      selectionDetail.isBoundaryNavigation = true;
    }

    this.state.selectedLineId = nextLineId;
    this.scheduleRender();
    this.scrollLineIntoView({ lineId: nextLineId });
    this.dispatchSelectedLineChanged(nextLineId, selectionDetail);
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

  canDispatchDomEvents() {
    try {
      return (
        this.isConnected === true && typeof this.dispatchEvent === "function"
      );
    } catch {
      return false;
    }
  }

  getNativeSelectionDebug() {
    const range = getSelectionRange(this.refs?.editor);
    if (!range) {
      return {
        hasRange: false,
      };
    }

    const lineElement = this.getLineElementFromRangePoint(
      range.startContainer,
      range.startOffset,
    );
    const lineOffset = this.getLineOffsetFromRange(lineElement, range);

    return {
      hasRange: true,
      collapsed: range.collapsed,
      startContainer: getElementDebugLabel(range.startContainer),
      startOffset: range.startOffset,
      endContainer: getElementDebugLabel(range.endContainer),
      endOffset: range.endOffset,
      lineId: this.getLineIdFromLineElement(lineElement),
      lineOffset,
      text: range.toString(),
    };
  }

  getLexicalSelectionDebug(selection) {
    if (!selection) {
      return {
        hasSelection: false,
      };
    }

    if (!$isRangeSelection(selection)) {
      return {
        hasSelection: true,
        isRangeSelection: false,
      };
    }

    const anchorNode = selection.anchor.getNode();
    const focusNode = selection.focus.getNode();
    const lineNode = this.getLineNodeFromSelection(selection);
    const lineMeta = this.lineMetaByKey.get(lineNode?.getKey());

    return {
      hasSelection: true,
      isRangeSelection: true,
      isCollapsed: selection.isCollapsed(),
      anchorKey: selection.anchor.key,
      anchorOffset: selection.anchor.offset,
      anchorType: selection.anchor.type,
      anchorNodeType: anchorNode?.getType?.(),
      anchorText: $isTextNode(anchorNode)
        ? anchorNode.getTextContent()
        : undefined,
      focusKey: selection.focus.key,
      focusOffset: selection.focus.offset,
      focusType: selection.focus.type,
      focusNodeType: focusNode?.getType?.(),
      lineKey: lineNode?.getKey?.(),
      lineId: lineMeta?.id,
      lineText: lineNode?.getTextContent?.(),
      lineSelection: lineNode
        ? getSelectionOffsets(lineNode, selection)
        : undefined,
    };
  }

  markPointerDownInsideEditor() {
    this.clearPointerDownInsideEditor();
    this.isPointerDownInsideEditor = true;
    this.pointerDownInsideEditorTimerId = setTimeout(() => {
      this.clearPointerDownInsideEditor();
    }, 1000);
  }

  clearPointerDownInsideEditor() {
    this.isPointerDownInsideEditor = false;
    this.pendingPointerFallbackSelection = undefined;

    if (this.pointerDownInsideEditorTimerId !== undefined) {
      clearTimeout(this.pointerDownInsideEditorTimerId);
      this.pointerDownInsideEditorTimerId = undefined;
    }
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

    if (this.state.mode === "block" && !this.isPointerDownInsideEditor) {
      this.applyModeState("block");
      return;
    }

    this.restoreTextEditorFocusState();
  }

  handleNativeBlur(event) {
    if (this.isEditorActiveElement()) {
      this.restoreEditorFocusState();
      this.restoreLastProgrammaticFocusTarget();
      return;
    }

    if (this.isWithinProgrammaticFocusRestoreWindow()) {
      this.restoreTextEditorFocusState();
      this.restoreLastProgrammaticFocusTarget();
      return;
    }

    if (this.shouldRestoreProgrammaticBodyBlur()) {
      this.restoreTextEditorFocusState();
      this.restoreLastProgrammaticFocusTarget();
      return;
    }

    if (this.isPointerDownInsideEditor) {
      setTimeout(() => {
        this.clearPointerDownInsideEditor();
        if (!this.isConnected) {
          return;
        }

        this.isEditorFocused = true;
        this.setMode("text-editor");
        this.focus({ preventScroll: true });

        const range = getSelectionRange(this.refs.editor);
        const lineId = this.getLineIdFromRange(range);
        if (lineId) {
          this.state.selectedLineId = lineId;
          this.scheduleRender();
        }
      }, 0);
      return;
    }

    if (this.selectionMenuIsOpen || this.furiganaDialogIsPending) {
      return;
    }

    if (this.state.mentionMenu?.isOpen) {
      const relatedTarget = event?.relatedTarget;
      if (this.isMentionMenuFocusTarget(relatedTarget)) {
        this.refs.mentionMenu.open = true;
        this.syncMentionMenuPopover();
        return;
      }
    }

    if (this.state.mentionMenu?.isOpen && this.hasActiveMentionTrigger()) {
      setTimeout(() => {
        if (!this.isConnected || !this.state.mentionMenu.isOpen) {
          return;
        }

        if (this.refs.editor?.contains(document.activeElement)) {
          return;
        }

        if (this.isMentionMenuFocusTarget(document.activeElement)) {
          this.syncMentionMenuPopover();
          return;
        }

        this.commitNativeBlur();
      }, 0);
      return;
    }

    this.commitNativeBlur();
  }

  commitNativeBlur() {
    if (this.isEditorActiveElement()) {
      this.restoreEditorFocusState();
      this.restoreLastProgrammaticFocusTarget();
      return;
    }

    if (this.isWithinProgrammaticFocusRestoreWindow()) {
      this.restoreTextEditorFocusState();
      this.restoreLastProgrammaticFocusTarget();
      return;
    }

    if (this.shouldRestoreProgrammaticBodyBlur()) {
      this.restoreTextEditorFocusState();
      this.restoreLastProgrammaticFocusTarget();
      return;
    }

    this.isEditorFocused = false;
    this.hideSelectionPopover();
    this.closeMentionMenu({
      dismissCurrentTrigger: this.state.mentionMenu?.isOpen === true,
    });
    this.pendingSelectionSnapshot = undefined;
    this.enterBlockMode({
      focusSurface: false,
      emitSelectionChange: false,
      lineId: this.state.selectedLineId,
      // Blur can fire while section editors mount. Sync block state without
      // scrolling, so scene entry stays pinned to the target section start.
      scrollLine: false,
    });
    this.dispatchEvent(
      new CustomEvent("editor-blur", {
        detail: {},
        bubbles: true,
      }),
    );
  }

  getActiveElement() {
    const root = this.refs?.editor?.getRootNode?.();
    return (
      root?.activeElement ||
      (typeof document === "undefined" ? undefined : document.activeElement)
    );
  }

  isEditorActiveElement() {
    const editorElement = this.refs?.editor;
    const activeElement = this.getActiveElement();
    return (
      activeElement === editorElement || editorElement?.contains(activeElement)
    );
  }

  isBodyActiveElement() {
    const activeElement = this.getActiveElement();
    return (
      activeElement === document.body ||
      activeElement === document.documentElement
    );
  }

  shouldRestoreProgrammaticBodyBlur() {
    return (
      this.state.mode === "text-editor" &&
      this.lastProgrammaticFocusTarget?.lineId &&
      this.isBodyActiveElement()
    );
  }

  restoreEditorFocusState() {
    this.isEditorFocused = true;
    this.applyModeState(this.state.mode);
  }

  restoreTextEditorFocusState() {
    this.isEditorFocused = true;
    this.applyModeState("text-editor");
  }

  getNow() {
    return typeof globalThis.performance?.now === "function"
      ? globalThis.performance.now()
      : Date.now();
  }

  markProgrammaticFocusRestore(focusTarget = {}) {
    this.lastProgrammaticFocusTarget = focusTarget?.lineId
      ? {
          lineId: focusTarget.lineId,
          cursorPosition: focusTarget.cursorPosition,
        }
      : undefined;
    this.programmaticFocusRestoreUntil =
      this.getNow() + PROGRAMMATIC_FOCUS_BLUR_SUPPRESS_MS;
  }

  isWithinProgrammaticFocusRestoreWindow() {
    return this.getNow() <= this.programmaticFocusRestoreUntil;
  }

  advanceFocusRestoreSequence() {
    this.focusRestoreSequenceId = (this.focusRestoreSequenceId ?? 0) + 1;
    return this.focusRestoreSequenceId;
  }

  invalidatePendingFocusRestore() {
    return this.advanceFocusRestoreSequence();
  }

  restoreLastProgrammaticFocusTarget() {
    const focusTarget = this.lastProgrammaticFocusTarget;
    if (!focusTarget?.lineId || typeof requestAnimationFrame !== "function") {
      return;
    }

    requestAnimationFrame(() => {
      if (!this.isConnected) {
        return;
      }

      if (this.lastProgrammaticFocusTarget !== focusTarget) {
        return;
      }

      if (!this.hasLine(focusTarget.lineId)) {
        this.lastProgrammaticFocusTarget = undefined;
        this.programmaticFocusRestoreUntil = 0;
        return;
      }

      this.focusLine(focusTarget);
    });
  }

  suppressBlockModeNativeEditorKey(event) {
    if (!isBlockModeNativeEditorKey(event)) {
      return false;
    }

    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
    return true;
  }

  handleNativeKeyDown(event) {
    this.hideSelectionPopover();
    const key = String(event.key ?? "").toLowerCase();

    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.isComposing &&
      (key === "z" || key === "y")
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return;
    }

    if (this.state?.mode === "block") {
      const didHandleBlockKey = this.handleSurfaceKeyDown(event);
      if (!didHandleBlockKey) {
        this.suppressBlockModeNativeEditorKey(event);
      }
      return;
    }

    if (this.handleImmediateTextModeVerticalBoundaryNavigation(event)) {
      return;
    }

    this.scheduleNativeSelectionLineSyncAfterVerticalNavigation(event);
    if (this.state?.mentionMenu?.isOpen && isArrowKeyEvent(event)) {
      this.closeMentionMenu({ dismissCurrentTrigger: true });
    }
    this.updatePendingTextInputFallback(event);

    if (this.handleReferenceArrowNavigation(event)) {
      return;
    }

    if (
      event.key !== "ArrowLeft" &&
      event.key !== "ArrowRight" &&
      event.key !== "Backspace"
    ) {
      this.clearSelectedReferenceNodeKey();
    }

    if (event.key === "Escape" && !event.isComposing) {
      if (this.state.mentionMenu.isOpen) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      this.enterBlockMode({
        focusSurface: true,
        lineId: this.state.selectedLineId || this.getSelectedLineIdSnapshot(),
        emitSelectionChange: true,
      });
      return;
    }

    if (
      event.key === "Backspace" &&
      !event.isComposing &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      this.invalidatePendingFocusRestore();

      const nativeSelection = this.getNativeLineSelectionContext();
      const nativeLineRangeSelection = nativeSelection?.lineId
        ? undefined
        : this.getNativeLineRangeSelectionContext();
      if (!nativeSelection?.lineId && !nativeLineRangeSelection?.isMultiLine) {
        return;
      }

      if (event.defaultPrevented) {
        const didHandleDefaultPreventedReference =
          nativeSelection?.lineId || this.selectedReferenceNodeKey
            ? this.handleBackspaceReferenceDelete({
                lineId: nativeSelection?.lineId,
                start: nativeSelection?.start,
                end: nativeSelection?.end,
              })
            : false;
        if (didHandleDefaultPreventedReference) {
          event.stopPropagation();
          event.stopImmediatePropagation?.();
          this.markHandledBackspaceKeyDown(event);
        }
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const didHandle = this.handleBackspaceDelete({
        nativeSelection,
        nativeLineRangeSelection,
      });
      if (didHandle) {
        this.markHandledBackspaceKeyDown(event);
      }
    }
  }

  handleNativeInput() {
    this.clearPendingTextInputFallback();
  }

  getTextModeVerticalNavigationDirection(event) {
    return event.key === "ArrowUp"
      ? "up"
      : event.key === "ArrowDown"
        ? "down"
        : undefined;
  }

  hasAdjacentSectionLineForVerticalNavigation(direction) {
    return direction === "up"
      ? this.state.hasPreviousSectionLine === true
      : this.state.hasNextSectionLine === true;
  }

  handleImmediateTextModeVerticalBoundaryNavigation(event) {
    const navigationDirection =
      this.getTextModeVerticalNavigationDirection(event);
    if (
      this.state?.mode !== "text-editor" ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      !navigationDirection ||
      !this.hasAdjacentSectionLineForVerticalNavigation(navigationDirection)
    ) {
      return false;
    }

    const nativeSelection = this.getNativeLineSelectionContext();
    const lineId = nativeSelection?.lineId || this.state.selectedLineId;
    if (
      !this.isTextModeVerticalNavigationBoundary(lineId, navigationDirection)
    ) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    if (this.state?.mentionMenu?.isOpen && isArrowKeyEvent(event)) {
      this.closeMentionMenu({ dismissCurrentTrigger: true });
    }
    this.dispatchTextModeVerticalBoundaryNavigation({
      lineId,
      nativeSelection,
      direction: navigationDirection,
    });
    return true;
  }

  scheduleNativeSelectionLineSyncAfterVerticalNavigation(event) {
    const navigationDirection =
      this.getTextModeVerticalNavigationDirection(event);
    if (
      this.state?.mode !== "text-editor" ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !navigationDirection ||
      typeof requestAnimationFrame !== "function"
    ) {
      return;
    }

    const initialNativeSelection = this.getNativeLineSelectionContext();
    const pendingSync = this.pendingVerticalNavigationSelectionSync;
    if (
      pendingSync?.direction === navigationDirection &&
      pendingSync.selectedLineId === this.state.selectedLineId &&
      areNativeLineSelectionContextsEqual(
        pendingSync.initialNativeSelection,
        initialNativeSelection,
      )
    ) {
      return;
    }

    const syncId = (this.verticalNavigationSelectionSyncId ?? 0) + 1;
    this.verticalNavigationSelectionSyncId = syncId;
    this.pendingVerticalNavigationSelectionSync = {
      syncId,
      direction: navigationDirection,
      selectedLineId: this.state.selectedLineId,
      initialNativeSelection,
    };
    const clearPendingSync = () => {
      if (this.pendingVerticalNavigationSelectionSync?.syncId === syncId) {
        this.pendingVerticalNavigationSelectionSync = undefined;
      }
    };
    const syncNativeSelectionLine = (framesRemaining) => {
      requestAnimationFrame(() => {
        if (this.verticalNavigationSelectionSyncId !== syncId) {
          return;
        }

        if (!this.isConnected || this.state?.mode !== "text-editor") {
          clearPendingSync();
          return;
        }

        const nativeSelection = this.getNativeLineSelectionContext();
        const lineId = nativeSelection?.lineId;
        if (!lineId || lineId === this.state.selectedLineId) {
          const didMoveWithinCurrentLine =
            lineId &&
            initialNativeSelection?.lineId === lineId &&
            (nativeSelection.start !== initialNativeSelection.start ||
              nativeSelection.end !== initialNativeSelection.end);
          if (didMoveWithinCurrentLine) {
            this.revealCurrentSelection({
              behavior: "auto",
              direction: navigationDirection,
            });
            clearPendingSync();
            return;
          }

          if (framesRemaining > 1) {
            syncNativeSelectionLine(framesRemaining - 1);
            return;
          }

          this.dispatchTextModeVerticalBoundaryNavigation({
            lineId,
            nativeSelection,
            direction: navigationDirection,
          });
          clearPendingSync();
          return;
        }

        this.state.selectedLineId = lineId;
        this.scheduleRender();
        this.dispatchSelectedLineChanged(lineId, {
          cursorPosition: nativeSelection.start,
          isCollapsed: nativeSelection.start === nativeSelection.end,
          mode: "text-editor",
        });
        this.revealCurrentSelection({
          behavior: "auto",
          direction: navigationDirection,
        });
        clearPendingSync();
      });
    };

    syncNativeSelectionLine(VERTICAL_NAVIGATION_SELECTION_SYNC_FRAMES);
  }

  dispatchTextModeVerticalBoundaryNavigation({
    lineId,
    nativeSelection,
    direction,
  } = {}) {
    if (!this.isTextModeVerticalNavigationBoundary(lineId, direction)) {
      return false;
    }

    this.dispatchSelectedLineChanged(lineId, {
      cursorPosition: nativeSelection?.start,
      isCollapsed: nativeSelection?.start === nativeSelection?.end,
      mode: "text-editor",
      navigationDirection: direction,
      isBoundaryNavigation: true,
    });
    return true;
  }

  isTextModeVerticalNavigationBoundary(lineId, direction) {
    return this.getTextModeVerticalNavigationBoundaryInfo(lineId, direction)
      .isBoundary;
  }

  getTextModeVerticalNavigationBoundaryInfo(lineId, direction) {
    if (!lineId || (direction !== "up" && direction !== "down")) {
      return {
        isBoundary: false,
        lineIndex: -1,
        lineCount: 0,
      };
    }

    const lines = Array.isArray(this.state?.lines) ? this.state.lines : [];
    const lineIndex = lines.findIndex((line) => line?.id === lineId);
    if (lineIndex < 0) {
      return {
        isBoundary: false,
        lineIndex,
        lineCount: lines.length,
        firstLineId: lines[0]?.id,
        lastLineId: lines.at(-1)?.id,
      };
    }

    return {
      isBoundary:
        direction === "up" ? lineIndex === 0 : lineIndex === lines.length - 1,
      lineIndex,
      lineCount: lines.length,
      firstLineId: lines[0]?.id,
      lastLineId: lines.at(-1)?.id,
    };
  }

  handleWindowKeyDownCapture(event) {
    if (this.handleTextModeWindowEscape(event)) {
      return;
    }

    if (this.handleBlockModeWindowShortcut(event)) {
      return;
    }

    if (this.handleBlockModeWindowArrowNavigation(event)) {
      return;
    }

    this.handleBlockModeWindowEnter(event);
  }

  handleTextModeWindowEscape(event) {
    if (
      event.defaultPrevented ||
      event.key !== "Escape" ||
      event.isComposing ||
      this.state.mode !== "text-editor"
    ) {
      return false;
    }

    const isTextModeTarget = isEditorOrSurfaceEventTarget({
      activeElement: this.getActiveElement(),
      event,
      editorElement: this.refs.editor,
      surfaceElement: this.refs.surface,
    });
    if (!isTextModeTarget) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.hideSelectionPopover();

    if (this.state.mentionMenu.isOpen) {
      this.handleMentionMenuClose();
      return true;
    }

    this.enterBlockMode({
      focusSurface: true,
      lineId: this.state.selectedLineId || this.getSelectedLineIdSnapshot(),
      emitSelectionChange: true,
    });
    return true;
  }

  handleBlockModeWindowShortcut(event) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      this.state.mode !== "block"
    ) {
      return false;
    }

    const activeElement = this.getActiveElement();
    const target = event.target;
    const isDocumentKeyTarget =
      (activeElement === document.body ||
        activeElement === document.documentElement ||
        activeElement === this) &&
      (target === document.body ||
        target === document.documentElement ||
        target === document ||
        target === window ||
        target === this);
    const isEditorKeyTarget = isEditorOrSurfaceEventTarget({
      activeElement,
      event,
      editorElement: this.refs.editor,
      surfaceElement: this.refs.surface,
    });

    if (!isDocumentKeyTarget && !isEditorKeyTarget) {
      return false;
    }

    const didHandle = this.handleSurfaceKeyDown(event);
    if (!didHandle) {
      return false;
    }

    event.stopImmediatePropagation?.();
    return true;
  }

  handleBlockModeWindowArrowNavigation(event) {
    const navigationDelta = (() => {
      if (event.key === "ArrowUp" || event.key === "k" || event.key === "K") {
        return -1;
      }

      if (event.key === "ArrowDown" || event.key === "j" || event.key === "J") {
        return 1;
      }

      return undefined;
    })();

    if (
      event.defaultPrevented ||
      navigationDelta === undefined ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      this.state.mode !== "block"
    ) {
      return false;
    }

    const activeElement = this.getActiveElement();
    const target = event.target;
    const isBodyKeyTarget =
      (activeElement === document.body ||
        activeElement === document.documentElement) &&
      (target === document.body || target === document.documentElement);
    if (!isBodyKeyTarget) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.moveBlockSelection(navigationDelta);
    return true;
  }

  handleBlockModeWindowEnter(event) {
    if (
      event.defaultPrevented ||
      event.key !== "Enter" ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.shiftKey ||
      this.state.mode !== "block"
    ) {
      return false;
    }

    const isBlockModeTarget = isEditorOrSurfaceEventTarget({
      activeElement: this.getActiveElement(),
      event,
      editorElement: this.refs.editor,
      surfaceElement: this.refs.surface,
    });
    if (!isBlockModeTarget) {
      return false;
    }

    const currentLineId = this.state.selectedLineId || this.state.lines[0]?.id;
    if (!currentLineId) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.enterTextMode({
      lineId: currentLineId,
      cursorPosition: -1,
    });
    return true;
  }

  clearPendingTextInputFallback() {
    if (this.pendingTextInputFallbackTimerId !== undefined) {
      clearTimeout(this.pendingTextInputFallbackTimerId);
      this.pendingTextInputFallbackTimerId = undefined;
    }
    this.pendingTextInputFallback = undefined;
  }

  updatePendingTextInputFallback(event) {
    const text = getPrintableKeyText(event);
    this.clearPendingTextInputFallback();
    this.lastCommittedTextInputFallback = undefined;
    this.pendingTextInputFallback = text
      ? {
          text,
          timeStamp: getEventTimestamp(event),
          nativeSelection: this.getNativeLineSelectionContext(),
        }
      : undefined;

    if (
      !this.pendingTextInputFallback?.text ||
      this.state?.mode !== "text-editor" ||
      !this.isEditorActiveElement()
    ) {
      return;
    }

    this.pendingTextInputFallbackTimerId = setTimeout(() => {
      this.pendingTextInputFallbackTimerId = undefined;
      const fallback = this.pendingTextInputFallback;
      this.pendingTextInputFallback = undefined;
      if (
        !fallback?.text ||
        !this.isConnected ||
        this.state?.mode !== "text-editor" ||
        !this.isEditorActiveElement()
      ) {
        return;
      }

      if (fallback.nativeSelection) {
        if (isSlashText(fallback.text)) {
          this.armMentionMenuOpenFromTypedSlash({
            source: "keydown-fallback",
          });
        }
        this.insertPlainText(fallback.text, {
          nativeSelection: fallback.nativeSelection,
        });
      } else {
        if (isSlashText(fallback.text)) {
          this.armMentionMenuOpenFromTypedSlash({
            source: "keydown-fallback",
          });
        }
        this.insertPlainText(fallback.text);
      }
      this.lastCommittedTextInputFallback = fallback;
    }, 0);
  }

  shouldSkipCommittedTextInputFallback(event) {
    const fallback = this.lastCommittedTextInputFallback;
    if (this.pendingTextInputFallback?.text || !fallback?.text) {
      return false;
    }

    const eventTimestamp = getEventTimestamp(event);
    if (eventTimestamp !== undefined && fallback.timeStamp !== undefined) {
      const elapsed = eventTimestamp - fallback.timeStamp;
      if (elapsed < 0 || elapsed > TEXT_INPUT_FALLBACK_DUPLICATE_MAX_AGE_MS) {
        return false;
      }
    } else {
      return false;
    }

    if (typeof event?.data === "string" && event.data.length > 0) {
      return event.data === fallback.text;
    }

    return true;
  }

  consumePendingTextInputFallback(event) {
    const fallback = this.pendingTextInputFallback;
    this.pendingTextInputFallback = undefined;

    if (!fallback?.text) {
      return undefined;
    }

    const eventTimestamp = getEventTimestamp(event);
    if (
      eventTimestamp !== undefined &&
      fallback.timeStamp !== undefined &&
      eventTimestamp - fallback.timeStamp > TEXT_INPUT_FALLBACK_MAX_AGE_MS
    ) {
      return undefined;
    }

    return fallback.text;
  }

  getPendingTextInputFallbackNativeSelection(event, inputText) {
    const fallback = this.pendingTextInputFallback;
    if (!fallback?.nativeSelection || !fallback.text) {
      return undefined;
    }

    if (inputText && inputText !== fallback.text) {
      return undefined;
    }

    const eventTimestamp = getEventTimestamp(event);
    if (
      eventTimestamp !== undefined &&
      fallback.timeStamp !== undefined &&
      (eventTimestamp < fallback.timeStamp ||
        eventTimestamp - fallback.timeStamp > TEXT_INPUT_FALLBACK_MAX_AGE_MS)
    ) {
      return undefined;
    }

    return fallback.nativeSelection;
  }

  resolveBeforeInputText(event, { allowKeyFallback = true } = {}) {
    if (typeof event?.data === "string" && event.data.length > 0) {
      this.clearPendingTextInputFallback();
      return event.data;
    }

    const dataTransferText = event?.dataTransfer?.getData?.("text/plain");
    if (typeof dataTransferText === "string" && dataTransferText.length > 0) {
      this.clearPendingTextInputFallback();
      return dataTransferText;
    }

    if (allowKeyFallback) {
      return this.consumePendingTextInputFallback(event);
    }

    this.clearPendingTextInputFallback();
    return undefined;
  }

  markHandledBackspaceKeyDown(event) {
    this.pendingHandledBackspaceKeyDown = {
      timeStamp: getEventTimestamp(event),
    };
  }

  clearPendingHandledBackspaceKeyDown() {
    this.pendingHandledBackspaceKeyDown = undefined;
  }

  consumeHandledBackspaceKeyDown(event) {
    const pending = this.pendingHandledBackspaceKeyDown;
    if (!pending) {
      return false;
    }

    const eventTimestamp = getEventTimestamp(event);
    const shouldConsume =
      eventTimestamp === undefined ||
      pending.timeStamp === undefined ||
      (eventTimestamp >= pending.timeStamp &&
        eventTimestamp - pending.timeStamp <= TEXT_INPUT_FALLBACK_MAX_AGE_MS);

    if (shouldConsume || eventTimestamp === undefined) {
      this.clearPendingHandledBackspaceKeyDown();
    } else if (
      eventTimestamp !== undefined &&
      pending.timeStamp !== undefined &&
      eventTimestamp - pending.timeStamp > TEXT_INPUT_FALLBACK_MAX_AGE_MS
    ) {
      this.clearPendingHandledBackspaceKeyDown();
    }

    return shouldConsume;
  }

  handleNativeMouseDown(event) {
    if (event.button !== 0) {
      if (event.button === 2 && this.state.mode === "block") {
        this.pendingBlockContextMenuSelectedLineId = this.state.selectedLineId;
        const lineElement = this.getLineElementFromEvent(event);
        const lineId = this.getLineIdFromLineElement(lineElement);
        if (lineId && lineId !== this.state.selectedLineId) {
          this.pendingDefaultContextMenuLineId = lineId;
          this.hideSelectionPopover();
          this.closeMentionMenu();
          this.enterTextMode({
            lineId,
            cursorPosition: this.getLineOffsetFromPointerEvent(
              event,
              lineElement,
            ),
          });
          return;
        }

        event.preventDefault?.();
      }
      return;
    }

    this.markPointerDownInsideEditor();

    const referenceSnapshot = this.getReferenceSnapshotFromContextEvent(event);
    if (
      referenceSnapshot === undefined &&
      this.suppressNativeLineBoundaryDoubleClick(event)
    ) {
      return;
    }
    if (
      referenceSnapshot === undefined &&
      this.enterTextModeFromBlockModePointer(event)
    ) {
      return;
    }

    this.pendingPointerFallbackSelection =
      referenceSnapshot === undefined
        ? this.createPointerFallbackSelection(event)
        : undefined;
    if (!referenceSnapshot) {
      this.clearSelectedReferenceNodeKey();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.hideSelectionPopover();
    this.closeMentionMenu();
    this.setMode("text-editor");
    this.focus({ preventScroll: true });
    this.selectReferenceByNodeKey(referenceSnapshot.nodeKey);
    requestAnimationFrame(() => {
      if (!this.isConnected) {
        return;
      }

      this.selectReferenceByNodeKey(referenceSnapshot.nodeKey);
    });
  }

  handleLeftGutterMouseDown(event) {
    if (event.button !== 0) {
      return;
    }

    const row = this.getLeftGutterRowFromEvent(event);
    const lineId = row?.dataset?.lineId;
    if (!lineId || !this.hasLine(lineId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.clearPointerDownInsideEditor();
    this.pendingPointerFallbackSelection = undefined;
    this.awaitingCharacterShortcut = false;
    this.clearDeleteShortcutState();
    this.hideSelectionPopover();
    this.closeMentionMenu();
    this.enterBlockMode({
      focusSurface: true,
      lineId,
      emitSelectionChange: true,
    });
  }

  getLeftGutterRowFromEvent(event) {
    const path =
      typeof event.composedPath === "function" ? event.composedPath() : [];
    const candidates = path.length > 0 ? path : [event.target];

    for (const candidate of candidates) {
      const element =
        candidate?.nodeType === Node.TEXT_NODE
          ? candidate.parentElement
          : candidate;
      const row = element?.classList?.contains("gutter-row")
        ? element
        : element?.closest?.(".gutter-row");

      if (row && this.refs.leftGutter?.contains(row)) {
        return row;
      }
    }

    return undefined;
  }

  enterTextModeFromBlockModePointer(event) {
    if (this.state.mode !== "block") {
      return false;
    }

    const lineElement = this.getLineElementFromEvent(event);
    const lineId = this.getLineIdFromLineElement(lineElement);
    if (!lineId) {
      return false;
    }

    const previousSelectedLineId = this.state.selectedLineId;
    const cursorPosition = this.getLineOffsetFromPointerEvent(
      event,
      lineElement,
    );
    this.pendingPointerFallbackSelection = undefined;
    this.clearSelectedReferenceNodeKey();
    this.hideSelectionPopover();
    this.closeMentionMenu();
    this.state.selectedLineId = lineId;
    this.isEditorFocused = true;
    this.applyModeState("text-editor");
    this.awaitingCharacterShortcut = false;
    this.clearDeleteShortcutState();
    this.scheduleRender();
    if (previousSelectedLineId !== lineId) {
      this.dispatchSelectedLineChanged(lineId, {
        cursorPosition: cursorPosition >= 0 ? cursorPosition : undefined,
        isCollapsed: true,
        mode: "text-editor",
      });
    }
    return true;
  }

  suppressNativeLineBoundaryDoubleClick(event) {
    if (event.detail < 2) {
      return false;
    }

    const lineElement = this.getLineElementFromEvent(event);
    const lineId = this.getLineIdFromLineElement(lineElement);
    if (!lineId) {
      return false;
    }

    const lineOrder = this.getEditorLineOrder();
    const lineIndex = lineOrder.findIndex((line) => {
      return line.lineId === lineId;
    });
    if (lineIndex < 0 || lineIndex >= lineOrder.length - 1) {
      return false;
    }

    const pointerOffset = this.getLineOffsetFromPointerEvent(
      event,
      lineElement,
    );
    const visibleTextLength = this.getLineVisibleTextLength(lineElement);
    const isResolvedBoundaryClick =
      typeof pointerOffset === "number" &&
      pointerOffset >= 0 &&
      pointerOffset >= visibleTextLength;
    const isUnresolvedTrailingBoundaryClick =
      pointerOffset === -1 &&
      this.isPointerInTrailingLineBoundary(event, lineElement);
    if (!isResolvedBoundaryClick && !isUnresolvedTrailingBoundaryClick) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.pendingPointerFallbackSelection = undefined;
    this.clearSelectedReferenceNodeKey();
    this.hideSelectionPopover();
    this.closeMentionMenu();
    this.setMode("text-editor");

    const selectionRange =
      event.detail >= 3
        ? {
            start: 0,
            end: visibleTextLength,
          }
        : getTrailingWordSelectionRange(lineElement.textContent);
    const isCollapsedSelection = selectionRange.start === selectionRange.end;
    const didLineChange = this.state.selectedLineId !== lineId;
    this.state.selectedLineId = lineId;
    if (isCollapsedSelection) {
      this.focusLine({
        lineId,
        cursorPosition: -1,
      });
    } else {
      this.selectLineTextRange({
        lineId,
        lineElement,
        start: selectionRange.start,
        end: selectionRange.end,
      });
    }
    this.scheduleRender();

    if (didLineChange) {
      this.dispatchSelectedLineChanged(lineId, {
        cursorPosition: undefined,
        isCollapsed: isCollapsedSelection,
        mode: "text-editor",
      });
    }

    return true;
  }

  selectLineTextRange(payload = {}) {
    const { lineId, lineElement, start, end } = payload;
    const lineKey = this.lineKeyById.get(lineId);
    if (!lineKey || !lineElement || !this.refs?.editor) {
      return false;
    }

    const visibleTextLength = this.getLineVisibleTextLength(lineElement);
    const selectionStart = Math.max(0, Math.min(start ?? 0, visibleTextLength));
    const selectionEnd = Math.max(
      selectionStart,
      Math.min(end ?? selectionStart, visibleTextLength),
    );
    const { range: startRange } = createCollapsedRangeAtPosition(
      lineElement,
      selectionStart,
    );
    const { range: endRange } = createCollapsedRangeAtPosition(
      lineElement,
      selectionEnd,
    );
    const range = document.createRange();
    range.setStart(startRange.startContainer, startRange.startOffset);
    range.setEnd(endRange.startContainer, endRange.startOffset);

    this.editor.update(
      () => {
        const lineNode = $getNodeByKey(lineKey);
        if (!lineNode) {
          return;
        }

        applySelectionToLineNode(lineNode, {
          lineId,
          start: selectionStart,
          end: selectionEnd,
        });
      },
      { discrete: true },
    );

    const didSetNativeSelection = setSelectionFromRange(
      this.refs.editor,
      range,
    );
    return didSetNativeSelection;
  }

  handleNativeMouseUp(event) {
    if (typeof event?.button === "number" && event.button !== 0) {
      return;
    }

    setTimeout(() => {
      this.clearPointerDownInsideEditor();
    }, 0);

    const range = getSelectionRange(this.refs.editor);
    if (this.normalizeInvisibleLineBoundarySelection(range)) {
      return;
    }
    requestAnimationFrame(() => {
      if (!this.isConnected) {
        return;
      }

      this.normalizeInvisibleLineBoundarySelection();
    });

    const lineId = this.getLineIdFromRange(range);
    const fallbackSelection =
      this.pendingPointerFallbackSelection ||
      this.createPointerFallbackSelection(event);
    if (!lineId) {
      if (this.refs.editor?.contains(event?.target)) {
        const didRestoreFallback =
          this.restorePointerFallbackSelection(fallbackSelection);
        if (!didRestoreFallback) {
          this.setMode("text-editor");
          this.focus({ preventScroll: true });
        }
        this.schedulePointerFallbackSelectionValidation(fallbackSelection);
      }
      this.scheduleRender();
      return;
    }

    const didLineChange = this.state.selectedLineId !== lineId;
    this.state.selectedLineId = lineId;
    this.scheduleRender();
    this.schedulePointerFallbackSelectionValidation(fallbackSelection);

    if (didLineChange) {
      this.dispatchSelectedLineChanged(lineId, {
        cursorPosition: undefined,
        isCollapsed: false,
        mode: "text-editor",
      });
    }
  }

  normalizeInvisibleLineBoundarySelection(
    range = getSelectionRange(this.refs?.editor),
  ) {
    if (!range || range.collapsed) {
      return false;
    }

    const selectedText = range.toString();
    if (!isInvisibleLineBoundarySelectionText(selectedText)) {
      return false;
    }

    const startLineElement = this.getLineElementFromRangePoint(
      range.startContainer,
      range.startOffset,
    );
    const endLineElement = this.getLineElementFromRangePoint(
      range.endContainer,
      range.endOffset,
    );
    if (!startLineElement || !endLineElement) {
      return false;
    }

    const startLineId = this.getLineIdFromLineElement(startLineElement);
    const endLineId = this.getLineIdFromLineElement(endLineElement);
    if (!startLineId || !endLineId) {
      return false;
    }

    if (startLineId !== endLineId) {
      const lineOrder = this.getEditorLineOrder();
      const startIndex = lineOrder.findIndex((line) => {
        return line.lineId === startLineId;
      });
      const endIndex = lineOrder.findIndex((line) => {
        return line.lineId === endLineId;
      });

      if (startIndex < 0 || endIndex !== startIndex + 1) {
        return false;
      }
    }

    const didLineChange = this.state.selectedLineId !== startLineId;
    this.state.selectedLineId = startLineId;
    const didRestore = this.restoreLineSelection({
      lineId: startLineId,
      cursorPosition: -1,
    });
    this.scheduleRender();

    if (didLineChange) {
      this.dispatchSelectedLineChanged(startLineId, {
        cursorPosition: undefined,
        isCollapsed: true,
        mode: "text-editor",
      });
    }

    return didRestore;
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
    if (this.pendingDefaultContextMenuLineId) {
      this.pendingDefaultContextMenuLineId = undefined;
      this.dispatchShortcutEvent("line-context-menu-dismiss", {});
      return;
    }

    if (this.state.mode === "block") {
      this.handleBlockModeContextMenu(event);
      return;
    }

    const referenceSnapshot = this.getReferenceSnapshotFromContextEvent(event);
    if (referenceSnapshot) {
      event.preventDefault();
      event.stopPropagation();
      this.showReferencePopover(event, referenceSnapshot);
      return;
    }

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

  handleBlockModeContextMenu(event) {
    if (this.state.mode !== "block") {
      return false;
    }

    const selectedLineId =
      this.pendingBlockContextMenuSelectedLineId ?? this.state.selectedLineId;
    this.pendingBlockContextMenuSelectedLineId = undefined;

    const lineElement = this.getLineElementFromEvent(event);
    const lineId = this.getLineIdFromLineElement(lineElement);
    if (!lineId || lineId !== selectedLineId) {
      this.hideSelectionPopover();
      this.closeMentionMenu();
      this.dispatchShortcutEvent("line-context-menu-dismiss", {});
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    this.hideSelectionPopover();
    this.closeMentionMenu();
    this.enterBlockMode({
      focusSurface: true,
      lineId,
      emitSelectionChange: true,
    });
    this.dispatchShortcutEvent("line-context-menu-request", {
      lineId,
      position: {
        x: event.clientX ?? 0,
        y: event.clientY ?? 0,
      },
    });
    return true;
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
    const element = getTextStyleSegmentElementFromContextEvent(
      event,
      this.refs.editor,
    );
    if (!element) {
      return undefined;
    }

    return this.getTextStyleSegmentSnapshotFromElement(element);
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

  getReferenceSnapshotFromContextEvent(event) {
    const element = getReferenceElementFromContextEvent(
      event,
      this.refs.editor,
    );
    if (!element) {
      return undefined;
    }

    return this.getReferenceSnapshotFromElement(element);
  }

  getReferenceSnapshotFromElement(element) {
    return this.editor.read(() => {
      const node = $getNearestNodeFromDOMNode(element);
      if (!$isMentionNode(node)) {
        return undefined;
      }

      return getReferenceSnapshotFromMentionNode(node);
    });
  }

  getReferenceRichTextState(nodeKey) {
    if (!nodeKey) {
      return {
        textStyleId: undefined,
        furigana: undefined,
      };
    }

    return this.editor.getEditorState().read(() => {
      return getReferenceRichTextStateFromNode($getNodeByKey(nodeKey));
    });
  }

  getReferenceElementFromNativeRange(nativeRange, direction) {
    if (
      !nativeRange?.collapsed ||
      typeof Node === "undefined" ||
      typeof Element === "undefined"
    ) {
      return undefined;
    }

    const getMentionElement = (node) => {
      const element =
        node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!(element instanceof Element)) {
        return undefined;
      }

      const mentionElement = element.closest?.(".mention-chip");
      if (mentionElement && this.refs?.editor?.contains?.(mentionElement)) {
        return mentionElement;
      }

      return undefined;
    };

    const directMentionElement = getMentionElement(nativeRange.startContainer);
    if (directMentionElement) {
      return directMentionElement;
    }

    let candidateNode;
    if (nativeRange.startContainer.nodeType === Node.TEXT_NODE) {
      const textLength = nativeRange.startContainer.textContent?.length ?? 0;
      if (direction > 0 && nativeRange.startOffset < textLength) {
        return undefined;
      }
      if (direction < 0 && nativeRange.startOffset > 0) {
        return undefined;
      }

      candidateNode =
        direction > 0
          ? nativeRange.startContainer.nextSibling
          : nativeRange.startContainer.previousSibling;
    } else {
      candidateNode =
        direction > 0
          ? nativeRange.startContainer.childNodes?.[nativeRange.startOffset]
          : nativeRange.startContainer.childNodes?.[
              nativeRange.startOffset - 1
            ];
    }

    return getMentionElement(candidateNode);
  }

  getNativeReferenceArrowFallbackInfo(
    nativeSelection,
    direction,
    { nativeRange } = {},
  ) {
    if (
      !nativeSelection?.lineId ||
      nativeSelection.start !== nativeSelection.end ||
      typeof nativeSelection.start !== "number"
    ) {
      return undefined;
    }

    const lineKey = this.lineKeyById.get(nativeSelection.lineId);
    const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
    if (!lineNode) {
      return undefined;
    }

    const content = this.serializeLineContent(lineNode);
    const lineLength = getContentLength(content);
    const offset = Math.max(0, Math.min(nativeSelection.start, lineLength));
    const mentionNodes = this.getMentionNodesInLine(lineNode);
    const domReferenceNodeKey = this.getReferenceElementFromNativeRange(
      nativeRange,
      direction,
    )?.dataset?.rvnReferenceKey;
    let consumed = 0;
    let referenceIndex = 0;

    for (const item of ensureContentArray(content)) {
      const itemLength = getPlainTextFromContent([item]).length;
      const itemStart = consumed;
      const itemEnd = consumed + itemLength;
      consumed = itemEnd;

      if (!item?.reference) {
        continue;
      }

      const mentionNode = mentionNodes[referenceIndex];
      referenceIndex += 1;
      if (!$isMentionNode(mentionNode)) {
        continue;
      }

      const matchesDomReference = mentionNode.getKey() === domReferenceNodeKey;
      const isFinalReference = itemEnd === lineLength;
      const isInsideReference = offset > itemStart && offset < itemEnd;
      const isAfterReference =
        direction < 0 && (offset === itemEnd || matchesDomReference);
      const isBeforeReference =
        direction > 0 &&
        (offset === itemStart || isInsideReference || matchesDomReference);
      if (!isAfterReference && !isBeforeReference) {
        continue;
      }

      return {
        node: mentionNode,
        lineId: nativeSelection.lineId,
        offset,
        itemStart,
        itemEnd,
        lineLength,
        isFinalReference,
        matchesDomReference,
        isInsideReference,
        shouldMoveAcross:
          isFinalReference &&
          ((direction < 0 && offset === lineLength) ||
            (direction > 0 &&
              (offset === itemStart ||
                isInsideReference ||
                matchesDomReference))),
      };
    }

    return undefined;
  }

  isFinalVisibleReferenceNode(node) {
    if (!$isMentionNode(node)) {
      return false;
    }

    const lineNode = node.getParent();
    if (!lineNode) {
      return false;
    }

    const content = this.serializeLineContent(lineNode);
    const contentItems = mergeAdjacentContentItems(content);
    if (!contentItems.at(-1)?.reference) {
      return false;
    }

    const mentionNodes = this.getMentionNodesInLine(lineNode);
    return mentionNodes.at(-1)?.getKey() === node.getKey();
  }

  selectReferenceNodeAsElement(node) {
    this.selectedReferenceNodeKey = node.getKey();
    selectReferenceNodeAsElement(node);
  }

  handleReferenceArrowNavigation(event) {
    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (
      direction === 0 ||
      event.isComposing ||
      this.isComposing ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return false;
    }

    const nativeRange =
      this.refs?.editor &&
      typeof window !== "undefined" &&
      typeof ShadowRoot !== "undefined"
        ? getSelectionRange(this.refs.editor)
        : undefined;
    const nativeSelection = this.getNativeLineSelectionContext(nativeRange);

    let didHandle = false;
    let nextSelectedReferenceNodeKey = this.selectedReferenceNodeKey;
    this.editor.update(
      () => {
        const selectedReferenceNode = this.selectedReferenceNodeKey
          ? $getNodeByKey(this.selectedReferenceNodeKey)
          : undefined;
        const handleNativeFallback = () => {
          const nativeFallbackInfo = this.getNativeReferenceArrowFallbackInfo(
            nativeSelection,
            direction,
            {
              nativeRange,
            },
          );
          if (!nativeFallbackInfo?.node) {
            return false;
          }

          if (nativeFallbackInfo.shouldMoveAcross) {
            placeCaretAroundReferenceNode(nativeFallbackInfo.node, direction);
            nextSelectedReferenceNodeKey = undefined;
            didHandle = true;
            return true;
          }

          this.selectReferenceNodeAsElement(nativeFallbackInfo.node);
          nextSelectedReferenceNodeKey = nativeFallbackInfo.node.getKey();
          didHandle = true;
          return true;
        };
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          if ($isMentionNode(selectedReferenceNode)) {
            placeCaretAroundReferenceNode(selectedReferenceNode, direction);
            nextSelectedReferenceNodeKey = undefined;
            didHandle = true;
          }
          if (didHandle || handleNativeFallback()) {
            return;
          }
          return;
        }

        const referenceSelection = getReferenceSelectionInfo(selection);
        if (referenceSelection?.node) {
          const isSelectedReference =
            this.selectedReferenceNodeKey === referenceSelection.node.getKey();
          if (referenceSelection.isWhole || isSelectedReference) {
            placeCaretAroundReferenceNode(referenceSelection.node, direction);
            nextSelectedReferenceNodeKey = undefined;
          } else if (
            referenceSelection.isCollapsed &&
            !isCollapsedReferenceCaretMovingIntoNode(
              selection,
              referenceSelection.node,
              direction,
            )
          ) {
            nextSelectedReferenceNodeKey = undefined;
            return;
          } else {
            this.selectReferenceNodeAsElement(referenceSelection.node);
            nextSelectedReferenceNodeKey = referenceSelection.node.getKey();
          }
          didHandle = true;
          return;
        }

        if ($isMentionNode(selectedReferenceNode)) {
          placeCaretAroundReferenceNode(selectedReferenceNode, direction);
          nextSelectedReferenceNodeKey = undefined;
          didHandle = true;
          return;
        }

        const adjacentReferenceInfo =
          getAdjacentReferenceNodeInfoForCollapsedSelection(
            selection,
            direction,
          );
        const adjacentReference = adjacentReferenceInfo?.node;
        if (!adjacentReference) {
          if (handleNativeFallback()) {
            return;
          }

          return;
        }

        if (adjacentReferenceInfo.skippedZeroLengthText && direction < 0) {
          placeCaretAroundReferenceNode(adjacentReference, direction);
          nextSelectedReferenceNodeKey = undefined;
          didHandle = true;
          return;
        }

        if (
          direction > 0 &&
          this.isFinalVisibleReferenceNode(adjacentReference)
        ) {
          placeCaretAroundReferenceNode(adjacentReference, direction);
          nextSelectedReferenceNodeKey = undefined;
          didHandle = true;
          return;
        }

        this.selectReferenceNodeAsElement(adjacentReference);
        nextSelectedReferenceNodeKey = adjacentReference.getKey();
        didHandle = true;
      },
      { discrete: true },
    );

    if (!didHandle) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    this.selectedReferenceNodeKey = nextSelectedReferenceNodeKey;
    this.updateReferenceSelectionMarkers();
    return true;
  }

  selectReferenceByNodeKey(nodeKey) {
    if (!nodeKey) {
      return;
    }

    this.editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if ($isMentionNode(node)) {
          this.selectReferenceNodeAsElement(node);
          this.selectedReferenceNodeKey = nodeKey;
        }
      },
      { discrete: true },
    );
    this.updateReferenceSelectionMarkers();
  }

  showReferencePopover(event, referenceSnapshot) {
    const menu = this.refs.selectionMenu;
    if (!menu || !referenceSnapshot?.nodeKey) {
      return;
    }

    this.selectionMenuIsOpen = true;
    this.pendingSelectionSnapshot = undefined;
    this.referenceMenuTarget = referenceSnapshot;
    this.selectionMenuPosition = {
      x: String(event.clientX),
      y: String(event.clientY),
    };

    this.selectReferenceByNodeKey(referenceSnapshot.nodeKey);

    const richTextState = this.getReferenceRichTextState(
      referenceSnapshot.nodeKey,
    );
    const hasTextStyle = !!richTextState.textStyleId;
    const hasFurigana = !!richTextState.furigana;
    menu.items = [
      {
        id: "change-reference",
        type: "item",
        label: "Change variable",
      },
      {
        id: "remove-reference",
        type: "item",
        label: "Remove variable",
      },
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
      menu.items.push({
        id: "remove-text-style",
        type: "item",
        label: "Remove text style",
      });
    }
    if (hasFurigana) {
      menu.items.push({
        id: "remove-furigana",
        type: "item",
        label: "Remove furigana",
      });
    }

    menu.x = this.selectionMenuPosition.x;
    menu.y = this.selectionMenuPosition.y;
    menu.place = "bs";
    menu.open = true;
    menu.render?.();
  }

  getReferenceVariableMenuItems() {
    if (this.state.mentionTargets.length === 0) {
      return [
        {
          id: "no-reference-targets",
          type: "item",
          label: "No variables",
          disabled: true,
        },
      ];
    }

    return this.state.mentionTargets.map((target) => ({
      id: `reference:${target.id}`,
      type: "item",
      label: target.label,
      suffixText: target.variableType || "",
      referenceResourceId: target.id,
    }));
  }

  showReferenceVariableSelectionMenu() {
    const menu = this.refs.selectionMenu;
    if (!menu || !this.referenceMenuTarget?.nodeKey) {
      this.hideSelectionPopover();
      return;
    }

    menu.items = this.getReferenceVariableMenuItems();
    menu.x = this.selectionMenuPosition.x;
    menu.y = this.selectionMenuPosition.y;
    menu.place = "bs";
    menu.open = true;
    menu.render?.();
  }

  replaceReferenceNode(nodeKey, resourceId) {
    if (!nodeKey || !resourceId) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isMentionNode(node)) {
          return;
        }

        const currentTextStyleId = getTextStyleIdFromNode(node);
        const currentFurigana = getFuriganaFromNode(node);
        const replacementNode = $createMentionNode({
          resourceId,
          label: this.getReferenceLabel(resourceId),
        });
        applyTextStyleIdToNode(replacementNode, currentTextStyleId);
        applyFuriganaToNode(replacementNode, currentFurigana);
        node.replace(replacementNode);
        this.selectReferenceNodeAsElement(replacementNode);
      },
      { discrete: true },
    );
  }

  applyTextStyleIdToReference(nodeKey, textStyleId) {
    if (!nodeKey || !textStyleId) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isMentionNode(node)) {
          return;
        }

        applyTextStyleIdToNode(node, textStyleId);
        this.selectReferenceNodeAsElement(node);
      },
      { discrete: true },
    );
  }

  removeTextStyleIdFromReference(nodeKey) {
    if (!nodeKey) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isMentionNode(node)) {
          return;
        }

        removeTextStyleIdFromNode(node);
        this.selectReferenceNodeAsElement(node);
      },
      { discrete: true },
    );
  }

  applyFuriganaToReference(nodeKey, furigana) {
    if (!nodeKey) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isMentionNode(node)) {
          return;
        }

        applyFuriganaToNode(node, furigana);
        this.selectReferenceNodeAsElement(node);
      },
      { discrete: true },
    );
  }

  removeFuriganaFromReference(nodeKey) {
    if (!nodeKey) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isMentionNode(node)) {
          return;
        }

        removeFuriganaFromNode(node);
        this.selectReferenceNodeAsElement(node);
      },
      { discrete: true },
    );
  }

  removeReferenceNode(nodeKey) {
    if (!nodeKey) {
      return;
    }

    this.pendingChangeReason = "text";
    this.editor.update(
      () => {
        const node = $getNodeByKey(nodeKey);
        if (!$isMentionNode(node)) {
          return;
        }

        const parentNode = node.getParent();
        const referenceIndex = node.getIndexWithinParent();
        node.remove();

        if ($isElementNode(parentNode)) {
          const caretIndex = Math.min(
            referenceIndex,
            parentNode.getChildrenSize(),
          );
          parentNode.select(caretIndex, caretIndex);
        }
      },
      { discrete: true },
    );
    if (this.selectedReferenceNodeKey === nodeKey) {
      this.clearSelectedReferenceNodeKey();
    }
  }

  hasReferenceNodeKey(nodeKey) {
    if (!nodeKey) {
      return false;
    }

    return this.editor.getEditorState().read(() => {
      return $isMentionNode($getNodeByKey(nodeKey));
    });
  }

  clearSelectedReferenceNodeKey() {
    if (!this.selectedReferenceNodeKey) {
      return;
    }

    this.selectedReferenceNodeKey = undefined;
    this.updateReferenceSelectionMarkers();
  }

  getReferenceElementByNodeKey(nodeKey) {
    if (!nodeKey || !this.refs?.editor) {
      return undefined;
    }

    for (const element of this.refs.editor.querySelectorAll(
      "[data-rvn-reference-key]",
    )) {
      if (element.dataset.rvnReferenceKey === nodeKey) {
        return element;
      }
    }

    return undefined;
  }

  collapseNativeSelectionAfterReference(nodeKey) {
    const element = this.getReferenceElementByNodeKey(nodeKey);
    const parentNode = element?.parentNode;
    if (!parentNode || typeof document === "undefined") {
      return false;
    }

    const childIndex = Array.from(parentNode.childNodes).indexOf(element);
    if (childIndex === -1) {
      return false;
    }

    const selectionOffset = Math.min(
      childIndex + 1,
      parentNode.childNodes.length,
    );
    const currentRange = getSelectionRange(this.refs.editor);
    if (
      currentRange?.collapsed &&
      currentRange.startContainer === parentNode &&
      currentRange.startOffset === selectionOffset
    ) {
      return true;
    }

    const range = document.createRange();
    range.setStart(parentNode, selectionOffset);
    range.collapse(true);
    return setSelectionFromRange(this.refs.editor, range);
  }

  updateReferenceSelectionMarkers() {
    if (!this.refs.editor) {
      return;
    }

    let selectedKey = this.selectedReferenceNodeKey;
    if (selectedKey && !this.hasReferenceNodeKey(selectedKey)) {
      selectedKey = undefined;
      this.selectedReferenceNodeKey = undefined;
    }

    if (selectedKey) {
      this.refs.editor.dataset.rvnReferenceSelectionActive = "true";
    } else {
      delete this.refs.editor.dataset.rvnReferenceSelectionActive;
    }

    for (const element of this.refs.editor.querySelectorAll(
      "[data-rvn-reference-key]",
    )) {
      if (element.dataset.rvnReferenceKey === selectedKey) {
        element.dataset.rvnReferenceSelected = "true";
      } else {
        delete element.dataset.rvnReferenceSelected;
      }
    }

    if (selectedKey) {
      this.collapseNativeSelectionAfterReference(selectedKey);
    }
  }

  handleSurfaceKeyDown(event) {
    this.hideSelectionPopover();

    if (this.state.mode !== "block") {
      return false;
    }

    if (isPlainSpaceKey(event)) {
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    const currentLineId = this.state.selectedLineId || this.state.lines[0]?.id;
    if (!currentLineId && this.state.lines.length === 0) {
      return false;
    }

    if (this.handleBlockModeCharacterShortcut(event, currentLineId)) {
      return true;
    }

    if (this.handleBlockModeDeleteShortcut(event, currentLineId)) {
      return true;
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
        return true;
      case "ArrowDown":
        event.preventDefault();
        event.stopPropagation();
        this.moveBlockSelection(1);
        return true;
      case "Enter":
        event.preventDefault();
        event.stopPropagation();
        this.enterTextMode({
          lineId: currentLineId,
          cursorPosition: -1,
        });
        return true;
      case "i":
      case "Shift+I":
        event.preventDefault();
        event.stopPropagation();
        this.enterTextMode({
          lineId: currentLineId,
          cursorPosition: 0,
        });
        return true;
      case "Shift+A":
        event.preventDefault();
        event.stopPropagation();
        this.enterTextMode({
          lineId: currentLineId,
          cursorPosition: -1,
        });
        return true;
      case "o":
        event.preventDefault();
        event.stopPropagation();
        this.dispatchShortcutEvent("newLine", {
          lineId: currentLineId || null,
          position: "after",
        });
        return true;
      case "O":
        event.preventDefault();
        event.stopPropagation();
        this.dispatchShortcutEvent("newLine", {
          lineId: currentLineId || null,
          position: "before",
        });
        return true;
      case "p":
      case "P":
        event.preventDefault();
        event.stopPropagation();
        this.dispatchShortcutEvent("preview-shortcut", {});
        return true;
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
        return true;
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
        return true;
      default:
        return false;
    }
  }

  handleNativeBeforeInput(event) {
    this.hideSelectionPopover();
    const inputType = String(event.inputType ?? "");

    if (this.state?.mode === "block") {
      this.clearPendingTextInputFallback();
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      return;
    }

    if (event.defaultPrevented || event.isComposing || this.isComposing) {
      this.clearPendingTextInputFallback();
      return;
    }

    this.clearSelectedReferenceNodeKey();

    if (inputType === "historyUndo" || inputType === "historyRedo") {
      this.clearPendingTextInputFallback();
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      return;
    }

    if (
      inputType === "insertFromPaste" ||
      inputType === "insertFromPasteAsQuotation"
    ) {
      this.clearPendingTextInputFallback();
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();

      if (this.pendingHandledPasteBeforeInput) {
        this.pendingHandledPasteBeforeInput = false;
        return;
      }

      const pastedText =
        event.dataTransfer?.getData?.("text/plain") ?? event.data ?? "";
      if (pastedText) {
        this.handlePasteEvent({
          clipboardData: {
            getData: (type) => (type === "text/plain" ? pastedText : ""),
          },
        });
      }
      return;
    }

    if (inputType === "insertParagraph") {
      this.clearPendingTextInputFallback();
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
      this.clearPendingTextInputFallback();
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
      const fallbackNativeSelection =
        this.getPendingTextInputFallbackNativeSelection(event, event?.data);
      if (this.shouldSkipCommittedTextInputFallback(event)) {
        this.lastCommittedTextInputFallback = undefined;
        event.preventDefault();
        event.stopPropagation?.();
        event.stopImmediatePropagation?.();
        return;
      }

      const inputText = this.resolveBeforeInputText(event, {
        allowKeyFallback: inputType === "insertText",
      });
      if (inputText === undefined) {
        return;
      }

      this.lastCommittedTextInputFallback = undefined;
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      const nativeSelection =
        this.getInputLineSelectionContext(event) ?? fallbackNativeSelection;
      if (isSlashText(inputText)) {
        this.armMentionMenuOpenFromTypedSlash({
          source: "beforeinput",
        });
      }
      if (nativeSelection) {
        this.insertPlainText(inputText, { nativeSelection });
      } else {
        this.insertPlainText(inputText);
      }
      return;
    }

    if (inputType === "deleteContentBackward") {
      this.invalidatePendingFocusRestore();
      this.clearPendingTextInputFallback();
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();

      const didConsumeHandledKeyDown =
        this.consumeHandledBackspaceKeyDown(event);
      if (didConsumeHandledKeyDown) {
        return;
      }

      const nativeSelection = this.getInputLineSelectionContext(event);
      const didHandle = this.handleBackspaceDelete({
        nativeSelection,
      });
      if (!didHandle) {
        this.deleteCharacterBackward({ nativeSelection });
      }
      return;
    }

    if (inputType === "deleteContentForward") {
      this.clearPendingTextInputFallback();
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      this.deleteCharacterForward();
      return;
    }

    if (inputType === "insertFromDrop" || inputType === "deleteByDrag") {
      this.clearPendingTextInputFallback();
      event.preventDefault();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      return;
    }

    if (inputType === "deleteByCut") {
      this.clearPendingTextInputFallback();
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

    const activeTriggerState = this.getActiveMentionTriggerState();
    const triggerState = activeTriggerState ?? { ...this.state.mentionMenu };

    this.dismissMentionTrigger(triggerState);
    this.closeMentionMenu();
    this.restoreMentionTriggerSelection(triggerState);
  }

  applyTextStyleIdToSelection(textStyleId) {
    if (!textStyleId) {
      return;
    }

    if (this.referenceMenuTarget?.nodeKey) {
      this.applyTextStyleIdToReference(
        this.referenceMenuTarget.nodeKey,
        textStyleId,
      );
      this.clearPendingRichTextSelection();
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
    if (this.referenceMenuTarget?.nodeKey) {
      this.removeTextStyleIdFromReference(this.referenceMenuTarget.nodeKey);
      this.clearPendingRichTextSelection();
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

    if (this.referenceMenuTarget?.nodeKey) {
      this.applyFuriganaToReference(this.referenceMenuTarget.nodeKey, {
        text: furiganaText,
        textStyleId,
      });
      this.clearPendingRichTextSelection();
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
    if (this.referenceMenuTarget?.nodeKey) {
      this.removeFuriganaFromReference(this.referenceMenuTarget.nodeKey);
      this.clearPendingRichTextSelection();
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
    this.referenceMenuTarget = undefined;
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

  getFuriganaForSelectionSnapshot(snapshot) {
    if (!snapshot?.lineId || snapshot.start === snapshot.end) {
      return undefined;
    }

    return this.editor.getEditorState().read(() => {
      const lineKey = this.lineKeyById.get(snapshot.lineId);
      const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
      if (!lineNode) {
        return undefined;
      }

      let offset = 0;
      const findFurigana = (node) => {
        if ($isElementNode(node)) {
          for (const childNode of node.getChildren()) {
            const furigana = findFurigana(childNode);
            if (furigana) {
              return furigana;
            }
          }

          return undefined;
        }

        const length = getLexicalTextLength(node);
        const start = offset;
        const end = offset + length;
        offset = end;

        if (end <= snapshot.start || start >= snapshot.end) {
          return undefined;
        }

        if (!$isTextNode(node) || $isMentionNode(node)) {
          return undefined;
        }

        return getFuriganaFromNode(node);
      };

      return findFurigana(lineNode);
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
    this.referenceMenuTarget = undefined;
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

    if (action === "change-reference") {
      this.showReferenceVariableSelectionMenu();
      return;
    }

    if (item.referenceResourceId) {
      const nodeKey = this.referenceMenuTarget?.nodeKey;
      this.replaceReferenceNode(nodeKey, item.referenceResourceId);
      this.hideSelectionPopover();
      this.focus({ preventScroll: true });
      return;
    }

    if (action === "remove-reference") {
      const nodeKey = this.referenceMenuTarget?.nodeKey;
      this.removeReferenceNode(nodeKey);
      this.hideSelectionPopover();
      this.focus({ preventScroll: true });
      return;
    }

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
    if (this.referenceMenuTarget?.nodeKey) {
      this.requestReferenceFuriganaDialog();
      return;
    }

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

    const furigana =
      this.getFuriganaForSelectionSnapshot(snapshot) ??
      this.getSelectionFurigana() ??
      {};
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

  requestReferenceFuriganaDialog() {
    const nodeKey = this.referenceMenuTarget?.nodeKey;
    if (!nodeKey) {
      this.hideSelectionPopover();
      return;
    }

    this.furiganaDialogIsPending = true;
    this.selectionMenuIsOpen = false;

    if (this.refs.selectionMenu) {
      this.refs.selectionMenu.open = false;
      this.refs.selectionMenu.render?.();
    }

    const richTextState = this.getReferenceRichTextState(nodeKey);
    const furigana = richTextState.furigana ?? {};
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
    this.referenceMenuTarget = undefined;
    this.furiganaDialogIsPending = false;

    if (this.refs.selectionMenu) {
      this.refs.selectionMenu.open = false;
      this.refs.selectionMenu.render?.();
    }
  }

  getLineSelectionContext({ preferNative = false } = {}) {
    const nativeContext = preferNative
      ? this.getLineSelectionContextFromNative()
      : undefined;
    if (nativeContext) {
      return nativeContext;
    }

    const lexicalContext = this.editor.getEditorState().read(() => {
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

    return lexicalContext ?? this.getLineSelectionContextFromNative();
  }

  getLineSelectionContextFromNative() {
    const nativeSelection = this.getNativeLineSelectionContext();
    return this.getLineSelectionContextFromLineSelection(nativeSelection);
  }

  getLineSelectionContextFromLineSelection(lineSelection) {
    if (!lineSelection?.lineId) {
      return undefined;
    }

    const selectionStart = lineSelection.start ?? lineSelection.offset;
    const selectionEnd =
      lineSelection.end ?? lineSelection.start ?? lineSelection.offset;
    if (
      typeof selectionStart !== "number" ||
      typeof selectionEnd !== "number"
    ) {
      return undefined;
    }

    const nativeSelection = {
      lineId: lineSelection.lineId,
      start: selectionStart,
      end: selectionEnd,
    };
    if (!nativeSelection?.lineId) {
      return undefined;
    }

    const lineKey = this.lineKeyById.get(nativeSelection.lineId);
    if (!lineKey) {
      return undefined;
    }

    return this.editor.getEditorState().read(() => {
      const lineNode = $getNodeByKey(lineKey);
      const lineMeta = this.lineMetaByKey.get(lineKey);
      if (!lineNode || !lineMeta) {
        return undefined;
      }

      return {
        lineKey,
        lineId: lineMeta.id,
        selection: {
          start: nativeSelection.start,
          end: nativeSelection.end,
        },
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

      let lexicalSelectedLineId;
      if ($isRangeSelection(selection)) {
        const selectedLineNode = this.getLineNodeFromSelection(selection);
        lexicalSelectedLineId = this.lineMetaByKey.get(
          selectedLineNode?.getKey(),
        )?.id;
      }
      selectedLineId = lexicalSelectedLineId ?? selectedLineId;

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
      const lexicalMentionTrigger = $isRangeSelection(selection)
        ? getMentionTriggerFromTextNode(
            selection.anchor.getNode(),
            selection.anchor.offset,
            { source: "lexical" },
          )
        : undefined;
      const mentionTrigger = lexicalMentionTrigger
        ? {
            ...lexicalMentionTrigger,
            lineId: selectedLineId,
          }
        : undefined;

      return {
        lines,
        selectedLineId,
        activeFormats,
        mentionTrigger,
      };
    });
  }

  getLinesSnapshot() {
    return cloneSceneEditorLines(this.readEditorSnapshot().lines);
  }

  hasLine(lineId) {
    return this.lineKeyById.has(lineId);
  }

  getSelectedLineIdSnapshot() {
    return this.readEditorSnapshot().selectedLineId;
  }

  createPersistableLine(lineMeta, lineNode) {
    const line = createLineMeta(lineMeta);
    setLineDialogueContent(line, this.serializeLineContent(lineNode));
    return line;
  }

  getReferenceLabel(resourceId) {
    const target = this.state.mentionTargets.find(
      (item) => item.id === resourceId,
    );
    return target?.label ?? resourceId;
  }

  refreshReferenceLabels() {
    if (!this.isConnected || !this.refs.editor || this.isComposing) {
      return;
    }

    const lines = this.readEditorSnapshot().lines;
    if (!hasReferenceContent(lines)) {
      return;
    }

    this.loadLines(lines, {
      emitChange: false,
      restoreSelection: this.getCurrentSelectionSnapshot(),
    });
  }

  createNodesFromContent(content) {
    return createLexicalNodesFromContent(content, {
      resolveReferenceLabel: (resourceId) => this.getReferenceLabel(resourceId),
    });
  }

  appendParagraphContent(lineNode, content) {
    const nodes = this.createNodesFromContent(content);
    if (nodes.length > 0) {
      lineNode.append(...nodes);
      if (doesContentEndWithReference(content)) {
        lineNode.append($createTextNode(EDITOR_CARET_TEXT));
      }
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
    const rangeContext = this.getNativeLineRangeSelectionContext();
    if (rangeContext?.isMultiLine) {
      this.replaceNativeLineRangeSelectionWithParagraphBreak(rangeContext);
      return;
    }

    const context = this.getLineSelectionContext({ preferNative: true });
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
    this.pendingFocusTarget = {
      lineId: newLineId,
      cursorPosition: 0,
    };
    let didSplit = false;

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
        didSplit = true;

        const selection = $getSelection();
        if ($isRangeSelection(selection) && getContentLength(after) === 0) {
          clearSelectionTextFormatting(selection);
        }
      },
      { discrete: true },
    );

    if (!didSplit) {
      this.pendingFocusTarget = undefined;
      this.pendingChangeReason = "text";
      return;
    }

    this.state.selectedLineId = newLineId;
    this.scheduleRender();
    if (this.canDispatchDomEvents()) {
      this.dispatchSelectedLineChanged(newLineId, {
        cursorPosition: 0,
        isCollapsed: true,
        mode: "text-editor",
      });
    }

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
      const didFocus = this.focusLine({
        lineId: newLineId,
        cursorPosition: 0,
      });
      this.state.selectedLineId = newLineId;
      this.scheduleRender();
      if (didFocus && this.canDispatchDomEvents()) {
        this.dispatchSelectedLineChanged(newLineId, {
          cursorPosition: 0,
          isCollapsed: true,
          mode: "text-editor",
        });
      }
    });
  }

  replaceNativeLineRangeSelectionWithParagraphBreak(rangeContext = {}) {
    if (!rangeContext?.isMultiLine) {
      return false;
    }

    const startLineKey = rangeContext.startLineKey;
    const endLineKey = rangeContext.endLineKey;
    const startLineMeta = this.lineMetaByKey.get(startLineKey);
    if (!startLineMeta || !endLineKey) {
      return false;
    }

    const newLineId = generateId();
    this.pendingChangeReason = "structure";
    this.pendingFocusTarget = {
      lineId: newLineId,
      cursorPosition: 0,
    };
    let didReplace = false;

    this.editor.update(
      () => {
        const startLineNode = $getNodeByKey(startLineKey);
        const endLineNode = $getNodeByKey(endLineKey);
        if (!startLineNode || !endLineNode) {
          return;
        }

        const startContent = this.serializeLineContent(startLineNode);
        const endContent = this.serializeLineContent(endLineNode);
        const { before } = splitContentRange(
          startContent,
          rangeContext.startOffset,
          rangeContext.startOffset,
        );
        const { after } = splitContentRange(
          endContent,
          rangeContext.endOffset,
          rangeContext.endOffset,
        );

        startLineNode.clear();
        this.appendParagraphContent(startLineNode, before);
        this.removeLineNodesAfterStartThroughEnd({
          startLineNode,
          endLineKey,
        });

        const nextLineNode = $createParagraphNode();
        this.appendParagraphContent(nextLineNode, after);
        startLineNode.insertAfter(nextLineNode);

        this.lineMetaByKey.set(nextLineNode.getKey(), {
          ...createNewLineMeta(startLineMeta),
          id: newLineId,
        });
        this.lineKeyById.set(newLineId, nextLineNode.getKey());
        nextLineNode.selectStart();
        didReplace = true;

        const selection = $getSelection();
        if ($isRangeSelection(selection) && getContentLength(after) === 0) {
          clearSelectionTextFormatting(selection);
        }
      },
      { discrete: true },
    );

    if (!didReplace) {
      this.pendingFocusTarget = undefined;
      this.pendingChangeReason = "text";
      return false;
    }

    this.state.selectedLineId = newLineId;
    this.scheduleRender();
    if (this.canDispatchDomEvents()) {
      this.dispatchSelectedLineChanged(newLineId, {
        cursorPosition: 0,
        isCollapsed: true,
        mode: "text-editor",
      });
    }

    requestAnimationFrame(() => {
      this.focusLine({
        lineId: newLineId,
        cursorPosition: 0,
      });
    });

    return true;
  }

  mergeCurrentLineBackward({ context, nativeSelection } = {}) {
    context = context ?? this.getLineSelectionContext();
    if (
      !context ||
      context.selection.start !== 0 ||
      context.selection.end !== 0
    ) {
      return false;
    }

    if (this.isNativeSelectionAfterLineStart(context, nativeSelection)) {
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
    let didMerge = false;

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
        applySelectionToLineNode(previousLineNode, {
          lineId: previousLineId,
          start: cursorPosition,
          end: cursorPosition,
        });
        this.pendingFocusTarget = {
          lineId: previousLineId,
          cursorPosition,
          skipPageRestore: true,
        };
        didMerge = true;
      },
      { discrete: true },
    );

    if (didMerge && previousLineId) {
      this.state.selectedLineId = previousLineId;
      this.scheduleRender();
      if (this.canDispatchDomEvents()) {
        this.dispatchSelectedLineChanged(previousLineId, {
          cursorPosition,
          isCollapsed: true,
          mode: "text-editor",
        });
      }
      this.scheduleFocusTargetRestore({
        lineId: previousLineId,
        cursorPosition,
        skipPageRestore: true,
      });
    }

    return didMerge;
  }

  removeLineNodesAfterStartThroughEnd({ startLineNode, endLineKey } = {}) {
    let lineNode = startLineNode?.getNextSibling?.();

    while (lineNode) {
      const nextLineNode = lineNode.getNextSibling();
      const lineKey = lineNode.getKey();
      const lineMeta = this.lineMetaByKey.get(lineKey);

      this.lineMetaByKey.delete(lineKey);
      if (lineMeta?.id) {
        this.lineKeyById.delete(lineMeta.id);
      }
      lineNode.remove();

      if (lineKey === endLineKey) {
        break;
      }

      lineNode = nextLineNode;
    }
  }

  deleteNativeLineRangeSelection(rangeContext = {}) {
    if (!rangeContext?.isMultiLine) {
      return false;
    }

    const startLineKey = rangeContext.startLineKey;
    const endLineKey = rangeContext.endLineKey;
    let didDelete = false;

    this.pendingChangeReason = "structure";
    this.pendingFocusTarget = {
      lineId: rangeContext.startLineId,
      cursorPosition: rangeContext.startOffset,
      skipPageRestore: true,
    };

    this.editor.update(
      () => {
        const startLineNode = $getNodeByKey(startLineKey);
        const endLineNode = $getNodeByKey(endLineKey);
        if (!startLineNode || !endLineNode) {
          return;
        }

        const startContent = this.serializeLineContent(startLineNode);
        const endContent = this.serializeLineContent(endLineNode);
        const { before } = splitContentRange(
          startContent,
          rangeContext.startOffset,
          rangeContext.startOffset,
        );
        const { after } = splitContentRange(
          endContent,
          rangeContext.endOffset,
          rangeContext.endOffset,
        );
        const mergedContent = appendContentArrays(before, after);

        startLineNode.clear();
        this.appendParagraphContent(startLineNode, mergedContent);
        this.removeLineNodesAfterStartThroughEnd({
          startLineNode,
          endLineKey,
        });
        applySelectionToLineNode(startLineNode, {
          lineId: rangeContext.startLineId,
          start: rangeContext.startOffset,
          end: rangeContext.startOffset,
        });
        didDelete = true;
      },
      { discrete: true },
    );

    if (!didDelete) {
      this.pendingFocusTarget = undefined;
      this.pendingChangeReason = "text";
      return false;
    }

    this.state.selectedLineId = rangeContext.startLineId;
    this.scheduleRender();
    if (this.canDispatchDomEvents()) {
      this.dispatchSelectedLineChanged(rangeContext.startLineId, {
        cursorPosition: rangeContext.startOffset,
        isCollapsed: true,
        mode: "text-editor",
      });
    }
    this.scheduleFocusTargetRestore({
      lineId: rangeContext.startLineId,
      cursorPosition: rangeContext.startOffset,
      skipPageRestore: true,
    });

    return true;
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

  insertPlainText(text, { nativeSelection } = {}) {
    const nextText = String(text ?? "").replace(/\r\n?/g, "\n");
    const resolvedNativeSelection =
      nativeSelection ?? this.getNativeLineSelectionContext();

    this.editor.update(
      () => {
        if (resolvedNativeSelection?.lineId) {
          const lineKey = this.lineKeyById.get(resolvedNativeSelection.lineId);
          const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
          if (lineNode) {
            applySelectionToLineNode(lineNode, resolvedNativeSelection);
          }
        }

        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        if (resolvedNativeSelection?.lineId) {
          selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }
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
    const nativeSelection = this.getNativeLineSelectionContext();
    this.editor.update(
      () => {
        if (nativeSelection?.lineId) {
          const lineKey = this.lineKeyById.get(nativeSelection.lineId);
          const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
          if (lineNode) {
            applySelectionToLineNode(lineNode, nativeSelection);
          }
        }

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

  getLineNodeFromNode(node) {
    const root = $getRoot();
    let lineNode = node;

    while (lineNode?.getParent?.() && lineNode.getParent() !== root) {
      lineNode = lineNode.getParent();
    }

    if (!lineNode || lineNode === root || lineNode.getParent?.() !== root) {
      return undefined;
    }

    return lineNode;
  }

  getMentionNodesInLine(lineNode) {
    const mentionNodes = [];

    const visitNode = (node) => {
      if ($isMentionNode(node)) {
        mentionNodes.push(node);
        return;
      }

      if (!$isElementNode(node)) {
        return;
      }

      for (const childNode of node.getChildren()) {
        visitNode(childNode);
      }
    };

    if (lineNode) {
      visitNode(lineNode);
    }

    return mentionNodes;
  }

  getReferenceNodeFromSerializedContentRange(lineNode, start, end = start) {
    if (!lineNode) {
      return undefined;
    }

    const content = this.serializeLineContent(lineNode);
    const lineLength = getContentLength(content);
    const rangeStart = Math.min(Math.max(0, Number(start) || 0), lineLength);
    const rangeEnd = Math.min(
      Math.max(rangeStart, Number(end) || 0),
      lineLength,
    );
    const isCollapsed = rangeStart === rangeEnd;
    const mentionNodes = this.getMentionNodesInLine(lineNode);
    let consumed = 0;
    let referenceIndex = 0;

    for (const item of ensureContentArray(content)) {
      const itemLength = getPlainTextFromContent([item]).length;
      const itemStart = consumed;
      const itemEnd = consumed + itemLength;
      consumed = itemEnd;

      if (!item?.reference) {
        continue;
      }

      const mentionNode = mentionNodes[referenceIndex];
      referenceIndex += 1;
      const isInsideReference =
        isCollapsed && rangeStart > itemStart && rangeStart <= itemEnd;
      const intersectsReference =
        !isCollapsed && rangeStart < itemEnd && rangeEnd > itemStart;
      if (isInsideReference || intersectsReference) {
        return mentionNode;
      }
    }

    return undefined;
  }

  getReferenceNodeBeforeLineOffset(lineNode, offset) {
    return this.getReferenceNodeFromSerializedContentRange(
      lineNode,
      offset,
      offset,
    );
  }

  getReferenceNodeIntersectingLineRange(lineNode, start, end = start) {
    return this.getReferenceNodeFromSerializedContentRange(
      lineNode,
      start,
      end,
    );
  }

  removeReferenceNodeFromBackspace(
    node,
    fallbackLineId,
    fallbackCursorPosition,
  ) {
    const lineNode = this.getLineNodeFromNode(node);
    const lineMeta = lineNode
      ? this.lineMetaByKey.get(lineNode.getKey())
      : undefined;
    const lineId = lineMeta?.id ?? fallbackLineId;
    const offsetResult =
      lineNode && node?.getKey
        ? getLexicalOffsetBeforeNode(lineNode, node.getKey())
        : undefined;
    const cursorPosition = offsetResult?.found
      ? offsetResult.offset
      : Math.max(0, Number(fallbackCursorPosition) || 0);
    const parentNode = node.getParent();
    const referenceIndex = node.getIndexWithinParent();

    this.pendingChangeReason = "text";
    node.remove();
    if ($isElementNode(parentNode)) {
      const caretIndex = Math.min(referenceIndex, parentNode.getChildrenSize());
      parentNode.select(caretIndex, caretIndex);
    }

    if (this.state && lineId) {
      this.state.selectedLineId = lineId;
    }
    this.selectedReferenceNodeKey = undefined;
    this.pendingFocusTarget = lineId
      ? {
          lineId,
          cursorPosition,
        }
      : undefined;

    return {
      lineId,
      cursorPosition,
    };
  }

  handleBackspaceReferenceDelete({ lineId, start, end } = {}) {
    let didHandle = false;
    let focusTarget;

    this.editor.update(
      () => {
        const selection = $getSelection();
        const referenceSelection = getReferenceSelectionInfo(selection);
        const selectedReferenceCandidate = this.selectedReferenceNodeKey
          ? $getNodeByKey(this.selectedReferenceNodeKey)
          : undefined;
        let selectedReferenceNode = $isMentionNode(selectedReferenceCandidate)
          ? selectedReferenceCandidate
          : undefined;
        if (selectedReferenceNode) {
          const selectedReferenceLineNode = this.getLineNodeFromNode(
            selectedReferenceNode,
          );
          const selectedReferenceLineId = selectedReferenceLineNode
            ? this.lineMetaByKey.get(selectedReferenceLineNode.getKey())?.id
            : undefined;
          if (
            lineId &&
            selectedReferenceLineId &&
            selectedReferenceLineId !== lineId
          ) {
            selectedReferenceNode = undefined;
            this.selectedReferenceNodeKey = undefined;
          }
        }

        const wholeSelectedReferenceNode =
          referenceSelection?.isWhole === true
            ? referenceSelection.node
            : undefined;
        const referenceNodeToRemove =
          selectedReferenceNode ?? wholeSelectedReferenceNode;

        if ($isMentionNode(referenceNodeToRemove)) {
          const referenceLineNode = this.getLineNodeFromNode(
            referenceNodeToRemove,
          );
          const referenceLineId = referenceLineNode
            ? this.lineMetaByKey.get(referenceLineNode.getKey())?.id
            : undefined;
          if (lineId && referenceLineId && referenceLineId !== lineId) {
            return;
          }

          focusTarget = this.removeReferenceNodeFromBackspace(
            referenceNodeToRemove,
            lineId,
            start,
          );
          didHandle = true;
          return;
        }

        if (referenceSelection?.node) {
          this.selectReferenceNodeAsElement(referenceSelection.node);
          didHandle = true;
          return;
        }

        if (!lineId || (start === end && start <= 0)) {
          return;
        }

        const lineKey = this.lineKeyById.get(lineId);
        const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
        const referenceNode =
          this.getReferenceNodeIntersectingLineRange(lineNode, start, end) ??
          (start === end
            ? this.getReferenceNodeBeforeLineOffset(lineNode, start)
            : undefined);
        if (!$isMentionNode(referenceNode)) {
          return;
        }

        this.selectReferenceNodeAsElement(referenceNode);
        didHandle = true;
      },
      { discrete: true },
    );

    if (!didHandle) {
      return false;
    }

    if (this.state && lineId) {
      this.state.selectedLineId = lineId;
    }
    this.updateReferenceSelectionMarkers();
    if (typeof requestAnimationFrame === "function") {
      this.scheduleRender();
      if (focusTarget?.lineId) {
        this.scheduleFocusTargetRestore(focusTarget);
      }
    }

    return true;
  }

  getLineContentLength(lineId) {
    if (!lineId || typeof this.editor?.getEditorState !== "function") {
      return undefined;
    }

    return this.editor.getEditorState().read(() => {
      const lineKey = this.lineKeyById.get(lineId);
      const lineNode = lineKey ? $getNodeByKey(lineKey) : undefined;
      if (!lineNode) {
        return undefined;
      }

      return getContentLength(this.serializeLineContent(lineNode));
    });
  }

  handleBackspaceDelete({
    nativeSelection = this.getNativeLineSelectionContext(),
    nativeLineRangeSelection,
  } = {}) {
    const resolvedLineRangeSelection =
      nativeLineRangeSelection ??
      (!nativeSelection?.lineId
        ? this.getNativeLineRangeSelectionContext()
        : undefined);

    if (!nativeSelection?.lineId) {
      if (resolvedLineRangeSelection?.isMultiLine) {
        return this.deleteNativeLineRangeSelection(resolvedLineRangeSelection);
      }

      return false;
    }

    const selectionStart = nativeSelection.start ?? nativeSelection.offset;
    const selectionEnd =
      nativeSelection.end ?? nativeSelection.start ?? nativeSelection.offset;
    if (
      typeof selectionStart !== "number" ||
      typeof selectionEnd !== "number"
    ) {
      return false;
    }

    const lineContentLength = this.getLineContentLength(nativeSelection.lineId);
    const normalizedSelectionStart =
      typeof lineContentLength === "number"
        ? Math.min(Math.max(0, selectionStart), lineContentLength)
        : selectionStart;
    const normalizedSelectionEnd =
      typeof lineContentLength === "number"
        ? Math.min(Math.max(0, selectionEnd), lineContentLength)
        : selectionEnd;
    const start = Math.min(normalizedSelectionStart, normalizedSelectionEnd);
    const end = Math.max(normalizedSelectionStart, normalizedSelectionEnd);

    if (
      this.handleBackspaceReferenceDelete({
        lineId: nativeSelection.lineId,
        start,
        end,
      })
    ) {
      return true;
    }

    if (start !== end) {
      return this.deleteNativeLineContentRange({
        lineId: nativeSelection.lineId,
        start,
        end,
      });
    }

    if (start > 0) {
      const deleteStart = start - 1;
      if (
        this.handleBackspaceReferenceDelete({
          lineId: nativeSelection.lineId,
          start: deleteStart,
          end: start,
        })
      ) {
        return true;
      }

      return this.deleteNativeLineContentRange({
        lineId: nativeSelection.lineId,
        start: deleteStart,
        end: start,
      });
    }

    const context = this.getLineSelectionContextFromLineSelection({
      lineId: nativeSelection.lineId,
      start: 0,
      end: 0,
    });
    return this.mergeCurrentLineBackward({
      context,
      nativeSelection: {
        lineId: nativeSelection.lineId,
        offset: 0,
      },
    });
  }

  deleteNativeLineContentRange({ lineId, start, end } = {}) {
    if (!lineId) {
      return false;
    }

    const lineKey = this.lineKeyById.get(lineId);
    if (!lineKey) {
      return false;
    }

    let didDelete = false;
    const cursorPosition = Math.max(0, Number(start) || 0);
    const focusTarget = {
      lineId,
      cursorPosition,
    };
    this.editor.update(
      () => {
        const lineNode = $getNodeByKey(lineKey);
        const lineMeta = lineNode
          ? this.lineMetaByKey.get(lineNode.getKey())
          : undefined;
        if (!lineNode || !lineMeta) {
          return;
        }

        this.deleteLineContentRange(lineNode, lineMeta, start, end);
        didDelete = true;
      },
      { discrete: true },
    );

    if (didDelete) {
      if (this.state) {
        this.state.selectedLineId = lineId;
      }
      if (typeof requestAnimationFrame === "function") {
        this.scheduleRender();
        this.scheduleFocusTargetRestore(focusTarget);
      }
    }

    return didDelete;
  }

  scheduleFocusTargetRestore(focusTarget = {}) {
    if (!focusTarget?.lineId || typeof requestAnimationFrame !== "function") {
      return;
    }

    const lineFocusTarget = {
      lineId: focusTarget.lineId,
      cursorPosition: focusTarget.cursorPosition,
    };
    const focusRestoreSequenceId = this.advanceFocusRestoreSequence();

    requestAnimationFrame(() => {
      if (this.focusRestoreSequenceId !== focusRestoreSequenceId) {
        return;
      }

      if (this.isEditorActiveElement() && this.state.mode === "text-editor") {
        this.restoreTextEditorFocusState();
        this.markProgrammaticFocusRestore(lineFocusTarget);
        this.restoreLineSelection(lineFocusTarget);
        return;
      }

      this.focusLine(lineFocusTarget);
    });
  }

  deleteCharacterBackward({
    nativeSelection = this.getNativeLineSelectionContext(),
  } = {}) {
    this.editor.update(
      () => {
        const nativeLineKey = nativeSelection?.lineId
          ? this.lineKeyById?.get(nativeSelection.lineId)
          : undefined;
        const nativeLineNode = nativeLineKey
          ? $getNodeByKey(nativeLineKey)
          : undefined;
        if (nativeLineNode) {
          applySelectionToLineNode(nativeLineNode, {
            lineId: nativeSelection.lineId,
            start: nativeSelection.start ?? nativeSelection.offset,
            end:
              nativeSelection.end ??
              nativeSelection.start ??
              nativeSelection.offset,
          });
        }

        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          return;
        }

        if (selection.isCollapsed()) {
          selection = $getSelection();
          if (!$isRangeSelection(selection)) {
            return;
          }

          const selectionLineNode = this.getLineNodeFromSelection(selection);
          const lineNode = nativeLineNode ?? selectionLineNode;
          const lineMeta = lineNode
            ? this.lineMetaByKey.get(lineNode.getKey())
            : undefined;
          const nativeLineSelection =
            nativeSelection?.lineId === lineMeta?.id
              ? {
                  start: nativeSelection.start ?? nativeSelection.offset,
                  end:
                    nativeSelection.end ??
                    nativeSelection.start ??
                    nativeSelection.offset,
                }
              : undefined;
          const lineSelection =
            lineNode && nativeLineSelection
              ? nativeLineSelection
              : lineNode && lineNode === selectionLineNode
                ? getSelectionOffsets(lineNode, selection)
                : undefined;
          const lineContent = lineNode
            ? this.serializeLineContent(lineNode)
            : undefined;
          const lineText =
            getPlainTextFromContent(lineContent) ||
            lineNode?.getTextContent() ||
            "";
          const nativeCursorOffset =
            nativeSelection?.offset ?? nativeSelection?.start;

          if (
            lineNode &&
            lineMeta &&
            lineSelection?.start === lineSelection?.end &&
            lineSelection.start <= 1 &&
            /^\s/.test(lineText)
          ) {
            this.deleteLineContentRange(lineNode, lineMeta, 0, 1);
            return;
          }

          if (
            lineNode &&
            lineMeta &&
            lineSelection?.start === lineSelection?.end &&
            nativeSelection?.lineId === lineMeta.id &&
            nativeCursorOffset > 0
          ) {
            this.deleteLineContentBackwardAtOffset(
              lineNode,
              lineMeta,
              nativeCursorOffset,
            );
            return;
          }

          if (
            lineNode &&
            lineMeta &&
            lineSelection?.start === 0 &&
            lineSelection.end === 0
          ) {
            return;
          }

          selection.deleteCharacter(true);
          return;
        }

        selection.removeText();
      },
      { discrete: true },
    );
  }

  deleteLineContentBackwardAtOffset(lineNode, lineMeta, offset) {
    const deleteEnd = Math.max(0, Number(offset) || 0);
    const deleteStart = Math.max(0, deleteEnd - 1);
    this.deleteLineContentRange(lineNode, lineMeta, deleteStart, deleteEnd);
  }

  deleteLineContentRange(lineNode, lineMeta, start, end) {
    const deleteStart = Math.max(0, Number(start) || 0);
    const deleteEnd = Math.max(deleteStart, Number(end) || 0);
    const { before, after } = splitContentRange(
      this.serializeLineContent(lineNode),
      deleteStart,
      deleteEnd,
    );

    lineNode.clear();
    this.appendParagraphContent(lineNode, appendContentArrays(before, after));
    applySelectionToLineNode(lineNode, {
      lineId: lineMeta.id,
      start: deleteStart,
      end: deleteStart,
    });
    this.pendingFocusTarget = {
      lineId: lineMeta.id,
      cursorPosition: deleteStart,
    };
    if (this.state) {
      this.state.selectedLineId = lineMeta.id;
    }
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

  closeMentionMenu({
    shouldRender = false,
    dismissCurrentTrigger = false,
  } = {}) {
    if (dismissCurrentTrigger) {
      this.dismissCurrentMentionTrigger();
    }
    this.pendingTypedSlashMentionTrigger = undefined;
    this.clearMentionMenuFocusRestore();
    this.state.mentionMenu = createClosedMentionMenuState();

    if (this.refs.mentionMenu) {
      this.refs.mentionMenu.items = [];
      this.refs.mentionMenu.open = false;
      this.refs.mentionMenu.render?.();
    } else if (shouldRender) {
      this.renderMentionMenu();
    }
  }

  hasActiveMentionTrigger() {
    if (!this.isEditorFocused) {
      return false;
    }

    try {
      return Boolean(this.readEditorSnapshot().mentionTrigger);
    } catch {
      return false;
    }
  }

  shouldPreserveMentionMenuAfterSelectionLoss() {
    if (!this.state.mentionMenu.isOpen || !this.isEditorFocused) {
      return false;
    }

    return this.isMentionMenuFocusTarget(document.activeElement);
  }

  shouldPreserveMentionMenuUntilFirstRender(editorState) {
    const menuState = this.state.mentionMenu;
    if (
      !menuState?.isOpen ||
      this.refs.mentionMenu?.open === true ||
      !this.isEditorFocused ||
      !menuState.nodeKey
    ) {
      return false;
    }

    try {
      return editorState.read(() => {
        const node = $getNodeByKey(menuState.nodeKey);
        const trigger = getMentionTriggerFromTextNode(
          node,
          menuState.endOffset,
          { source: "pending-menu-render" },
        );

        return (
          trigger?.nodeKey === menuState.nodeKey &&
          trigger.startOffset === menuState.startOffset &&
          trigger.endOffset === menuState.endOffset &&
          trigger.query === menuState.query
        );
      });
    } catch {
      return false;
    }
  }

  getMentionTriggerSelectionSnapshot(triggerState = {}) {
    if (!triggerState.nodeKey || !this.editor) {
      return undefined;
    }

    return this.editor.getEditorState().read(() => {
      const node = $getNodeByKey(triggerState.nodeKey);
      if (!$isTextNode(node) || $isMentionNode(node)) {
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

      const nodeLength = getLexicalTextLength(node);
      const localOffset = Math.max(
        0,
        Math.min(Number(triggerState.endOffset) || 0, nodeLength),
      );
      const offset = result.offset + localOffset;
      return {
        lineId: lineMeta.id,
        start: offset,
        end: offset,
      };
    });
  }

  restoreMentionTriggerSelection(triggerState = {}) {
    const snapshot = this.getMentionTriggerSelectionSnapshot(triggerState);
    if (snapshot?.lineId) {
      const focusTarget = {
        lineId: snapshot.lineId,
        cursorPosition: snapshot.start,
        forceRestore: true,
      };
      this.state.selectedLineId = snapshot.lineId;
      this.isEditorFocused = true;
      this.applyModeState("text-editor");
      this.markProgrammaticFocusRestore(focusTarget);
      this.focus({ preventScroll: true });
      this.restoreLineSelection(snapshot);
      this.restoreLineSelectionAfterLexicalFocus(focusTarget);
      this.scheduleRender();
      return true;
    }

    if (!triggerState.lineId) {
      return false;
    }

    return this.focusLine({
      lineId: triggerState.lineId,
      cursorPosition: Number.isFinite(triggerState.endOffset)
        ? triggerState.endOffset
        : undefined,
    });
  }

  getActiveMentionTriggerState() {
    try {
      const mentionTrigger = this.readEditorSnapshot().mentionTrigger;
      return mentionTrigger
        ? {
            ...this.state.mentionMenu,
            ...mentionTrigger,
          }
        : undefined;
    } catch {
      return undefined;
    }
  }

  getMentionTriggerSignature(trigger = {}) {
    if (!trigger.nodeKey) {
      return undefined;
    }

    const signature = {
      nodeKey: trigger.nodeKey,
      startOffset: trigger.startOffset,
      endOffset: trigger.endOffset,
      query: trigger.query ?? "",
    };
    if (trigger.lineId) {
      signature.lineId = trigger.lineId;
    }
    return signature;
  }

  dismissMentionTrigger(trigger = {}) {
    const signature = this.getMentionTriggerSignature(trigger);
    if (signature) {
      this.dismissedMentionTrigger = signature;
      this.dismissedMentionTriggerScope = {
        nodeKey: signature.nodeKey,
        query: signature.query,
        until: this.getNow() + PROGRAMMATIC_FOCUS_BLUR_SUPPRESS_MS,
      };
    }
  }

  dismissCurrentMentionTrigger() {
    this.dismissMentionTrigger(this.state.mentionMenu);
  }

  armMentionMenuOpenFromTypedSlash({ source = "input" } = {}) {
    this.pendingTypedSlashMentionTrigger = {
      source,
      until: this.getNow() + TYPED_SLASH_MENTION_TRIGGER_WINDOW_MS,
    };
    this.dismissedMentionTrigger = undefined;
    this.dismissedMentionTriggerScope = undefined;
  }

  isSameMentionTriggerRoot(left = {}, right = {}) {
    if (!left.nodeKey || !right.nodeKey) {
      return false;
    }

    return (
      left.nodeKey === right.nodeKey &&
      left.lineId === right.lineId &&
      left.startOffset === right.startOffset
    );
  }

  isOpenMentionTriggerContinuation(trigger = {}) {
    return (
      this.state.mentionMenu?.isOpen === true &&
      this.isSameMentionTriggerRoot(trigger, this.state.mentionMenu)
    );
  }

  consumeTypedSlashMentionTriggerOpen(trigger = {}) {
    const pendingTrigger = this.pendingTypedSlashMentionTrigger;
    if (!pendingTrigger) {
      return undefined;
    }

    if (this.getNow() > pendingTrigger.until) {
      this.pendingTypedSlashMentionTrigger = undefined;
      return undefined;
    }

    if (trigger.query !== "" || trigger.endOffset !== trigger.startOffset + 1) {
      return undefined;
    }

    this.pendingTypedSlashMentionTrigger = undefined;
    return pendingTrigger.source;
  }

  getMentionTriggerOpenReason(trigger = {}) {
    if (this.isOpenMentionTriggerContinuation(trigger)) {
      return "continuation";
    }

    const typedSlashSource = this.consumeTypedSlashMentionTriggerOpen(trigger);
    if (typedSlashSource) {
      return typedSlashSource;
    }

    return undefined;
  }

  isDismissedMentionTrigger(trigger = {}) {
    const signature = this.getMentionTriggerSignature(trigger);
    const dismissed = this.dismissedMentionTrigger;
    const isExactDismissed = Boolean(
      signature &&
        dismissed &&
        signature.nodeKey === dismissed.nodeKey &&
        signature.lineId === dismissed.lineId &&
        signature.startOffset === dismissed.startOffset &&
        signature.endOffset === dismissed.endOffset &&
        signature.query === dismissed.query,
    );
    if (isExactDismissed) {
      return true;
    }

    const scope = this.dismissedMentionTriggerScope;
    if (!signature || !scope) {
      return false;
    }

    if (this.getNow() > scope.until) {
      this.dismissedMentionTriggerScope = undefined;
      return false;
    }

    return (
      signature.nodeKey === scope.nodeKey && signature.query === scope.query
    );
  }

  clearMentionMenuFocusRestore() {
    if (this.mentionMenuFocusRestoreTimerId !== undefined) {
      clearTimeout(this.mentionMenuFocusRestoreTimerId);
      this.mentionMenuFocusRestoreTimerId = undefined;
    }
  }

  isMentionMenuFocusTarget(element) {
    if (!element) {
      return false;
    }

    if (element === this.refs.mentionMenu) {
      return true;
    }

    if (this.refs.mentionMenu?.contains?.(element)) {
      return true;
    }

    if (this.refs.mentionMenu?.shadowRoot?.contains?.(element)) {
      return true;
    }

    const popover =
      this.refs.mentionMenu?.shadowRoot?.querySelector?.("rtgl-popover");
    const popoverDialog = popover?.shadowRoot?.querySelector?.("dialog");
    return Boolean(
      element === popover ||
        element === popoverDialog ||
        popover?.contains?.(element) ||
        popover?.shadowRoot?.contains?.(element) ||
        (this.refs.mentionMenu?.open === true &&
          element.tagName === "DIALOG" &&
          element.querySelector?.(".popover-container")),
    );
  }

  getMentionMenuPopover() {
    return this.refs.mentionMenu?.shadowRoot?.querySelector?.("rtgl-popover");
  }

  getMentionMenuPositionForTrigger(trigger = {}) {
    const surfaceRect = this.refs.surface.getBoundingClientRect();
    const editorRect = this.refs.editor.getBoundingClientRect();
    const maxLeft = Math.max(12, surfaceRect.width - 292);
    const lineKey = trigger.lineId
      ? this.lineKeyById.get(trigger.lineId)
      : undefined;
    const lineElement = lineKey
      ? this.editor.getElementByKey(lineKey)
      : undefined;
    const triggerRange =
      lineElement && Number.isFinite(trigger.endOffset)
        ? createCollapsedRangeAtPosition(lineElement, trigger.endOffset).range
        : undefined;
    const triggerRect =
      triggerRange?.getBoundingClientRect?.() ??
      lineElement?.getBoundingClientRect?.() ??
      editorRect;

    return {
      left:
        surfaceRect.left +
        Math.max(12, Math.min(maxLeft, triggerRect.left - surfaceRect.left)),
      top:
        surfaceRect.top +
        Math.max(18, triggerRect.bottom - surfaceRect.top + 12),
    };
  }

  syncMentionMenuPopover() {
    const popover = this.getMentionMenuPopover();
    if (popover?.hasAttribute("no-overlay")) {
      popover.removeAttribute("no-overlay");
    }

    const dialog = popover?.shadowRoot?.querySelector?.("dialog");
    if (dialog && dialog.getAttribute("tabindex") !== "-1") {
      dialog.setAttribute("tabindex", "-1");
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

        const mentionNode = $createMentionNode({
          resourceId: mention.id,
          label: mention.label,
        });
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
    const traceId = createSceneEditorTimingTraceId("lexical-update");
    const updateStartedAt = getSceneEditorTimingNow();
    const snapshotStartedAt = getSceneEditorTimingNow();
    const snapshot = this.readEditorSnapshot(editorState);
    const snapshotDurationMs =
      getSceneEditorTimingDurationMs(snapshotStartedAt);
    const changeReason = this.pendingChangeReason;

    const ownsFocus = this.isEditorFocused === true;
    const previousLines = this.state.lines;
    const previousSelectedLineId = this.state.selectedLineId;
    const cloneStartedAt = getSceneEditorTimingNow();
    this.state.lines = cloneSceneEditorLines(snapshot.lines);
    const cloneDurationMs = getSceneEditorTimingDurationMs(cloneStartedAt);
    this.state.selectedLineId =
      this.state.mode === "block" || !ownsFocus
        ? previousSelectedLineId
        : snapshot.selectedLineId;
    this.state.activeFormats = snapshot.activeFormats;
    const plainTextStartedAt = getSceneEditorTimingNow();
    this.state.plainText = snapshot.lines
      .map((line) => getPlainTextFromContent(getLineDialogueContent(line)))
      .join("\n");
    const plainTextDurationMs =
      getSceneEditorTimingDurationMs(plainTextStartedAt);

    const mentionStartedAt = getSceneEditorTimingNow();
    if (snapshot.mentionTrigger) {
      const openReason = this.getMentionTriggerOpenReason(
        snapshot.mentionTrigger,
      );

      if (!openReason) {
        if (
          this.state.mentionMenu?.isOpen === true &&
          !this.shouldPreserveMentionMenuAfterSelectionLoss()
        ) {
          this.closeMentionMenu({
            dismissCurrentTrigger: true,
          });
        } else if (this.state.mentionMenu?.isOpen === true) {
          this.refs.mentionMenu.open = true;
          this.syncMentionMenuPopover();
        } else {
          this.closeMentionMenu();
        }
      } else if (
        openReason !== "continuation" &&
        this.isDismissedMentionTrigger(snapshot.mentionTrigger)
      ) {
        this.closeMentionMenu();
      } else {
        if (openReason !== "continuation") {
          this.dismissedMentionTrigger = undefined;
          this.dismissedMentionTriggerScope = undefined;
        }
        const items = filterMentionSuggestions(
          snapshot.mentionTrigger.query,
          this.state.mentionTargets,
        );
        this.state.mentionMenu = {
          isOpen: true,
          query: snapshot.mentionTrigger.query,
          items,
          highlightedIndex: 0,
          left: 12,
          top: 18,
          nodeKey: snapshot.mentionTrigger.nodeKey,
          lineId: snapshot.mentionTrigger.lineId,
          startOffset: snapshot.mentionTrigger.startOffset,
          endOffset: snapshot.mentionTrigger.endOffset,
        };

        const position = this.getMentionMenuPositionForTrigger(
          snapshot.mentionTrigger,
        );
        this.state.mentionMenu.left = position.left;
        this.state.mentionMenu.top = position.top;
      }
    }

    if (!snapshot.mentionTrigger) {
      if (this.shouldPreserveMentionMenuUntilFirstRender(editorState)) {
        this.syncMentionMenuPopover();
      } else if (this.shouldPreserveMentionMenuAfterSelectionLoss()) {
        this.refs.mentionMenu.open = true;
        this.syncMentionMenuPopover();
      } else {
        this.closeMentionMenu();
      }
    }
    const mentionDurationMs = getSceneEditorTimingDurationMs(mentionStartedAt);

    this.scheduleRender();

    const diffStartedAt = getSceneEditorTimingNow();
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
    const diffDurationMs = getSceneEditorTimingDurationMs(diffStartedAt);

    const focusTarget = this.pendingFocusTarget;
    let dispatchDurationMs = 0;
    if (didLinesChange && !this.isApplyingExternalLines && ownsFocus) {
      const dispatchStartedAt = getSceneEditorTimingNow();
      const detail = {
        lines: cloneSceneEditorLines(this.state.lines),
        selectedLineId: this.state.selectedLineId,
        reason: this.pendingChangeReason,
        traceId,
      };
      if (focusTarget?.lineId) {
        detail.focusTarget = focusTarget;
      }
      this.dispatchEvent(
        new CustomEvent("scene-lines-changed", {
          detail,
          bubbles: true,
        }),
      );
      dispatchDurationMs = getSceneEditorTimingDurationMs(dispatchStartedAt);
    }
    if (focusTarget) {
      this.pendingFocusTarget = undefined;
    }

    if (previousSelectedLineId !== this.state.selectedLineId) {
      this.dispatchSelectedLineChanged(this.state.selectedLineId);
    }

    this.pendingChangeReason = "text";
    emitSceneEditorTiming("lexical.update", {
      traceId,
      durationMs: getSceneEditorTimingDurationMs(updateStartedAt),
      snapshotDurationMs,
      cloneDurationMs,
      plainTextDurationMs,
      mentionDurationMs,
      diffDurationMs,
      dispatchDurationMs,
      lineCount: this.state.lines.length,
      previousLineCount: previousLines.length,
      didLinesChange,
      didDispatchLinesChange:
        didLinesChange && !this.isApplyingExternalLines && ownsFocus,
      ownsFocus,
      isComposing: this.isComposing === true,
      mode: this.state.mode,
      reason: changeReason,
      selectedLineId: this.state.selectedLineId,
      mentionOpen: this.state.mentionMenu?.isOpen === true,
    });
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

    const detail = {
      lineId,
      cursorPosition: selectionDetail?.cursorPosition,
      isCollapsed: selectionDetail?.isCollapsed === true,
      mode: selectionDetail?.mode || this.state.mode,
    };
    if (selectionDetail?.navigationDirection) {
      detail.navigationDirection = selectionDetail.navigationDirection;
    }
    if (selectionDetail?.isBoundaryNavigation === true) {
      detail.isBoundaryNavigation = true;
    }

    this.dispatchEvent(
      new CustomEvent("selected-line-changed", {
        detail,
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
    this.refs.editor.dataset.mode = this.state.mode;
    this.style.setProperty(
      "--left-gutter-width",
      `${this.state.showLineNumbers ? LEFT_GUTTER_WIDTH_WITH_NUMBERS : LEFT_GUTTER_WIDTH_WITHOUT_NUMBERS}px`,
    );
    this.style.setProperty(
      "--right-gutter-width",
      `${this.rightGutterWidth}px`,
    );
    this.style.setProperty(
      "--scene-document-editor-font-size",
      EDITOR_FONT_SIZE_VALUES[this.state.fontSize],
    );
    this.refs.placeholder.hidden = this.state.plainText.length > 0;
    this.refs.placeholder.textContent = this.state.placeholder;
    this.renderGutters();
    this.renderMentionMenu();
    this.updateReferenceSelectionMarkers();
  }

  clearRenderedSelectionState() {
    this.refs?.editor
      ?.querySelectorAll?.('.editor-paragraph[data-selected="true"]')
      ?.forEach((lineElement) => {
        lineElement.dataset.selected = "false";
      });

    this.refs?.leftGutter
      ?.querySelectorAll?.('.gutter-row[data-selected="true"]')
      ?.forEach((row) => {
        row.dataset.selected = "false";
      });

    this.refs?.rightGutter
      ?.querySelectorAll?.('.gutter-row[data-selected="true"]')
      ?.forEach((row) => {
        row.dataset.selected = "false";
      });
  }

  renderGutters() {
    const renderStartedAt = getSceneEditorTimingNow();
    const lineDecorationsById = new Map();

    for (const lineDecoration of this.state.lineDecorations) {
      if (!lineDecoration?.id) {
        continue;
      }

      lineDecorationsById.set(lineDecoration.id, lineDecoration);
    }

    let layoutReadCount = 0;
    let measuredLineCount = 0;
    let previewRowsCreated = 0;
    let rightGutterMeasurementCount = 0;
    let rowReplaceCount = 0;
    const surfaceRect = this.refs.surface.getBoundingClientRect();
    layoutReadCount += 1;
    const maxRightGutterWidth = this.getMaxRightGutterWidth();
    layoutReadCount += 1;
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
      layoutReadCount += 1;
      measuredLineCount += 1;
      const top = Math.max(0, lineRect.top - surfaceRect.top);
      const height = Math.max(24, lineRect.height);
      const isSelected =
        this.state.selectionActive !== false &&
        line.id === this.state.selectedLineId;
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
      if (this.updateLeftGutterRow(leftRow, lineDecoration, index)) {
        rowReplaceCount += 1;
      }
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
      previewRowsCreated += 1;
      if (this.updateRightGutterRow(rightRow, lineDecoration, previewItems)) {
        rowReplaceCount += 1;
      }
      const lineRightGutter = this.syncLineRightGutterWidth(
        lineElement,
        rightRow,
        maxRightGutterWidth,
      );
      layoutReadCount += 1;
      rightGutterMeasurementCount += 1;
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

    emitSceneEditorTiming("lexical.gutters", {
      durationMs: getSceneEditorTimingDurationMs(renderStartedAt),
      lineCount: this.state.lines.length,
      decorationCount: this.state.lineDecorations.length,
      measuredLineCount,
      layoutReadCount,
      previewRowsCreated,
      rightGutterMeasurementCount,
      rowReplaceCount,
      shouldRenderAgain,
      showLineNumbers: this.state.showLineNumbers,
      selectedLineId: this.state.selectedLineId,
      mode: this.state.mode,
    });
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
      return false;
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
    return true;
  }

  updateRightGutterRow(row, lineDecoration = {}, previewItems) {
    const signature = this.buildRightGutterSignature(lineDecoration);
    if (row.dataset.signature === signature) {
      return false;
    }

    row.dataset.signature = signature;
    row.replaceChildren(previewItems);
    return true;
  }

  buildRightGutterSignature(lineDecoration = {}) {
    return JSON.stringify({
      background: lineDecoration.background,
      characterSprites: lineDecoration.characterSprites,
      visual: lineDecoration.visual,
      screenTransition: Boolean(lineDecoration.screenTransition),
      sectionTransition: Boolean(lineDecoration.sectionTransition),
      hasDialogueLayout: Boolean(lineDecoration.hasDialogueLayout),
      dialogueModeLabel: lineDecoration.dialogueModeLabel || "",
      dialogueChangeType: lineDecoration.dialogueChangeType,
      hasControl: Boolean(lineDecoration.hasControl),
      controlChangeType: lineDecoration.controlChangeType,
      bgm: lineDecoration.bgm,
      hasVoice: Boolean(lineDecoration.hasVoice),
      voiceChangeType: lineDecoration.voiceChangeType,
      hasSfx: Boolean(lineDecoration.hasSfx),
      sfxChangeType: lineDecoration.sfxChangeType,
      hasChoices: Boolean(lineDecoration.hasChoices),
      hasConditional: Boolean(lineDecoration.hasConditional),
      hasUpdateVariable: Boolean(lineDecoration.hasUpdateVariable),
      hasInput: Boolean(lineDecoration.hasInput),
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

  getLineElementFromEvent(event) {
    const target = event?.composedPath?.()[0] ?? event?.target;
    const element =
      target?.nodeType === Node.TEXT_NODE ? target.parentElement : target;
    return element?.closest?.(".editor-paragraph");
  }

  getLineIdFromLineElement(lineElement) {
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

  getCaretRangeFromPointerEvent(event, lineElement) {
    if (!event || !lineElement) {
      return undefined;
    }

    const root = lineElement.getRootNode?.();
    const createRangeFromCaretPosition = (position) => {
      if (!position?.offsetNode) {
        return undefined;
      }

      const range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
      range.collapse(true);
      return range;
    };

    if (typeof document.caretPositionFromPoint === "function") {
      try {
        const position =
          root instanceof ShadowRoot
            ? document.caretPositionFromPoint(event.clientX, event.clientY, {
                shadowRoots: [root],
              })
            : document.caretPositionFromPoint(event.clientX, event.clientY);
        const range = createRangeFromCaretPosition(position);
        if (range) {
          return range;
        }
      } catch {
        try {
          const position = document.caretPositionFromPoint(
            event.clientX,
            event.clientY,
          );
          const range = createRangeFromCaretPosition(position);
          if (range) {
            return range;
          }
        } catch {
          // Fall through to the legacy API.
        }
      }
    }

    if (typeof document.caretRangeFromPoint !== "function") {
      return undefined;
    }

    try {
      return document.caretRangeFromPoint(event.clientX, event.clientY);
    } catch {
      return undefined;
    }
  }

  getLineOffsetFromRange(lineElement, range) {
    if (
      !lineElement ||
      !range?.startContainer ||
      (range.startContainer !== lineElement &&
        !lineElement.contains(range.startContainer))
    ) {
      return undefined;
    }

    try {
      const prefixRange = document.createRange();
      prefixRange.selectNodeContents(lineElement);
      prefixRange.setEnd(range.startContainer, range.startOffset);
      return prefixRange.toString().replaceAll(EDITOR_CARET_TEXT, "").length;
    } catch {
      return undefined;
    }
  }

  getLineOffsetFromPointerEvent(event, lineElement) {
    const caretRange = this.getCaretRangeFromPointerEvent(event, lineElement);
    const caretOffset = this.getLineOffsetFromRange(lineElement, caretRange);
    if (typeof caretOffset === "number") {
      return caretOffset;
    }

    if ((lineElement?.textContent?.length ?? 0) === 0) {
      return 0;
    }

    return -1;
  }

  isPointerInTrailingLineBoundary(event, lineElement) {
    const clientX = Number(event?.clientX);
    const clientY = Number(event?.clientY);
    if (
      !lineElement ||
      !Number.isFinite(clientX) ||
      !Number.isFinite(clientY)
    ) {
      return false;
    }

    const range = document.createRange();
    try {
      range.selectNodeContents(lineElement);
    } catch {
      return false;
    }

    const rects = Array.from(range.getClientRects?.() ?? []).filter((rect) => {
      return rect.width > 0 || rect.height > 0;
    });
    const trailingRect = rects.at(-1);
    if (!trailingRect) {
      return false;
    }

    const lineRect = lineElement.getBoundingClientRect?.();
    if (!lineRect) {
      return false;
    }

    const verticalTolerance = 2;
    return (
      clientY >= trailingRect.top - verticalTolerance &&
      clientY <= trailingRect.bottom + verticalTolerance &&
      clientX >= trailingRect.right &&
      clientX <= lineRect.right
    );
  }

  getLineVisibleTextLength(lineElement) {
    return (lineElement?.textContent ?? "").replaceAll(EDITOR_CARET_TEXT, "")
      .length;
  }

  getNativeCollapsedLineSelectionContext() {
    const selection = this.getNativeLineSelectionContext();
    if (
      selection?.lineId &&
      selection.start === selection.end &&
      typeof selection.start === "number"
    ) {
      return {
        lineId: selection.lineId,
        offset: selection.start,
      };
    }

    return undefined;
  }

  createNativeSelectionRange(rangeLike) {
    if (!rangeLike?.startContainer || !rangeLike?.endContainer) {
      return undefined;
    }

    if (
      !this.refs?.editor?.contains?.(rangeLike.startContainer) ||
      !this.refs?.editor?.contains?.(rangeLike.endContainer)
    ) {
      return undefined;
    }

    const range = document.createRange();
    try {
      range.setStart(rangeLike.startContainer, rangeLike.startOffset);
      range.setEnd(rangeLike.endContainer, rangeLike.endOffset);
    } catch {
      return undefined;
    }

    return range;
  }

  getLineSelectionContextFromRange(rangeLike) {
    const range = this.createNativeSelectionRange(rangeLike);
    if (!range) {
      return undefined;
    }

    if (!range.collapsed) {
      const startLineElement = this.getLineElementFromRangePoint(
        range.startContainer,
        range.startOffset,
      );
      const endLineElement = this.getLineElementFromRangePoint(
        range.endContainer,
        range.endOffset,
      );
      const startLineId = this.getLineIdFromLineElement(startLineElement);
      const endLineId = this.getLineIdFromLineElement(endLineElement);
      const startOffset = this.getLineOffsetFromRange(startLineElement, range);
      const endRange = document.createRange();

      try {
        endRange.setStart(range.endContainer, range.endOffset);
        endRange.setEnd(range.endContainer, range.endOffset);
      } catch {
        return undefined;
      }

      const endOffset = this.getLineOffsetFromRange(endLineElement, endRange);
      if (
        !startLineId ||
        startLineId !== endLineId ||
        typeof startOffset !== "number" ||
        typeof endOffset !== "number"
      ) {
        return undefined;
      }

      return {
        lineId: startLineId,
        start: Math.min(startOffset, endOffset),
        end: Math.max(startOffset, endOffset),
      };
    }

    const lineElement = this.getLineElementFromRangePoint(
      range.startContainer,
      range.startOffset,
    );
    const lineId = this.getLineIdFromLineElement(lineElement);
    const offset = this.getLineOffsetFromRange(lineElement, range);

    if (!lineId || typeof offset !== "number") {
      return undefined;
    }

    return {
      lineId,
      start: offset,
      end: offset,
    };
  }

  getNativeLineSelectionContext(rangeLike) {
    if (
      !rangeLike &&
      (!this.refs?.editor ||
        typeof window === "undefined" ||
        typeof document === "undefined" ||
        typeof ShadowRoot === "undefined")
    ) {
      return undefined;
    }

    return this.getLineSelectionContextFromRange(
      rangeLike ?? getSelectionRange(this.refs?.editor),
    );
  }

  getBeforeInputLineSelectionContext(event) {
    const targetRange = event?.getTargetRanges?.()?.[0];
    if (!targetRange) {
      return undefined;
    }

    return this.getLineSelectionContextFromRange(targetRange);
  }

  getInputLineSelectionContext(event) {
    return (
      this.getBeforeInputLineSelectionContext(event) ??
      this.getNativeLineSelectionContext()
    );
  }

  getNativeLineRangeSelectionContext() {
    const range = getSelectionRange(this.refs?.editor);
    if (!range || range.collapsed) {
      return undefined;
    }

    const startLineElement = this.getLineElementFromRangePoint(
      range.startContainer,
      range.startOffset,
    );
    const endLineElement = this.getLineElementFromRangePoint(
      range.endContainer,
      range.endOffset,
    );
    const startLineId = this.getLineIdFromLineElement(startLineElement);
    const endLineId = this.getLineIdFromLineElement(endLineElement);
    const startLineKey = startLineId
      ? this.lineKeyById.get(startLineId)
      : undefined;
    const endLineKey = endLineId ? this.lineKeyById.get(endLineId) : undefined;
    const startOffset = this.getLineOffsetFromRange(startLineElement, range);
    const endRange = document.createRange();

    try {
      endRange.setStart(range.endContainer, range.endOffset);
      endRange.setEnd(range.endContainer, range.endOffset);
    } catch {
      return undefined;
    }

    const endOffset = this.getLineOffsetFromRange(endLineElement, endRange);
    if (
      !startLineId ||
      !endLineId ||
      !startLineKey ||
      !endLineKey ||
      typeof startOffset !== "number" ||
      typeof endOffset !== "number"
    ) {
      return undefined;
    }

    const lineOrder = this.getEditorLineOrder();
    const startIndex = lineOrder.findIndex((line) => {
      return line.lineKey === startLineKey;
    });
    const endIndex = lineOrder.findIndex((line) => {
      return line.lineKey === endLineKey;
    });
    if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) {
      return undefined;
    }

    return {
      startLineId,
      endLineId,
      startLineKey,
      endLineKey,
      startOffset,
      endOffset,
      startIndex,
      endIndex,
      isMultiLine: startLineId !== endLineId,
    };
  }

  getEditorLineOrder() {
    return this.editor.getEditorState().read(() => {
      return $getRoot()
        .getChildren()
        .map((lineNode, index) => {
          const lineKey = lineNode.getKey();
          const lineMeta = this.lineMetaByKey.get(lineKey);
          return {
            index,
            lineKey,
            lineId: lineMeta?.id,
          };
        })
        .filter((line) => line.lineId);
    });
  }

  isNativeSelectionAfterLineStart(context, nativeSelection) {
    const nativeOffset = nativeSelection?.offset ?? nativeSelection?.start;
    return nativeSelection?.lineId === context?.lineId && nativeOffset > 0;
  }

  createPointerFallbackSelection(event) {
    const lineElement = this.getLineElementFromEvent(event);
    const lineId = this.getLineIdFromLineElement(lineElement);
    if (!lineId) {
      return undefined;
    }

    return {
      lineId,
      cursorPosition: this.getLineOffsetFromPointerEvent(event, lineElement),
    };
  }

  restorePointerFallbackSelection(fallbackSelection) {
    if (!fallbackSelection?.lineId) {
      return false;
    }

    this.setMode("text-editor");
    this.state.selectedLineId = fallbackSelection.lineId;
    const didFocus = this.focusLine({
      lineId: fallbackSelection.lineId,
      cursorPosition: fallbackSelection.cursorPosition,
    });

    if (!didFocus) {
      return false;
    }

    this.scheduleRender();
    this.dispatchSelectedLineChanged(fallbackSelection.lineId, {
      cursorPosition:
        fallbackSelection.cursorPosition >= 0
          ? fallbackSelection.cursorPosition
          : undefined,
      isCollapsed: true,
      mode: "text-editor",
    });
    return true;
  }

  schedulePointerFallbackSelectionValidation(fallbackSelection) {
    if (!fallbackSelection?.lineId) {
      return;
    }

    setTimeout(() => {
      if (!this.isConnected || !this.isEditorFocused) {
        return;
      }

      const range = getSelectionRange(this.refs.editor);
      const lineId = this.getLineIdFromRange(range);
      if (lineId) {
        return;
      }

      this.restorePointerFallbackSelection(fallbackSelection);
    }, 0);
  }

  getLineElementFromRangePoint(container, offset) {
    const element =
      container?.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container;
    const directLineElement = element?.closest?.(".editor-paragraph");
    if (directLineElement) {
      return directLineElement;
    }

    if (container !== this.refs.editor) {
      return undefined;
    }

    const childNodes = Array.from(container.childNodes);
    const candidates = [
      childNodes[offset],
      childNodes[offset - 1],
      childNodes[offset + 1],
    ];

    for (const candidate of candidates) {
      const candidateElement =
        candidate?.nodeType === Node.TEXT_NODE
          ? candidate.parentElement
          : candidate;
      const lineElement = candidateElement?.closest?.(".editor-paragraph");
      if (lineElement) {
        return lineElement;
      }
    }

    return undefined;
  }

  getLineIdFromRange(range) {
    if (!range?.startContainer) {
      return undefined;
    }

    const lineElement = this.getLineElementFromRangePoint(
      range.startContainer,
      range.startOffset,
    );

    if (!lineElement) {
      return undefined;
    }

    return this.getLineIdFromLineElement(lineElement);
  }

  createPreviewItems(lineDecoration = {}) {
    const container = document.createElement("div");
    container.className = "preview-items";

    if (lineDecoration.background) {
      const item = document.createElement("div");
      item.className = "preview-item";
      const resourceIsDelete =
        (lineDecoration.background.resourceChangeType ??
          lineDecoration.background.changeType) === "delete";
      const colorIsDelete =
        (lineDecoration.background.colorChangeType ??
          lineDecoration.background.changeType) === "delete";

      if (lineDecoration.background.colorHex) {
        item.append(
          this.createColorSwatch({
            colorHex: lineDecoration.background.colorHex,
            colorName: lineDecoration.background.colorName,
            isDelete: colorIsDelete,
          }),
        );
      }

      if (
        lineDecoration.background.fileId ||
        !lineDecoration.background.colorHex
      ) {
        item.append(
          this.createMediaThumb({
            fileId: lineDecoration.background.fileId,
            placeholderIcon: "image",
            size: "bg",
            isDelete: resourceIsDelete,
          }),
        );
      }

      container.append(item);
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
          stack.append(this.createCharacterSpritePreview(sprite));
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

    if (lineDecoration.screenTransition) {
      container.append(
        this.createIconPreview({
          icon: "screen",
        }),
      );
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
      item.className = "preview-item preview-dialogue-item";
      item.append(
        this.createIconPreview({
          icon: "dialogue",
          isDelete: lineDecoration.dialogueChangeType === "delete",
          deleteDisplay: "mark",
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

    if (lineDecoration.hasVoice) {
      container.append(
        this.createIconPreview({
          icon: "microphone",
          isDelete: lineDecoration.voiceChangeType === "delete",
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

    if (lineDecoration.hasConditional) {
      container.append(
        this.createIconPreview({
          icon: "settings",
        }),
      );
    }

    if (lineDecoration.hasUpdateVariable) {
      container.append(
        this.createIconPreview({
          icon: "variable",
        }),
      );
    }

    if (lineDecoration.hasInput) {
      container.append(
        this.createIconPreview({
          icon: "input",
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

  createCharacterSpritePreview(sprite = {}) {
    const layers = Array.isArray(sprite.spritePreviewLayers)
      ? sprite.spritePreviewLayers
      : [];
    const fallbackFileIds =
      layers.length === 0 && Array.isArray(sprite.spriteFileIds)
        ? sprite.spriteFileIds
        : [];
    const previewLayers =
      layers.length > 0
        ? layers
        : fallbackFileIds
            .filter((fileId) => typeof fileId === "string" && fileId)
            .map((fileId, index) => ({
              kind: "image",
              fileId,
              previewKey: `line-character-sprite:${index}:${fileId}`,
            }));

    if (previewLayers.length === 0 && sprite.fileId) {
      previewLayers.push({
        kind: "image",
        fileId: sprite.fileId,
        previewKey: `line-character-sprite:${sprite.fileId}`,
      });
    }

    if (previewLayers.length === 0) {
      return this.createMediaThumb({
        placeholderIcon: "character",
        size: "sprite",
      });
    }

    const preview = document.createElement("rvn-stacked-file-images");
    preview.layers = previewLayers;
    preview.w = "20";
    preview.h = "24";
    preview.br = sprite.spritePreviewBr ?? "none";
    preview.spritesheetBr = "none";
    preview.spritesheetCheckerCellSize = "4";
    preview.showSpritesheetCheckerboard = false;

    return preview;
  }

  createColorSwatch({ colorHex, colorName, isDelete = false } = {}) {
    const swatch = document.createElement("div");
    swatch.className = "preview-color-swatch";
    swatch.style.backgroundColor = colorHex;
    if (colorName) {
      swatch.title = colorName;
    }
    if (isDelete) {
      swatch.append(this.createDeleteOverlay());
    }
    return swatch;
  }

  createIconPreview({
    icon,
    isDelete = false,
    deleteDisplay = "overlay",
  } = {}) {
    const item = document.createElement("div");
    item.className = "preview-item";
    const thumb = document.createElement("div");
    thumb.className = "preview-thumb";
    thumb.dataset.size = "icon";
    thumb.append(this.createSvgIcon(icon, 24));

    if (isDelete) {
      thumb.append(
        deleteDisplay === "mark"
          ? this.createIconDeleteMark()
          : this.createDeleteOverlay(),
      );
    }

    item.append(thumb);
    return item;
  }

  createIconDeleteMark() {
    const mark = document.createElement("div");
    mark.className = "preview-icon-delete-mark";
    mark.append(this.createSvgIcon("x", 20));
    return mark;
  }

  createDeleteOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "preview-delete-overlay";
    overlay.append(this.createSvgIcon("x", 16, "er"));
    return overlay;
  }

  createPreviewGroupDeleteOverlay() {
    const overlay = document.createElement("div");
    overlay.className = "preview-group-delete-overlay";
    overlay.append(this.createSvgIcon("x", 16, "er"));
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

    const mentionItems = menuState.items ?? [];
    if (!menuState.isOpen || mentionItems.length === 0) {
      if (menu.open !== true && (menu.items?.length ?? 0) === 0) {
        return;
      }
      menu.items = [];
      menu.open = false;
      menu.render?.();
      return;
    }

    const nextItems = mentionItems.map((item) => ({
      id: `mention:${item.id}`,
      type: "item",
      label: item.label,
      suffixText: item.variableType ?? "",
    }));
    const nextX = String(menuState.left);
    const nextY = String(menuState.top);
    const nextPlace = "bs";
    const nextWidth = "260";
    const nextHeight = "240";
    const hasPopover = Boolean(this.getMentionMenuPopover());
    const needsRender =
      menu.open !== true ||
      menu.x !== nextX ||
      menu.y !== nextY ||
      menu.place !== nextPlace ||
      menu.w !== nextWidth ||
      menu.h !== nextHeight ||
      !areRenderedMentionMenuItemsEqual(menu.items, nextItems) ||
      !hasPopover;

    if (!needsRender) {
      this.syncMentionMenuPopover();
      return;
    }

    menu.items = nextItems;
    menu.x = nextX;
    menu.y = nextY;
    menu.place = nextPlace;
    menu.w = nextWidth;
    menu.h = nextHeight;
    if (!hasPopover) {
      menu.open = false;
      menu.render?.();
      this.syncMentionMenuPopover();
    }
    menu.open = true;
    menu.render?.();
    this.syncMentionMenuPopover();
  }
}
