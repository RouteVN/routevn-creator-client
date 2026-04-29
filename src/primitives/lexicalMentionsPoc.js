import {
  $applyNodeReplacement,
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  KEY_ARROW_DOWN_COMMAND,
  KEY_ARROW_UP_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  PASTE_COMMAND,
  TextNode,
  createEditor,
} from "lexical";
import {
  $getSelectionStyleValueForProperty,
  $patchStyleText,
} from "@lexical/selection";
import { registerRichText } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { mergeRegister } from "@lexical/utils";

const ACCENT_FILL = "#b45309";

const MENTION_SUGGESTIONS = [
  { id: "user-alice", label: "alice" },
  { id: "user-allen", label: "allen" },
  { id: "user-amina", label: "amina" },
  { id: "user-brook", label: "brook" },
  { id: "user-kai", label: "kai" },
  { id: "user-route-dev", label: "route-dev" },
  { id: "user-scene-editor", label: "scene-editor" },
];

const MAX_LOG_ENTRIES = 80;
const ACTIVE_ELEMENT_PATCH_COUNTS = new WeakMap();
const ACTIVE_ELEMENT_PATCH_STATE = new WeakMap();
const WINDOW_SELECTION_PATCH_COUNTS = new WeakMap();
const WINDOW_SELECTION_PATCH_STATE = new WeakMap();
const DIAGNOSTICS_IDLE_MS = 180;

const SAMPLE_CONTENT = [
  { text: "Talk to " },
  { mention: { id: "user-alice", label: "alice" } },
  { text: " before " },
  { text: "shipping", textStyle: { fontWeight: "bold" } },
  { text: " the " },
  { text: "single-line", textStyle: { fontStyle: "italic" } },
  { text: " Lexical POC.", textStyle: { fill: ACCENT_FILL } },
];

const SHADOW_STYLES = `
  rvn-lexical-mention-editor-poc {
    display: block;
    width: 100%;
    color: #1f2937;
  }

  rvn-lexical-mention-editor-poc * {
    box-sizing: border-box;
  }

  .shell {
    display: grid;
    gap: 18px;
    width: 100%;
  }

  .intro {
    display: grid;
    gap: 8px;
    padding: 18px 20px;
    border: 1px solid rgba(125, 211, 252, 0.25);
    border-radius: 18px;
    background:
      linear-gradient(135deg, rgba(224, 242, 254, 0.95), rgba(255, 255, 255, 0.98)),
      radial-gradient(circle at top right, rgba(14, 165, 233, 0.12), transparent 45%);
  }

  .eyebrow {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #0369a1;
  }

  .intro-title {
    font-size: 18px;
    font-weight: 700;
    color: #0f172a;
  }

  .intro-text {
    font-size: 14px;
    line-height: 1.6;
    color: #475569;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
  }

  .tool {
    appearance: none;
    border: 1px solid rgba(148, 163, 184, 0.32);
    border-radius: 999px;
    background: #ffffff;
    color: #0f172a;
    padding: 9px 14px;
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      color 120ms ease,
      transform 120ms ease,
      box-shadow 120ms ease;
  }

  .tool:hover {
    border-color: rgba(2, 132, 199, 0.35);
    background: #f0f9ff;
    color: #0369a1;
    transform: translateY(-1px);
  }

  .tool[data-active="true"] {
    border-color: rgba(2, 132, 199, 0.55);
    background: #e0f2fe;
    color: #075985;
    box-shadow: 0 8px 20px rgba(14, 165, 233, 0.12);
  }

  .tool-accent {
    color: #9a3412;
  }

  .tool-sample {
    margin-left: auto;
  }

  .surface {
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 20px;
    background:
      linear-gradient(180deg, rgba(248, 250, 252, 0.98), rgba(255, 255, 255, 0.98)),
      radial-gradient(circle at bottom left, rgba(14, 165, 233, 0.07), transparent 40%);
  }

  .surface-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(255, 255, 255, 0.82);
    font-size: 12px;
    color: #64748b;
  }

  .editor-frame {
    position: relative;
    padding: 18px 18px 16px;
  }

  .editor {
    min-height: 72px;
    padding: 14px 16px;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 16px;
    background: #ffffff;
    font-size: 18px;
    line-height: 1.5;
    color: #0f172a;
    outline: none;
    caret-color: #0f766e;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .editor:focus {
    border-color: rgba(14, 165, 233, 0.45);
    box-shadow: 0 0 0 4px rgba(14, 165, 233, 0.12);
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

  .placeholder {
    position: absolute;
    left: 35px;
    top: 33px;
    font-size: 16px;
    color: #94a3b8;
    pointer-events: none;
    user-select: none;
  }

  .placeholder[hidden] {
    display: none;
  }

  .mention-menu {
    position: absolute;
    z-index: 4;
    width: min(280px, calc(100% - 24px));
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.98);
    box-shadow: 0 24px 48px rgba(15, 23, 42, 0.16);
    overflow: hidden;
  }

  .mention-menu[hidden] {
    display: none;
  }

  .mention-item {
    appearance: none;
    display: grid;
    gap: 4px;
    width: 100%;
    border: 0;
    border-bottom: 1px solid rgba(226, 232, 240, 0.95);
    background: transparent;
    padding: 12px 14px;
    text-align: left;
    cursor: pointer;
    font: inherit;
  }

  .mention-item:last-child {
    border-bottom: 0;
  }

  .mention-item:hover,
  .mention-item[data-active="true"] {
    background: #f0f9ff;
  }

  .mention-item-label {
    font-size: 14px;
    font-weight: 700;
    color: #0f172a;
  }

  .mention-item-meta {
    font-size: 12px;
    color: #64748b;
  }

  .mention-empty {
    padding: 14px;
    font-size: 13px;
    color: #64748b;
  }

  .panes {
    display: grid;
    gap: 16px;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .panel {
    min-width: 0;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 16px;
    background: #ffffff;
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
    min-height: 148px;
    padding: 14px;
    overflow: auto;
    background: #ffffff;
    color: #334155;
    font-family:
      "SFMono-Regular",
      "Consolas",
      "Liberation Mono",
      monospace;
    font-size: 12px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
`;

