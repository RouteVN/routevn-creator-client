// Helper function to find the position on the last line closest to goal column
const findLastLinePosition = (element, goalColumn) => {
  const text = element.textContent;
  const textLength = text.length;

  // If no text or goal column is at end, return end position
  if (textLength === 0 || goalColumn >= textLength) {
    return textLength;
  }

  // Create a range to test each position and find where the last line starts
  let lastLineStartPos = 0;
  let lastLineTop = null;

  // Walk backwards from the end to find where the last line starts
  for (let pos = textLength; pos >= 0; pos--) {
    try {
      const range = document.createRange();

      // Position the range at this character position
      let currentPos = 0;
      let foundNode = false;

      const walkTextNodes = (node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const nodeLength = node.textContent.length;
          if (currentPos + nodeLength >= pos) {
            const offset = pos - currentPos;
            range.setStart(node, offset);
            range.setEnd(node, offset);
            foundNode = true;
            return true;
          }
          currentPos += nodeLength;
        } else {
          for (let child of node.childNodes) {
            if (walkTextNodes(child)) return true;
          }
        }
        return false;
      };

      walkTextNodes(element);

      if (foundNode) {
        const rect = range.getBoundingClientRect();

        if (lastLineTop === null) {
          // First position (end of text) - this is definitely the last line
          lastLineTop = rect.top;
          lastLineStartPos = pos;
        } else if (Math.abs(rect.top - lastLineTop) > 5) {
          // We've moved to a different line (more than 5px difference)
          // The previous position was the start of the last line
          break;
        } else {
          // Still on the same line
          lastLineStartPos = pos;
        }
      }
    } catch {
      // If range creation fails, continue
      continue;
    }
  }

  // Now find the position on the last line closest to the goal column
  const lastLineLength = textLength - lastLineStartPos;
  const positionOnLastLine = Math.min(goalColumn, lastLineLength);
  const finalPosition = lastLineStartPos + positionOnLastLine;

  return finalPosition;
};

// Helper function to get selection range, handling Shadow DOM with getComposedRanges
const getSelectionRange = (element) => {
  const shadowRoot = element.getRootNode();
  const isShadowRoot = shadowRoot instanceof ShadowRoot;

  let selection = window.getSelection();

  // Try shadowRoot.getSelection() first for Shadow DOM (non-standard but works in some browsers)
  if (isShadowRoot && typeof shadowRoot.getSelection === "function") {
    const shadowSelection = shadowRoot.getSelection();
    if (shadowSelection && shadowSelection.rangeCount > 0) {
      const range = shadowSelection.getRangeAt(0);
      if (element.contains(range.startContainer)) {
        return range;
      }
    }
  }

  if (!selection || selection.rangeCount === 0) return null;

  // Use getComposedRanges for Shadow DOM (Safari 17+, Chrome 137+, Firefox 142+)
  if (isShadowRoot && typeof selection.getComposedRanges === "function") {
    try {
      const ranges = selection.getComposedRanges(shadowRoot);
      if (ranges.length > 0) {
        const staticRange = ranges[0];

        // Validate that the range is actually inside our element
        // On some browsers (Windows Chrome), getComposedRanges may return body instead of actual element
        if (element.contains(staticRange.startContainer)) {
          // Convert StaticRange to Range (StaticRange doesn't have getBoundingClientRect)
          const range = document.createRange();
          range.setStart(staticRange.startContainer, staticRange.startOffset);
          range.setEnd(staticRange.endContainer, staticRange.endOffset);
          return range;
        }
      }
    } catch (e) {
      // getComposedRanges not supported, fall through to fallback
      console.log(e);
    }
  }

  // Fallback to regular getRangeAt
  const range = selection.getRangeAt(0);
  if (element.contains(range.startContainer)) {
    return range;
  }

  return null;
};

// Helper function to get cursor position in contenteditable
const getCursorPosition = (element) => {
  if (!element) {
    return 0;
  }

  const range = getSelectionRange(element);
  if (!range) return 0;

  // For StaticRange (from getComposedRanges), we need to create a new range
  const preCaretRange = document.createRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.endContainer, range.endOffset);
  const position = preCaretRange.toString().length;
  return position;
};

