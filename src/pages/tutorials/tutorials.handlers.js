import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";

export const handleBeforeMount = (deps) => {
  const { store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  return mountMobileResourceWindowLayout(deps);
};

export const handleWatchTutorialsClick = (deps) => {
  const { appService, store } = deps;
  appService.openUrl(store.selectVideoTutorialsUrl());
};
