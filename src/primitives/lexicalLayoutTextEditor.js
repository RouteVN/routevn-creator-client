import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_HIGH,
  INSERT_LINE_BREAK_COMMAND,
  KEY_ENTER_COMMAND,
  KEY_ESCAPE_COMMAND,
  createEditor,
} from "lexical";
import { registerRichText } from "@lexical/rich-text";
import { createEmptyHistoryState, registerHistory } from "@lexical/history";
import { mergeRegister } from "@lexical/utils";
import {
  $createMentionNode,
  $isMentionNode,
  LEXICAL_EDITOR_THEME,
  MentionNode,
  createNodesFromContent as createLexicalNodesFromContent,
  createSnapshotFromEditorState,
  filterMentionSuggestions,
  getSelectionRange,
  patchDocumentActiveElement,
  patchDocumentGetSelection,
  patchWindowGetSelection,
  unpatchDocumentActiveElement,
  unpatchDocumentGetSelection,
  unpatchWindowGetSelection,
} from "./lexicalRichTextShared.js";
import {
  createCollapsedRangeAtPosition,
  applySelectionToLineNode,
  getLexicalOffsetBeforeNode,
  getLexicalTextLength,
  setSelectionFromRange,
} from "./lexicalSceneDocumentSelection.js";
import {
  getAdjacentReferenceNodeInfoForCollapsedSelection,
  getReferenceElementFromContextEvent,
  getReferenceSelectionInfo,
  isCollapsedReferenceCaretMovingIntoNode,
  placeCaretAroundReferenceNode,
  selectReferenceNodeAsElement as selectLexicalReferenceNodeAsElement,
} from "./lexicalSceneDocumentReferences.js";
import {
  normalizeLayoutTextContent,
  getLayoutTextDisplayText,
  getLayoutTextReferenceResourceId,
} from "../internal/layoutTextContent.js";

export const LEXICAL_LAYOUT_TEXT_EDITOR_TAG_NAME =
  "rvn-lexical-layout-text-editor";

const createClosedMentionMenuState = () => ({
  isOpen: false,
  query: "",
  items: [],
  highlightedIndex: 0,
  nodeKey: undefined,
  startOffset: 0,
  endOffset: 0,
  left: 0,
  top: 0,
});

const TYPED_SLASH_MENTION_TRIGGER_WINDOW_MS = 1000;
const isSlashText = (value) => String(value ?? "") === "/";

const getMentionTriggerMatchFromBeforeCaret = ({
  beforeCaret,
  caretRect,
  source = "dom",
} = {}) => {
  const text = String(beforeCaret ?? "");
  const match = text.match(/(?:^|\s)\/([a-z0-9._-]*)$/i);

  if (!match) {
    return undefined;
  }

  const query = match[1] ?? "";
  const startOffset = text.lastIndexOf(`/${query}`);
  if (startOffset === -1) {
    return undefined;
  }

  return {
    source,
    startOffset,
    endOffset: text.length,
    query,
    caretRect,
  };
};

const normalizeMentionLabel = (value) => {
  return String(value ?? "")
    .trim()
    .replace(/^[@/]+/, "");
};

const normalizeMentionTarget = (target = {}) => {
  const label = normalizeMentionLabel(target.label ?? target.name ?? target.id);
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
  return (Array.isArray(targets) ? targets : [])
    .map((target) => normalizeMentionTarget(target))
    .filter(Boolean);
};

const areJsonEqual = (left, right) => {
  return JSON.stringify(left) === JSON.stringify(right);
};

const createShell = () => {
  const shell = document.createElement("div");
  shell.className = "rvn-layout-text-editor-shell";
  shell.innerHTML = `
    <style>
      .rvn-layout-text-editor-shell {
        display: block;
        width: 100%;
      }

      .rvn-layout-text-editor-surface {
        width: 100%;
        min-height: 220px;
        border: 1px solid var(--border);
        border-radius: var(--border-radius-md);
        background: var(--background);
        color: var(--foreground);
        box-sizing: border-box;
      }

      .rvn-layout-text-editor {
        min-height: 220px;
        padding: 12px;
        box-sizing: border-box;
        outline: none;
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        font-size: 14px;
        line-height: 1.5;
      }

      .rvn-layout-text-editor:focus {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
      }

      .rvn-layout-text-editor[data-rvn-reference-selection-active="true"] {
        caret-color: transparent;
      }

      .rvn-layout-text-editor[data-rvn-reference-selection-active="true"]::selection,
      .rvn-layout-text-editor[data-rvn-reference-selection-active="true"] *::selection {
        background: transparent;
        color: inherit;
      }

      rvn-lexical-layout-text-editor .mention-chip,
      .rvn-layout-text-editor .mention-chip {
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
        vertical-align: baseline;
        white-space: nowrap;
        cursor: default;
        user-select: none;
        -webkit-user-select: none;
      }

      rvn-lexical-layout-text-editor .mention-chip[data-rvn-reference-selected="true"],
      .rvn-layout-text-editor .mention-chip[data-rvn-reference-selected="true"] {
        border-color: var(--accent);
        background: var(--accent);
        color: var(--accent-foreground);
      }
    </style>
    <div id="surface" class="rvn-layout-text-editor-surface">
      <div
        id="editor"
        class="rvn-layout-text-editor"
        role="textbox"
        aria-multiline="true"
      ></div>
    </div>
    <rtgl-dropdown-menu id="mentionMenu"></rtgl-dropdown-menu>
  `;
  return shell;
};

export class LexicalLayoutTextEditorElement extends HTMLElement {
  constructor() {
    super();

    this.state = {
      content: normalizeLayoutTextContent([]),
      mentionTargets: [],
      mentionMenu: createClosedMentionMenuState(),
    };
    this.refs = {};
    this.isInitialized = false;
    this.isApplyingExternalContent = false;
    this.isEditorFocused = false;
    this.pendingTypedSlashMentionTrigger = undefined;
    this.mentionMenuOpenFallbackTimerId = undefined;
    this.selectedReferenceNodeKey = undefined;
    this.didPatchActiveElement = false;
    this.didPatchDocumentSelection = false;
    this.didPatchWindowSelection = false;

    this.editor = createEditor({
      namespace: "routevn-lexical-layout-text-editor",
      nodes: [MentionNode],
      onError: () => undefined,
      theme: LEXICAL_EDITOR_THEME,
    });
    this.unregister = undefined;

    this.handleEditorFocus = this.handleEditorFocus.bind(this);
    this.handleEditorBlur = this.handleEditorBlur.bind(this);
    this.handleEditorBeforeInput = this.handleEditorBeforeInput.bind(this);
    this.handleEditorInput = this.handleEditorInput.bind(this);
    this.handleEditorKeyDown = this.handleEditorKeyDown.bind(this);
    this.handleEditorMouseDown = this.handleEditorMouseDown.bind(this);
    this.handleReferenceDragEvent = this.handleReferenceDragEvent.bind(this);
    this.handleMentionMenuMouseDown =
      this.handleMentionMenuMouseDown.bind(this);
    this.handleMentionMenuItemClick =
      this.handleMentionMenuItemClick.bind(this);
    this.handleMentionMenuClose = this.handleMentionMenuClose.bind(this);
  }