// Helper function to check if cursor is on the first line of contenteditable
const isCursorOnFirstLine = (element) => {
  const range = getSelectionRange(element);
  if (!range) return false;

  // Get the bounding rectangle of the cursor position
  const cursorRect = range.getBoundingClientRect();

  // Create a range at the very beginning of the element
  const startRange = document.createRange();

  // Instead of using selectNodeContents and collapse, let's position at the actual start
  let firstTextNode = null;

  // Walk through all text nodes to find the actual first position
  const walkTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE && !firstTextNode) {
      firstTextNode = node;
      return true; // Stop walking once we find the first text node
    } else {
      for (let child of node.childNodes) {
        if (walkTextNodes(child)) return true;
      }
    }
    return false;
  };

  walkTextNodes(element);

  // If we found a text node, position the range there
  if (firstTextNode) {
    startRange.setStart(firstTextNode, 0);
    startRange.setEnd(firstTextNode, 0);
  } else {
    // Fallback to element positioning if no text nodes found
    startRange.selectNodeContents(element);
    startRange.collapse(true);
  }

  const startRect = startRange.getBoundingClientRect();

  // Consider the cursor on the first line if it's within a reasonable tolerance of the first line
  const tolerance = 5; // pixels
  const isOnFirstLine = Math.abs(cursorRect.top - startRect.top) <= tolerance;

  return isOnFirstLine;
};

// Helper function to check if cursor is on the last line of contenteditable
const isCursorOnLastLine = (element) => {
  // First, check if the element has multiple visual lines
  const elementHeight = element.scrollHeight;
  const lineHeight =
    parseFloat(window.getComputedStyle(element).lineHeight) || 20;
  const hasMultipleLines = elementHeight > lineHeight * 1.5; // Allow some tolerance

  if (!hasMultipleLines) {
    // Single line content - always navigate to next editor on ArrowDown
    return true;
  }

  const range = getSelectionRange(element);
  if (!range) return false;

  // Get the bounding rectangle of the cursor position
  const cursorRect = range.getBoundingClientRect();

  // Create a range at the very end of the element
  const endRange = document.createRange();

  // Instead of using selectNodeContents and collapse, let's position at the actual end
  let lastTextNode = null;
  let lastOffset = 0;

  // Walk through all text nodes to find the actual last position
  const walkTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      lastTextNode = node;
      lastOffset = node.textContent.length;
    } else {
      for (let child of node.childNodes) {
        walkTextNodes(child);
      }
    }
  };

  walkTextNodes(element);

  // If we found a text node, position the range there
  if (lastTextNode) {
    endRange.setStart(lastTextNode, lastOffset);
    endRange.setEnd(lastTextNode, lastOffset);
  } else {
    // Fallback to element positioning if no text nodes found
    endRange.selectNodeContents(element);
    endRange.collapse(false);
  }

  const endRect = endRange.getBoundingClientRect();

  // Consider the cursor on the last line if it's within a reasonable tolerance of the last line
  const tolerance = 5; // pixels
  const isOnLastLine = Math.abs(cursorRect.top - endRect.top) <= tolerance;

  return isOnLastLine;
};

