import { debugLog, previewDebugText } from "../../utils/debugLog.js";

const getLineContent = (element) => {
  if (!element || typeof element.getContent !== "function") {
    return "";
  }

  return element.getContent();
};

const getCursorPosition = (element) => {
  if (!element || typeof element.getCaretPosition !== "function") {
    return 0;
  }

  return element.getCaretPosition();
};

const hasSelectionRange = (element) => {
  if (!element || typeof element.hasSelectionRange !== "function") {
    return true;
  }

  return element.hasSelectionRange();
};

const getLineIdFromElement = (element) => {
  return element?.dataset?.lineId || element?.id?.replace(/^line/, "") || "";
};

const shouldIgnoreElementInput = (element) => {
  return element?.__rvnIgnoreInputUntilFocus === true;
};

const suppressElementInputUntilFocus = (element) => {
  if (element) {
    element.__rvnIgnoreInputUntilFocus = true;
  }
};

const clearElementInputSuppression = (element) => {
  if (element) {
    element.__rvnIgnoreInputUntilFocus = false;
  }
};

const dispatchEditorDataChanged = (dispatchEvent, element) => {
  const lineId = getLineIdFromElement(element);
  if (!lineId) {
    return;
  }

  const content = getLineContent(element);
  debugLog("lines", "editor.dispatch-data-changed", {
    lineId,
    contentLength: content.length,
    content: previewDebugText(content),
  });

  dispatchEvent(
    new CustomEvent("editor-data-changed", {
      detail: {
        lineId,
        content,
      },
    }),
  );
};

const getLineElementById = (refs, lineId) => {
  return Object.values(refs || {}).find(
    (element) => getLineIdFromElement(element) === lineId,
  );
};

const syncStoredCursorState = (
  store,
  element,
  { updateGoalColumn = true, remainingFrames = 2 } = {},
) => {
  requestAnimationFrame(() => {
    const cursorPosition = getCursorPosition(element);
    const selectionReady = hasSelectionRange(element);

    if (!selectionReady && remainingFrames > 0) {
      syncStoredCursorState(store, element, {
        updateGoalColumn,
        remainingFrames: remainingFrames - 1,
      });
      return;
    }

    store.setCursorPosition({ position: cursorPosition });
    if (updateGoalColumn) {
      store.setGoalColumn({ goalColumn: cursorPosition });
    }
  });
};

const focusContainerAfterPaint = (refs) => {
  requestAnimationFrame(() => {
    const container = refs["container"];
    if (container) {
      container.focus();
    }
  });
};

const getActualActiveElement = (element) => {
  const root = element?.getRootNode();

  if (root instanceof ShadowRoot && root.activeElement) {
    return root.activeElement;
  }

  return document.activeElement;
};

const isLineElement = (element) => {
  return Boolean(element && getLineIdFromElement(element));
};

const getLineText = (line) => {
  return line?.actions?.dialogue?.content?.[0]?.text ?? "";
};

const syncRenderedLineContent = (refs, lines, lineId) => {
  if (!lineId) {
    return;
  }

  const lineRef = getLineElementById(refs, lineId);
  if (!lineRef || typeof lineRef.updateContent !== "function") {
    return;
  }

  const line = (lines || []).find((item) => item.id === lineId);
  if (!line) {
    return;
  }

  lineRef.updateContent(getLineText(line));
};

const syncAllRenderedLineContent = (refs, lines) => {
  for (const line of lines || []) {
    syncRenderedLineContent(refs, lines, line.id);
  }
};

const didLineStructureChange = (oldLines, newLines) => {
  if ((oldLines || []).length !== (newLines || []).length) {
    return true;
  }

  for (let i = 0; i < (newLines || []).length; i++) {
    if (oldLines?.[i]?.id !== newLines?.[i]?.id) {
      return true;
    }
  }

  return false;
};

const syncChangedRenderedLineContent = (refs, oldLines, newLines) => {
  if (!oldLines || oldLines.length === 0) {
    syncAllRenderedLineContent(refs, newLines);
    return;
  }

  if (didLineStructureChange(oldLines, newLines)) {
    syncAllRenderedLineContent(refs, newLines);
    return;
  }

  const oldLineContentById = new Map(
    oldLines.map((line) => [line.id, getLineText(line)]),
  );

  for (const line of newLines || []) {
    const nextContent = getLineText(line);
    if (oldLineContentById.get(line.id) !== nextContent) {
      syncRenderedLineContent(refs, newLines, line.id);
    }
  }
};

