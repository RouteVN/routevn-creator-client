export const handleAfterMount = async (deps) => {
  const { attrs, store, render, projectService } = deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  try {
    const waveformData = await projectService.downloadMetadata(
      attrs.waveformDataFileId,
    );

    store.setWaveformData(waveformData);
    store.setLoading(false);
    render();
  } catch {
    store.setLoading(false);
    render();
  }
};

export const handleOnUpdate = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { newAttrs: attrs } = payload;

  if (!attrs?.waveformDataFileId) {
    return;
  }

  store.setLoading(true);

  try {
    const waveformData = await projectService.downloadMetadata(
      attrs.waveformDataFileId,
    );

    store.setWaveformData(waveformData);
    store.setLoading(false);
    render();
  } catch {
    store.setLoading(false);
    render();
  }
};
