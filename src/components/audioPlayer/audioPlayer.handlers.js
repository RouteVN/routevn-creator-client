const calculateSeekPosition = (clickX, progressBarWidth, duration) => {
  const percentage = Math.max(0, Math.min(1, clickX / progressBarWidth));
  return percentage * duration;
};

export const handleBeforeMount = (deps) => {
  const { store, attrs, render, audioManager, globalUI } = deps;

  if (!attrs) {
    globalUI.showAlert({ message: "Missing fileId", type: "error" });
    return;
  }

  audioManager.init();

  const handleTimeUpdate = (currentTime) => {
    store.setCurrentTime(currentTime);
    render();
  };
  audioManager.on("timeupdate", handleTimeUpdate);

  const handlePlay = () => {
    store.setPlaying(true);
    render();
  };
  audioManager.on("play", handlePlay);

  const handlePause = () => {
    store.setPlaying(false);
    render();
  };
  audioManager.on("pause", handlePause);

  const handleEnded = () => {
    store.setPlaying(false);
    store.setCurrentTime(0);
    render();
  };
  audioManager.on("ended", handleEnded);

  const handleLoaded = ({ duration }) => {
    store.setDuration(duration);
    store.setLoading(false);
    render();
  };
  audioManager.on("loaded", handleLoaded);

  const handleError = (error) => {
    console.error("Audio error:", error);
    store.setLoading(false);
    render();
  };
  audioManager.on("error", handleError);
  return audioManager.cleanup;
};

export const handleAfterMount = async (deps) => {
  const { store, attrs, fileManagerFactory, render, audioManager, router } =
    deps;
  const { fileId, autoPlay } = attrs;
  try {
    store.setLoading(true);
    render();

    // Get the current project ID from router
    const { p: projectId } = router.getPayload();
    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(projectId);
    const { url } = await fileManager.getFileContent({
      fileId,
    });
    await audioManager.loadAudio(url);

    if (autoPlay) {
      await audioManager.play();
    }
  } catch (error) {
    console.error("Error loading audio:", error);
    store.setLoading(false);
    render();
  }
};

export const handleOnUpdate = async (changes, deps) => {
  const { oldProps } = changes;
  const { store, attrs, fileManagerFactory, render, audioManager, router } =
    deps;
  const { fileId, autoPlay } = attrs;

  if (oldProps.fileId === fileId) {
    return;
  }

  try {
    store.setLoading(true);
    render();

    audioManager.stop();

    // Get the current project ID from router
    const { p: projectId } = router.getPayload();
    // Get fileManager for this project
    const fileManager = await fileManagerFactory.getByProject(projectId);
    const { url } = await fileManager.getFileContent({
      fileId,
    });
    await audioManager.loadAudio(url);

    if (autoPlay) {
      await audioManager.play();
    }
  } catch (error) {
    console.error("Error loading audio:", error);
    store.setLoading(false);
    render();
  }
};

export const handlePlayPause = async (e, deps) => {
  e.preventDefault();
  const { audioManager } = deps;

  if (audioManager.isPlaying()) {
    audioManager.pause();
    return;
  }
  await audioManager.play();
};

export const handleProgressBarClick = async (e, deps) => {
  const { store, audioManager } = deps;
  const duration = store.selectDuration();

  if (!duration) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const seekTime = calculateSeekPosition(clickX, rect.width, duration);

  await audioManager.seek(seekTime);
};

export const handleClose = (e, deps) => {
  e.preventDefault();
  const { dispatchEvent, audioManager } = deps;

  audioManager.stop();

  dispatchEvent(
    new CustomEvent("audio-player-close", {
      bubbles: true,
      composed: true,
    }),
  );
};
