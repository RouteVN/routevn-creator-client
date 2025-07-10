export const INITIAL_STATE = Object.freeze({
  waveformData: null,
  isLoading: false,
  canvasWidth: 800,
  canvasHeight: 120,
  currentTime: 0,
  duration: 0,
  isPlaying: false
});

export const toViewData = ({ state, props }, payload) => {
  const waveformData = props.waveformData || state.waveformData;
  
  return {
    waveformData,
    isLoading: state.isLoading,
    canvasWidth: state.canvasWidth,
    canvasHeight: state.canvasHeight,
    currentTime: state.currentTime,
    duration: props.duration || state.duration,
    isPlaying: state.isPlaying
  };
};

export const setWaveformData = (state, waveformData) => {
  state.waveformData = waveformData;
};

export const setIsLoading = (state, isLoading) => {
  state.isLoading = isLoading;
};

export const setCurrentTime = (state, currentTime) => {
  state.currentTime = currentTime;
};

export const setDuration = (state, duration) => {
  state.duration = duration;
};

export const selectWaveformData = ({ state }) => state.waveformData;
export const selectIsLoading = ({ state }) => state.isLoading;
export const selectCurrentTime = ({ state }) => state.currentTime;
export const selectDuration = ({ state }) => state.duration;