import { buildYouTubeWatchUrl } from "../../internal/youtube.js";

export const handleClose = (deps) => {
  const { dispatchEvent } = deps;
  dispatchEvent(new CustomEvent("close"));
};

export const handleOpenOnYouTubeClick = (deps) => {
  const { appService, dispatchEvent, props } = deps;
  dispatchEvent(new CustomEvent("close"));
  appService.openUrl(buildYouTubeWatchUrl(props.youtubeId));
};
