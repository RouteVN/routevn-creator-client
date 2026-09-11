// iOS can stop at HAVE_METADATA for a local blob even with preload="auto".
// Decode silently, then pause before the thumbnail extractor seeks its samples.
export const prepareIOSVideoForThumbnail = async (
  video,
  { timeoutMs = 5000 } = {},
) => {
  if (video.readyState >= 2) return;

  let timeoutId;
  try {
    const playback = video.play().finally(() => video.pause());
    await Promise.race([
      playback,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("Timed out preparing video thumbnail frames"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
    video.pause();
  }
};