const DELETE_SHORTCUT_TIMEOUT_MS = 1200;
let deleteShortcutTimerId = null;

const isShortcutDigit = (key) => {
  return /^[0-9]$/.test(key);
};

const handleBlockModeCharacterShortcut = (deps, payload, { lineId } = {}) => {
  const { store, dispatchEvent, props } = deps;
  const event = payload._event;
  const key = event.key;
  const isAwaitingCharacterShortcut = store.selectAwaitingCharacterShortcut();

  if (isAwaitingCharacterShortcut) {
    store.setAwaitingCharacterShortcut({
      awaitingCharacterShortcut: false,
    });
    event.preventDefault();
    event.stopPropagation();

    if (!isShortcutDigit(key)) {
      return true;
    }

    const targetLineId = lineId || props.selectedLineId;
    if (!targetLineId) {
      return true;
    }

    dispatchEvent(
      new CustomEvent("dialogue-character-shortcut", {
        detail: {
          lineId: targetLineId,
          shortcut: key,
        },
      }),
    );
    return true;
  }

  const isCharacterShortcutStartKey =
    typeof key === "string" &&
    key.toLowerCase() === "c" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey;

  if (!isCharacterShortcutStartKey) {
    return false;
  }

  store.setAwaitingCharacterShortcut({
    awaitingCharacterShortcut: true,
  });
  event.preventDefault();
  event.stopPropagation();
  return true;
};

const clearDeleteShortcutState = (store) => {
  store.setAwaitingDeleteShortcut({
    awaitingDeleteShortcut: false,
  });
  if (deleteShortcutTimerId !== null) {
    clearTimeout(deleteShortcutTimerId);
    deleteShortcutTimerId = null;
  }
};

const armDeleteShortcutState = (store) => {
  if (deleteShortcutTimerId !== null) {
    clearTimeout(deleteShortcutTimerId);
  }

  deleteShortcutTimerId = setTimeout(() => {
    clearDeleteShortcutState(store);
  }, DELETE_SHORTCUT_TIMEOUT_MS);
};

const handleBlockModeDeleteShortcut = (deps, payload, { lineId } = {}) => {
  const { store, dispatchEvent, props } = deps;
  const event = payload._event;
  const key = String(event.key || "");
  const isDeleteShortcutKey =
    key === "d" &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey;
  const isAwaitingDeleteShortcut = store.selectAwaitingDeleteShortcut();

  if (isAwaitingDeleteShortcut) {
    clearDeleteShortcutState(store);

    if (!isDeleteShortcutKey) {
      return false;
    }

    event.preventDefault();
    event.stopPropagation();

    const targetLineId = lineId || props.selectedLineId;
    if (!targetLineId) {
      return true;
    }

    dispatchEvent(
      new CustomEvent("delete-line-shortcut", {
        detail: {
          lineId: targetLineId,
        },
      }),
    );
    return true;
  }

  if (!isDeleteShortcutKey) {
    return false;
  }

  store.setAwaitingDeleteShortcut({
    awaitingDeleteShortcut: true,
  });
  armDeleteShortcutState(store);
  event.preventDefault();
  event.stopPropagation();
  return true;
};

const enterInsertModeAtLineStart = (deps, lineId) => {
  const { store } = deps;
  if (!lineId) {
    return;
  }

  const lineElement = getLineElementById(deps.refs, lineId);
  if (!lineElement) {
    return;
  }

  store.setCursorPosition({ position: 0 });
  store.setGoalColumn({ goalColumn: 0 });
  store.setNavigationDirection({ direction: null });
  updateSelectedLine(deps, { currentLineId: lineId });
};

const enterInsertModeAtLineEnd = (deps, lineId) => {
  const { store } = deps;
  if (!lineId) {
    return;
  }

  const lineElement = getLineElementById(deps.refs, lineId);
  if (!lineElement) {
    return;
  }

  const textLength = getLineContent(lineElement).length;
  store.setCursorPosition({ position: textLength });
  store.setGoalColumn({ goalColumn: textLength });
  store.setNavigationDirection({ direction: "end" });
  updateSelectedLine(deps, { currentLineId: lineId });
};

