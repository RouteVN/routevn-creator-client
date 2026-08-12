const MOBILE_RESOURCE_SELECTOR_GRID_STYLE =
  "display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));";
const MOBILE_RESOURCE_SELECTOR_ITEM_STYLE =
  "width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box;";

export const createCommandLineResourceSelectorLayout = ({
  isTouchMode,
} = {}) => ({
  showFileExplorer: !isTouchMode,
  columns: isTouchMode ? 2 : undefined,
  gridStyle: isTouchMode ? MOBILE_RESOURCE_SELECTOR_GRID_STYLE : "",
  itemStyle: isTouchMode ? MOBILE_RESOURCE_SELECTOR_ITEM_STYLE : "",
  cardStyle: isTouchMode ? MOBILE_RESOURCE_SELECTOR_ITEM_STYLE : "",
  previewStyle: isTouchMode ? "width: 100%;" : "",
});
