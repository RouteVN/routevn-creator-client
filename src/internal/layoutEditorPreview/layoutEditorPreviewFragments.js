const getLayoutTraversalEntry = ({
  currentLayoutId,
  currentLayoutData,
  currentLayoutType,
  layoutsData,
  layoutId,
} = {}) => {
  if (!layoutId) {
    return undefined;
  }

  const isCurrentLayout = layoutId === currentLayoutId;
  const layoutItem = isCurrentLayout
    ? { id: currentLayoutId, layoutType: currentLayoutType }
    : layoutsData?.items?.[layoutId];
  if (!layoutItem) {
    return undefined;
  }

  return {
    layoutId,
    layoutType: layoutItem.layoutType,
    items: isCurrentLayout
      ? (currentLayoutData?.items ?? {})
      : (layoutItem?.elements?.items ?? {}),
  };
};

export const visitLayoutItemsWithFragments = (
  {
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId,
    visited = new Set(),
  } = {},
  visitor,
) => {
  if (!layoutId || visited.has(layoutId) || typeof visitor !== "function") {
    return false;
  }

  visited.add(layoutId);

  const entry = getLayoutTraversalEntry({
    currentLayoutId,
    currentLayoutData,
    currentLayoutType,
    layoutsData,
    layoutId,
  });
  if (!entry) {
    return false;
  }

  for (const item of Object.values(entry.items)) {
    if (
      visitor({
        item,
        layoutId: entry.layoutId,
        layoutType: entry.layoutType,
      }) === true
    ) {
      return true;
    }

    if (item?.type !== "fragment-ref" || !item.fragmentLayoutId) {
      continue;
    }

    if (
      visitLayoutItemsWithFragments(
        {
          currentLayoutId,
          currentLayoutData,
          currentLayoutType,
          layoutsData,
          layoutId: item.fragmentLayoutId,
          visited,
        },
        visitor,
      )
    ) {
      return true;
    }
  }

  return false;
};
