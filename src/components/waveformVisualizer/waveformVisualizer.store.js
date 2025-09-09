export const INITIAL_STATE = Object.freeze({
  waveformData: {},
  isLoading: true,
});

export const setLoading = (state, isLoading) => {
  state.isLoading = isLoading;
};

export const setWaveformData = (state, data) => {
  // Validate waveform data structure
  if (data && !data.amplitudes) {
    throw new Error("Invalid waveform data: missing amplitudes field");
  }

  state.waveformData = data;
};

export const toViewData = ({ state, attrs }) => {
  return {
    isLoading: state.isLoading,
    w: attrs.w || "250",
    h: attrs.h || "150",
    waveformData: state.waveformData,
  };
};
