import { calculations } from './audioPlayer.store.js';

const getAudioUrl = async (fileId, httpClient) => {
  const { url } = await httpClient.creator.getFileContent({
    fileId,
    projectId: 'someprojectId'
  });
  return url;
};

export const handleOnMount = async (deps) => {
  const { store, attrs, httpClient, render, audioManager } = deps;
  const { fileId, autoPlay } = attrs;

  audioManager.init();

  const handleTimeUpdate = (currentTime) => {
    store.setCurrentTime(currentTime);
    render();
  };
  audioManager.on('timeupdate', handleTimeUpdate);

  const handlePlay = () => {
    store.setPlaying(true);
    render();
  };
  audioManager.on('play', handlePlay);

  const handlePause = () => {
    store.setPlaying(false);
    render();
  };
  audioManager.on('pause', handlePause);

  const handleEnded = () => {
    store.setPlaying(false);
    store.setCurrentTime(0);
    render();
  };
  audioManager.on('ended', handleEnded);

  const handleLoaded = ({ duration }) => {
    store.setDuration(duration);
    store.setLoading(false);
    render();
  };
  audioManager.on('loaded', handleLoaded);

  const handleError = (error) => {
    console.error('Audio error:', error);
    store.setLoading(false);
    render();
  };
  audioManager.on('error', handleError);

  if (fileId) {
    try {
      store.setLoading(true);
      render();

      const url = await getAudioUrl(fileId, httpClient);
      await audioManager.loadAudio(url);

      if (autoPlay) {
        await audioManager.play();
      }
    } catch (error) {
      console.error('Error loading audio:', error);
      store.setLoading(false);
      render();
    }
  }

  return () => {
    audioManager.cleanup();
    store.resetState();
  };
};

export const handleOnUpdate = async (prevProps, deps) => {
  const { store, attrs, httpClient, render, audioManager } = deps;
  const { fileId, autoPlay } = attrs;

  if (prevProps.fileId !== fileId && fileId) {
    try {
      store.setLoading(true);
      render();

      audioManager.stop();

      const url = await getAudioUrl(fileId, httpClient);
      await audioManager.loadAudio(url);

      if (autoPlay) {
        await audioManager.play();
      }
    } catch (error) {
      console.error('Error loading audio:', error);
      store.setLoading(false);
      render();
    }
  }
};

export const handlePlayPause = async (e, deps) => {
  e.preventDefault();
  const { audioManager } = deps;

  if (audioManager.isPlaying()) {
    audioManager.pause();
  } else {
    await audioManager.play();
  }
};

export const handleProgressBarClick = async (e, deps) => {
  const { store, audioManager } = deps;
  const state = store.getState();

  if (!state.duration) return;

  const rect = e.currentTarget.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const seekTime = calculations.calculateSeekPosition(clickX, rect.width, state.duration);

  await audioManager.seek(seekTime);
};

export const handleClose = (e, deps) => {
  e.preventDefault();
  const { dispatchEvent, audioManager } = deps;

  audioManager.stop();

  dispatchEvent(new CustomEvent("audio-player-close", {
    bubbles: true,
    composed: true
  }));
};