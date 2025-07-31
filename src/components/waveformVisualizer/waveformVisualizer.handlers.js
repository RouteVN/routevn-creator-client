export const handleAfterMount = async (deps) => {
  const { attrs, store, render, downloadWaveformData } = deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  try {
    // Download waveform data from API Object Storage
    const waveformData = await downloadWaveformData({
      fileId: attrs.waveformDataFileId,
    });

    store.setWaveformData(waveformData);
    store.setLoading(false);
    render();
  } catch (error) {
    // store.setError(true);
    store.setLoading(false);
    render();
  }
};

export const handleOnUpdate = async (changes, deps) => {
  const { attrs, store, render, downloadWaveformData } = deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  store.setLoading(true);
  render();

  try {
    const waveformData = await downloadWaveformData({
      fileId: attrs.waveformDataFileId,
    });
    store.setWaveformData(waveformData);
    store.setLoading(false);
    render();
  } catch (error) {
    // store.setError(true);
    store.setLoading(false);
    render();
  }
};
