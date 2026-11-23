import { getInlineEndX, getInlineStartX } from "../textDirection.js";

const resolveTagFilterButtonPosition = (
  element,
  { alignEnd = true, direction } = {},
) => {
  if (!element?.getBoundingClientRect) {
    return {
      x: 0,
      y: 0,
    };
  }

  const rect = element.getBoundingClientRect();

  return {
    x: Math.round(
      alignEnd
        ? getInlineEndX(rect, direction)
        : getInlineStartX(rect, direction),
    ),
    y: Math.round(rect.bottom),
  };
};

export const openTagFilterPopoverFromButton = (
  deps,
  payload,
  { alignEnd = true } = {},
) => {
  const { appService, refs, props, store, render } = deps;
  payload?._event?.stopPropagation?.();

  store.openTagFilterPopover({
    position: resolveTagFilterButtonPosition(refs.tagFilterButton, {
      alignEnd,
      direction: appService.getDocumentDirection(),
    }),
    tagIds: props.selectedTagFilterValues ?? [],
  });
  render();
};

export const closeTagFilterPopoverFromOverlay = (deps) => {
  const { store, render } = deps;
  store.closeTagFilterPopover();
  render();
};

export const toggleTagFilterPopoverOption = (deps, payload) => {
  const { store, render } = deps;
  payload?._event?.stopPropagation?.();

  const tagId =
    payload?._event?.currentTarget?.getAttribute?.("data-tag-id") ?? "";
  if (!tagId) {
    return;
  }

  store.toggleTagFilterPopoverTagId({ tagId });
  render();
};

export const clearTagFilterPopoverSelection = (deps, payload) => {
  const { store, render } = deps;
  payload?._event?.stopPropagation?.();

  store.clearTagFilterPopoverTagIds();
  render();
};

export const applyTagFilterPopoverSelection = (deps, payload) => {
  const { store, render, dispatchEvent } = deps;
  payload?._event?.stopPropagation?.();

  const tagIds = store.selectTagFilterPopoverDraftTagIds();

  store.closeTagFilterPopover();
  render();

  dispatchEvent(
    new CustomEvent("tag-filter-change", {
      detail: { tagIds },
      bubbles: true,
      composed: true,
    }),
  );
};