const dispatchBlockModeSwapLine = (dispatchEvent, lineId, direction) => {
  if (!lineId || (direction !== "up" && direction !== "down")) {
    return;
  }

  dispatchEvent(
    new CustomEvent("swapLine", {
      detail: {
        lineId,
        direction,
      },
    }),
  );
};

export const handleAfterMount = (deps) => {
  const { refs } = deps;

  focusContainerAfterPaint(refs);
};

export const handleBeforeMount = (deps) => {
  const { store } = deps;
  store.setReady();
};

export const handlePreviewRightClick = async (deps, payload) => {
  const { globalUI, dispatchEvent } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  const { type, id } = event.currentTarget.dataset;

  dispatchEvent(
    new CustomEvent("line-navigation", {
      detail: {
        targetLineId: id,
        mode: "block",
        direction: "up",
        targetCursorPosition: null,
        lineRect: null,
      },
    }),
  );

  const result = await globalUI.showDropdownMenu({
    items: [{ type: "item", label: "Remove", key: "remove" }],
    x: event.clientX,
    y: event.clientY,
    place: "bs",
  });

  if (result.item.key === "remove") {
    dispatchEvent(
      new CustomEvent("delete-action", {
        detail: {
          actionType: type,
        },
      }),
    );
  }
};

export const handleContainerKeyDown = (deps, payload) => {
  const { store, props, dispatchEvent, refs } = deps;
  const mode = store.selectMode();

  // Only handle container keydown if the target is the container itself
  // If focus is already inside an editable line primitive, let the line handler own it.
  if (payload._event.target.id !== "container") {
    return;
  }

  if (mode === "block") {
    const currentLineId = props.selectedLineId;
    const lines = props.lines || [];

    const handledShortcut = handleBlockModeCharacterShortcut(deps, payload, {
      lineId: currentLineId,
    });
    if (handledShortcut) {
      return;
    }

    const handledDeleteShortcut = handleBlockModeDeleteShortcut(deps, payload, {
      lineId: currentLineId,
    });
    if (handledDeleteShortcut) {
      return;
    }

    const event = payload._event;
    let navKey = event.key;
    if (event.shiftKey && event.code === "KeyI") {
      navKey = "Shift+I";
    } else if (event.shiftKey && event.code === "KeyA") {
      navKey = "Shift+A";
    } else if (event.altKey && event.code === "KeyJ") {
      navKey = "Alt+J";
    } else if (event.altKey && event.code === "KeyK") {
      navKey = "Alt+K";
    } else if (event.altKey && event.code === "ArrowDown") {
      navKey = "Alt+ArrowDown";
    } else if (event.altKey && event.code === "ArrowUp") {
      navKey = "Alt+ArrowUp";
    }

    const hasModifierKey = event.ctrlKey || event.metaKey || event.altKey;
    if (!hasModifierKey) {
      if (navKey === "j" || navKey === "J") {
        navKey = "ArrowDown";
      } else if (navKey === "k" || navKey === "K") {
        navKey = "ArrowUp";
      }
    }

    if (navKey === "o" || navKey === "O") {
      payload._event.preventDefault();
      payload._event.stopPropagation();

      dispatchEvent(
        new CustomEvent("newLine", {
          detail: {
            lineId: currentLineId || null,
            position: navKey === "O" ? "before" : "after",
          },
        }),
      );
      return;
    }

    switch (navKey) {
      case "ArrowUp":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        if (!currentLineId && lines.length > 0) {
          // No selection, select the first line
          const firstLineId = lines[0].id;

          requestAnimationFrame(() => {
            const refIds = refs;
            const lineElement = getLineElementById(refIds, firstLineId);
            let lineRect = null;

            if (lineElement) {
              lineRect = lineElement.getBoundingClientRect();
            }

            dispatchEvent(
              new CustomEvent("line-navigation", {
                detail: {
                  targetLineId: firstLineId,
                  mode: "block",
                  direction: null,
                  targetCursorPosition: null,
                  lineRect: lineRect
                    ? {
                        top: lineRect.top,
                        bottom: lineRect.bottom,
                        left: lineRect.left,
                        right: lineRect.right,
                        height: lineRect.height,
                      }
                    : null,
                },
              }),
            );
          });
        } else if (currentLineId) {
          const currentIndex = lines.findIndex(
            (line) => line.id === currentLineId,
          );
          if (currentIndex > 0) {
            const prevLineId = lines[currentIndex - 1].id;

            // Get the line element's coordinates before dispatching
            requestAnimationFrame(() => {
              const refIds = refs;
              const lineElement = getLineElementById(refIds, prevLineId);
              let lineRect = null;

              if (lineElement) {
                lineRect = lineElement.getBoundingClientRect();
              }

              dispatchEvent(
                new CustomEvent("line-navigation", {
                  detail: {
                    targetLineId: prevLineId,
                    mode: "block",
                    direction: null,
                    targetCursorPosition: null,
                    lineRect: lineRect
                      ? {
                          top: lineRect.top,
                          bottom: lineRect.bottom,
                          left: lineRect.left,
                          right: lineRect.right,
                          height: lineRect.height,
                        }
                      : null,
                  },
                }),
              );
            });
          } else {
            // On first line, still emit event for animation
            dispatchEvent(
              new CustomEvent("line-navigation", {
                detail: {
                  targetLineId: currentLineId,
                  mode: "block",
                  direction: "up",
                  targetCursorPosition: null,
                  lineRect: null,
                },
              }),
            );
          }
        }
        break;
      case "ArrowDown":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        if (!currentLineId && lines.length > 0) {
          // No selection, select the first line
          const firstLineId = lines[0].id;

          requestAnimationFrame(() => {
            const refIds = refs;
            const lineElement = getLineElementById(refIds, firstLineId);
            let lineRect = null;

            if (lineElement) {
              lineRect = lineElement.getBoundingClientRect();
            }

            dispatchEvent(
              new CustomEvent("line-navigation", {
                detail: {
                  targetLineId: firstLineId,
                  mode: "block",
                  direction: null,
                  targetCursorPosition: null,
                  lineRect: lineRect
                    ? {
                        top: lineRect.top,
                        bottom: lineRect.bottom,
                        left: lineRect.left,
                        right: lineRect.right,
                        height: lineRect.height,
                      }
                    : null,
                },
              }),
            );
          });
        } else if (currentLineId) {
          const currentIndex = lines.findIndex(
            (line) => line.id === currentLineId,
          );
          if (currentIndex < lines.length - 1) {
            const nextLineId = lines[currentIndex + 1].id;

            // Get the line element's coordinates before dispatching
            requestAnimationFrame(() => {
              const refIds = refs;
              const lineElement = getLineElementById(refIds, nextLineId);
              let lineRect = null;

              if (lineElement) {
                lineRect = lineElement.getBoundingClientRect();
              }

              dispatchEvent(
                new CustomEvent("line-navigation", {
                  detail: {
                    targetLineId: nextLineId,
                    mode: "block",
                    direction: null,
                    targetCursorPosition: null,
                    lineRect: lineRect
                      ? {
                          top: lineRect.top,
                          bottom: lineRect.bottom,
                          left: lineRect.left,
                          right: lineRect.right,
                          height: lineRect.height,
                        }
                      : null,
                  },
                }),
              );
            });
          }
        }
        break;
      case "Enter":
        payload._event.preventDefault();
        enterInsertModeAtLineEnd(deps, currentLineId);
        break;
      case "Shift+I":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        enterInsertModeAtLineStart(deps, currentLineId);
        break;
      case "Shift+A":
        payload._event.preventDefault();
        enterInsertModeAtLineEnd(deps, currentLineId);
        break;
      case "Alt+J":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, currentLineId, "down");
        break;
      case "Alt+K":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, currentLineId, "up");
        break;
      case "Alt+ArrowDown":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, currentLineId, "down");
        break;
      case "Alt+ArrowUp":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, currentLineId, "up");
        break;
    }
  }
};