const createMentionText = (label) => `@${normalizeMentionLabel(label)}`;

const normalizeSingleLineText = (value) => {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n+/g, " ");
};

const normalizeMentionLabel = (value) => {
  return String(value ?? "")
    .trim()
    .replace(/^@+/, "");
};

const cloneTextStyle = (textStyle) => {
  if (!textStyle || typeof textStyle !== "object" || Array.isArray(textStyle)) {
    return undefined;
  }

  const nextTextStyle = {};

  if (textStyle.fontWeight === "bold") {
    nextTextStyle.fontWeight = "bold";
  }

  if (textStyle.fontStyle === "italic") {
    nextTextStyle.fontStyle = "italic";
  }

  if (typeof textStyle.fill === "string" && textStyle.fill.length > 0) {
    nextTextStyle.fill = textStyle.fill;
  }

  return Object.keys(nextTextStyle).length > 0 ? nextTextStyle : undefined;
};

const getTextStyleKey = (textStyle) => {
  return JSON.stringify(cloneTextStyle(textStyle) ?? {});
};

const cloneMentionItem = (mention) => {
  const label = normalizeMentionLabel(mention?.label);
  if (!label) {
    return undefined;
  }

  return {
    mention: {
      id: String(mention?.id ?? label),
      label,
    },
  };
};

const cloneContentItems = (items = []) => {
  const nextItems = [];

  for (const item of items) {
    const mentionItem = cloneMentionItem(item?.mention);
    if (mentionItem) {
      nextItems.push(mentionItem);
      continue;
    }

    const text = normalizeSingleLineText(item?.text);
    if (text.length === 0) {
      continue;
    }

    const nextItem = { text };
    const nextTextStyle = cloneTextStyle(item?.textStyle);
    if (nextTextStyle) {
      nextItem.textStyle = nextTextStyle;
    }
    nextItems.push(nextItem);
  }

  return nextItems;
};

const mergeAdjacentTextItems = (items = []) => {
  const result = [];

  for (const item of cloneContentItems(items)) {
    if (item?.mention) {
      result.push(item);
      continue;
    }

    const previousItem = result[result.length - 1];
    if (
      previousItem &&
      !previousItem.mention &&
      getTextStyleKey(previousItem.textStyle) ===
        getTextStyleKey(item.textStyle)
    ) {
      previousItem.text += item.text;
      continue;
    }

    result.push(item);
  }

  return result;
};

const getItemPlainText = (item) => {
  if (item?.mention) {
    return createMentionText(item.mention.label);
  }
  return String(item?.text ?? "");
};

const getPlainTextFromContent = (items = []) => {
  return mergeAdjacentTextItems(items).map(getItemPlainText).join("");
};

