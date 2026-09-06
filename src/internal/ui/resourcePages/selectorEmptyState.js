export const selectResourceSelectorEmptyMessage = ({
  groups,
  searchQuery = "",
  i18n,
}) => {
  if (groups.some((group) => group.children.length > 0)) {
    return undefined;
  }

  const copy = i18n?.resourcePages ?? {};
  return searchQuery.trim()
    ? (copy.selectorNoResultsMessage ?? "No items match your search.")
    : (copy.selectorEmptyMessage ?? "No items available to select.");
};
