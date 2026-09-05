export const createInitialState = () => ({
  waveformData: undefined,
  isLoading: true,
  loadedFileId: undefined,
  loadingFileId: undefined,
  loadVersion: 0,
  renderedWidth: 0,
  renderedHeight: 0,
});

export const startWaveformLoad = ({ state }, { fileId }) => {
  state.loadVersion += 1;
  state.loadingFileId = fileId;
  state.loadedFileId = undefined;
  state.waveformData = undefined;
  state.isLoading = true;
};

export const finishWaveformLoad = ({ state }, { fileId, data }) => {
  // Validate waveform data structure
  if (data && !data.amplitudes) {
    throw new Error("Invalid waveform data: missing amplitudes field");
  }

  state.waveformData = data;
  state.loadedFileId = data ? fileId : undefined;
  state.loadingFileId = undefined;
  state.isLoading = false;
};

export const resetWaveform = ({ state }) => {
  state.loadVersion += 1;
  state.waveformData = undefined;
  state.loadedFileId = undefined;
  state.loadingFileId = undefined;
  state.isLoading = false;
};

export const cancelWaveformLoad = ({ state }) => {
  state.loadVersion += 1;
  state.loadingFileId = undefined;
  state.isLoading = false;
};

export const selectWaveformLoad = ({ state }) => ({
  loadedFileId: state.loadedFileId,
  loadingFileId: state.loadingFileId,
  version: state.loadVersion,
});

export const setRenderedSize = ({ state }, { width, height } = {}) => {
  state.renderedWidth = width;
  state.renderedHeight = height;
};

export const selectRenderedSize = ({ state }) => ({
  width: state.renderedWidth,
  height: state.renderedHeight,
});

export const selectWaveformData = ({ state }) => state.waveformData;

export const selectViewData = ({ state, props: attrs }) => {
  return {
    isLoading: state.isLoading,
    w: attrs.w ?? "250",
    h: attrs.h ?? "150",
    waveformData: state.waveformData,
  };
};
