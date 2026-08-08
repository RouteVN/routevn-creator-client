const playMuted = (video) => {
  if (!video) return;
  video.defaultMuted = true;
  video.muted = true;
  try {
    const playback = video.play();
    playback?.catch(() => undefined);
  } catch {
    // A later canplay event retries playback when the media becomes ready.
  }
};

export const handleAfterMount = (deps) => {
  const { refs } = deps;
  playMuted(refs.video);
};

export const handleVideoCanPlay = (_deps, payload) => {
  playMuted(payload._event.currentTarget);
};
