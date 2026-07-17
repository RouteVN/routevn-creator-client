export const createInitialState = () => ({
  waveformData: null,
  isLoading: true,
  renderedWidth: 0,
  renderedHeight: 0,
});

export const setLoading = ({ state }, { isLoading } = {}) => {
  state.isLoading = isLoading;
};

export const setWaveformData = ({ state }, { data } = {}) => {
  // Validate waveform data structure
  if (data && !data.amplitudes) {
    throw new Error("Invalid waveform data: missing amplitudes field");
  }

  state.waveformData = data;
};

export const setRenderedSize = ({ state }, { width, height } = {}) => {
  state.renderedWidth = width;
  state.renderedHeight = height;
};

export const selectRenderedSize = ({ state }) => ({
  width: state.renderedWidth,
  height: state.renderedHeight,
});

export const selectViewData = ({ state, props: attrs }) => {
  return {
    isLoading: state.isLoading,
    w: attrs.w ?? "250",
    h: attrs.h ?? "150",
    waveformData: state.waveformData,
    waveformRenderKey: `waveform${state.renderedWidth}x${state.renderedHeight}`,
  };
};
