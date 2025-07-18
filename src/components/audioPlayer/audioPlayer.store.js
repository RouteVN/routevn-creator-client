export const INITIAL_STATE = Object.freeze({
  isLoading: true,
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

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const calculateProgressPercentage = (currentTime, duration) =>
  duration > 0 ? (currentTime / duration) * 100 : 0;

export const selectProgressPercentage = ({ state }) =>
  calculateProgressPercentage(state.currentTime, state.duration);

export const selectFormattedCurrentTime = ({ state }) =>
  formatTime(state.currentTime);

export const selectFormattedDuration = ({ state }) =>
  formatTime(state.duration);

export const selectPlaybackPosition = ({ state }) => ({
  current: state.currentTime,
  duration: state.duration,
  percentage: calculateProgressPercentage(state.currentTime, state.duration),
});

export const selectDuration = ({ state }) => state.duration;

export const toViewData = ({ state, props }) => ({
  isPlaying: state.isPlaying,
  title: props.title,
  isLoading: state.isLoading,
  currentTime: state.currentTime,
  duration: state.duration,
  currentTimeFormatted: selectFormattedCurrentTime({ state }),
  durationFormatted: selectFormattedDuration({ state }),
  progressPercentage: selectProgressPercentage({ state }),
});
