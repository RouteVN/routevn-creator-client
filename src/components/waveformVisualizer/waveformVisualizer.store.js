export const INITIAL_STATE = Object.freeze({
  isLoading: true,
  hasError: false,
  waveformData: null,
});

export const setLoading = (state, loading) => {
  state.isLoading = loading;
};

export const setError = (state, error) => {
  state.hasError = error;
};

export const setWaveformData = (state, data) => {
  state.waveformData = data;
};

export const toViewData = ({ state, props }) => {
  const width = props.width || 600;
  const height = props.height || 400;

  return {
    isLoading: state.isLoading,
    hasError: state.hasError,
    canvasWidth: width,
    canvasHeight: height,
    waveformDataFileId: props.waveformDataFileId,
  };
};
