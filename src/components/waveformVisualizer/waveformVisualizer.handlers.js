export const handleAfterMount = async (deps) => {
  const { props: attrs, store, render, projectService } = deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  try {
    const waveformData = await projectService.downloadMetadata(
      attrs.waveformDataFileId,
    );

    store.setWaveformData({ data: waveformData });
    store.setLoading({ isLoading: false });
    render();
  } catch {
    store.setLoading({ isLoading: false });
    render();
  }
};

export const handleOnUpdate = async (deps, payload) => {
  const { store, render, projectService } = deps;
  const { newProps: attrs } = payload;

  if (!attrs?.waveformDataFileId) {
    return;
  }

  store.setLoading({ isLoading: true });

  try {
    const waveformData = await projectService.downloadMetadata(
      attrs.waveformDataFileId,
    );

    store.setWaveformData({ data: waveformData });
    store.setLoading({ isLoading: false });
    render();
  } catch {
    store.setLoading({ isLoading: false });
    render();
  }
};
