export const INITIAL_STATE = Object.freeze({
  isLoading: false,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
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



export const resetState = (state) => {
  state.isPlaying = false;
  state.currentTime = 0;
  state.duration = 0;
  state.isLoading = false;
};

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

export const selectors = {
  getProgressPercentage: (state) => calculateProgressPercentage(state.currentTime, state.duration),
  getFormattedCurrentTime: (state) => formatTime(state.currentTime),
  getFormattedDuration: (state) => formatTime(state.duration),
  getPlaybackPosition: (state) => ({
    current: state.currentTime,
    duration: state.duration,
    percentage: calculateProgressPercentage(state.currentTime, state.duration)
  })
};

export const calculations = {
  formatTime,
  calculateProgressPercentage,
  calculateSeekPosition,
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