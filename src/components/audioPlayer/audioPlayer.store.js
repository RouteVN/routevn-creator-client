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

// Helper function to format time in MM:SS format
const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return '0:00';

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const toViewData = ({ state, props }) => {
  const currentTimeFormatted = formatTime(state.currentTime);
  const durationFormatted = formatTime(state.duration);
  const progressPercentage = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;
  return {
    isPlaying: state.isPlaying,
    title: props.title,
    isLoading: state.isLoading,
    currentTime: state.currentTime,
    duration: state.duration,
    currentTimeFormatted,
    durationFormatted,
    progressPercentage,
  };
};