const getEventTarget = (event) => {
  return event?.composedPath?.()?.[0] ?? event?.target;
};

const isFocusableInteractiveTarget = (target) => {
  if (!target) {
    return false;
  }

  const tagName = String(target?.tagName ?? "").toLowerCase();
  if (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    tagName === "button" ||
    tagName === "a"
  ) {
    return true;
  }

  if (target?.isContentEditable) {
    return true;
  }

  if (typeof target?.closest !== "function") {
    return false;
  }

  return Boolean(
    target.closest(
      "input, textarea, select, button, a, [contenteditable=''], [contenteditable='true']",
    ),
  );
};

export const isTextEntryKeyEvent = (event) => {
  const target = getEventTarget(event);
  const tagName = String(target?.tagName ?? "").toLowerCase();

  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target?.isContentEditable === true
  );
};

export const createFileExplorerKeyboardScopeHandlers = ({
  fileExplorerRefName = "fileExplorer",
  keyboardScopeRefName = "fileExplorerKeyboardScope",
  isNavigationBlocked = () => false,
  onEnterKey,
  resolveSelectedItemId = ({ selectedExplorerItem }) => {
    return selectedExplorerItem?.isFolder
      ? undefined
      : selectedExplorerItem?.itemId;
  },
} = {}) => {
  const focusKeyboardScope = ({ refs } = {}) => {
    requestAnimationFrame(() => {
      refs?.[keyboardScopeRefName]?.focus?.();
    });
  };

  const selectInitialExplorerItem = ({ deps, fileExplorer } = {}) => {
    const nextSelection = fileExplorer?.navigateSelection?.({
      direction: "next",
    });
    if (!nextSelection?.itemId) {
      return false;
    }

    focusKeyboardScope(deps);
    return true;
  };

  const handleKeyboardScopeClick = (deps, payload) => {
    const event = payload?._event;
    if (isFocusableInteractiveTarget(getEventTarget(event))) {
      return;
    }

    focusKeyboardScope(deps);
  };

  const handleKeyboardScopeKeyDown = (deps, payload) => {
    const event = payload?._event;
    if (!event || isNavigationBlocked({ deps, event })) {
      return;
    }

    if (isTextEntryKeyEvent(event)) {
      return;
    }

    if (event.altKey || event.ctrlKey || event.metaKey) {
      return;
    }

    const fileExplorer = deps?.refs?.[fileExplorerRefName];
    if (!fileExplorer) {
      return;
    }

    const selectedExplorerItem = fileExplorer.getSelectedItem?.();
    const selectedItemId = resolveSelectedItemId({
      deps,
      event,
      selectedExplorerItem,
    });
    const isArrowKey =
      event.key === "ArrowUp" ||
      event.key === "ArrowDown" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight";

    if (!selectedExplorerItem && isArrowKey) {
      const didSelectInitialItem = selectInitialExplorerItem({
        deps,
        fileExplorer,
      });
      if (!didSelectInitialItem) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (event.key === "Enter") {
      if (!selectedItemId || typeof onEnterKey !== "function") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onEnterKey({
        deps,
        event,
        selectedItemId,
        selectedExplorerItem,
      });
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      fileExplorer.setSelectedFolderExpanded?.({ expanded: true });
      focusKeyboardScope(deps);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      fileExplorer.setSelectedFolderExpanded?.({ expanded: false });
      focusKeyboardScope(deps);
      return;
    }

    const direction =
      event.key === "ArrowDown"
        ? "next"
        : event.key === "ArrowUp"
          ? "previous"
          : undefined;
    if (!direction) {
      return;
    }

    const nextSelection = fileExplorer.navigateSelection?.({ direction });
    if (!nextSelection?.itemId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    focusKeyboardScope(deps);
  };

  return {
    focusKeyboardScope,
    handleKeyboardScopeClick,
    handleKeyboardScopeKeyDown,
  };
};
