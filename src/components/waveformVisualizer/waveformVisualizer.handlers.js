export const handleBeforeMount = (deps) => {
  const { refs, store, render } = deps;
  let resizeObserver;

  const updateRenderedSize = ({ width, height }) => {
    const renderedWidth = Math.round(width);
    const renderedHeight = Math.round(height);
    const currentSize = store.selectRenderedSize();

    if (
      renderedWidth <= 0 ||
      renderedHeight <= 0 ||
      (renderedWidth === currentSize.width &&
        renderedHeight === currentSize.height)
    ) {
      return;
    }

    store.setRenderedSize({
      width: renderedWidth,
      height: renderedHeight,
    });
    render();
  };

  const animationFrameId = requestAnimationFrame(() => {
    const { waveformContainer } = refs;
    updateRenderedSize(waveformContainer.getBoundingClientRect());

    resizeObserver = new ResizeObserver(([entry]) => {
      if (entry) {
        updateRenderedSize(entry.contentRect);
      }
    });
    resizeObserver.observe(waveformContainer);
  });

  return () => {
    cancelAnimationFrame(animationFrameId);
    resizeObserver?.disconnect();
  };
};

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
