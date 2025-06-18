let updateInterval = null;

export const handleOnMount = async (deps) => {
  const { store, attrs, httpClient, render } = deps;
  const { fileId, autoPlay } = attrs;

  // Store render function globally for time updates
  globalRender = render;

  if (!fileId) {
    console.warn('AudioPlayer: No fileId provided');
    return () => {
      globalRender = null;
    };
  }

  try {
    // Initialize audio context
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    store.setAudioContext(audioContext);

    // Create gain node for volume control
    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    store.setGainNode(gainNode);

    // Load audio file
    await loadAudioFile(fileId, store, httpClient);
    render();

    // Auto-play if requested
    if (autoPlay) {
      await handlePlay(store);
      render();
    }

  } catch (error) {
    console.error('Error initializing audio player:', error);
    store.setLoading(false);
  }

  // Cleanup function
  return () => {
    cleanup(store);
    globalRender = null;
  };
};

export const handlePlayPause = async (e, deps) => {
  e.preventDefault();
  const { store, render } = deps;
  const state = store.getState();

  if (state.isPlaying) {
    handlePause(store);
  } else {
    await handlePlay(store);
  }
  render();
};

export const handleProgressBarClick = (e, deps) => {
  const { store, render } = deps;
  const state = store.getState();
  
  if (!state.duration) return;
  
  // Calculate click position as percentage of progress bar width
  const rect = e.currentTarget.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percentage = clickX / rect.width;
  const seekTime = percentage * state.duration;
  
  store.setCurrentTime(seekTime);
  
  // If playing, restart from new position
  if (state.isPlaying) {
    stopCurrentSource(store);
    startPlaybackFromTime(store, seekTime);
  } else {
    store.setPauseTime(seekTime);
  }
  render();
};

// Private helper functions
const loadAudioFile = async (fileId, store, httpClient) => {
  store.setLoading(true);

  try {
    // Get file URL from httpClient (following fileImage pattern)
    const { url } = await httpClient.creator.getFileContent({ fileId, projectId: 'someprojectId' });
    
    // Fetch audio data
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    
    // Decode audio data
    const state = store.getState();
    const audioBuffer = await state.audioContext.decodeAudioData(arrayBuffer);
    
    store.setAudioBuffer(audioBuffer);
    store.setDuration(audioBuffer.duration);
    store.setLoading(false);

  } catch (error) {
    console.error('Error loading audio file:', error);
    store.setLoading(false);
    throw error;
  }
};

const handlePlay = async (store) => {
  const state = store.getState();
  
  if (!state.audioBuffer || !state.audioContext) {
    console.warn('Audio not loaded yet');
    return;
  }

  // Resume audio context if suspended (required by some browsers)
  if (state.audioContext.state === 'suspended') {
    await state.audioContext.resume();
  }

  const startTime = state.pauseTime || 0;
  startPlaybackFromTime(store, startTime);
  
  store.setPlaying(true);
  store.setStartTime(state.audioContext.currentTime - startTime);

  // Start time update interval
  startTimeUpdates(store);
};

const handlePause = (store) => {
  const state = store.getState();
  
  stopCurrentSource(store);
  store.setPlaying(false);
  store.setPauseTime(state.currentTime);
  
  // Stop time updates
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
};

const startPlaybackFromTime = (store, startTime) => {
  const state = store.getState();
  
  // Create new source node
  const sourceNode = state.audioContext.createBufferSource();
  sourceNode.buffer = state.audioBuffer;
  sourceNode.connect(state.gainNode);
  
  // Handle playback end
  sourceNode.onended = () => {
    if (state.isPlaying) {
      store.setPlaying(false);
      store.setCurrentTime(0);
      store.setPauseTime(0);
      
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
    }
  };
  
  store.setSourceNode(sourceNode);
  
  // Start playback from specified time
  sourceNode.start(0, startTime);
};

const stopCurrentSource = (store) => {
  const state = store.getState();
  
  if (state.sourceNode) {
    try {
      state.sourceNode.stop();
    } catch (error) {
      // Source might already be stopped
    }
    store.setSourceNode(null);
  }
};

// Store the render function globally so the interval can access it
let globalRender = null;

const startTimeUpdates = (store) => {
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  
  updateInterval = setInterval(() => {
    const state = store.getState();
    
    if (!state.isPlaying || state.isSeeking) {
      return;
    }
    
    const elapsed = state.audioContext.currentTime - state.startTime;
    const currentTime = Math.min(elapsed, state.duration);
    
    store.setCurrentTime(currentTime);
    
    // Trigger render to update UI
    if (globalRender) {
      globalRender();
    }
    
    // Auto-stop at end
    if (currentTime >= state.duration) {
      handlePause(store);
      store.setCurrentTime(0);
      store.setPauseTime(0);
      if (globalRender) {
        globalRender();
      }
    }
  }, 100); // Update every 100ms
};

const cleanup = (store) => {
  const state = store.getState();
  
  // Stop time updates
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  
  // Stop current source
  stopCurrentSource(store);
  
  // Close audio context
  if (state.audioContext && state.audioContext.state !== 'closed') {
    state.audioContext.close();
  }
  
  // Reset state
  store.setPlaying(false);
  store.setAudioContext(null);
  store.setAudioBuffer(null);
  store.setGainNode(null);
};