export const handleLineKeyDown = (deps, payload) => {
  const { dispatchEvent, store, render, props } = deps;
  const id = getLineIdFromElement(payload._event.currentTarget);
  const mode = store.selectMode();

  if (mode === "block") {
    const handledShortcut = handleBlockModeCharacterShortcut(deps, payload, {
      lineId: id,
    });
    if (handledShortcut) {
      return;
    }

    const handledDeleteShortcut = handleBlockModeDeleteShortcut(deps, payload, {
      lineId: id,
    });
    if (handledDeleteShortcut) {
      return;
    }
  }

  let navKey = payload._event.key;
  if (mode === "block") {
    if (payload._event.shiftKey && payload._event.code === "KeyI") {
      navKey = "Shift+I";
    } else if (payload._event.shiftKey && payload._event.code === "KeyA") {
      navKey = "Shift+A";
    } else if (payload._event.altKey && payload._event.code === "KeyJ") {
      navKey = "Alt+J";
    } else if (payload._event.altKey && payload._event.code === "KeyK") {
      navKey = "Alt+K";
    } else if (payload._event.altKey && payload._event.code === "ArrowDown") {
      navKey = "Alt+ArrowDown";
    } else if (payload._event.altKey && payload._event.code === "ArrowUp") {
      navKey = "Alt+ArrowUp";
    }

    const hasModifierKey =
      payload._event.ctrlKey || payload._event.metaKey || payload._event.altKey;
    if (!hasModifierKey) {
      if (navKey === "j" || navKey === "J") {
        navKey = "ArrowDown";
      } else if (navKey === "k" || navKey === "K") {
        navKey = "ArrowUp";
      }
    }
  }

  // Capture cursor position immediately before any key handling
  if (mode === "text-editor") {
    const cursorPos = getCursorPosition(payload._event.currentTarget);
    store.setCursorPosition({ position: cursorPos });

    // Update goal column for horizontal movement or when setting new vertical position
    if (
      payload._event.key === "ArrowLeft" ||
      payload._event.key === "ArrowRight" ||
      payload._event.key === "Home" ||
      payload._event.key === "End"
    ) {
      store.setGoalColumn({ goalColumn: cursorPos });
    } else if (
      payload._event.key === "ArrowUp" ||
      payload._event.key === "ArrowDown"
    ) {
      // For vertical movement, ensure we have the current position as goal column if not set
      const currentGoalColumn = store.selectGoalColumn();
      if (currentGoalColumn === 0) {
        store.setGoalColumn({ goalColumn: cursorPos });
      }
    }
  }

  switch (navKey) {
    case "Backspace":
      if (mode === "text-editor") {
        // Check if cursor is at position 0
        const currentElement = payload._event.currentTarget;
        const currentPos = getCursorPosition(currentElement);
        const currentLineId = getLineIdFromElement(currentElement);

        if (currentPos === 0) {
          payload._event.preventDefault();
          payload._event.stopPropagation();

          // Find the previous line
          const currentIndex = props.lines.findIndex(
            (line) => line.id === currentLineId,
          );

          if (currentIndex > 0) {
            dispatchEditorDataChanged(dispatchEvent, currentElement);
            suppressElementInputUntilFocus(currentElement);
            debugLog("lines", "editor.merge-request", {
              lineId: currentLineId,
              cursorPos: currentPos,
            });

            // Dispatch event to merge lines
            dispatchEvent(
              new CustomEvent("mergeLines", {
                detail: {
                  currentLineId: currentLineId,
                },
              }),
            );
          }
        }
      }
      break;
    case "Escape":
      payload._event.preventDefault();
      // Switch to block mode and blur the current element
      store.setMode({ mode: "block" });
      payload._event.currentTarget.blur();
      // Focus the container to enable block mode navigation
      const container = deps.refs["container"];
      if (container) {
        container.focus();
      }
      render();
      break;
    case "Enter":
      if (mode === "text-editor") {
        payload._event.preventDefault();
        const currentElement = payload._event.currentTarget;

        debugLog("lines", "editor.enter-keydown", {
          lineId: id,
          textLength: getLineContent(currentElement).length,
          cursorPos: getCursorPosition(currentElement),
        });
        requestAnimationFrame(() => {
          const cursorPos = getCursorPosition(currentElement);
          const fullText = getLineContent(currentElement);
          suppressElementInputUntilFocus(currentElement);

          // Split the content at cursor position after the latest DOM/input work
          // has settled, then let the parent structural handler own the writes.
          const leftContent = fullText.substring(0, cursorPos);
          const rightContent = fullText.substring(cursorPos);
          debugLog("lines", "editor.enter-snapshot", {
            lineId: id,
            cursorPos,
            fullTextLength: fullText.length,
            fullText: previewDebugText(fullText),
            leftContent: previewDebugText(leftContent),
            rightContent: previewDebugText(rightContent),
          });

          dispatchEvent(
            new CustomEvent("splitLine", {
              detail: {
                lineId: id,
                leftContent: leftContent,
                rightContent: rightContent,
              },
            }),
          );
        });
      }
      break;
    case "Shift+I":
      if (mode === "block") {
        payload._event.preventDefault();
        payload._event.stopPropagation();
        enterInsertModeAtLineStart(deps, id);
      }
      break;
    case "Shift+A":
      if (mode === "block") {
        payload._event.preventDefault();
        enterInsertModeAtLineEnd(deps, id);
      }
      break;
    case "Alt+J":
      if (mode === "block") {
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, id, "down");
      }
      break;
    case "Alt+K":
      if (mode === "block") {
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, id, "up");
      }
      break;
    case "Alt+ArrowDown":
      if (mode === "block") {
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, id, "down");
      }
      break;
    case "Alt+ArrowUp":
      if (mode === "block") {
        payload._event.preventDefault();
        payload._event.stopPropagation();
        dispatchBlockModeSwapLine(dispatchEvent, id, "up");
      }
      break;
    case "ArrowUp":
      if (mode === "block") {
        payload._event.preventDefault();
        // In block mode, just update selectedLineId without focusing
        const currentIndex = props.lines.findIndex((line) => line.id === id);
        if (currentIndex > 0) {
          const prevLine = props.lines[currentIndex - 1];

          // Get the line element's coordinates before dispatching
          requestAnimationFrame(() => {
            const refIds = deps.refs;
            const lineElement = getLineElementById(refIds, prevLine.id);
            let lineRect = null;

            if (lineElement) {
              lineRect = lineElement.getBoundingClientRect();
            }

            dispatchEvent(
              new CustomEvent("line-navigation", {
                detail: {
                  targetLineId: prevLine.id,
                  mode: "block",
                  direction: null,
                  targetCursorPosition: null,
                  lineRect: lineRect
                    ? {
                        top: lineRect.top,
                        bottom: lineRect.bottom,
                        left: lineRect.left,
                        right: lineRect.right,
                        height: lineRect.height,
                      }
                    : null,
                },
              }),
            );
          });
        } else {
          // On first line in block mode, still emit event for animation
          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: id,
                mode: "block",
                direction: "up",
                targetCursorPosition: null,
                lineRect: null,
              },
            }),
          );
        }
      } else {
        // In text-editor mode, check if cursor is on first line
        const isOnFirstLine = payload._event.currentTarget.isCaretOnFirstLine();

        if (isOnFirstLine) {
          // Cursor is on first line, move to previous line
          payload._event.preventDefault();
          payload._event.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;

          // Set navigating flag
          store.setIsNavigating({ isNavigating: true });

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: getLineIdFromElement(
                  payload._event.currentTarget,
                ),
                mode: "text-editor",
                direction: "up",
                targetCursorPosition: goalColumn,
                lineRect: null,
              },
            }),
          );
        }
        // If not on first line, let native behavior handle it (don't preventDefault)
      }
      break;
    case "ArrowDown":
      if (mode === "block") {
        payload._event.preventDefault();
        // In block mode, just update selectedLineId without focusing
        const currentIndex = props.lines.findIndex((line) => line.id === id);
        if (currentIndex < props.lines.length - 1) {
          const nextLine = props.lines[currentIndex + 1];

          // Get the line element's coordinates before dispatching
          requestAnimationFrame(() => {
            const refIds = deps.refs;
            const lineElement = getLineElementById(refIds, nextLine.id);
            let lineRect = null;

            if (lineElement) {
              lineRect = lineElement.getBoundingClientRect();
            }

            dispatchEvent(
              new CustomEvent("line-navigation", {
                detail: {
                  targetLineId: nextLine.id,
                  mode: "block",
                  direction: null,
                  targetCursorPosition: null,
                  lineRect: lineRect
                    ? {
                        top: lineRect.top,
                        bottom: lineRect.bottom,
                        left: lineRect.left,
                        right: lineRect.right,
                        height: lineRect.height,
                      }
                    : null,
                },
              }),
            );
          });
        }
      } else {
        // In text-editor mode, check if cursor is on last line
        const isOnLastLine = payload._event.currentTarget.isCaretOnLastLine();

        if (isOnLastLine) {
          // Cursor is on last line, move to next line
          payload._event.preventDefault();
          payload._event.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;

          // Set navigating flag and direction
          store.setIsNavigating({ isNavigating: true });
          store.setNavigationDirection({ direction: "down" });

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: getLineIdFromElement(
                  payload._event.currentTarget,
                ),
                mode: "text-editor",
                direction: "down",
                targetCursorPosition: goalColumn,
                lineRect: null,
              },
            }),
          );
        }
        // If not on last line, let native behavior handle it (don't preventDefault)
      }
      break;
    case "ArrowRight":
      if (mode === "text-editor") {
        // Check if cursor is at the end of the text
        const currentPos = getCursorPosition(payload._event.currentTarget);
        const textLength = getLineContent(payload._event.currentTarget).length;

        if (currentPos >= textLength) {
          // Cursor is at end, move to next line
          payload._event.preventDefault();
          payload._event.stopPropagation();

          // Set navigating flag
          store.setIsNavigating({ isNavigating: true });

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: getLineIdFromElement(
                  payload._event.currentTarget,
                ),
                mode: "text-editor",
                direction: "down",
                targetCursorPosition: 0, // Go to beginning of next line
                lineRect: null,
              },
            }),
          );
        }
        // If not at end, let native behavior handle it
      }
      break;
    case "ArrowLeft":
      if (mode === "text-editor") {
        // Check if cursor is at the beginning of the text
        const currentPos = getCursorPosition(payload._event.currentTarget);

        if (currentPos <= 0) {
          // Cursor is at beginning, move to previous line
          payload._event.preventDefault();
          payload._event.stopPropagation();

          // Set navigating flag
          store.setIsNavigating({ isNavigating: true });

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: getLineIdFromElement(
                  payload._event.currentTarget,
                ),
                mode: "text-editor",
                direction: "end",
                targetCursorPosition: -1, // Special value to indicate "go to end"
                lineRect: null,
              },
            }),
          );
        }
      }
      break;
  }
};

