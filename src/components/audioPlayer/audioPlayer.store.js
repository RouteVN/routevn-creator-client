export const INITIAL_STATE = Object.freeze({
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 0,
  audioBuffer: null,
  audioContext: null,
  sourceNode: null,
  gainNode: null,
  startTime: 0,
  pauseTime: 0,
  isSeeking: false,
  componentId: null,
});

export const setLoading = (state, isLoading) => {
  state.isLoading = isLoading;
};

export const setPlaying = (state, isPlaying) => {
  state.isPlaying = isPlaying;
};

export const setCurrentTime = (state, currentTime) => {
  state.currentTime = Math.max(0, Math.min(currentTime, state.duration));
};

export const setDuration = (state, duration) => {
  state.duration = duration;
};

export const setAudioBuffer = (state, audioBuffer) => {
  state.audioBuffer = audioBuffer;
};

export const setAudioContext = (state, audioContext) => {
  state.audioContext = audioContext;
};

export const setSourceNode = (state, sourceNode) => {
  state.sourceNode = sourceNode;
};

export const setGainNode = (state, gainNode) => {
  state.gainNode = gainNode;
};

export const setStartTime = (state, startTime) => {
  state.startTime = startTime;
};

export const setPauseTime = (state, pauseTime) => {
  state.pauseTime = pauseTime;
};

export const setSeeking = (state, isSeeking) => {
  state.isSeeking = isSeeking;
};

export const setComponentId = (state, componentId) => {
  state.componentId = componentId;
};

// Compound state updates
export const updatePlaybackState = (state, updates) => {
  Object.assign(state, updates);
};

export const resetPlayback = (state) => {
  state.isPlaying = false;
  state.currentTime = 0;
  state.pauseTime = 0;
  state.startTime = 0;
  state.sourceNode = null;
};

// Pure calculation functions
const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '0:00';

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const calculateProgressPercentage = (currentTime, duration) => 
  duration > 0 ? (currentTime / duration) * 100 : 0;

const calculateSeekPosition = (clickX, progressBarWidth, duration) => {
  const percentage = Math.max(0, Math.min(1, clickX / progressBarWidth));
  return percentage * duration;
};

const calculatePlaybackParams = (state, seekTime = null) => {
  const startTime = seekTime !== null ? seekTime : (state.pauseTime || 0);
  const contextStartTime = state.audioContext ? state.audioContext.currentTime - startTime : 0;
  
  return { 
    startTime, 
    contextStartTime,
    shouldResume: state.audioContext?.state === 'suspended'
  };
};


export const selectors = {
  getProgressPercentage: (state) => calculateProgressPercentage(state.currentTime, state.duration),
  getFormattedCurrentTime: (state) => formatTime(state.currentTime),
  getFormattedDuration: (state) => formatTime(state.duration),
  canPlay: (state) => Boolean(state.audioBuffer && state.audioContext && !state.isLoading),
  isReady: (state) => Boolean(state.audioBuffer && state.audioContext),
  getPlaybackPosition: (state) => ({
    current: state.currentTime,
    duration: state.duration,
    percentage: calculateProgressPercentage(state.currentTime, state.duration)
  })
};

// Pure functions for calculations
export const calculations = {
  formatTime,
  calculateProgressPercentage,
  calculateSeekPosition,
  calculatePlaybackParams
};

export const toViewData = ({ state, props }) => ({
  isPlaying: state.isPlaying,
  title: props.title,
  isLoading: state.isLoading,
  currentTime: state.currentTime,
  duration: state.duration,
  currentTimeFormatted: selectors.getFormattedCurrentTime(state),
  durationFormatted: selectors.getFormattedDuration(state),
  progressPercentage: selectors.getProgressPercentage(state),
});