  connectedCallback() {
    if (!this.isInitialized) {
      this.append(createShell());
      this.refs = {
        editor: this.querySelector("#editor"),
        mentionMenu: this.querySelector("#mentionMenu"),
        surface: this.querySelector("#surface"),
      };
      this.isInitialized = true;
    }

    this.style.display = "block";
    this.style.width = "100%";
    this.style.minWidth = "min(280px, calc(100vw - 64px))";
    this.style.boxSizing = "border-box";
    this.didPatchActiveElement = patchDocumentActiveElement(document);
    this.didPatchDocumentSelection = patchDocumentGetSelection(document);
    this.didPatchWindowSelection = patchWindowGetSelection(window);
    this.refs.editor.contentEditable = "true";
    this.refs.editor.setAttribute("contenteditable", "true");
    this.refs.editor.spellcheck = true;
    this.refs.mentionMenu.items = [];
    this.refs.mentionMenu.open = false;
    this.refs.mentionMenu.place = "bs";
    this.refs.mentionMenu.w = "260";
    this.refs.mentionMenu.h = "240";
    this.refs.editor.addEventListener(
      "beforeinput",
      this.handleEditorBeforeInput,
      true,
    );
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
          event?.stopPropagation?.();
          this.editor.dispatchCommand(INSERT_LINE_BREAK_COMMAND, false);
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
          event?.stopPropagation?.();
          this.closeMentionMenu();
          return true;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );

    this.refs.editor.addEventListener("focus", this.handleEditorFocus);
    this.refs.editor.addEventListener("blur", this.handleEditorBlur);
    this.refs.editor.addEventListener("input", this.handleEditorInput);
    this.refs.editor.addEventListener("keydown", this.handleEditorKeyDown);
    this.refs.editor.addEventListener("mousedown", this.handleEditorMouseDown);
    this.refs.editor.addEventListener(
      "dragstart",
      this.handleReferenceDragEvent,
    );
    this.refs.editor.addEventListener(
      "dragenter",
      this.handleReferenceDragEvent,
    );
    this.refs.editor.addEventListener(
      "dragover",
      this.handleReferenceDragEvent,
    );
    this.refs.editor.addEventListener("drop", this.handleReferenceDragEvent);
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