export const handleLineMouseUp = (deps, payload) => {
  const { store } = deps;

  syncStoredCursorState(store, payload._event.currentTarget);
};

export const handleOnInput = (deps, payload) => {
  const { dispatchEvent, store } = deps;
  const currentElement = payload._event.currentTarget;

  if (shouldIgnoreElementInput(currentElement)) {
    debugLog("lines", "editor.input-ignored", {
      lineId: getLineIdFromElement(currentElement),
      content: previewDebugText(getLineContent(currentElement)),
    });
    return;
  }

  const lineId = getLineIdFromElement(currentElement);
  const content = getLineContent(currentElement);

  // Save cursor position on every input
  const cursorPos = getCursorPosition(currentElement);
  store.setCursorPosition({ position: cursorPos });
  debugLog("lines", "editor.input", {
    lineId,
    cursorPos,
    contentLength: content.length,
    content: previewDebugText(content),
  });

  const detail = {
    lineId,
    content,
  };

  dispatchEvent(
    new CustomEvent("editor-data-changed", {
      detail,
    }),
  );
};

export const handleLinePaste = (deps, payload) => {
  const { dispatchEvent } = deps;
  const event = payload._event;

  // Get plain text from clipboard (text only, no images)
  const pastedText = event.clipboardData.getData("text/plain");

  // If no newlines, let default behavior handle it
  if (!pastedText.includes("\n")) {
    return;
  }

  // Prevent default paste behavior since we're handling multi-line paste
  event.preventDefault();

  // Split by newlines (handles both Unix \n and Windows \r\n) and filter out blank lines
  const lines = pastedText
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  // If all lines were blank, do nothing
  if (lines.length === 0) {
    return;
  }

  // Get current cursor position and line content
  const lineId = getLineIdFromElement(event.currentTarget);
  const cursorPos = getCursorPosition(event.currentTarget);
  const currentContent = getLineContent(event.currentTarget);

  // Split current content at cursor position
  const leftContent = currentContent.substring(0, cursorPos);
  const rightContent = currentContent.substring(cursorPos);

  // Dispatch pasteLines event to parent (sceneEditor)
  dispatchEvent(
    new CustomEvent("pasteLines", {
      detail: {
        lineId,
        leftContent,
        rightContent,
        lines,
      },
    }),
  );
};

