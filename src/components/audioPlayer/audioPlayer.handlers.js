const calculateSeekPosition = (clickX, progressBarWidth, duration) => {
  const percentage = Math.max(0, Math.min(1, clickX / progressBarWidth));
  return percentage * duration;
};

export const handleBeforeMount = (deps) => {
  const { store, props: attrs, render, audioService, appService } = deps;

  if (!attrs) {
    appService.showAlert({ message: "Missing fileId", title: "Error" });
    return;
  }

  audioService.init();

  const handleTimeUpdate = (currentTime) => {
    store.setCurrentTime({ currentTime: currentTime });
    render();
  };
  audioService.on("timeupdate", handleTimeUpdate);

  const handlePlay = () => {
    store.setPlaying({ isPlaying: true });
    render();
  };
  audioService.on("play", handlePlay);

  const handlePause = () => {
    store.setPlaying({ isPlaying: false });
    render();
  };
  audioService.on("pause", handlePause);

  const handleEnded = () => {
    store.setPlaying({ isPlaying: false });
    store.setCurrentTime({ currentTime: 0 });
    render();
  };
  audioService.on("ended", handleEnded);

  const handleLoaded = ({ duration }) => {
    store.setDuration({ duration: duration });
    store.setLoading({ isLoading: false });
    render();
  };
  audioService.on("loaded", handleLoaded);

  const handleError = (error) => {
    console.error("Audio error:", error);
    store.setLoading({ isLoading: false });
    render();
  };
  audioService.on("error", handleError);
  return audioService.cleanup;
};

export const handleAfterMount = async (deps) => {
  const { store, props: attrs, projectService, render, audioService } = deps;
  const { fileId, autoPlay } = attrs;
  try {
    store.setLoading({ isLoading: true });
    render();

    const { url } = await projectService.getFileContent(fileId);
    await audioService.loadAudio(url);

    if (autoPlay) {
      await audioService.play();
    }
  } catch (error) {
    console.error("Error loading audio:", error);
    store.setLoading({ isLoading: false });
    render();
  }
};

export const handleOnUpdate = async (deps, changes) => {
  const { oldProps } = changes;
  const { store, props: attrs, projectService, render, audioService } = deps;
  const { fileId, autoPlay } = attrs;

  if (oldProps.fileId === fileId) {
    return;
  }

  try {
    store.setLoading({ isLoading: true });
    render();

    audioService.stop();

    const { url } = await projectService.getFileContent(fileId);
    await audioService.loadAudio(url);

    if (autoPlay) {
      await audioService.play();
    }
  } catch (error) {
    console.error("Error loading audio:", error);
    store.setLoading({ isLoading: false });
    render();
  }
};

export const handlePlayPause = async (deps, payload) => {
  payload._event.preventDefault();
  const { audioService } = deps;

  if (audioService.isPlaying()) {
    audioService.pause();
    return;
  }
  await audioService.play();
};

export const handleProgressBarClick = async (deps, payload) => {
  const { store, audioService } = deps;
  const duration = store.selectDuration();

  if (!duration) return;

  const rect = payload._event.currentTarget.getBoundingClientRect();
  const clickX = payload._event.clientX - rect.left;
  const seekTime = calculateSeekPosition(clickX, rect.width, duration);

  await audioService.seek(seekTime);
};

export const handleClose = (deps, payload) => {
  payload._event.preventDefault();
  const { dispatchEvent, audioService } = deps;

  audioService.stop();

  dispatchEvent(
    new CustomEvent("audio-player-close", {
      bubbles: true,
      composed: true,
    }),
  );
};
