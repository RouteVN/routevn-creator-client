import {
  $createParagraphNode,
  $createTextNode,
  $getNodeByKey,
  $getRoot,
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
} from "./lexicalRichTextShared.js";
import {
  normalizeLayoutTextContent,
  getLayoutTextDisplayText,
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

      .rvn-layout-text-editor .mention-chip {
        display: inline-block;
        max-width: 100%;
        padding: 1px 6px;
        margin: 0 1px;
        border-radius: var(--border-radius-sm);
        background: color-mix(in srgb, var(--accent) 16%, transparent);
        color: var(--accent-foreground);
        border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
        font-weight: 600;
        line-height: 1.4;
        vertical-align: baseline;
        white-space: nowrap;
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

    this.editor = createEditor({
      namespace: "routevn-lexical-layout-text-editor",
      nodes: [MentionNode],
      onError: () => undefined,
      theme: LEXICAL_EDITOR_THEME,
    });
    this.unregister = undefined;

    this.handleEditorFocus = this.handleEditorFocus.bind(this);
    this.handleEditorBlur = this.handleEditorBlur.bind(this);
    this.handleEditorKeyDown = this.handleEditorKeyDown.bind(this);
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
    this.refs.editor.contentEditable = "true";
    this.refs.editor.setAttribute("contenteditable", "true");
    this.refs.editor.spellcheck = true;
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
    this.refs.editor.addEventListener("keydown", this.handleEditorKeyDown);
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
    this.refs.editor?.removeEventListener("keydown", this.handleEditorKeyDown);
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
    this.editor.setRootElement(null);
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
    return normalizeLayoutTextContent(this.state.content);
  }

  focusEditor() {
    this.refs.editor?.focus?.({ preventScroll: true });
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
    this.closeMentionMenu();
  }

  readSnapshot(editorState = this.editor.getEditorState()) {
    return createSnapshotFromEditorState(editorState);
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
      const items = filterMentionSuggestions(
        snapshot.mentionTrigger.query,
        this.state.mentionTargets,
      );
      const position = this.getMentionMenuPosition();

      this.state.mentionMenu = {
        isOpen: items.length > 0,
        query: snapshot.mentionTrigger.query,
        items,
        highlightedIndex: 0,
        nodeKey: snapshot.mentionTrigger.nodeKey,
        startOffset: snapshot.mentionTrigger.startOffset,
        endOffset: snapshot.mentionTrigger.endOffset,
        left: position.left,
        top: position.top,
      };
      this.renderMentionMenu();
      return;
    }

    this.closeMentionMenu();
  }

  getMentionMenuPosition() {
    const surfaceRect = this.refs.surface.getBoundingClientRect();
    const selection = window.getSelection?.();
    const range =
      selection && selection.rangeCount > 0
        ? selection.getRangeAt(0).cloneRange()
        : undefined;
    const rect = range?.getBoundingClientRect?.();
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
    if (popover && !popover.hasAttribute("no-overlay")) {
      popover.setAttribute("no-overlay", "");
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
    if (!this.state.mentionMenu.isOpen || mentionItems.length === 0) {
      menu.items = [];
      menu.open = false;
      menu.render?.();
      return;
    }

    menu.items = mentionItems.map((item, index) => ({
      id: item.id,
      key: item.id,
      type: "item",
      label: item.label,
      suffixText: item.variableType ?? "",
      selected: index === this.state.mentionMenu.highlightedIndex,
    }));
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

  closeMentionMenu() {
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

    this.focusEditor();
  }

  handleEditorFocus() {
    this.isEditorFocused = true;
  }

  handleEditorBlur() {
    this.isEditorFocused = false;
  }

  handleEditorKeyDown(event) {
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
    this.closeMentionMenu();
  }
}
