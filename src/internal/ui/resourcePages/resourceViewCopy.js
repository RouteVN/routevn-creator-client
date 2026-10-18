import { formatI18nCopy } from "../i18nCopy.js";

// Copy the resource views show when their page does not pass it. Text style
// and character views name their own resource, so they pass their page
// namespace for the search and tag filter messages and, for characters, the
// avatar and sprites labels.
export const selectResourceViewCopy = ({
  i18n = {},
  namespace = "resourcePages",
  searchQuery = "",
  hasActiveSearch,
  hasActiveTagFilter,
}) => {
  const resourceCopy = i18n.resourcePages ?? {};
  const copy = i18n[namespace] ?? {};

  let emptyMessage = resourceCopy.emptyItemsMessage ?? "No items found";
  if (hasActiveSearch) {
    emptyMessage = formatI18nCopy(
      copy.emptySearchMessage ?? 'No items found matching "{query}"',
      { query: searchQuery },
    );
  } else if (hasActiveTagFilter) {
    emptyMessage =
      copy.emptyTagFilterMessage ?? "No items found for the selected tags";
  }

  return {
    backButtonLabel: resourceCopy.backButtonLabel ?? "Back",
    clearButton: resourceCopy.clearButton ?? "Clear",
    dropFilesMessage:
      resourceCopy.dropFilesMessage ?? "Drop files to upload to {folder}",
    emptyMessage,
    filterLabel: resourceCopy.filterLabel ?? "Filter",
    menuButtonLabel: resourceCopy.menuButtonLabel ?? "Menu",
    noAvatarLabel: copy.noAvatarLabel ?? "No Avatar",
    noDataMessage: resourceCopy.noDataMessage ?? "No data",
    noPreviewImageLabel: resourceCopy.noPreviewImageLabel ?? "No preview image",
    noTagsAvailableMessage:
      resourceCopy.noTagsAvailableMessage ?? "No tags available",
    noThumbnailLabel: resourceCopy.noThumbnailLabel ?? "No thumbnail",
    noWaveformLabel: resourceCopy.noWaveformLabel ?? "No waveform",
    processingLabel: resourceCopy.processingLabel ?? "Processing...",
    saveButton: resourceCopy.saveButton ?? "Save",
    searchPlaceholder: resourceCopy.searchPlaceholder ?? "Search...",
    spritesButtonLabel: copy.spritesButtonLabel ?? "Sprites",
    tagFilterPlaceholder: resourceCopy.tagFilterPlaceholder ?? "Filter tags",
    updateToSetPreviewLabel:
      resourceCopy.updateToSetPreviewLabel ?? "Update to set preview",
    zoomLabel: resourceCopy.zoomLabel ?? "Zoom",
  };
};