export const forceSyncContentLine = (deps, payload) => {
  const { refs, props } = deps;
  syncRenderedLineContent(refs, props.lines, payload?.lineId);
};

export const forceSyncAllContentLines = (deps) => {
  const { refs, props } = deps;
  syncAllRenderedLineContent(refs, props.lines);
};

export const handleOnUpdate = (deps, payload) => {
  const { refs } = deps;
  const oldLines = payload?.oldProps?.lines;
  const newLines = payload?.newProps?.lines;
  syncChangedRenderedLineContent(refs, oldLines, newLines);
};

export const updateSelectedLine = (deps, payload) => {
  const { currentLineId } = payload;
  const { store, refs } = deps;
  const refIds = refs;
  const lineRef = getLineElementById(refIds, currentLineId);

  // Check if lineRef exists and has the elm property
  if (!lineRef) {
    return;
  }

  // Get goal column (desired position) instead of current position
  const goalColumn = store.selectGoalColumn() || 0;
  const textLength = getLineContent(lineRef).length;
  const direction = store.selectNavigationDirection();

  // Choose positioning strategy based on direction
  let targetPosition;
  if (direction === "up") {
    // For upward navigation, find position on last line
    targetPosition = lineRef.findLastLinePosition(goalColumn);
  } else if (direction === "end") {
    // For end positioning (ArrowLeft navigation), position at absolute end
    targetPosition = textLength;
  } else {
    // For downward navigation, use normal goal column positioning
    targetPosition = Math.min(goalColumn, textLength);
  }

  const actualPosition = lineRef.setCaretPosition(targetPosition, {
    preventScroll: true,
  });
  store.setCursorPosition({ position: actualPosition });
};

