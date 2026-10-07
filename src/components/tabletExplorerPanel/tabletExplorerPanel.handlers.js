// One choice for every page, so a hidden panel stays hidden while moving
// between them.
export const TABLET_EXPLORER_COLLAPSED_CONFIG_KEY =
  "resourcePages.tabletExplorerCollapsed";

export const handleBeforeMount = (deps) => {
  const { appService, store } = deps;
  store.setCollapsed({
    collapsed:
      appService.getUserConfig(TABLET_EXPLORER_COLLAPSED_CONFIG_KEY) === true,
  });
};

export const handleToggleClick = (deps) => {
  const { appService, render, store } = deps;
  const collapsed = !store.selectCollapsed();
  store.setCollapsed({ collapsed });
  appService.setUserConfig(TABLET_EXPLORER_COLLAPSED_CONFIG_KEY, collapsed);
  render();
};