export const handleAfterMount = async (deps) => {
  const { store, getRefIds, projectService } = deps;

  await projectService.ensureRepository();
  store.setRepositoryState(projectService.getState());
  store.setReady();

  // Focus container on mount to enable keyboard navigation
  setTimeout(() => {
    const container = getRefIds()["container"]?.elm;
    if (container) {
      container.focus();
    }
  }, 0);
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
    placement: "bottom-start",
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
  const { store, props, dispatchEvent, getRefIds } = deps;
  const mode = store.selectMode();

  // Only handle container keydown if the target is the container itself
  // If it's a contenteditable, let the line handler handle it
  if (payload._event.target.id !== "container") {
    return;
  }

  if (mode === "block") {
    const currentLineId = props.selectedLineId;
    const lines = props.lines || [];

    switch (payload._event.key) {
      case "ArrowUp":
        payload._event.preventDefault();
        payload._event.stopPropagation();
        if (!currentLineId && lines.length > 0) {
          // No selection, select the first line
          const firstLineId = lines[0].id;

          requestAnimationFrame(() => {
            const refIds = getRefIds();
            const lineElement = refIds[`line-${firstLineId}`]?.elm;
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
              const refIds = getRefIds();
              const lineElement = refIds[`line-${prevLineId}`]?.elm;
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
            const refIds = getRefIds();
            const lineElement = refIds[`line-${firstLineId}`]?.elm;
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
              const refIds = getRefIds();
              const lineElement = refIds[`line-${nextLineId}`]?.elm;
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
        if (currentLineId) {
          // Focus the selected line to enter text-editor mode at the end
          const lineElement = deps.getRefIds()[`line-${currentLineId}`]?.elm;

          if (lineElement) {
            // Position cursor at the end before focusing
            const textLength = lineElement.textContent.length;
            store.setCursorPosition(textLength);
            store.setGoalColumn(textLength);
            store.setNavigationDirection("end");

            // Use updateSelectedLine to properly position cursor at end
            updateSelectedLine(deps, { currentLineId });
          }
        }
        break;
    }
  }
};

export const handleLineKeyDown = (deps, payload) => {
  const { dispatchEvent, store, render, props } = deps;
  const id = payload._event.target.id.replace(/^line-/, "");
  const mode = store.selectMode();

  // Capture cursor position immediately before any key handling
  if (mode === "text-editor") {
    const cursorPos = getCursorPosition(payload._event.currentTarget);
    store.setCursorPosition(cursorPos);

    // Update goal column for horizontal movement or when setting new vertical position
    if (
      payload._event.key === "ArrowLeft" ||
      payload._event.key === "ArrowRight" ||
      payload._event.key === "Home" ||
      payload._event.key === "End"
    ) {
      store.setGoalColumn(cursorPos);
    } else if (
      payload._event.key === "ArrowUp" ||
      payload._event.key === "ArrowDown"
    ) {
      // For vertical movement, ensure we have the current position as goal column if not set
      const currentGoalColumn = store.selectGoalColumn();
      if (currentGoalColumn === 0) {
        store.setGoalColumn(cursorPos);
      }
    }
  }

  switch (payload._event.key) {
    case "Backspace":
      if (mode === "text-editor") {
        // Check if cursor is at position 0
        const currentPos = getCursorPosition(payload._event.currentTarget);
        const currentContent = payload._event.currentTarget.textContent;
        const currentLineId = payload._event.currentTarget.id.replace(
          /^line-/,
          "",
        );

        if (currentPos === 0) {
          payload._event.preventDefault();
          payload._event.stopPropagation();

          // Find the previous line
          const currentIndex = props.lines.findIndex(
            (line) => line.id === currentLineId,
          );

          if (currentIndex > 0) {
            const prevLine = props.lines[currentIndex - 1];

            // Dispatch event to merge lines
            dispatchEvent(
              new CustomEvent("mergeLines", {
                detail: {
                  prevLineId: prevLine.id,
                  currentLineId: currentLineId,
                  contentToAppend: currentContent,
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
      store.setMode("block");
      payload._event.currentTarget.blur();
      // Focus the container to enable block mode navigation
      const container = deps.getRefIds()["container"]?.elm;
      if (container) {
        container.focus();
      }
      render();
      break;
    case "Enter":
      if (mode === "text-editor") {
        payload._event.preventDefault();

        // Get current cursor position and text content
        const cursorPos = getCursorPosition(payload._event.currentTarget);
        const fullText = payload._event.currentTarget.textContent;

        // Split the content at cursor position
        const leftContent = fullText.substring(0, cursorPos);
        const rightContent = fullText.substring(cursorPos);
        const keydownTime = performance.now().toFixed(2);
        console.log(
          `[LE][${keydownTime}]   Enter keydown | lineId:`,
          id,
          "| cursorPos:",
          cursorPos,
          "| fullText: '",
          fullText,
          "' | left: '",
          leftContent,
          "' | right: '",
          rightContent,
          "'",
        );
        requestAnimationFrame(() => {
          const dispatchTime = performance.now().toFixed(2);
          console.log(
            `[LE][${dispatchTime}] Dispatching splitLine | lineId:`,
            id,
            "| left: '",
            leftContent,
            "' | right: '",
            rightContent,
            "'",
          );
          dispatchEvent(
            new CustomEvent("splitLine", {
              detail: {
                lineId: id,
                leftContent: leftContent,
                rightContent: rightContent,
              },
            }),
          );
          console.log(
            `[LE][${dispatchTime}] splitLine dispatched for lineId:`,
            id,
          );
        });
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
            const refIds = deps.getRefIds();
            const lineElement = refIds[`line-${prevLine.id}`]?.elm;
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
        const isOnFirstLine = isCursorOnFirstLine(payload._event.currentTarget);

        if (isOnFirstLine) {
          // Cursor is on first line, move to previous line
          payload._event.preventDefault();
          payload._event.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;

          // Set navigating flag
          store.setIsNavigating(true);

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: payload._event.currentTarget.id.replace(
                  /^line-/,
                  "",
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
            const refIds = deps.getRefIds();
            const lineElement = refIds[`line-${nextLine.id}`]?.elm;
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
        const isOnLastLine = isCursorOnLastLine(payload._event.currentTarget);

        if (isOnLastLine) {
          // Cursor is on last line, move to next line
          payload._event.preventDefault();
          payload._event.stopPropagation(); // Prevent bubbling to container
          const goalColumn = store.selectGoalColumn() || 0;

          // Set navigating flag and direction
          store.setIsNavigating(true);
          store.setNavigationDirection("down");

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: payload._event.currentTarget.id.replace(
                  /^line-/,
                  "",
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
        const textLength = payload._event.currentTarget.textContent.length;

        if (currentPos >= textLength) {
          // Cursor is at end, move to next line
          payload._event.preventDefault();
          payload._event.stopPropagation();

          // Set navigating flag
          store.setIsNavigating(true);

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: payload._event.currentTarget.id.replace(
                  /^line-/,
                  "",
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
          store.setIsNavigating(true);

          dispatchEvent(
            new CustomEvent("line-navigation", {
              detail: {
                targetLineId: payload._event.currentTarget.id.replace(
                  /^line-/,
                  "",
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

  // Save cursor position after mouse up (selection change)
  // Use multiple attempts with slight delays to ensure selection is established
  setTimeout(() => {
    const cursorPos = getCursorPosition(payload._event.currentTarget);
    if (cursorPos > 0) {
      store.setCursorPosition(cursorPos);
      store.setGoalColumn(cursorPos);
    } else {
      // Try again with longer delay if position is 0
      setTimeout(() => {
        const cursorPos2 = getCursorPosition(payload._event.currentTarget);
        store.setCursorPosition(cursorPos2);
        store.setGoalColumn(cursorPos2);
      }, 10);
    }
  }, 0);
};

export const handleOnInput = (deps, payload) => {
  const { dispatchEvent, store } = deps;

  const lineId = payload._event.target.id.replace(/^line-/, "");
  const content = payload._event.target.textContent;

  // Save cursor position on every input
  const cursorPos = getCursorPosition(payload._event.target);
  store.setCursorPosition(cursorPos);

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

export const updateSelectedLine = (deps, payload) => {
  const { currentLineId } = payload;
  const { store, getRefIds } = deps;
  const refIds = getRefIds();
  const lineRef = refIds[`line-${currentLineId}`];

  // Check if lineRef exists and has the elm property
  if (!lineRef || !lineRef.elm) {
    console.warn(`Line reference not found for lineId: ${currentLineId}`);
    return;
  }

  // Get goal column (desired position) instead of current position
  const goalColumn = store.selectGoalColumn() || 0;
  const textLength = lineRef.elm.textContent.length;
  const direction = store.selectNavigationDirection();

  // Choose positioning strategy based on direction
  let targetPosition;
  if (direction === "up") {
    // For upward navigation, find position on last line
    targetPosition = findLastLinePosition(lineRef.elm, goalColumn);
  } else if (direction === "end") {
    // For end positioning (ArrowLeft navigation), position at absolute end
    targetPosition = textLength;
  } else {
    // For downward navigation, use normal goal column positioning
    targetPosition = Math.min(goalColumn, textLength);
  }

  // Get shadow root for selection if needed
  let shadowRoot = lineRef.elm.getRootNode();
  let selection = window.getSelection();

  // Check if we're in a shadow DOM
  if (shadowRoot && shadowRoot.getSelection) {
    selection = shadowRoot.getSelection();
  }

  // Create a range at the desired position before focusing
  const range = document.createRange();

  // Try to set position before focus
  let currentPos = 0;
  let foundNode = false;
  let lastTextNode = null;
  let lastTextNodeLength = 0;
  let actualPosition = 0;

  const walkTextNodes = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeLength = node.textContent.length;
      lastTextNode = node;
      lastTextNodeLength = nodeLength;

      if (currentPos + nodeLength >= targetPosition) {
        const offset = targetPosition - currentPos;
        range.setStart(node, offset);
        range.setEnd(node, offset);
        actualPosition = targetPosition;
        foundNode = true;
        return true;
      }
      currentPos += nodeLength;
    } else {
      for (let child of node.childNodes) {
        if (walkTextNodes(child)) return true;
      }
    }
    return false;
  };

  walkTextNodes(lineRef.elm);

  // If we didn't find a position (cursor beyond text), position at end
  if (!foundNode && lastTextNode) {
    range.setStart(lastTextNode, lastTextNodeLength);
    range.setEnd(lastTextNode, lastTextNodeLength);
    actualPosition = textLength;
    foundNode = true;
  }

  // Now focus - this must happen before setting selection in Shadow DOM
  lineRef.elm.focus({ preventScroll: true });

  // After focus, set the selection using setBaseAndExtent which works better with Shadow DOM
  if (foundNode) {
    // Re-get selection after focus - this is important for Shadow DOM
    selection = window.getSelection();

    // Use setBaseAndExtent instead of addRange - works better in Shadow DOM
    selection.setBaseAndExtent(
      range.startContainer,
      range.startOffset,
      range.endContainer,
      range.endOffset,
    );

    // Update the current cursor position in store to reflect where we actually landed
    store.setCursorPosition(actualPosition);
  }
};

export const handleOnFocus = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  const lineId = payload._event.currentTarget.id.replace(/^line-/, "");

  // Get the line element's coordinates
  const lineElement = payload._event.currentTarget;
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
  store.setMode("text-editor"); // Switch to text-editor mode on focus

  // Check if we're navigating - if so, don't reset cursor or re-render
  if (store.selectIsNavigating()) {
    // Reset the flag and direction but don't render
    store.setIsNavigating(false);
    store.setNavigationDirection(null);
    return;
  }

  // When user clicks to focus (not navigating), set goal column to current position
  setTimeout(() => {
    const cursorPos = getCursorPosition(payload._event.currentTarget);
    if (cursorPos >= 0) {
      store.setGoalColumn(cursorPos);
    }
  }, 10);

  render();
};

export const handleLineBlur = (deps, payload) => {
  const { store, render, getRefIds } = deps;

  // Capture element references before the timeout
  const blurredElement = payload._event.currentTarget;
  const shadowRoot = blurredElement.getRootNode();

  // Check if we're navigating between lines - if so, don't switch to block mode
  if (store.selectIsNavigating()) {
    return;
  }

  // Small delay to check if focus is moving to another line or staying within the editor
  setTimeout(() => {
    const activeElement = document.activeElement;
    const actualActiveElement =
      (shadowRoot && shadowRoot.activeElement) || activeElement;

    // Check if focus moved to another line within the editor
    if (
      actualActiveElement &&
      actualActiveElement.id &&
      actualActiveElement.id.startsWith("line-")
    ) {
      // Focus moved to another line, stay in text-editor mode
      return;
    }

    const container = getRefIds()["container"]?.elm;

    // If focus moved to the container itself or left the editor, switch to block mode
    // The container getting focus means the user clicked outside lines but within the editor area
    if (
      actualActiveElement === container ||
      !container?.contains(actualActiveElement)
    ) {
      store.setMode("block");

      // Focus the container to enable block mode navigation
      if (container) {
        container.focus();
      }

      render();
    }
  }, 0);
};
