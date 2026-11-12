import { buildYouTubeWatchUrl } from "../youtube.js";

// Plays a tutorial in the app's player. Where YouTube's player cannot play
// inside the app, the video opens on YouTube instead of showing its error.
export const playTutorialVideo = (
  { appService, openPlayer },
  { youtubeId },
) => {
  if (!appService.canEmbedYouTube()) {
    appService.openUrl(buildYouTubeWatchUrl(youtubeId));
    return;
  }

  openPlayer();
};