    this.loadContent(this.state.content);
    requestAnimationFrame(() => {
      if (this.isConnected) {
        this.focusEditor();
      }
    });
  }

  disconnectedCallback() {
    this.refs.editor?.removeEventListener("focus", this.handleEditorFocus);
    this.refs.editor?.removeEventListener("blur", this.handleEditorBlur);
    this.refs.editor?.removeEventListener(
      "beforeinput",
      this.handleEditorBeforeInput,
      true,
    );
    this.refs.editor?.removeEventListener("input", this.handleEditorInput);
    this.refs.editor?.removeEventListener("keydown", this.handleEditorKeyDown);
    this.refs.editor?.removeEventListener(
      "mousedown",
      this.handleEditorMouseDown,
    );
    this.refs.editor?.removeEventListener(
      "dragstart",
      this.handleReferenceDragEvent,
    );
    this.refs.editor?.removeEventListener(
      "dragenter",
      this.handleReferenceDragEvent,
    );
    this.refs.editor?.removeEventListener(
      "dragover",
      this.handleReferenceDragEvent,
    );
    this.refs.editor?.removeEventListener(
      "drop",
      this.handleReferenceDragEvent,
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

    this.unregister?.();
    this.unregister = undefined;
    this.clearMentionMenuOpenFallback();
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
    const nextContent = normalizeLayoutTextContent(value);
    if (areJsonEqual(this.state.content, nextContent)) {
      return;
    }

    this.state.content = nextContent;
    if (this.isConnected && this.refs.editor) {
      this.loadContent(nextContent);
    }
  }

  get content() {
    return normalizeLayoutTextContent(this.state.content);
  }

  set mentionTargets(value) {
    const nextMentionTargets = normalizeMentionTargets(value);
    if (areJsonEqual(this.state.mentionTargets, nextMentionTargets)) {
      return;
    }

    this.state.mentionTargets = nextMentionTargets;
    if (this.isConnected && this.refs.editor) {
      this.loadContent(this.state.content);
    }
  }

  get mentionTargets() {
    return normalizeMentionTargets(this.state.mentionTargets);
  }

  getContent() {
    if (this.isConnected && this.refs.editor) {
      return normalizeLayoutTextContent(this.readSnapshot().content);
    }

    return normalizeLayoutTextContent(this.state.content);
  }

  focusEditor() {
    this.editor.focus(
      () => {
        this.refs.editor?.focus?.({ preventScroll: true });
      },
      { preventScroll: true },
    );
  }

  getReferenceElementByNodeKey(nodeKey) {
    if (!nodeKey) {
      return undefined;
    }

    return Array.from(
      this.refs.editor?.querySelectorAll?.("[data-rvn-reference-key]") ?? [],
    ).find((element) => element.dataset.rvnReferenceKey === nodeKey);
  }

  getReferenceElementFromDomNode(node) {
    const element =
      node?.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    const referenceElement = element?.closest?.(
      ".mention-chip[data-rvn-reference-key]",
    );

    return referenceElement && this.refs.editor?.contains(referenceElement)
      ? referenceElement
      : undefined;
  }

  createDomRangeFromRangeLike(rangeLike = {}) {
    if (
      !rangeLike.startContainer ||
      !rangeLike.endContainer ||
      !this.refs.editor?.contains(rangeLike.startContainer) ||
      !this.refs.editor?.contains(rangeLike.endContainer)
    ) {
      return undefined;
    }

    try {
      const range = document.createRange();
      range.setStart(rangeLike.startContainer, rangeLike.startOffset);
      range.setEnd(rangeLike.endContainer, rangeLike.endOffset);
      return range;
    } catch {
      return undefined;
    }
  }

  getReferenceElementIntersectingDomRange(rangeLike = {}) {
    const endpointReference =
      this.getReferenceElementFromDomNode(rangeLike.startContainer) ??
      this.getReferenceElementFromDomNode(rangeLike.endContainer);
    if (endpointReference) {
      return endpointReference;
    }

    const range = this.createDomRangeFromRangeLike(rangeLike);
    if (!range || range.collapsed) {
      return undefined;
    }

    for (const element of this.refs.editor.querySelectorAll(
      ".mention-chip[data-rvn-reference-key]",
    )) {
      try {
        if (range.intersectsNode(element)) {
          return element;
        }
      } catch {
        // Ignore nodes rejected by Range in older engines.
      }
    }

    return undefined;
  }

  hasReferenceNodeKey(nodeKey) {
    if (!nodeKey) {
      return false;
    }

    return this.editor.getEditorState().read(() => {
      return $isMentionNode($getNodeByKey(nodeKey));
    });
  }

  collapseNativeSelectionAfterReference(nodeKey) {
    const referenceElement = this.getReferenceElementByNodeKey(nodeKey);
    if (!referenceElement) {
      return;
    }

    const ownerDocument = referenceElement.ownerDocument;
    const selection = ownerDocument?.defaultView?.getSelection?.();
    if (!selection) {
      return;
    }

    const range = ownerDocument.createRange();
    range.setStartAfter(referenceElement);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  updateReferenceSelectionMarkers() {
    const editorElement = this.refs.editor;
    if (!editorElement) {
      return;
    }

    if (
      this.selectedReferenceNodeKey &&
      !this.hasReferenceNodeKey(this.selectedReferenceNodeKey)
    ) {
      this.selectedReferenceNodeKey = undefined;
    }

    if (this.selectedReferenceNodeKey) {
      editorElement.dataset.rvnReferenceSelectionActive = "true";
      this.collapseNativeSelectionAfterReference(this.selectedReferenceNodeKey);
    } else {
      delete editorElement.dataset.rvnReferenceSelectionActive;
    }

    for (const element of editorElement.querySelectorAll(".mention-chip")) {
      if (element.dataset.rvnReferenceKey === this.selectedReferenceNodeKey) {
        element.dataset.rvnReferenceSelected = "true";
      } else {
        delete element.dataset.rvnReferenceSelected;
      }
    }
  }

  clearSelectedReferenceNodeKey() {
    if (!this.selectedReferenceNodeKey) {
      return;
    }

    this.selectedReferenceNodeKey = undefined;
    this.updateReferenceSelectionMarkers();
  }

  selectReferenceNodeAsElement(node) {
    this.selectedReferenceNodeKey = node.getKey();
    selectLexicalReferenceNodeAsElement(node);
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
        }
      },
      { discrete: true },
    );
    this.updateReferenceSelectionMarkers();
  }

  isFinalVisibleReferenceNode(node) {
    if (!$isMentionNode(node)) {
      return false;
    }

    const rootNode = $getRoot();
    let lastMentionNode;
    let hasTrailingText = false;

    const visit = (currentNode) => {
      if ($isMentionNode(currentNode)) {
        lastMentionNode = currentNode;
        hasTrailingText = false;
        return;
      }

      if ($isElementNode(currentNode)) {
        for (const childNode of currentNode.getChildren()) {
          visit(childNode);
        }
        return;
      }

      const text = String(currentNode.getTextContent?.() ?? "");
      if (lastMentionNode && text.length > 0) {
        hasTrailingText = true;
      }
    };

    visit(rootNode);
    return !hasTrailingText && lastMentionNode?.getKey() === node.getKey();
  }

  findReferenceElementAtDomEdge(node, direction) {
    let candidate = node;

    while (candidate) {
      if (candidate.nodeType === Node.TEXT_NODE) {
        if (!/^\s*$/.test(String(candidate.textContent ?? ""))) {
          return undefined;
        }
        candidate =
          direction < 0 ? candidate.previousSibling : candidate.nextSibling;
        continue;
      }

      if (candidate.nodeType !== Node.ELEMENT_NODE) {
        return undefined;
      }

      if (candidate.matches?.(".mention-chip[data-rvn-reference-key]")) {
        return candidate;
      }

      const childNodes = Array.from(candidate.childNodes);
      if (childNodes.length === 0) {
        return undefined;
      }
      candidate =
        direction < 0 ? childNodes[childNodes.length - 1] : childNodes[0];
    }

    return undefined;
  }

  getReferenceElementAroundDomPoint(container, offset, direction) {
    if (!container || !this.refs.editor.contains(container)) {
      return undefined;
    }

    let candidate;

    if (container.nodeType === Node.TEXT_NODE) {
      const textLength = String(container.textContent ?? "").length;
      const textBeforeCaret = String(container.textContent ?? "").slice(
        0,
        offset,
      );
      const textAfterCaret = String(container.textContent ?? "").slice(offset);
      if (direction < 0 && offset > 0) {
        if (!/^\s*$/.test(textBeforeCaret)) {
          return undefined;
        }
        candidate = container.previousSibling;
      } else if (direction > 0 && offset < textLength) {
        if (!/^\s*$/.test(textAfterCaret)) {
          return undefined;
        }
        candidate = container.nextSibling;
      } else {
        candidate =
          direction < 0 ? container.previousSibling : container.nextSibling;
      }
    } else if (container.nodeType === Node.ELEMENT_NODE) {
      const childNodes = Array.from(container.childNodes);
      const childIndex = direction < 0 ? offset - 1 : offset;
      candidate =
        childIndex >= 0 && childIndex < childNodes.length
          ? childNodes[childIndex]
          : undefined;
    }

    while (!candidate && container && container !== this.refs.editor) {
      candidate =
        direction < 0 ? container.previousSibling : container.nextSibling;
      container = container.parentNode;
    }

    const referenceElement = this.findReferenceElementAtDomEdge(
      candidate,
      direction,
    );
    return referenceElement && this.refs.editor.contains(referenceElement)
      ? referenceElement
      : undefined;
  }

  getReferenceElementAroundNativeSelection(direction) {
    const range = getSelectionRange(this.refs.editor);
    if (!range || !range.collapsed) {
      return undefined;
    }

    return this.getReferenceElementAroundDomPoint(
      range.startContainer,
      range.startOffset,
      direction,
    );
  }

  getDomTextOffsetFromPoint(container, offset) {
    if (!container || !this.refs.editor.contains(container)) {
      return undefined;
    }

    const beforeCaretRange = document.createRange();
    beforeCaretRange.selectNodeContents(this.refs.editor);
    beforeCaretRange.setEnd(container, offset);
    return beforeCaretRange.toString().length;
  }

  getDeleteTargetRangeContext(event = {}, direction) {
    const ranges = event.getTargetRanges?.();
    const targetRange = ranges?.[0];
    if (!targetRange) {
      return undefined;
    }

    const container =
      direction < 0 ? targetRange.endContainer : targetRange.startContainer;
    const offset =
      direction < 0 ? targetRange.endOffset : targetRange.startOffset;
    if (!container || !this.refs.editor.contains(container)) {
      return undefined;
    }

    const referenceElement =
      this.getReferenceElementAroundDomPoint(container, offset, direction) ??
      this.getReferenceElementIntersectingDomRange(targetRange);

    return {
      offset: this.getDomTextOffsetFromPoint(container, offset),
      referenceElement,
      startOffset: this.getDomTextOffsetFromPoint(
        targetRange.startContainer,
        targetRange.startOffset,
      ),
      endOffset: this.getDomTextOffsetFromPoint(
        targetRange.endContainer,
        targetRange.endOffset,
      ),
    };
  }

  getReferenceNodeAroundContentOffset(rootNode, targetOffset, direction) {
    const offsetValue = Number(targetOffset);
    if (!Number.isFinite(offsetValue)) {
      return undefined;
    }

    let offset = 0;
    let referenceNode;
    let previousReferenceNode;
    const visit = (node) => {
      if (referenceNode) {
        return;
      }

      if ($isMentionNode(node)) {
        const startOffset = offset;
        const endOffset = startOffset + node.getTextContent().length;
        offset = endOffset;
        const isBeforeOrInside =
          direction > 0 &&
          offsetValue >= startOffset &&
          offsetValue < endOffset;
        const isAfterOrInside =
          direction < 0 &&
          offsetValue > startOffset &&
          offsetValue <= endOffset;
        if (isBeforeOrInside || isAfterOrInside) {
          referenceNode = node;
        }
        previousReferenceNode = node;
        return;
      }

      if ($isElementNode(node)) {
        for (const childNode of node.getChildren()) {
          visit(childNode);
          if (referenceNode) {
            return;
          }
        }
        return;
      }

      const text = String(node.getTextContent?.() ?? "");
      const textStart = offset;
      const textEnd = textStart + text.length;
      if (
        direction < 0 &&
        previousReferenceNode &&
        offsetValue > textStart &&
        offsetValue <= textEnd &&
        /^\s*$/.test(text.slice(0, offsetValue - textStart))
      ) {
        referenceNode = previousReferenceNode;
        return;
      }
      if (text.length > 0 && !/^\s*$/.test(text)) {
        previousReferenceNode = undefined;
      }
      offset = textEnd;
    };

    visit(rootNode);
    return referenceNode;
  }

  getReferenceNodeIntersectingContentRange(rootNode, startOffset, endOffset) {
    const startValue = Number(startOffset);
    const endValue = Number(endOffset);
    if (!Number.isFinite(startValue) || !Number.isFinite(endValue)) {
      return undefined;
    }

    const rangeStart = Math.min(startValue, endValue);
    const rangeEnd = Math.max(startValue, endValue);
    if (rangeStart === rangeEnd) {
      return undefined;
    }

    let offset = 0;
    let referenceNode;
    const visit = (node) => {
      if (referenceNode) {
        return;
      }

      if ($isMentionNode(node)) {
        const mentionStart = offset;
        const mentionEnd = mentionStart + node.getTextContent().length;
        offset = mentionEnd;
        if (rangeEnd > mentionStart && rangeStart < mentionEnd) {
          referenceNode = node;
        }
        return;
      }

      if ($isElementNode(node)) {
        for (const childNode of node.getChildren()) {
          visit(childNode);
          if (referenceNode) {
            return;
          }
        }
        return;
      }

      offset += String(node.getTextContent?.() ?? "").length;
    };

    visit(rootNode);
    return referenceNode;
  }

  restoreNativeCaretAtContentOffset(targetOffset) {
    const numericTargetOffset = Number(targetOffset);
    if (!Number.isFinite(numericTargetOffset) || !this.refs.editor) {
      return;
    }

    const { range } = createCollapsedRangeAtPosition(
      this.refs.editor,
      numericTargetOffset,
    );
    setSelectionFromRange(this.refs.editor, range);
  }

  resolveReferenceLabel(resourceId) {
    const mentionTarget = this.state.mentionTargets.find(
      (target) => target.id === resourceId,
    );
    return mentionTarget?.label ?? resourceId;
  }

  loadContent(content) {
    const nextContent = normalizeLayoutTextContent(content);
    this.state.content = nextContent;
    this.isApplyingExternalContent = true;

    this.editor.update(
      () => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        const nodes = createLexicalNodesFromContent(nextContent, {
          resolveReferenceLabel: (resourceId) =>
            this.resolveReferenceLabel(resourceId),
        });

        root.clear();
        if (nodes.length > 0) {
          paragraph.append(...nodes);
        } else {
          paragraph.append($createTextNode(""));
        }
        root.append(paragraph);
        paragraph.selectEnd();
      },
      { discrete: true },
    );

    this.isApplyingExternalContent = false;
    this.clearSelectedReferenceNodeKey();
    this.closeMentionMenu("load-content");
  }

  readSnapshot(editorState = this.editor.getEditorState()) {
    return createSnapshotFromEditorState(editorState);
  }

  readContentFromDom() {
    const content = [];
    const appendText = (text) => {
      const normalizedText = String(text ?? "").replace(/\r\n?/g, "\n");
      if (!normalizedText) {
        return;
      }

      const previousItem = content[content.length - 1];
      if (previousItem && !previousItem.reference) {
        previousItem.text += normalizedText;
        return;
      }

      content.push({ text: normalizedText });
    };
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        appendText(node.textContent);
        return;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return;
      }

      const element = node;
      const resourceId = element.dataset?.rvnReferenceResourceId;
      if (resourceId) {
        content.push({
          reference: {
            resourceId,
          },
        });
        return;
      }

      if (element.tagName === "BR") {
        appendText("\n");
        return;
      }

      for (const childNode of element.childNodes) {
        walk(childNode);
      }
    };

    for (const childNode of this.refs.editor.childNodes) {
      walk(childNode);
    }

    return normalizeLayoutTextContent(content);
  }

  getContentItemDisplayText(item = {}) {
    const resourceId = getLayoutTextReferenceResourceId(item);
    return resourceId ? this.resolveReferenceLabel(resourceId) : item.text;
  }

  createMentionContentItem(mention = {}) {
    return {
      reference: {
        resourceId: mention.id,
      },
    };
  }

  replaceContentRangeWithMention(content, triggerState = {}, mention = {}) {
    const startOffset = Number(triggerState.startOffset);
    const endOffset = Number(triggerState.endOffset);
    if (!Number.isFinite(startOffset) || !Number.isFinite(endOffset)) {
      return normalizeLayoutTextContent(content);
    }

    const normalizedContent = normalizeLayoutTextContent(content);
    const nextContent = [];
    const textAfterRange = normalizedContent
      .map((item) => this.getContentItemDisplayText(item) ?? "")
      .join("")
      .slice(endOffset);
    const shouldAddSpacer = !/^[\s,.!?;:]/.test(textAfterRange);
    let offset = 0;
    let inserted = false;
    const insertMention = () => {
      if (inserted) {
        return;
      }

      nextContent.push(this.createMentionContentItem(mention));
      if (shouldAddSpacer) {
        nextContent.push({ text: " " });
      }
      inserted = true;
    };

    for (const item of normalizedContent) {
      const displayText = this.getContentItemDisplayText(item) ?? "";
      const itemStart = offset;
      const itemEnd = itemStart + displayText.length;
      offset = itemEnd;

      if (itemEnd <= startOffset) {
        nextContent.push(item);
        continue;
      }

      if (itemStart >= endOffset) {
        insertMention();
        nextContent.push(item);
        continue;
      }

      const resourceId = getLayoutTextReferenceResourceId(item);
      if (resourceId) {
        insertMention();
        continue;
      }

      const text = item.text ?? "";
      const prefixLength = Math.max(0, startOffset - itemStart);
      const suffixStart = Math.max(0, endOffset - itemStart);
      const prefixText = text.slice(0, prefixLength);
      const suffixText = text.slice(suffixStart);

      if (prefixText) {
        nextContent.push({ text: prefixText });
      }
      insertMention();
      if (suffixText) {
        nextContent.push({ text: suffixText });
      }
    }

    insertMention();
    return normalizeLayoutTextContent(nextContent);
  }

  syncStateFromDom() {
    const content = this.readContentFromDom();
    this.state.content = content;
    return content;
  }

  shouldPreserveOpenMentionMenuDuringFocusTransfer() {
    return this.state.mentionMenu.isOpen === true && !this.isEditorFocused;
  }

  syncFromEditorState(editorState) {
    const snapshot = this.readSnapshot(editorState);
    const nextContent = normalizeLayoutTextContent(snapshot.content);
    this.state.content = nextContent;

    if (!this.isApplyingExternalContent) {
      this.dispatchEvent(
        new CustomEvent("content-change", {
          detail: {
            content: this.getContent(),
            plainText: getLayoutTextDisplayText(this.getContent()),
          },
          bubbles: true,
        }),
      );
    }

    if (snapshot.mentionTrigger && !this.isApplyingExternalContent) {
      const openReason = this.getMentionTriggerOpenReason(
        snapshot.mentionTrigger,
      );

      if (!openReason) {
        if (this.shouldPreserveOpenMentionMenuDuringFocusTransfer()) {
          return;
        }

        this.closeMentionMenu("mention-trigger-without-open-reason");
        return;
      }

      this.openMentionMenuForTrigger(snapshot.mentionTrigger);
      return;
    }

    if (this.shouldPreserveOpenMentionMenuDuringFocusTransfer()) {
      return;
    }

    this.closeMentionMenu("no-mention-trigger");
  }

  getNow() {
    return Date.now();
  }

  armMentionMenuOpenFromTypedSlash({
    source = "input",
    domEndOffset,
    caretRect,
  } = {}) {
    this.pendingTypedSlashMentionTrigger = {
      source,
      until: this.getNow() + TYPED_SLASH_MENTION_TRIGGER_WINDOW_MS,
      domEndOffset,
      caretRect,
    };
    this.queueMentionMenuOpenFallback();
  }

  clearMentionMenuOpenFallback() {
    if (this.mentionMenuOpenFallbackTimerId === undefined) {
      return;
    }

    clearTimeout(this.mentionMenuOpenFallbackTimerId);
    this.mentionMenuOpenFallbackTimerId = undefined;
  }

  queueMentionMenuOpenFallback() {
    this.clearMentionMenuOpenFallback();
    this.mentionMenuOpenFallbackTimerId = setTimeout(() => {
      this.mentionMenuOpenFallbackTimerId = undefined;
      if (!this.isConnected || this.isApplyingExternalContent) {
        return;
      }

      this.openMentionMenuFromCurrentSelection();
    }, 0);
  }

  isOpenMentionTriggerContinuation(trigger = {}) {
    const menu = this.state.mentionMenu;
    if (menu?.isOpen !== true) {
      return false;
    }

    if (menu.source === "dom") {
      return true;
    }

    return (
      menu.nodeKey === trigger.nodeKey &&
      menu.startOffset === trigger.startOffset
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

    return this.consumeTypedSlashMentionTriggerOpen(trigger);
  }

  openMentionMenuFromCurrentSelection() {
    const snapshot = this.readSnapshot();
    const snapshotMentionTrigger = snapshot.mentionTrigger;
    const nativeMentionTrigger = this.getNativeMentionTriggerMatch();
    const domMentionTrigger = this.getDomTextMentionTriggerMatch();
    const mentionTrigger =
      snapshotMentionTrigger ?? nativeMentionTrigger ?? domMentionTrigger;
    if (!mentionTrigger) {
      return false;
    }

    this.pendingTypedSlashMentionTrigger = undefined;
    this.openMentionMenuForTrigger(mentionTrigger);
    return true;
  }

  getDomTextMentionTriggerMatch() {
    const text = this.refs.editor?.textContent ?? "";
    const selectionTextOffset = this.getNativeSelectionTextOffset();
    const pendingDomEndOffset =
      this.pendingTypedSlashMentionTrigger?.domEndOffset;
    const endOffset = Math.max(
      0,
      Math.min(
        selectionTextOffset?.offset ?? pendingDomEndOffset ?? text.length,
        text.length,
      ),
    );
    const beforeCaret = text.slice(0, endOffset);
    const match = getMentionTriggerMatchFromBeforeCaret({
      source: "dom",
      beforeCaret,
      caretRect:
        selectionTextOffset?.caretRect ??
        this.pendingTypedSlashMentionTrigger?.caretRect ??
        this.getDomTextOffsetRect(endOffset),
    });

    return match;
  }

  getNativeMentionTriggerMatch() {
    const range = getSelectionRange(this.refs.editor);
    if (!range || !range.collapsed) {
      return undefined;
    }

    const beforeCaretRange = document.createRange();
    beforeCaretRange.selectNodeContents(this.refs.editor);
    beforeCaretRange.setEnd(range.endContainer, range.endOffset);
    const beforeCaret = beforeCaretRange.toString();
    const match = getMentionTriggerMatchFromBeforeCaret({
      source: "dom",
      beforeCaret,
      caretRect: this.getRangeRect(range),
    });

    return match;
  }

  getNativeSelectionTextOffset() {
    const range = getSelectionRange(this.refs.editor);
    if (!range || !range.collapsed) {
      return undefined;
    }

    const beforeCaretRange = document.createRange();
    beforeCaretRange.selectNodeContents(this.refs.editor);
    beforeCaretRange.setEnd(range.endContainer, range.endOffset);
    return {
      offset: beforeCaretRange.toString().length,
      caretRect: this.getRangeRect(range),
    };
  }

  getNativeSelectionTextRange() {
    const range = getSelectionRange(this.refs.editor);
    if (!range) {
      return undefined;
    }

    const getOffset = (container, offset) => {
      const beforePointRange = document.createRange();
      beforePointRange.selectNodeContents(this.refs.editor);
      beforePointRange.setEnd(container, offset);
      return beforePointRange.toString().length;
    };
    const start = getOffset(range.startContainer, range.startOffset);
    const end = getOffset(range.endContainer, range.endOffset);

    return {
      start,
      end,
      collapsed: range.collapsed,
      caretRect: this.getRangeRect(range),
    };
  }

  insertPlainText(text, { nativeSelection } = {}) {
    const nextText = String(text ?? "").replace(/\r\n?/g, "\n");
    if (!nextText) {
      return false;
    }

    let didInsert = false;
    this.editor.update(
      () => {
        const root = $getRoot();
        if (nativeSelection) {
          applySelectionToLineNode(root, nativeSelection);
        }

        let selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          root.selectEnd();
          selection = $getSelection();
        }

        if (!$isRangeSelection(selection)) {
          return;
        }

        selection.insertText(nextText);
        didInsert = true;
      },
      { discrete: true },
    );

    return didInsert;
  }

  handleControlledTextInput(event) {
    if (
      event.defaultPrevented ||
      event.isComposing ||
      (event.inputType !== "insertText" &&
        event.inputType !== "insertReplacementText")
    ) {
      return false;
    }

    const inputText = String(event.data ?? "");
    if (!inputText) {
      return false;
    }

    const nativeSelection = this.getNativeSelectionTextRange();
    event.preventDefault();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();

    if (isSlashText(inputText)) {
      this.armMentionMenuOpenFromTypedSlash({
        source: "beforeinput",
        domEndOffset:
          nativeSelection?.start === undefined
            ? undefined
            : nativeSelection.start + inputText.length,
        caretRect: nativeSelection?.caretRect,
      });
    }

    return this.insertPlainText(inputText, { nativeSelection });
  }

  openMentionMenuForTrigger(trigger = {}) {
    const items = filterMentionSuggestions(
      trigger.query,
      this.state.mentionTargets,
    );
    const position = this.getMentionMenuPosition(trigger);

    this.state.mentionMenu = {
      isOpen: true,
      source: trigger.source,
      query: trigger.query,
      items,
      highlightedIndex: 0,
      nodeKey: trigger.nodeKey,
      startOffset: trigger.startOffset,
      endOffset: trigger.endOffset,
      left: position.left,
      top: position.top,
    };
    this.renderMentionMenu();
  }

  getRangeRect(range) {
    const rect = range?.getBoundingClientRect?.();
    if (rect && rect.width + rect.height > 0) {
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      };
    }

    const rects = range?.getClientRects?.();
    const lastRect = rects?.length ? rects[rects.length - 1] : undefined;
    if (!lastRect) {
      return undefined;
    }

    return {
      left: lastRect.left,
      right: lastRect.right,
      top: lastRect.top,
      bottom: lastRect.bottom,
      width: lastRect.width,
      height: lastRect.height,
    };
  }

  getDomTextOffsetRect(targetOffset) {
    const numericTargetOffset = Number(targetOffset);
    if (!Number.isFinite(numericTargetOffset)) {
      return undefined;
    }

    let offset = 0;
    const stack = [...this.refs.editor.childNodes];
    while (stack.length > 0) {
      const node = stack.shift();
      if (node.nodeType === Node.TEXT_NODE) {
        const textLength = node.textContent?.length ?? 0;
        if (offset + textLength >= numericTargetOffset) {
          const range = document.createRange();
          range.setStart(
            node,
            Math.max(0, Math.min(textLength, numericTargetOffset - offset)),
          );
          range.collapse(true);
          return this.getRangeRect(range);
        }
        offset += textLength;
        continue;
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }

      if (node.tagName === "BR") {
        offset += 1;
        continue;
      }

      stack.unshift(...node.childNodes);
    }

    return undefined;
  }

  getMentionMenuPosition(trigger = {}) {
    const surfaceRect = this.refs.surface.getBoundingClientRect();
    const range = getSelectionRange(this.refs.editor);
    const rect = trigger.caretRect ?? this.getRangeRect(range);
    const fallbackRect = this.refs.editor.getBoundingClientRect();
    const anchorRect =
      rect && rect.width + rect.height > 0 ? rect : fallbackRect;
    const maxLeft = Math.max(12, surfaceRect.width - 292);

    return {
      left:
        surfaceRect.left +
        Math.max(12, Math.min(maxLeft, anchorRect.left - surfaceRect.left)),
      top: Math.max(surfaceRect.top + 18, anchorRect.bottom + 8),
    };
  }

  getMentionMenuPopover() {
    return this.refs.mentionMenu?.shadowRoot?.querySelector?.("rtgl-popover");
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

  renderMentionMenu() {
    const menu = this.refs.mentionMenu;
    if (!menu) {
      return;
    }

    const mentionItems = this.state.mentionMenu.items ?? [];
    if (!this.state.mentionMenu.isOpen) {
      menu.items = [];
      menu.open = false;
      menu.render?.();
      return;
    }

    menu.items =
      mentionItems.length > 0
        ? mentionItems.map((item, index) => ({
            id: item.id,
            key: item.id,
            type: "item",
            label: item.label,
            suffixText: item.variableType ?? "",
            selected: index === this.state.mentionMenu.highlightedIndex,
          }))
        : [
            {
              id: "no-variables",
              key: "no-variables",
              type: "item",
              label: "No variables",
              disabled: true,
            },
          ];
    const hasPopover = Boolean(this.getMentionMenuPopover());
    menu.x = String(this.state.mentionMenu.left);
    menu.y = String(this.state.mentionMenu.top);
    menu.place = "bs";
    menu.w = "260";
    menu.h = "240";
    if (!hasPopover) {
      menu.open = false;
      menu.render?.();
      this.syncMentionMenuPopover();
    }
    menu.open = true;
    menu.render?.();
    this.syncMentionMenuPopover();
  }

  closeMentionMenu(_reason = "close") {
    this.state.mentionMenu = createClosedMentionMenuState();
    if (this.refs.mentionMenu) {
      this.refs.mentionMenu.items = [];
      this.refs.mentionMenu.open = false;
      this.refs.mentionMenu.render?.();
    }
  }

  selectMentionByIndex(index) {
    const mention = this.state.mentionMenu.items[index];
    if (!mention) {
      return;
    }

    const triggerState = { ...this.state.mentionMenu };
    this.closeMentionMenu("select-mention");

    if (triggerState.source === "dom") {
      const content = this.replaceContentRangeWithMention(
        this.readContentFromDom(),
        triggerState,
        mention,
      );
      this.loadContent(content);
      this.focusEditor();
      this.clearSelectedReferenceNodeKey();
      return;
    }

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

    this.focusEditor();
    this.clearSelectedReferenceNodeKey();
  }

  handleReferenceArrowNavigation(event) {
    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (
      direction === 0 ||
      event.isComposing ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return false;
    }

    const nativeSelectionTextOffset = this.getNativeSelectionTextOffset();
    let didHandle = false;
    let caretRestoreOffset;
    let nextSelectedReferenceNodeKey = this.selectedReferenceNodeKey;
    this.editor.update(
      () => {
        const placeCaretAroundReference = (referenceNode) => {
          const referenceOffset = getLexicalOffsetBeforeNode(
            $getRoot(),
            referenceNode.getKey(),
          );
          caretRestoreOffset = referenceOffset.found
            ? referenceOffset.offset +
              (direction > 0 ? getLexicalTextLength(referenceNode) : 0)
            : undefined;
          placeCaretAroundReferenceNode(referenceNode, direction);
        };
        const selectedReferenceNode = this.selectedReferenceNodeKey
          ? $getNodeByKey(this.selectedReferenceNodeKey)
          : undefined;
        const handleNativeFallback = () => {
          const nativeReference = this.getReferenceNodeAroundContentOffset(
            $getRoot(),
            nativeSelectionTextOffset?.offset,
            direction,
          );
          if (!nativeReference) {
            return false;
          }

          if (
            direction > 0 &&
            this.isFinalVisibleReferenceNode(nativeReference)
          ) {
            placeCaretAroundReference(nativeReference);
            nextSelectedReferenceNodeKey = undefined;
            didHandle = true;
            return true;
          }

          this.selectReferenceNodeAsElement(nativeReference);
          nextSelectedReferenceNodeKey = nativeReference.getKey();
          didHandle = true;
          return true;
        };
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) {
          if ($isMentionNode(selectedReferenceNode)) {
            placeCaretAroundReference(selectedReferenceNode);
            nextSelectedReferenceNodeKey = undefined;
            didHandle = true;
            return;
          }
          handleNativeFallback();
          return;
        }

        const referenceSelection = getReferenceSelectionInfo(selection);
        if (referenceSelection?.node) {
          const isSelectedReference =
            this.selectedReferenceNodeKey === referenceSelection.node.getKey();
          if (referenceSelection.isWhole || isSelectedReference) {
            placeCaretAroundReference(referenceSelection.node);
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
          placeCaretAroundReference(selectedReferenceNode);
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
        const nativeReference =
          adjacentReference ??
          this.getReferenceNodeAroundContentOffset(
            $getRoot(),
            nativeSelectionTextOffset?.offset,
            direction,
          );
        if (!nativeReference) {
          return;
        }

        if (
          nativeReference === adjacentReference &&
          adjacentReferenceInfo.skippedZeroLengthText &&
          direction < 0
        ) {
          placeCaretAroundReference(nativeReference);
          nextSelectedReferenceNodeKey = undefined;
          didHandle = true;
          return;
        }

        if (
          nativeReference === adjacentReference &&
          direction > 0 &&
          this.isFinalVisibleReferenceNode(nativeReference)
        ) {
          placeCaretAroundReference(nativeReference);
          nextSelectedReferenceNodeKey = undefined;
          didHandle = true;
          return;
        }

        this.selectReferenceNodeAsElement(nativeReference);
        nextSelectedReferenceNodeKey = nativeReference.getKey();
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
    this.restoreNativeCaretAtContentOffset(caretRestoreOffset);
    return true;
  }

  getReferenceDeleteDirection(event = {}) {
    if (
      event.key === "Backspace" ||
      event.inputType === "deleteContentBackward"
    ) {
      return -1;
    }

    if (event.key === "Delete" || event.inputType === "deleteContentForward") {
      return 1;
    }

    return 0;
  }

  handleReferenceDelete(event) {
    const direction = this.getReferenceDeleteDirection(event);
    if (
      direction === 0 ||
      event.isComposing ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    ) {
      return false;
    }

    const targetRangeContext = this.getDeleteTargetRangeContext(
      event,
      direction,
    );
    const nativeSelectionTextOffset =
      this.getNativeSelectionTextOffset() ??
      (targetRangeContext?.offset === undefined
        ? undefined
        : {
            offset: targetRangeContext.offset,
            caretRect: undefined,
          });
    const nativeReferenceElement =
      this.getReferenceElementAroundNativeSelection(direction) ??
      targetRangeContext?.referenceElement;
    const nativeReferenceNodeKey =
      nativeReferenceElement?.dataset.rvnReferenceKey;
    let didHandle = false;
    let caretRestoreOffset;
    this.editor.update(
      () => {
        const selectedReferenceCandidate = this.selectedReferenceNodeKey
          ? $getNodeByKey(this.selectedReferenceNodeKey)
          : undefined;
        const selectedReferenceNode = $isMentionNode(selectedReferenceCandidate)
          ? selectedReferenceCandidate
          : undefined;
        const selection = $getSelection();
        const referenceSelection = getReferenceSelectionInfo(selection);
        const wholeSelectedReferenceNode =
          referenceSelection?.isWhole === true
            ? referenceSelection.node
            : undefined;
        const referenceNodeToRemove =
          selectedReferenceNode ?? wholeSelectedReferenceNode;

        if ($isMentionNode(referenceNodeToRemove)) {
          const parentNode = referenceNodeToRemove.getParent();
          const referenceOffset = getLexicalOffsetBeforeNode(
            $getRoot(),
            referenceNodeToRemove.getKey(),
          );
          caretRestoreOffset = referenceOffset.found
            ? referenceOffset.offset
            : undefined;
          const referenceIndex = referenceNodeToRemove.getIndexWithinParent();
          referenceNodeToRemove.remove();
          if ($isElementNode(parentNode)) {
            const caretIndex = Math.min(
              referenceIndex,
              parentNode.getChildrenSize(),
            );
            parentNode.select(caretIndex, caretIndex);
          }
          this.selectedReferenceNodeKey = undefined;
          didHandle = true;
          return;
        }

        if (referenceSelection?.node) {
          this.selectReferenceNodeAsElement(referenceSelection.node);
          didHandle = true;
          return;
        }

        const adjacentReference =
          getAdjacentReferenceNodeInfoForCollapsedSelection(
            selection,
            direction,
          )?.node;
        const nativeReferenceCandidate = nativeReferenceNodeKey
          ? $getNodeByKey(nativeReferenceNodeKey)
          : undefined;
        const targetRangeReference =
          this.getReferenceNodeIntersectingContentRange(
            $getRoot(),
            targetRangeContext?.startOffset,
            targetRangeContext?.endOffset,
          );
        const nativeReference =
          adjacentReference ??
          ($isMentionNode(nativeReferenceCandidate)
            ? nativeReferenceCandidate
            : undefined) ??
          targetRangeReference ??
          this.getReferenceNodeAroundContentOffset(
            $getRoot(),
            nativeSelectionTextOffset?.offset,
            direction,
          );
        if (!$isMentionNode(nativeReference)) {
          return;
        }

        this.selectReferenceNodeAsElement(nativeReference);
        didHandle = true;
      },
      { discrete: true },
    );

    if (!didHandle) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();
    this.updateReferenceSelectionMarkers();
    this.restoreNativeCaretAtContentOffset(caretRestoreOffset);
    return true;
  }

  handleReferenceBackspace(event) {
    return this.handleReferenceDelete(event);
  }

  handleEditorFocus() {
    this.isEditorFocused = true;
  }

  handleEditorBlur() {
    this.isEditorFocused = false;
    this.clearSelectedReferenceNodeKey();
  }

  handleEditorBeforeInput(event) {
    if (
      event.inputType === "deleteContentBackward" ||
      event.inputType === "deleteContentForward"
    ) {
      if (this.handleReferenceDelete(event)) {
        return;
      }
    }

    if (
      (event.inputType === "insertText" ||
        event.inputType === "insertReplacementText") &&
      event.data
    ) {
      if (this.handleControlledTextInput(event)) {
        return;
      }
    }
  }

  handleEditorInput(event) {
    this.syncStateFromDom({
      source: event.inputType,
    });

    if (this.selectedReferenceNodeKey) {
      this.updateReferenceSelectionMarkers();
    }

    if (
      (event.inputType === "insertText" ||
        event.inputType === "insertReplacementText") &&
      isSlashText(event.data)
    ) {
      const selectionTextOffset = this.getNativeSelectionTextOffset();
      this.armMentionMenuOpenFromTypedSlash({
        source: "input",
        domEndOffset:
          selectionTextOffset?.offset ??
          this.pendingTypedSlashMentionTrigger?.domEndOffset,
        caretRect:
          selectionTextOffset?.caretRect ??
          this.pendingTypedSlashMentionTrigger?.caretRect,
      });
      this.openMentionMenuFromCurrentSelection();
      return;
    }

    if (
      this.state.mentionMenu.isOpen &&
      (event.inputType === "insertText" ||
        event.inputType === "insertReplacementText" ||
        event.inputType === "deleteContentBackward" ||
        event.inputType === "deleteContentForward")
    ) {
      const didOpen = this.openMentionMenuFromCurrentSelection();
      if (!didOpen) {
        this.closeMentionMenu("input-no-mention-trigger");
      }
    }
  }

  handleEditorKeyDown(event) {
    if (this.handleReferenceArrowNavigation(event)) {
      return;
    }

    if (this.handleReferenceDelete(event)) {
      return;
    }

    if (
      isSlashText(event.key) &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const selectionTextOffset = this.getNativeSelectionTextOffset();
      this.armMentionMenuOpenFromTypedSlash({
        source: "keydown",
        domEndOffset:
          selectionTextOffset?.offset === undefined
            ? undefined
            : selectionTextOffset.offset + 1,
        caretRect: selectionTextOffset?.caretRect,
      });
    } else if (
      event.key !== "Backspace" &&
      event.key !== "Delete" &&
      !this.state.mentionMenu.isOpen
    ) {
      this.clearSelectedReferenceNodeKey();
    }

    if (!this.state.mentionMenu.isOpen) {
      return;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const itemCount = this.state.mentionMenu.items.length;
      if (itemCount === 0) {
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      this.state.mentionMenu.highlightedIndex =
        (this.state.mentionMenu.highlightedIndex + delta + itemCount) %
        itemCount;
      this.renderMentionMenu();
      return;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      this.selectMentionByIndex(this.state.mentionMenu.highlightedIndex);
    }
  }

  handleEditorMouseDown(event) {
    if (event.button !== 0) {
      return;
    }

    const referenceElement = getReferenceElementFromContextEvent(
      event,
      this.refs.editor,
    );
    if (!referenceElement) {
      this.clearSelectedReferenceNodeKey();
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.focusEditor();
    this.selectReferenceByNodeKey(referenceElement.dataset.rvnReferenceKey);
  }

  handleReferenceDragEvent(event) {
    if (!getReferenceElementFromContextEvent(event, this.refs.editor)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
  }

  handleMentionMenuMouseDown(event) {
    event.preventDefault();
  }

  handleMentionMenuItemClick(event) {
    const itemId =
      event.detail?.item?.key ??
      event.detail?.item?.id ??
      event.detail?.key ??
      event.detail?.id;
    const index = this.state.mentionMenu.items.findIndex(
      (item) => item.id === itemId,
    );
    this.selectMentionByIndex(index);
  }

  handleMentionMenuClose() {
    this.closeMentionMenu("dropdown-close-event");
  }
}
