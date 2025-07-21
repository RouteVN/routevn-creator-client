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

export const toViewData = ({ state, attrs, props }) => {
  return {
    isLoading: state.isLoading,
    hasError: state.hasError,
    w: attrs.w || '250',
    h: attrs.h || '150',
    waveformDataFileId: props.waveformDataFileId,
  };
};