export const handleOnFocus = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const lineElement = payload._event.currentTarget;
  clearElementInputSuppression(lineElement);
  const lineId = getLineIdFromElement(lineElement);
  debugLog("lines", "editor.focus", {
    lineId,
    contentLength: getLineContent(lineElement).length,
  });

  // Get the line element's coordinates
  const lineRect = lineElement.getBoundingClientRect();

  // Always update the selected line ID with coordinates
  dispatchEvent(
    new CustomEvent("line-navigation", {
      detail: {
        targetLineId: lineId,
        mode: "block",
        direction: null,
        targetCursorPosition: null,
        lineRect: {
          top: lineRect.top,
          bottom: lineRect.bottom,
          left: lineRect.left,
          right: lineRect.right,
          height: lineRect.height,
        },
      },
    }),
  );
  store.setMode({ mode: "text-editor" }); // Switch to text-editor mode on focus

  // Check if we're navigating - if so, don't reset cursor or re-render
  if (store.selectIsNavigating()) {
    // Reset the flag and direction but don't render
    store.setIsNavigating({ isNavigating: false });
    store.setNavigationDirection({ direction: null });
    return;
  }

  // When user clicks to focus (not navigating), set goal column to current position
  syncStoredCursorState(store, payload._event.currentTarget);

  render();
};

export const handleLineBlur = (deps, payload) => {
  const { store, render, refs } = deps;

  // Capture element references before focus settles on the next paint.
  const blurredElement = payload._event.currentTarget;
  const shadowRoot = blurredElement.getRootNode();

  // Check if we're navigating between lines - if so, don't switch to block mode
  if (store.selectIsNavigating()) {
    return;
  }

  // Wait one paint so the next focused element is observable.
  requestAnimationFrame(() => {
    const actualActiveElement =
      (shadowRoot && shadowRoot.activeElement) ||
      getActualActiveElement(blurredElement);

    // Check if focus moved to another line within the editor
    if (isLineElement(actualActiveElement)) {
      // Focus moved to another line, stay in text-editor mode
      return;
    }

    const container = refs["container"];

    // If focus moved to the container itself or left the editor, switch to block mode
    // The container getting focus means the user clicked outside lines but within the editor area
    if (
      actualActiveElement === container ||
      !container?.contains(actualActiveElement)
    ) {
      store.setMode({ mode: "block" });

      // Focus the container to enable block mode navigation
      if (container) {
        container.focus();
      }

      render();
    }
  });
};
