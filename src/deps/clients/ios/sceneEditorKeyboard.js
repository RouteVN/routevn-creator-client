import { callIOSBridge } from "./bridge.js";

const SCENE_EDITOR_TAG = "rvn-lexical-scene-document-editor";

const getFocusedSceneEditor = () => {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element?.isContentEditable
    ? element.closest(SCENE_EDITOR_TAG)
    : undefined;
};

export const installIOSSceneEditorKeyboard = ({ onRevealError } = {}) => {
  let revealFrame;
  let revealSequence = 0;
  let revealErrorReported = false;
  let nativeCaret;
  const viewport = window.visualViewport;

  const cancelReveal = () => {
    cancelAnimationFrame(revealFrame);
    revealSequence += 1;
  };

  const revealSelection = async (
    direction,
    sequence,
    previousCaret,
    syncSelection,
  ) => {
    const editor = getFocusedSceneEditor();
    if (
      !editor ||
      editor.revealCurrentSelection({ behavior: "auto", direction })
    ) {
      return;
    }

    // iOS 16 cannot expose shadow-DOM selections to JavaScript. UIKit still
    // knows the caret rectangle; reading it leaves the native selection alone.
    try {
      const rect = await callIOSBridge("getCaretRect");
      if (sequence !== revealSequence || getFocusedSceneEditor() !== editor) {
        return;
      }
      revealErrorReported = false;
      if (!rect) {
        return;
      }
      const scale = (viewport?.width ?? window.innerWidth) / rect.viewWidth;
      // UIKit's conversion to the WebView already includes its keyboard pan.
      // Adding visualViewport offsets again moves the target by a keyboard's
      // height and can scroll the real caret completely out of view.
      const left = rect.x * scale;
      const top = rect.y * scale;
      const width = rect.width * scale;
      const height = rect.height * scale;
      const caretRect = {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
      };
      const context = syncSelection
        ? editor.syncSelectionFromCaretRect({ rect: caretRect })
        : undefined;
      const focusSequence = editor.focusRestoreSequenceId;
      nativeCaret = context ? { editor, context, focusSequence } : undefined;
      // Only cross a section after a native arrow actually stalled at its
      // edge. A missing or superseded measurement must not skip a real line.
      if (
        context &&
        previousCaret?.editor === editor &&
        previousCaret.focusSequence === focusSequence &&
        previousCaret.context.lineId === context.lineId &&
        Math.abs(previousCaret.context.y - context.y) < 1 &&
        editor.hasAdjacentSectionLineForVerticalNavigation(direction) &&
        editor.dispatchTextModeVerticalBoundaryNavigation({
          lineId: context.lineId,
          direction,
        })
      ) {
        nativeCaret = undefined;
        return;
      }
      editor.revealSelectionRect({
        rect: caretRect,
        behavior: "auto",
        direction,
      });
    } catch {
      if (sequence === revealSequence && !revealErrorReported) {
        revealErrorReported = true;
        onRevealError?.();
      }
    }
  };

  const scheduleReveal = (direction, previousCaret, syncSelection = true) => {
    cancelReveal();
    const sequence = revealSequence;
    // Wait for Selection.modify/native arrow movement and toolbar layout.
    revealFrame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => {
        void revealSelection(direction, sequence, previousCaret, syncSelection);
      });
    });
  };

  const handleMouseDown = (event) => {
    if (event.button !== 0 || event.defaultPrevented) {
      return;
    }

    const path = event.composedPath();
    const editor = path.find(
      (element) => element.localName === SCENE_EDITOR_TAG,
    );
    const editable = path.find(
      (element) => element.getAttribute?.("contenteditable") === "true",
    );
    if (!editor || !editable) {
      return;
    }

    // Run after the editor's block/text-mode handler, before WebKit's default
    // tap focus. iOS otherwise pans the whole WebView to reveal the caret.
    // Keep the default event so WebKit still places the caret at the tap.
    cancelReveal();
    nativeCaret = undefined;
    editable.focus({ preventScroll: true });
    scheduleReveal();
  };

  const handleViewportResize = () => {
    if (window.innerHeight - viewport.height < 100) {
      nativeCaret = undefined;
      cancelReveal();
      return;
    }

    // The toolbar updates the page's keyboard spacing on the next frame.
    // Reveal the caret inside the dialogue scroller after that layout settles.
    scheduleReveal("down");
  };

  const handleKeyDown = (event) => {
    const previousCaret = nativeCaret;
    nativeCaret = undefined;
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) {
      cancelReveal();
      return;
    }
    if (
      (event.key === "ArrowUp" || event.key === "ArrowDown") &&
      getFocusedSceneEditor()
    ) {
      scheduleReveal(
        event.key === "ArrowUp" ? "up" : "down",
        event.shiftKey ? undefined : previousCaret,
        !event.shiftKey,
      );
    } else {
      cancelReveal();
    }
  };

  const handleFocusIn = () => {
    nativeCaret = undefined;
    if (getFocusedSceneEditor()) scheduleReveal();
  };
  const handleFocusOut = () => {
    nativeCaret = undefined;
    cancelReveal();
  };

  document.addEventListener("mousedown", handleMouseDown);
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("focusin", handleFocusIn);
  document.addEventListener("focusout", handleFocusOut);
  viewport?.addEventListener("resize", handleViewportResize);

  return () => {
    document.removeEventListener("mousedown", handleMouseDown);
    document.removeEventListener("keydown", handleKeyDown, true);
    document.removeEventListener("focusin", handleFocusIn);
    document.removeEventListener("focusout", handleFocusOut);
    viewport?.removeEventListener("resize", handleViewportResize);
    cancelReveal();
  };
};
