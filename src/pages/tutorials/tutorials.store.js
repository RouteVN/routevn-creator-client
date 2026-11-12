import {
  buildTabletLandscapeContentColumnStyle,
  setMobileResourcePageWindowMetricsState,
} from "../../internal/ui/resourcePages/mobileResourcePage.js";
import {
  buildYouTubeEmbedUrl,
  buildYouTubeThumbnailUrl,
  buildYouTubeWatchUrl,
} from "../../internal/youtube.js";
import { selectTutorialsPageCopy } from "./support/tutorialsPageCopy.js";
import tutorialVideos from "./support/tutorialVideos.json";

// Phones and tablets list the tutorials recorded on them first.
const TOUCH_FIRST_FOLDER_ID = "mobile";
const VIDEO_CARD_MIN_WIDTH = 240;

const selectOrderedFolders = (state) => {
  const { folders } = tutorialVideos;
  if (!state.isTouchMode) {
    return folders;
  }

  return [
    ...folders.filter((folder) => folder.id === TOUCH_FIRST_FOLDER_ID),
    ...folders.filter((folder) => folder.id !== TOUCH_FIRST_FOLDER_ID),
  ];
};

const findVideo = (videoId) =>
  tutorialVideos.folders
    .flatMap((folder) => folder.videos)
    .find((video) => video.youtubeId === videoId);

export const createInitialState = () => ({
  resourceCategory: "settings",
  selectedResourceId: "tutorials",
  isTouchMode: false,
  appWindowMetrics: { width: 0, height: 0 },
  collapsedFolderIds: [],
  playingVideoId: undefined,
});

export const setUiConfig = ({ state }, { uiConfig } = {}) => {
  state.isTouchMode =
    uiConfig?.id === "touch" || uiConfig?.inputMode === "touch";
};

export const setAppWindowMetrics = ({ state }, { width, height } = {}) => {
  setMobileResourcePageWindowMetricsState(state, { width, height });
};

export const toggleFolderCollapsed = ({ state }, { folderId } = {}) => {
  if (state.collapsedFolderIds.includes(folderId)) {
    state.collapsedFolderIds = state.collapsedFolderIds.filter(
      (collapsedFolderId) => collapsedFolderId !== folderId,
    );
    return;
  }

  state.collapsedFolderIds.push(folderId);
};

export const openVideoPlayer = ({ state }, { videoId } = {}) => {
  state.playingVideoId = videoId;
};

export const closeVideoPlayer = ({ state }) => {
  state.playingVideoId = undefined;
};

export const selectPlayingVideoId = ({ state }) => state.playingVideoId;

export const selectVideoWatchUrl = (_context, { videoId } = {}) =>
  buildYouTubeWatchUrl(videoId);

export const selectViewData = ({ state, i18n }) => {
  const copy = selectTutorialsPageCopy(i18n);
  const folderNames = {
    desktop: copy.desktopFolder ?? "Desktop",
    mobile: copy.mobileFolder ?? "Mobile",
  };
  const folders = selectOrderedFolders(state);

  const groups = folders.map((folder, groupIndex) => ({
    id: folder.id,
    name: folderNames[folder.id],
    isCollapsed: state.collapsedFolderIds.includes(folder.id),
    videos: folder.videos.map((video, videoIndex) => ({
      id: video.youtubeId,
      refKey: `${groupIndex}x${videoIndex}`,
      title: video.title,
      thumbnailUrl: buildYouTubeThumbnailUrl(video.youtubeId),
    })),
  }));

  const playingVideo = findVideo(state.playingVideoId);

  return {
    resourceCategory: state.resourceCategory,
    selectedResourceId: state.selectedResourceId,
    isTouchMode: state.isTouchMode,
    showExplorerPanel: !state.isTouchMode,
    tabletLandscapeContentStyle: buildTabletLandscapeContentColumnStyle(state, {
      minGutter: "var(--spacing-md)",
    }),
    title: copy.title ?? "Tutorials",
    groups,
    gridColumns: `repeat(auto-fill, minmax(min(${VIDEO_CARD_MIN_WIDTH}px, 100%), 1fr))`,
    playingVideo: playingVideo
      ? {
          title: playingVideo.title,
          embedUrl: buildYouTubeEmbedUrl(playingVideo.youtubeId),
        }
      : undefined,
    openOnYouTubeButton: copy.openOnYouTubeButton ?? "Open on YouTube",
    closePlayerLabel: copy.closePlayerLabel ?? "Close",
  };
};
