import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { ROUTEVN_CREATOR_VIDEO_TUTORIALS_URL } from "../../internal/routevnUrls.js";

export const handleBeforeMount = (deps) => {
  const { store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  return mountMobileResourceWindowLayout(deps);
};

export const handleWatchTutorialsClick = (deps) => {
  const { appService } = deps;
  appService.openUrl(ROUTEVN_CREATOR_VIDEO_TUTORIALS_URL);
};
