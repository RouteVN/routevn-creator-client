export const handleOnMount = async (deps) => {
  const { store, attrs, httpClient, render, audioManager } = deps;
  const { fileId, autoPlay, fileName } = attrs;

  // Generate unique component ID
  const componentId = `audio-player-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  store.setComponentId(componentId);
  store.setFileName(fileName);

  // Register with audio manager
  audioManager.registerPlayer(componentId, store, render);

  if (!fileId) {
    console.warn('AudioPlayer: No fileId provided');
    return () => {
      audioManager.unregisterPlayer(componentId);
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
      await handlePlay(store, audioManager);
      render();
    }

  } catch (error) {
    console.error('Error initializing audio player:', error);
    store.setLoading(false);
  }

  // Cleanup function
  return () => {
    cleanup(store, audioManager);
  };
};

export const handlePlayPause = async (e, deps) => {
  e.preventDefault();
  const { store, render, audioManager } = deps;
  const state = store.getState();

  if (state.isPlaying) {
    handlePause(store, audioManager);
  } else {
    await handlePlay(store, audioManager);
  }
  render();
};

export const handleProgressBarClick = (e, deps) => {
  const { store, render, audioManager } = deps;
  const state = store.getState();
  
  if (!state.duration) return;
  
  // Calculate click position as percentage of progress bar width
  const rect = e.currentTarget.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const percentage = clickX / rect.width;
  const seekTime = percentage * state.duration;
  
  store.setCurrentTime(seekTime);
  store.setPauseTime(seekTime);
  
  // Always stop current source first
  stopCurrentSource(store);
  
  // If playing, restart from new position
  if (state.isPlaying) {
    // Stop time updates during seek
    audioManager.stopTimeUpdates(state.componentId);
    
    // Start playback from new position
    startPlaybackFromTime(store, seekTime);
    store.setStartTime(state.audioContext.currentTime - seekTime);
    
    // Resume time updates
    audioManager.startTimeUpdates(state.componentId);
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

const handlePlay = async (store, audioManager) => {
  const state = store.getState();
  
  if (!state.audioBuffer || !state.audioContext) {
    console.warn('Audio not loaded yet');
    return;
  }

  // Always stop current source first to prevent overlapping
  stopCurrentSource(store);

  // Resume audio context if suspended (required by some browsers)
  if (state.audioContext.state === 'suspended') {
    await state.audioContext.resume();
  }

  const startTime = state.pauseTime || 0;
  startPlaybackFromTime(store, startTime);
  
  store.setPlaying(true);
  store.setStartTime(state.audioContext.currentTime - startTime);

  // Start time update interval
  audioManager.startTimeUpdates(state.componentId);
};

const handlePause = (store, audioManager) => {
  const state = store.getState();
  
  stopCurrentSource(store);
  store.setPlaying(false);
  store.setPauseTime(state.currentTime);
  
  // Stop time updates
  audioManager.stopTimeUpdates(state.componentId);
};

const startPlaybackFromTime = (store, startTime) => {
  const state = store.getState();
  
  // Create new source node
  const sourceNode = state.audioContext.createBufferSource();
  sourceNode.buffer = state.audioBuffer;
  sourceNode.connect(state.gainNode);
  
  // Handle playback end - but let AudioManager handle cleanup to avoid conflicts
  sourceNode.onended = () => {
    // Don't interfere with manual operations, let AudioManager handle auto-stop
    console.debug('Audio source ended naturally');
  };
  
  store.setSourceNode(sourceNode);
  
  // Start playback from specified time
  sourceNode.start(0, startTime);
};

const stopCurrentSource = (store) => {
  const state = store.getState();
  
  if (state.sourceNode) {
    try {
      // Disconnect from gain node first to prevent audio artifacts
      state.sourceNode.disconnect();
      state.sourceNode.stop();
    } catch (error) {
      // Source might already be stopped or disconnected
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