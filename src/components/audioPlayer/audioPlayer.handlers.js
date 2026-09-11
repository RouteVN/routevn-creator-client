const OPEN_DIALOG_SELECTOR = "dialog[open], rtgl-dialog[open]";

const isEscapeFromOpenDialog = (event) =>
  event
    .composedPath?.()
    ?.some((target) => target?.matches?.(OPEN_DIALOG_SELECTOR)) ?? false;

const closeAudioPlayer = ({ dispatchEvent, audioService }) => {
  audioService.stop();

  dispatchEvent(
    new CustomEvent("audio-player-close", {
      bubbles: true,
      composed: true,
    }),
  );
};

export const handleBeforeMount = (deps) => {
  const {
    store,
    props: attrs,
    render,
    audioService,
    appService,
    dispatchEvent,
    i18n,
  } = deps;
  const copy = i18n?.audioPlayerPage ?? {};

  if (!attrs) {
    appService.showAlert({
      message: copy.missingFileId ?? "Missing fileId",
      title: copy.errorTitle ?? i18n?.resourcePages?.errorTitle ?? "Error",
    });
    return;
  }

  const releaseAudioService = audioService.acquire();

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
    store.clearSeekTime();
    store.setPlaying({ isPlaying: false });
    render();
  };
  audioService.on("pause", handlePause);

  const handleEnded = () => {
    store.clearSeekTime();
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
    store.clearSeekTime();
    store.setLoading({ isLoading: false });
    store.setPlaying({ isPlaying: false });
    render();
    appService.showToast({
      title: copy.errorTitle ?? "Error",
      message:
        copy.failedPlayback ?? "Could not play this audio. Please try again.",
      status: "error",
    });
  };
  audioService.on("error", handleError);

  const handleWindowKeyDown = (event) => {
    if (event.key !== "Escape" || isEscapeFromOpenDialog(event)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    closeAudioPlayer({ dispatchEvent, audioService });
  };
  window.addEventListener("keydown", handleWindowKeyDown, true);
  const handlePointerUp = () => handleSeekEnd(deps);
  const handleSeekInterrupted = () => handleSeekCancel(deps);
  // Releases can happen outside the range, and an unchanged range emits no change.
  window.addEventListener("pointerup", handlePointerUp, true);
  window.addEventListener("pointercancel", handleSeekInterrupted, true);
  window.addEventListener("blur", handleSeekInterrupted);

  return () => {
    window.removeEventListener("keydown", handleWindowKeyDown, true);
    window.removeEventListener("pointerup", handlePointerUp, true);
    window.removeEventListener("pointercancel", handleSeekInterrupted, true);
    window.removeEventListener("blur", handleSeekInterrupted);
    audioService.off("timeupdate", handleTimeUpdate);
    audioService.off("play", handlePlay);
    audioService.off("pause", handlePause);
    audioService.off("ended", handleEnded);
    audioService.off("loaded", handleLoaded);
    audioService.off("error", handleError);
    releaseAudioService();
  };
};

export const handleAfterMount = async (deps) => {
  const { store, props: attrs, projectService, render, audioService } = deps;
  const { fileId, autoPlay } = attrs;
  try {
    store.setLoading({ isLoading: true });
    render();

    const { url } = await projectService.getFileContent(fileId);
    const audioInfo = await audioService.loadAudio(url);
    if (!audioInfo) {
      return;
    }

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
    const audioInfo = await audioService.loadAudio(url);
    if (!audioInfo) {
      return;
    }

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

export const handleSeekInput = (deps, payload) => {
  const { store, render } = deps;
  store.setSeekTime({ seekTime: payload._event.currentTarget.valueAsNumber });
  render();
};

export const handleSeekStart = handleSeekInput;

export const handleSeekEnd = (deps) => {
  const { store } = deps;
  // Do not render here: native change may follow pointerup and must read the
  // released input value. Playback ticks (or change) resume rendering afterward.
  store.clearSeekTime();
};

export const handleSeekChange = async (deps, payload) => {
  const { store, render, audioService } = deps;
  const seekTime = payload._event.currentTarget.valueAsNumber;
  // The gesture has ended even if the native output takes time to resume.
  store.clearSeekTime();
  try {
    await audioService.seek(seekTime);
  } finally {
    render();
  }
};

export const handleSeekCancel = (deps) => {
  const { store, render } = deps;
  if (store.selectSeekTime() === undefined) return;
  store.clearSeekTime();
  render();
};

export const handleClose = (deps, payload) => {
  payload._event.preventDefault();
  const { dispatchEvent, audioService } = deps;

  closeAudioPlayer({ dispatchEvent, audioService });
};
