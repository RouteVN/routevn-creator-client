import tutorialVideos from "./tutorialVideos.json";

// The tutorial folders, in the order the Tutorials page lists them.
export const TUTORIAL_FOLDERS = tutorialVideos.folders;

export const findTutorialVideo = (youtubeId) =>
  TUTORIAL_FOLDERS.flatMap((folder) => folder.videos).find(
    (video) => video.youtubeId === youtubeId,
  );

// The tutorial the help button offers on an app page, by its route pattern
// and layout: the desktop layout's, or the one for phones and tablets.
// Pages without one offer no video.
export const findPageTutorialVideo = (routePattern, { isTouchMode } = {}) =>
  findTutorialVideo(
    tutorialVideos.pageVideos[routePattern]?.[
      isTouchMode ? "mobile" : "desktop"
    ],
  );