const parseStyleText = (styleText) => {
  const styleObject = {};
  const normalizedStyleText = String(styleText ?? "");

  for (const entry of normalizedStyleText.split(";")) {
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

const getTextStyleFromNode = (node) => {
  const nextTextStyle = {};

  if (node.hasFormat("bold")) {
    nextTextStyle.fontWeight = "bold";
  }

  if (node.hasFormat("italic")) {
    nextTextStyle.fontStyle = "italic";
  }

  const color = parseStyleText(node.getStyle()).color;
  if (color) {
    nextTextStyle.fill = color;
  }

  return Object.keys(nextTextStyle).length > 0 ? nextTextStyle : undefined;
};

const applyTextStyleToNode = (node, textStyle) => {
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

  if (nextTextStyle.fill) {
    node.setStyle(`color: ${nextTextStyle.fill};`);
  }

  return node;
};

const getSelectionRange = (element) => {
  const root = element?.getRootNode?.();
  const isShadowRoot = root instanceof ShadowRoot;

  let selection = window.getSelection();

  if (isShadowRoot && typeof root.getSelection === "function") {
    const shadowSelection = root.getSelection();
    if (shadowSelection && shadowSelection.rangeCount > 0) {
      const shadowRange = shadowSelection.getRangeAt(0);
      if (element.contains(shadowRange.startContainer)) {
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
        if (element.contains(composedRange.startContainer)) {
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
  if (element.contains(range.startContainer)) {
    return range;
  }

  return null;
};

const getMentionMenuPosition = (editorElement, surfaceElement) => {
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

const createEditorShell = () => {
  const template = document.createElement("template");
  template.innerHTML = `
    <style>${SHADOW_STYLES}</style>
    <div class="shell">
      <div class="intro">
        <div class="eyebrow">Lexical POC</div>
        <div class="intro-title">Single-line segmented editor with mentions</div>
        <div class="intro-text">
          This POC keeps the same content-array shape for styled text segments,
          adds inline mention items, and uses Lexical as the editing core. Type
          <strong>@</strong> to open the mention menu, then use arrows and Enter.
        </div>
      </div>
      <div class="toolbar" id="toolbar">
        <button class="tool" type="button" data-action="bold">Bold</button>
        <button class="tool" type="button" data-action="italic">Italic</button>
        <button class="tool tool-accent" type="button" data-action="accent">
          Accent
        </button>
        <button class="tool tool-sample" type="button" data-action="sample">
          Reset Sample
        </button>
        <button class="tool" type="button" data-action="clear-logs">
          Clear Logs
        </button>
      </div>
      <div class="surface">
        <div class="surface-meta">
          <span id="selectionLabel">Selection 0..0</span>
          <span id="plainTextLabel">0 chars</span>
          <span id="menuLabel">Mentions idle</span>
        </div>
        <div class="editor-frame" id="surface">
          <div id="placeholder" class="placeholder">
            Type @alice to insert a mention chip.
          </div>
          <div
            id="editor"
            class="editor"
            contenteditable="true"
            role="textbox"
            aria-label="Lexical mentions POC"
            aria-multiline="false"
          ></div>
          <div id="mentionMenu" class="mention-menu" hidden></div>
        </div>
      </div>
      <div class="panes">
        <div class="panel">
          <div class="panel-title">Content Array</div>
          <pre id="contentDebug" class="panel-body"></pre>
        </div>
        <div class="panel">
          <div class="panel-title">Editor State</div>
          <pre id="stateDebug" class="panel-body"></pre>
        </div>
        <div class="panel">
          <div class="panel-title">Plain Text</div>
          <pre id="plainTextDebug" class="panel-body"></pre>
        </div>
        <div class="panel">
          <div class="panel-title">Event Log</div>
          <pre id="eventLogDebug" class="panel-body"></pre>
        </div>
      </div>
    </div>
  `;

  return template.content.cloneNode(true);
};

class MentionNode extends TextNode {
  static getType() {
    return "poc-mention";
  }

  static clone(node) {
    return new MentionNode(
      node.__mentionId,
      node.__mentionLabel,
      node.__text,
      node.__key,
    );
  }

  static importJSON(serializedNode) {
    return $createMentionNode({
      id: serializedNode?.mentionId,
      label: serializedNode?.mentionLabel,
    }).updateFromJSON(serializedNode);
  }

  static importDOM() {
    return {
      span: (domNode) => {
        if (!domNode.hasAttribute("data-poc-mention")) {
          return null;
        }

        return {
          conversion: () => {
            const label = domNode.getAttribute("data-poc-mention-label");
            const id = domNode.getAttribute("data-poc-mention-id");
            return {
              node: $createMentionNode({ id, label }),
            };
          },
          priority: 1,
        };
      },
    };
  }

  constructor(mentionId, mentionLabel, text, key) {
    super(text ?? createMentionText(mentionLabel), key);
    this.__mentionId = String(mentionId ?? normalizeMentionLabel(mentionLabel));
    this.__mentionLabel = normalizeMentionLabel(mentionLabel);
  }

  exportJSON() {
    return {
      ...super.exportJSON(),
      mentionId: this.__mentionId,
      mentionLabel: this.__mentionLabel,
      type: MentionNode.getType(),
      version: 1,
    };
  }

  createDOM(config) {
    const dom = super.createDOM(config);
    dom.className = "mention-chip";
    dom.dataset.mentionId = this.__mentionId;
    dom.dataset.mentionLabel = this.__mentionLabel;
    dom.style.cssText = `
      display: inline-block;
      padding: 0.1em 0.48em;
      border-radius: 999px;
      border: 1px solid rgba(8, 145, 178, 0.22);
      background: rgba(103, 232, 249, 0.18);
      color: #0f766e;
      font-weight: 700;
      white-space: nowrap;
    `;
    dom.spellcheck = false;
    return dom;
  }

  exportDOM() {
    const element = document.createElement("span");
    element.setAttribute("data-poc-mention", "true");
    element.setAttribute("data-poc-mention-id", this.__mentionId);
    element.setAttribute("data-poc-mention-label", this.__mentionLabel);
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

  getMentionData() {
    return {
      id: this.__mentionId,
      label: this.__mentionLabel,
    };
  }
}

const $createMentionNode = ({ id, label } = {}) => {
  const mentionLabel = normalizeMentionLabel(label);
  const mentionId = String(id ?? mentionLabel);
  const mentionNode = new MentionNode(
    mentionId,
    mentionLabel,
    createMentionText(mentionLabel),
  );
  mentionNode.setMode("segmented").toggleDirectionless();
  return $applyNodeReplacement(mentionNode);
};

const $isMentionNode = (node) => {
  return node instanceof MentionNode;
};

const collectContentItemsFromNode = (node, items) => {
  if ($isMentionNode(node)) {
    const mentionItem = cloneMentionItem(node.getMentionData());
    if (mentionItem) {
      items.push(mentionItem);
    }
    return;
  }

  if ($isTextNode(node)) {
    const text = normalizeSingleLineText(node.getTextContent());
    if (text.length === 0) {
      return;
    }

    const nextItem = { text };
    const textStyle = getTextStyleFromNode(node);
    if (textStyle) {
      nextItem.textStyle = textStyle;
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

const getTextLengthOfNode = (node) => {
  if ($isTextNode(node)) {
    return node.getTextContent().length;
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
    return result.offset + point.offset;
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

const getSelectionOffsets = (rootNode, selection) => {
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

const getMentionTriggerMatch = (selection) => {
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
};

const createNodesFromContent = (items = []) => {
  const nodes = [];

  for (const item of mergeAdjacentTextItems(items)) {
    const mentionItem = cloneMentionItem(item?.mention);
    if (mentionItem) {
      nodes.push($createMentionNode(mentionItem.mention));
      continue;
    }

    const text = normalizeSingleLineText(item?.text);
    if (text.length === 0) {
      continue;
    }

    const textNode = $createTextNode(text);
    applyTextStyleToNode(textNode, item?.textStyle);
    nodes.push(textNode);
  }

  return nodes;
};

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

const filterMentionSuggestions = (query) => {
  const normalizedQuery = String(query ?? "").toLowerCase();
  if (!normalizedQuery) {
    return [...MENTION_SUGGESTIONS];
  }

  return MENTION_SUGGESTIONS.filter((option) => {
    return option.label.toLowerCase().startsWith(normalizedQuery);
  });
};

const createSnapshotFromEditorState = (editorState) => {
  return editorState.read(() => {
    const root = $getRoot();
    const selection = $getSelection();
    const content = [];

    for (const childNode of root.getChildren()) {
      collectContentItemsFromNode(childNode, content);
    }

    const normalizedContent = mergeAdjacentTextItems(content);
    const plainText = getPlainTextFromContent(normalizedContent);
    const activeFormats = {
      bold: $isRangeSelection(selection) ? selection.hasFormat("bold") : false,
      italic: $isRangeSelection(selection)
        ? selection.hasFormat("italic")
        : false,
      accent:
        $isRangeSelection(selection) &&
        $getSelectionStyleValueForProperty(selection, "color", "") ===
          ACCENT_FILL,
    };

    return {
      content: normalizedContent,
      plainText,
      selection: getSelectionOffsets(root, selection),
      activeFormats,
      mentionTrigger: getMentionTriggerMatch(selection),
    };
  });
};

const describeNodeForLog = (node) => {
  if (!node) {
    return "null";
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return `#text("${text.slice(0, 12)}${text.length > 12 ? "…" : ""}")`;
  }

  const id = node.id ? `#${node.id}` : "";
  return `${node.nodeName.toLowerCase()}${id}`;
};

const getSelectionSnapshotDebug = (selection) => {
  if (!selection || selection.rangeCount === 0) {
    return {
      hasRange: false,
      anchor: "none",
      focus: "none",
      text: "",
    };
  }

  return {
    hasRange: true,
    anchor: `${describeNodeForLog(selection.anchorNode)}:${selection.anchorOffset ?? 0}`,
    focus: `${describeNodeForLog(selection.focusNode)}:${selection.focusOffset ?? 0}`,
    text: selection.toString(),
  };
};

const getSelectionSourcesDebug = (element) => {
  const root = element?.getRootNode?.();
  const windowSelection = window.getSelection();
  const rootSelection =
    root instanceof ShadowRoot && typeof root.getSelection === "function"
      ? root.getSelection()
      : undefined;

  return {
    rootType:
      root instanceof ShadowRoot ? "shadow-root" : describeNodeForLog(root),
    window: getSelectionSnapshotDebug(windowSelection),
    root:
      rootSelection === undefined
        ? {
            hasRange: false,
            anchor: "unsupported",
            focus: "unsupported",
            text: "",
          }
        : getSelectionSnapshotDebug(rootSelection),
  };
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

  return shadowSelection;
};

const getNativeSelectionDebug = (element) => {
  const range = getSelectionRange(element);
  if (!range) {
    return {
      hasRange: false,
      anchor: "none",
      focus: "none",
      text: "",
    };
  }

  const selection = window.getSelection();

  return {
    hasRange: true,
    anchor: `${describeNodeForLog(selection?.anchorNode)}:${selection?.anchorOffset ?? 0}`,
    focus: `${describeNodeForLog(selection?.focusNode)}:${selection?.focusOffset ?? 0}`,
    text: range.toString(),
  };
};

const getActiveElementDebug = (editorElement) => {
  const activeElement = document.activeElement;
  return {
    activeElement: describeNodeForLog(activeElement),
    editorHasFocus: activeElement === editorElement,
    editorContainsActive: Boolean(
      activeElement && editorElement?.contains?.(activeElement),
    ),
  };
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

const patchDocumentActiveElement = (documentObject) => {
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

  ACTIVE_ELEMENT_PATCH_STATE.set(documentObject, descriptor);
  ACTIVE_ELEMENT_PATCH_COUNTS.set(documentObject, 1);
  return true;
};

const unpatchDocumentActiveElement = (documentObject) => {
  if (!documentObject) {
    return;
  }

  const currentCount = ACTIVE_ELEMENT_PATCH_COUNTS.get(documentObject) ?? 0;
  if (currentCount <= 1) {
    delete documentObject.activeElement;
    ACTIVE_ELEMENT_PATCH_COUNTS.delete(documentObject);
    ACTIVE_ELEMENT_PATCH_STATE.delete(documentObject);
    return;
  }

  ACTIVE_ELEMENT_PATCH_COUNTS.set(documentObject, currentCount - 1);
};

const patchWindowGetSelection = (windowObject) => {
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

const unpatchWindowGetSelection = (windowObject) => {
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

export const LEXICAL_MENTIONS_POC_TAG_NAME = "rvn-lexical-mention-editor-poc";

export class LexicalMentionsPocElement extends HTMLElement {
  constructor() {
    super();

    this.state = {
      content: mergeAdjacentTextItems(SAMPLE_CONTENT),
      plainText: getPlainTextFromContent(SAMPLE_CONTENT),
      selection: { start: 0, end: 0 },
      activeFormats: {
        bold: false,
        italic: false,
        accent: false,
      },
      mentionMenu: createClosedMentionMenuState(),
      logs: [],
    };

    this.refs = {};
    this.isInitialized = false;

    this.editor = createEditor({
      namespace: "routevn-lexical-mentions-poc",
      nodes: [MentionNode],
      onError: (error) => {
        console.error(error);
      },
      theme: {
        paragraph: "editor-paragraph",
        text: {
          bold: "text-bold",
          italic: "text-italic",
        },
      },
    });

    this.unregister = undefined;
    this.renderFrame = 0;
    this.diagnosticsFrame = 0;
    this.diagnosticsTimer = undefined;
    this.didPatchActiveElement = false;
    this.didPatchWindowSelection = false;
    this.isEditorFocused = false;

    this.handleToolbarMouseDown = this.handleToolbarMouseDown.bind(this);
    this.handleToolbarClick = this.handleToolbarClick.bind(this);
    this.handleMentionMenuMouseDown =
      this.handleMentionMenuMouseDown.bind(this);
    this.handleMentionMenuClick = this.handleMentionMenuClick.bind(this);
    this.handleEditorNativeEvent = this.handleEditorNativeEvent.bind(this);
    this.handleDocumentSelectionChange =
      this.handleDocumentSelectionChange.bind(this);
  }

  connectedCallback() {
    if (!this.isInitialized) {
      this.append(createEditorShell());
      this.refs = {
        toolbar: this.querySelector("#toolbar"),
        surface: this.querySelector("#surface"),
        editor: this.querySelector("#editor"),
        placeholder: this.querySelector("#placeholder"),
        mentionMenu: this.querySelector("#mentionMenu"),
        contentDebug: this.querySelector("#contentDebug"),
        stateDebug: this.querySelector("#stateDebug"),
        plainTextDebug: this.querySelector("#plainTextDebug"),
        eventLogDebug: this.querySelector("#eventLogDebug"),
        selectionLabel: this.querySelector("#selectionLabel"),
        plainTextLabel: this.querySelector("#plainTextLabel"),
        menuLabel: this.querySelector("#menuLabel"),
      };
      this.isInitialized = true;
    }

    this.style.display = "block";
    this.style.width = "100%";
    this.didPatchActiveElement = patchDocumentActiveElement(document);
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
          } else {
            this.closeMentionMenu({ shouldRender: true });
          }

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
          const pastedText = event?.clipboardData?.getData("text/plain") ?? "";
          this.insertPlainText(pastedText);
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );

    this.refs.toolbar.addEventListener(
      "mousedown",
      this.handleToolbarMouseDown,
    );
    this.refs.toolbar.addEventListener("click", this.handleToolbarClick);
    this.refs.editor.addEventListener("keydown", this.handleEditorNativeEvent);
    this.refs.editor.addEventListener(
      "beforeinput",
      this.handleEditorNativeEvent,
    );
    this.refs.editor.addEventListener("input", this.handleEditorNativeEvent);
    this.refs.editor.addEventListener("keyup", this.handleEditorNativeEvent);
    this.refs.editor.addEventListener("focus", this.handleEditorNativeEvent);
    this.refs.editor.addEventListener("blur", this.handleEditorNativeEvent);
    this.refs.editor.addEventListener(
      "compositionstart",
      this.handleEditorNativeEvent,
    );
    this.refs.editor.addEventListener(
      "compositionend",
      this.handleEditorNativeEvent,
    );
    this.refs.mentionMenu.addEventListener(
      "mousedown",
      this.handleMentionMenuMouseDown,
    );
    this.refs.mentionMenu.addEventListener(
      "click",
      this.handleMentionMenuClick,
    );
    document.addEventListener(
      "selectionchange",
      this.handleDocumentSelectionChange,
    );

    this.loadContent(SAMPLE_CONTENT, { focusAtEnd: false });
  }

  disconnectedCallback() {
    if (this.renderFrame) {
      cancelAnimationFrame(this.renderFrame);
      this.renderFrame = 0;
    }

    if (this.diagnosticsFrame) {
      cancelAnimationFrame(this.diagnosticsFrame);
      this.diagnosticsFrame = 0;
    }

    if (this.diagnosticsTimer) {
      clearTimeout(this.diagnosticsTimer);
      this.diagnosticsTimer = undefined;
    }

    this.refs.toolbar.removeEventListener(
      "mousedown",
      this.handleToolbarMouseDown,
    );
    this.refs.toolbar.removeEventListener("click", this.handleToolbarClick);
    this.refs.editor.removeEventListener(
      "keydown",
      this.handleEditorNativeEvent,
    );
    this.refs.editor.removeEventListener(
      "beforeinput",
      this.handleEditorNativeEvent,
    );
    this.refs.editor.removeEventListener("input", this.handleEditorNativeEvent);
    this.refs.editor.removeEventListener("keyup", this.handleEditorNativeEvent);
    this.refs.editor.removeEventListener("focus", this.handleEditorNativeEvent);
    this.refs.editor.removeEventListener("blur", this.handleEditorNativeEvent);
    this.refs.editor.removeEventListener(
      "compositionstart",
      this.handleEditorNativeEvent,
    );
    this.refs.editor.removeEventListener(
      "compositionend",
      this.handleEditorNativeEvent,
    );
    this.refs.mentionMenu.removeEventListener(
      "mousedown",
      this.handleMentionMenuMouseDown,
    );
    this.refs.mentionMenu.removeEventListener(
      "click",
      this.handleMentionMenuClick,
    );
    document.removeEventListener(
      "selectionchange",
      this.handleDocumentSelectionChange,
    );

    this.unregister?.();
    this.unregister = undefined;
    this.editor.setRootElement(null);
    if (this.didPatchActiveElement) {
      unpatchDocumentActiveElement(document);
      this.didPatchActiveElement = false;
    }

    if (this.didPatchWindowSelection) {
      unpatchWindowGetSelection(window);
      this.didPatchWindowSelection = false;
    }
  }

  pushLog(type, data = {}) {
    const entry = {
      t: new Date().toISOString().slice(11, 23),
      type,
      ...data,
    };

    this.state.logs = [...this.state.logs.slice(-(MAX_LOG_ENTRIES - 1)), entry];

    if (type !== "selectionchange") {
      console.debug("[LexicalMentionsPoc]", entry);
    }
  }

  handleEditorNativeEvent(event) {
    if (event.type === "focus") {
      this.isEditorFocused = true;
    } else if (event.type === "blur") {
      this.isEditorFocused = false;
    }

    this.pushLog(`dom:${event.type}`, {
      key: event.key,
      inputType: event.inputType,
      data: event.data,
      eventTarget: describeNodeForLog(event.target),
      nativeSelection: getNativeSelectionDebug(this.refs.editor),
      selectionSources: getSelectionSourcesDebug(this.refs.editor),
      active: getActiveElementDebug(this.refs.editor),
      plainText: this.state.plainText,
      lexicalSelection: this.state.selection,
    });

    if (event.type === "blur") {
      this.scheduleDiagnosticsRender({ immediate: true });
    }
  }

  handleDocumentSelectionChange() {
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const focusNode = selection?.focusNode;
    const editor = this.refs.editor;

    if (
      !editor ||
      (!editor.contains(anchorNode) && anchorNode !== editor) ||
      (!editor.contains(focusNode) && focusNode !== editor)
    ) {
      return;
    }

    this.pushLog("selectionchange", {
      nativeSelection: getNativeSelectionDebug(editor),
      selectionSources: getSelectionSourcesDebug(editor),
      active: getActiveElementDebug(editor),
      plainText: this.state.plainText,
      lexicalSelection: this.state.selection,
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
      this.pushLog("action:sample");
      this.loadContent(SAMPLE_CONTENT);
      return;
    }

    if (action === "clear-logs") {
      this.state.logs = [];
      this.scheduleDiagnosticsRender({ immediate: true });
      return;
    }

    if (action === "bold") {
      this.pushLog("action:bold");
      this.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold");
      this.focusEditor();
      return;
    }

    if (action === "italic") {
      this.pushLog("action:italic");
      this.editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic");
      this.focusEditor();
      return;
    }

    if (action === "accent") {
      this.pushLog("action:accent");
      this.toggleAccentStyle();
      return;
    }
  }

  handleMentionMenuMouseDown(event) {
    const button = event.target?.closest?.("button[data-index]");
    if (!button) {
      return;
    }

    event.preventDefault();
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

  focusEditor() {
    this.refs.editor.focus({ preventScroll: true });
  }

  toggleAccentStyle() {
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

    this.focusEditor();
  }

  insertPlainText(text) {
    const nextText = normalizeSingleLineText(text);
    this.pushLog("insert-plain-text", {
      text: nextText,
      nativeSelection: getNativeSelectionDebug(this.refs.editor),
      selectionSources: getSelectionSourcesDebug(this.refs.editor),
      active: getActiveElementDebug(this.refs.editor),
    });

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

    this.focusEditor();
  }

  loadContent(content, { focusAtEnd = true } = {}) {
    const nextContent = mergeAdjacentTextItems(content);
    this.pushLog("load-content", {
      focusAtEnd,
      content: nextContent,
    });

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
        } else {
          paragraphNode.selectStart();
        }
      },
      { discrete: true },
    );

    if (focusAtEnd) {
      this.focusEditor();
    }
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
    this.scheduleDiagnosticsRender();
  }

  closeMentionMenu({ shouldRender = false } = {}) {
    this.state.mentionMenu = createClosedMentionMenuState();
    if (shouldRender) {
      this.renderMentionMenu();
      this.scheduleDiagnosticsRender();
    }
  }

  selectMentionByIndex(index) {
    const mention = this.state.mentionMenu.items[index];
    if (!mention) {
      return;
    }

    this.pushLog("mention:select", {
      index,
      mention,
      trigger: this.state.mentionMenu,
    });

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

    this.focusEditor();
  }

  syncFromEditorState(editorState) {
    const snapshot = createSnapshotFromEditorState(editorState);
    this.pushLog("lexical:update", {
      plainText: snapshot.plainText,
      lexicalSelection: snapshot.selection,
      activeFormats: snapshot.activeFormats,
      mentionTrigger: snapshot.mentionTrigger,
      nativeSelection: getNativeSelectionDebug(this.refs.editor),
      selectionSources: getSelectionSourcesDebug(this.refs.editor),
      active: getActiveElementDebug(this.refs.editor),
    });

    this.state.content = snapshot.content;
    this.state.plainText = snapshot.plainText;
    this.state.selection = snapshot.selection;
    this.state.activeFormats = snapshot.activeFormats;
    this.syncMentionMenu(snapshot.mentionTrigger);
    this.scheduleRender();
    this.scheduleDiagnosticsRender();
  }

  syncMentionMenu(mentionTrigger) {
    if (!mentionTrigger) {
      this.state.mentionMenu = createClosedMentionMenuState();
      return;
    }

    const items = filterMentionSuggestions(mentionTrigger.query);
    const previousMenu = this.state.mentionMenu;
    let highlightedIndex = 0;

    if (
      previousMenu.isOpen &&
      previousMenu.query === mentionTrigger.query &&
      previousMenu.highlightedIndex < items.length
    ) {
      highlightedIndex = previousMenu.highlightedIndex;
    }

    this.state.mentionMenu = {
      isOpen: true,
      query: mentionTrigger.query,
      items,
      highlightedIndex,
      left: previousMenu.left,
      top: previousMenu.top,
      nodeKey: mentionTrigger.nodeKey,
      startOffset: mentionTrigger.startOffset,
      endOffset: mentionTrigger.endOffset,
    };
  }

  scheduleRender() {
    if (this.renderFrame) {
      return;
    }

    this.renderFrame = requestAnimationFrame(() => {
      this.renderFrame = 0;
      this.renderSurface();
    });
  }

  scheduleDiagnosticsRender({ immediate = false } = {}) {
    if (this.diagnosticsTimer) {
      clearTimeout(this.diagnosticsTimer);
      this.diagnosticsTimer = undefined;
    }

    if (this.diagnosticsFrame) {
      cancelAnimationFrame(this.diagnosticsFrame);
      this.diagnosticsFrame = 0;
    }

    const runDiagnosticsRender = () => {
      this.diagnosticsFrame = requestAnimationFrame(() => {
        this.diagnosticsFrame = 0;
        this.renderDiagnostics();
        this.dispatchStateChange();
      });
    };

    if (immediate || !this.isEditorFocused) {
      runDiagnosticsRender();
      return;
    }

    this.diagnosticsTimer = setTimeout(() => {
      this.diagnosticsTimer = undefined;
      runDiagnosticsRender();
    }, DIAGNOSTICS_IDLE_MS);
  }

  renderSurface() {
    const shouldHidePlaceholder = this.state.plainText.length > 0;
    if (this.refs.placeholder.hidden !== shouldHidePlaceholder) {
      this.refs.placeholder.hidden = shouldHidePlaceholder;
    }

    this.renderMentionMenu();
  }

  renderDiagnostics() {
    this.renderToolbar();
    this.renderDebug();
  }

  renderToolbar() {
    for (const button of this.refs.toolbar.querySelectorAll("button")) {
      const action = button.dataset.action;
      let isActive = false;

      if (action === "bold") {
        isActive = this.state.activeFormats.bold;
      } else if (action === "italic") {
        isActive = this.state.activeFormats.italic;
      } else if (action === "accent") {
        isActive = this.state.activeFormats.accent;
      }

      button.dataset.active = isActive ? "true" : "false";
    }
  }

  renderMentionMenu() {
    const menuState = this.state.mentionMenu;

    if (!menuState.isOpen) {
      if (!this.refs.mentionMenu.hidden) {
        this.refs.mentionMenu.hidden = true;
      }

      if (this.refs.mentionMenu.childNodes.length > 0) {
        this.refs.mentionMenu.replaceChildren();
      }

      return;
    }

    if (this.refs.mentionMenu.hidden) {
      this.refs.mentionMenu.hidden = false;
    }

    const position = getMentionMenuPosition(
      this.refs.editor,
      this.refs.surface,
    );
    menuState.left = position.left;
    menuState.top = position.top;
    const nextLeft = `${position.left}px`;
    const nextTop = `${position.top}px`;

    if (this.refs.mentionMenu.style.left !== nextLeft) {
      this.refs.mentionMenu.style.left = nextLeft;
    }

    if (this.refs.mentionMenu.style.top !== nextTop) {
      this.refs.mentionMenu.style.top = nextTop;
    }

    this.refs.mentionMenu.replaceChildren();

    if (menuState.items.length === 0) {
      const emptyState = document.createElement("div");
      emptyState.className = "mention-empty";
      emptyState.textContent = `No usernames match "@${menuState.query}".`;
      this.refs.mentionMenu.append(emptyState);
      return;
    }

    const fragment = document.createDocumentFragment();

    menuState.items.forEach((option, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mention-item";
      button.dataset.index = String(index);
      button.dataset.active =
        index === menuState.highlightedIndex ? "true" : "false";

      const label = document.createElement("span");
      label.className = "mention-item-label";
      label.textContent = createMentionText(option.label);

      const meta = document.createElement("span");
      meta.className = "mention-item-meta";
      meta.textContent = option.id;

      button.append(label, meta);
      fragment.append(button);
    });

    this.refs.mentionMenu.append(fragment);
  }

  renderDebug() {
    const { content, plainText, selection, mentionMenu } = this.state;

    this.refs.contentDebug.textContent = JSON.stringify(content, null, 2);
    this.refs.stateDebug.textContent = JSON.stringify(
      {
        selection,
        activeFormats: this.state.activeFormats,
        nativeSelection: getNativeSelectionDebug(this.refs.editor),
        active: getActiveElementDebug(this.refs.editor),
        mentionMenu: {
          isOpen: mentionMenu.isOpen,
          query: mentionMenu.query,
          optionCount: mentionMenu.items.length,
          highlightedIndex: mentionMenu.highlightedIndex,
        },
      },
      null,
      2,
    );
    this.refs.plainTextDebug.textContent = plainText;
    this.refs.eventLogDebug.textContent = this.state.logs
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    this.refs.selectionLabel.textContent = `Selection ${selection.start}..${selection.end}`;
    this.refs.plainTextLabel.textContent = `${plainText.length} chars`;
    this.refs.menuLabel.textContent = mentionMenu.isOpen
      ? `Mentions @${mentionMenu.query || ""} (${mentionMenu.items.length})`
      : "Mentions idle";
  }

  dispatchStateChange() {
    this.dispatchEvent(
      new CustomEvent("state-change", {
        detail: {
          content: cloneContentItems(this.state.content),
          plainText: this.state.plainText,
          selection: { ...this.state.selection },
          activeFormats: { ...this.state.activeFormats },
          mentionMenu: {
            isOpen: this.state.mentionMenu.isOpen,
            query: this.state.mentionMenu.query,
            optionCount: this.state.mentionMenu.items.length,
          },
        },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
