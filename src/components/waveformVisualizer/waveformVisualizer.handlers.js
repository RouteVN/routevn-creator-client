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

    // Convert byte data (0-255) back to normalized values (0-1)
    if (waveformData && waveformData.data) {
      waveformData.data = waveformData.data.map((value) => value / 255);
    }

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

    // Convert byte data (0-255) back to normalized values (0-1)
    if (waveformData && waveformData.data) {
      waveformData.data = waveformData.data.map((value) => value / 255);
    }

    store.setWaveformData(waveformData);
    store.setLoading(false);
    render();
  } catch (error) {
    // store.setError(true);
    store.setLoading(false);
    render();
  }
};
