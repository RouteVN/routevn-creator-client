const getEventTarget = (event) => {
  return event?.composedPath?.()?.[0] ?? event?.target;
};

const TEXT_ENTRY_TAGS = new Set([
  "input",
  "textarea",
  "select",
  "rtgl-input",
  "rtgl-select",
  "rtgl-textarea",
]);

const TEXT_ENTRY_SELECTOR =
  "input, textarea, select, rtgl-input, rtgl-select, rtgl-textarea, [contenteditable=''], [contenteditable='true']";

const isFocusableInteractiveTarget = (target) => {
  if (!target) {
    return false;
  }

  const tagName = String(target?.tagName ?? "").toLowerCase();
  if (TEXT_ENTRY_TAGS.has(tagName) || tagName === "button" || tagName === "a") {
    return true;
  }

  if (target?.isContentEditable) {
    return true;
  }

  if (typeof target?.closest !== "function") {
    return false;
  }

  return Boolean(target.closest(`${TEXT_ENTRY_SELECTOR}, button, a`));
};

const VIM_ARROW_KEYS = {
  h: "ArrowLeft",
  j: "ArrowDown",
  k: "ArrowUp",
  l: "ArrowRight",
};

const JUMP_DISTANCE = 10;

const resolveJumpDirection = (event) => {
  if (!event.ctrlKey || event.altKey || event.metaKey) {
    return undefined;
  }

  const key = String(event.key ?? "").toLowerCase();
  if (key === "d") {
    return "next";
  }

  if (key === "u") {
    return "previous";
  }

  return undefined;
};

const resolveNavigationKey = (event) => {
  if (
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight"
  ) {
    return event.key;
  }

  if (event.altKey || event.ctrlKey || event.metaKey) {
    return undefined;
  }

  return VIM_ARROW_KEYS[String(event.key ?? "").toLowerCase()];
};

const isTextEntryTarget = (target) => {
  const tagName = String(target?.tagName ?? "").toLowerCase();

  if (TEXT_ENTRY_TAGS.has(tagName) || target?.isContentEditable === true) {
    return true;
  }

  if (typeof target?.closest !== "function") {
    return false;
  }

  return Boolean(target.closest(TEXT_ENTRY_SELECTOR));
};

export const isTextEntryKeyEvent = (event) => {
  const path =
    typeof event?.composedPath === "function" ? event.composedPath() : [];

  for (const node of path) {
    if (isTextEntryTarget(node)) {
      return true;
    }
  }

  return isTextEntryTarget(event?.target);
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

    const jumpDirection = resolveJumpDirection(event);
    if (event.altKey || event.metaKey || (event.ctrlKey && !jumpDirection)) {
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
    const navigationKey = resolveNavigationKey(event);

    if (!selectedExplorerItem && (navigationKey || jumpDirection)) {
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

    if (navigationKey === "ArrowRight") {
      event.preventDefault();
      event.stopPropagation();
      fileExplorer.setSelectedFolderExpanded?.({ expanded: true });
      focusKeyboardScope(deps);
      return;
    }

    if (navigationKey === "ArrowLeft") {
      event.preventDefault();
      event.stopPropagation();
      fileExplorer.setSelectedFolderExpanded?.({ expanded: false });
      focusKeyboardScope(deps);
      return;
    }

    if (jumpDirection) {
      const nextSelection = fileExplorer.navigateSelection?.({
        direction: jumpDirection,
        distance: JUMP_DISTANCE,
        clamp: true,
      });
      if (!nextSelection?.itemId) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      focusKeyboardScope(deps);
      return;
    }

    const direction =
      navigationKey === "ArrowDown"
        ? "next"
        : navigationKey === "ArrowUp"
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
