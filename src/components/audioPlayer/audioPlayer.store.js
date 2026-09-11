export const createInitialState = () => ({
  isLoading: true,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  seekTime: undefined,
});

const parseBooleanProp = (value, fallback = false) => {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (value === true || value === "") {
    return true;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }

  return Boolean(value);
};

export const setLoading = ({ state }, { isLoading } = {}) => {
  state.isLoading = isLoading;
  if (isLoading) state.seekTime = undefined;
};

export const setPlaying = ({ state }, { isPlaying } = {}) => {
  state.isPlaying = isPlaying;
};

export const setCurrentTime = ({ state }, { currentTime } = {}) => {
  state.currentTime = Math.max(0, Math.min(currentTime, state.duration));
};

export const setDuration = ({ state }, { duration } = {}) => {
  state.duration = duration;
};

export const setSeekTime = ({ state }, { seekTime }) => {
  state.seekTime = Math.max(0, Math.min(seekTime, state.duration));
};

export const clearSeekTime = ({ state }) => {
  state.seekTime = undefined;
};

export const selectSeekTime = ({ state }) => state.seekTime;

const formatTime = (seconds) => {
  if (!seconds || !isFinite(seconds)) return "0:00";

  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

const calculateProgressPercentage = (currentTime, duration) =>
  duration > 0 ? (currentTime / duration) * 100 : 0;

export const selectProgressPercentage = ({ state }) =>
  calculateProgressPercentage(
    state.seekTime ?? state.currentTime,
    state.duration,
  );

export const selectFormattedCurrentTime = ({ state }) =>
  formatTime(state.seekTime ?? state.currentTime);

export const selectFormattedDuration = ({ state }) =>
  formatTime(state.duration);

export const selectPlaybackPosition = ({ state }) => ({
  current: state.currentTime,
  duration: state.duration,
  percentage: calculateProgressPercentage(state.currentTime, state.duration),
});

export const selectDuration = ({ state }) => state.duration;

export const selectViewData = ({ state, props, i18n }) => ({
  isPlaying: state.isPlaying,
  title: props.title,
  mobileLayout: parseBooleanProp(props.mobileLayout),
  isLoading: state.isLoading,
  currentTime: state.currentTime,
  duration: state.duration,
  seekPosition: state.seekTime ?? state.currentTime,
  seekLabel: i18n.audioPlayerPage.seekLabel,
  currentTimeFormatted: selectFormattedCurrentTime({ state }),
  durationFormatted: selectFormattedDuration({ state }),
  progressPercentage: selectProgressPercentage({ state }),
});
