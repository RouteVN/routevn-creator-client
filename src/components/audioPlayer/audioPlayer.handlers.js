import { calculations, selectors } from './audioPlayer.store.js';

const generateComponentId = () =>
  `audio-player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

const canStartPlayback = (state) =>
  state.audioBuffer && state.audioContext && !state.isLoading;

const createErrorState = (error, context) => ({
  error: {
    message: error.message,
    type: error.name,
    context,
    timestamp: Date.now()
  }
});

// Effect runners (side effects contained)
const createAudioContext = () => {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContext();
  const gainNode = audioContext.createGain();
  gainNode.connect(audioContext.destination);
  return { audioContext, gainNode };
};

const loadAudioData = async (fileId, httpClient) => {
  const { url } = await httpClient.creator.getFileContent({
    fileId,
    projectId: 'someprojectId'
  });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }
  return await response.arrayBuffer();
};

const decodeAudioData = async (audioContext, arrayBuffer) => {
  return await audioContext.decodeAudioData(arrayBuffer);
};

export const handleOnMount = async (deps) => {
  const { store, attrs, httpClient, render, audioManager } = deps;
  const { fileId, autoPlay } = attrs;

  // Generate component ID
  const componentId = generateComponentId();
  store.setComponentId(componentId);

  // Register with audio manager
  audioManager.registerPlayer(componentId, store, render);

  if (!fileId) {
    console.warn('AudioPlayer: No fileId provided');
    return () => {
      audioManager.unregisterPlayer(componentId);
    };
  }

  try {
    // Set loading state
    store.setLoading(true);

    // Create audio context (side effect)
    const { audioContext, gainNode } = createAudioContext();
    store.setAudioContext(audioContext);
    store.setGainNode(gainNode);

    // Load audio file (side effect)
    const arrayBuffer = await loadAudioData(fileId, httpClient);
    const audioBuffer = await decodeAudioData(audioContext, arrayBuffer);

    store.setAudioBuffer(audioBuffer);
    store.setDuration(audioBuffer.duration);
    store.setLoading(false);

    render();

    // Auto-play if requested
    const state = store.getState();
    if (autoPlay && canStartPlayback(state)) {
      await playAudio(store, audioManager);
      render();
    }

  } catch (error) {
    const errorState = createErrorState(error, 'initialization');
    console.error('Error initializing audio player:', errorState);
    store.setLoading(false);
  }

  // Cleanup function
  return () => {
    cleanup(store, audioManager);
  };
};

export const handleOnUpdate = async (_, deps) => {
  console.log('AudioPlayer: handleOnUpdate called');
  const { store, attrs, httpClient, render, audioManager } = deps;
  const { fileId, autoPlay } = attrs;

  store.setPlaying(false);
  store.setCurrentTime(0);

  if (!fileId) {
    console.warn('AudioPlayer: No fileId provided');
    return;
  }

  try {
    // Set loading state
    store.setLoading(true);

    // Create audio context (side effect)
    const { audioContext, gainNode } = createAudioContext();
    store.setAudioContext(audioContext);
    store.setGainNode(gainNode);

    // Load audio file (side effect)
    const arrayBuffer = await loadAudioData(fileId, httpClient);
    const audioBuffer = await decodeAudioData(audioContext, arrayBuffer);

    store.setAudioBuffer(audioBuffer);
    store.setDuration(audioBuffer.duration);
    store.setLoading(false);

    await playAudio(store, audioManager);
    render();

  } catch (error) {
    const errorState = createErrorState(error, 'initialization');
    console.error('Error initializing audio player:', errorState);
    store.setLoading(false);
  }
}

export const handlePlayPause = async (e, deps) => {
  e.preventDefault();
  const { store, render, audioManager } = deps;
  const state = store.getState();

  if (state.isPlaying) {
    pauseAudio(store, audioManager);
  } else {
    await playAudio(store, audioManager);
  }
  render();
};

export const handleProgressBarClick = (e, deps) => {
  const { store, render, audioManager } = deps;
  const state = store.getState();

  if (!state.duration) return;

  // Calculate seek position
  const rect = e.currentTarget.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const seekTime = calculations.calculateSeekPosition(clickX, rect.width, state.duration);

  // Update state
  store.setCurrentTime(seekTime);
  store.setPauseTime(seekTime);

  // Stop current source
  stopCurrentSource(store);

  // If playing, restart from new position
  if (state.isPlaying) {
    audioManager.stopTimeUpdates(state.componentId);
    startPlaybackFromTime(store, seekTime);
    store.setStartTime(state.audioContext.currentTime - seekTime);
    audioManager.startTimeUpdates(state.componentId);
  }

  render();
};

export const handleClose = (e, deps) => {
  e.preventDefault();
  const { dispatchEvent, store, audioManager } = deps;

  // Stop playback first
  pauseAudio(store, audioManager);

  // Dispatch close event to parent component
  dispatchEvent(new CustomEvent("audio-player-close", {
    bubbles: true,
    composed: true
  }));
};

// Audio control functions
const playAudio = async (store, audioManager) => {
  const state = store.getState();

  if (!canStartPlayback(state)) {
    console.warn('Audio not ready for playback');
    return;
  }

  // Stop current source if any
  stopCurrentSource(store);

  // Calculate playback parameters
  const playbackParams = calculations.calculatePlaybackParams(state);

  // Resume context if needed (side effect)
  if (playbackParams.shouldResume) {
    await state.audioContext.resume();
  }

  // Start playback from calculated time
  startPlaybackFromTime(store, playbackParams.startTime);
  store.setPlaying(true);
  store.setStartTime(playbackParams.contextStartTime);

  // Start time updates
  audioManager.startTimeUpdates(state.componentId);
};

const pauseAudio = (store, audioManager) => {
  const state = store.getState();

  stopCurrentSource(store);
  store.setPlaying(false);
  store.setPauseTime(state.currentTime);

  // Stop time updates
  audioManager.stopTimeUpdates(state.componentId);
};

const startPlaybackFromTime = (store, startTime) => {
  const state = store.getState();

  // Create new source node (side effect)
  const sourceNode = state.audioContext.createBufferSource();
  sourceNode.buffer = state.audioBuffer;
  sourceNode.connect(state.gainNode);

  // Handle playback end
  sourceNode.onended = () => {
    console.debug('Audio source ended naturally');
  };

  store.setSourceNode(sourceNode);

  // Start playback from specified time (side effect)
  sourceNode.start(0, startTime);
};

const stopCurrentSource = (store) => {
  const state = store.getState();

  if (state.sourceNode) {
    try {
      // Disconnect and stop source (side effects)
      state.sourceNode.disconnect();
      state.sourceNode.stop();
    } catch (error) {
      console.debug('Source already stopped:', error.message);
    }
    store.setSourceNode(null);
  }
};

const cleanup = (store, audioManager) => {
  const state = store.getState();

  // Stop time updates and unregister from audio manager
  if (state.componentId) {
    audioManager.unregisterPlayer(state.componentId);
  }

  // Stop current source
  stopCurrentSource(store);

  // Close audio context (side effect)
  if (state.audioContext && state.audioContext.state !== 'closed') {
    state.audioContext.close();
  }

  // Reset state
  store.setPlaying(false);
  store.setAudioContext(null);
  store.setAudioBuffer(null);
  store.setGainNode(null);
};