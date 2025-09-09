export const handleAfterMount = async (deps) => {
  const { attrs, store, render, fileManagerFactory, router } = deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  try {
    const { p: projectId } = router.getPayload();
    const fileManager = await fileManagerFactory.getByProject(projectId);

    const waveformData = await fileManager.downloadMetadata({
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
  const { attrs, store, render, fileManagerFactory, router } = deps;

  if (!attrs.waveformDataFileId) {
    return;
  }

  store.setLoading(true);
  render();

  try {
    const { p: projectId } = router.getPayload();
    const fileManager = await fileManagerFactory.getByProject(projectId);

    const waveformData = await fileManager.downloadMetadata({
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
