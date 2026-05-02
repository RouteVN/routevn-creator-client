import { isTextEntryKeyEvent } from "../fileExplorerKeyboardScope.js";

export const resolveResourceZoomShortcutDirection = (event) => {
  if (
    !event ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    isTextEntryKeyEvent(event)
  ) {
    return undefined;
  }

  if (
    event.key === "+" ||
    event.code === "NumpadAdd" ||
    (event.shiftKey && event.code === "Equal")
  ) {
    return "in";
  }

  if (
    event.key === "-" ||
    event.code === "Minus" ||
    event.code === "NumpadSubtract"
  ) {
    return "out";
  }

  return undefined;
};

export const isResourceZoomShortcutKeyEvent = (event) =>
  Boolean(resolveResourceZoomShortcutDirection(event));

export const handleResourceZoomShortcutKeyDown = (
  deps,
  payload,
  { refName = "groupview" } = {},
) => {
  const event = payload?._event;
  const direction = resolveResourceZoomShortcutDirection(event);
  if (!direction) {
    return false;
  }

  const zoomMethod = direction === "in" ? "zoomIn" : "zoomOut";
  const zoomTarget = deps.refs?.[refName];
  if (typeof zoomTarget?.[zoomMethod] !== "function") {
    return false;
  }

  const handled = zoomTarget[zoomMethod]();
  if (handled === false) {
    return false;
  }

  event.preventDefault();
  event.stopPropagation();
  return true;
};
