import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";
import { playTutorialVideo } from "../../internal/ui/tutorialVideoPlayback.js";

export const handleBeforeMount = (deps) => {
  const { store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  return mountMobileResourceWindowLayout(deps);
};

export const handleVideoCardClick = (deps, payload) => {
  const { appService, store, render } = deps;
  const { videoId } = payload._event.currentTarget.dataset;
  const openPlayer = () => {
    store.openVideoPlayer({ videoId });
    render();
  };

  playTutorialVideo({ appService, openPlayer }, { youtubeId: videoId });
};

export const handleVideoCardKeyDown = (deps, payload) => {
  const { key } = payload._event;
  if (key !== "Enter" && key !== " ") {
    return;
  }

  payload._event.preventDefault();
  handleVideoCardClick(deps, payload);
};

export const handleFolderHeaderClick = (deps, payload) => {
  const { store, render } = deps;
  const { folderId } = payload._event.currentTarget.dataset;

  store.toggleFolderCollapsed({ folderId });
  render();
};

export const handleVideoPlayerClose = (deps) => {
  const { store, render } = deps;
  store.closeVideoPlayer();
  render();
};
