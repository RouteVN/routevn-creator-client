// YouTube's embedded player plays a video only when the page that embeds it
// tells YouTube its address, and web views send that address only from
// http(s) pages. The Windows, Android and web apps load from http(s). The
// macOS and Linux apps load from tauri://localhost and the iOS app from
// routevn://app, where the player shows "Error 153" instead of the video.
export const canEmbedYouTubeFrom = (location) =>
  location.protocol === "https:" || location.protocol === "http:";

export const buildYouTubeThumbnailUrl = (videoId) =>
  `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

export const buildYouTubeEmbedUrl = (videoId) =>
  `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&playsinline=1`;

export const buildYouTubeWatchUrl = (videoId) =>
  `https://www.youtube.com/watch?v=${videoId}`;
