export const DEFAULT_PROGRESSIVE_PLACEHOLDER_ITEM_COUNT = 12;

const clampNonNegativeInteger = (value, fallback = 0) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    return fallback;
  }

  return Math.round(numericValue);
};

export const buildProgressivePlaceholderChildren = ({
  children = [],
  remainingProgressiveItemCount,
  groupId,
  placeholderItemCount = DEFAULT_PROGRESSIVE_PLACEHOLDER_ITEM_COUNT,
  createPlaceholder,
} = {}) => {
  if (remainingProgressiveItemCount === Number.POSITIVE_INFINITY) {
    return {
      children,
      remainingProgressiveItemCount,
      renderedItemCount: children.length,
      placeholderItemCount: 0,
      deferredItemCount: 0,
      totalItemCount: children.length,
    };
  }

  const renderedItemCount = Math.min(
    children.length,
    Math.max(0, clampNonNegativeInteger(remainingProgressiveItemCount)),
  );
  const deferredItemCount = Math.max(0, children.length - renderedItemCount);
  const placeholderCount = Math.min(
    deferredItemCount,
    clampNonNegativeInteger(
      placeholderItemCount,
      DEFAULT_PROGRESSIVE_PLACEHOLDER_ITEM_COUNT,
    ),
  );
  const visibleChildren = children.slice(0, renderedItemCount);
  const placeholderChildren = children
    .slice(renderedItemCount, renderedItemCount + placeholderCount)
    .map((item, index) => {
      if (typeof createPlaceholder === "function") {
        return createPlaceholder({
          item,
          index,
          absoluteIndex: renderedItemCount + index,
          groupId,
        });
      }

      return {
        id: `${item?.id ?? `${groupId}-${renderedItemCount + index}`}-placeholder`,
        sourceItemId: item?.id,
        isPlaceholder: true,
        isInteractive: false,
      };
    });

  return {
    children: [...visibleChildren, ...placeholderChildren],
    remainingProgressiveItemCount: Math.max(
      0,
      clampNonNegativeInteger(remainingProgressiveItemCount) - children.length,
    ),
    renderedItemCount,
    placeholderItemCount: placeholderCount,
    deferredItemCount,
    totalItemCount: children.length,
  };
};

export const calculateGridReservedHeight = ({
  itemCount,
  columnCount,
  itemHeight,
  rowGap = 16,
  verticalPadding = 24,
} = {}) => {
  const normalizedItemCount = clampNonNegativeInteger(itemCount);
  const normalizedColumnCount = Math.max(
    1,
    clampNonNegativeInteger(columnCount, 1),
  );
  const normalizedItemHeight = Math.max(0, Number(itemHeight) || 0);

  if (normalizedItemCount === 0 || normalizedItemHeight === 0) {
    return 0;
  }

  const rowCount = Math.ceil(normalizedItemCount / normalizedColumnCount);
  return Math.round(
    rowCount * normalizedItemHeight +
      Math.max(0, rowCount - 1) * rowGap +
      verticalPadding,
  );
};

export const calculateListReservedHeight = ({
  itemCount,
  itemHeight,
  rowGap = 0,
  verticalPadding = 0,
  headerHeight = 0,
} = {}) => {
  const normalizedItemCount = clampNonNegativeInteger(itemCount);
  const normalizedItemHeight = Math.max(0, Number(itemHeight) || 0);

  if (normalizedItemCount === 0 || normalizedItemHeight === 0) {
    return 0;
  }

  return Math.round(
    headerHeight +
      normalizedItemCount * normalizedItemHeight +
      Math.max(0, normalizedItemCount - 1) * rowGap +
      verticalPadding,
  );
};
