import { mountMobileResourceWindowLayout } from "../../internal/ui/resourcePages/mobileResourcePage.js";

export const handleBeforeMount = (deps) => {
  const { store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  return mountMobileResourceWindowLayout(deps);
};

// Where YouTube's player cannot play inside the app, the video opens on
// YouTube instead of showing the player's error.
const playVideo = (deps, { videoId }) => {
  const { appService, store, render } = deps;

  if (!appService.canEmbedYouTube()) {
    appService.openUrl(store.selectVideoWatchUrl({ videoId }));
    return;
  }

  store.openVideoPlayer({ videoId });
  render();
};

export const handleVideoCardClick = (deps, payload) => {
  const { videoId } = payload._event.currentTarget.dataset;
  playVideo(deps, { videoId });
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

export const handleOpenOnYouTubeClick = (deps) => {
  const { appService, store, render } = deps;
  const videoId = store.selectPlayingVideoId();

  store.closeVideoPlayer();
  render();
  appService.openUrl(store.selectVideoWatchUrl({ videoId }));
};
