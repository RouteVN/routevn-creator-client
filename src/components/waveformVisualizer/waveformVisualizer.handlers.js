import { renderWaveformCanvas } from "../../internal/waveformCanvas.js";

export { renderWaveformCanvas };

export const handleBeforeMount = (deps) => {
  const { refs, store } = deps;
  let resizeObserver;

  const drawWaveform = ({ width, height }) => {
    renderWaveformCanvas({
      canvas: refs.waveformCanvas,
      waveformData: store.selectWaveformData(),
      width,
      height,
    });
  };

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
    drawWaveform({ width: renderedWidth, height: renderedHeight });
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
  const { props: attrs, refs, store, render, projectService } = deps;

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
    const { width, height } = store.selectRenderedSize();
    renderWaveformCanvas({
      canvas: refs.waveformCanvas,
      waveformData,
      width,
      height,
    });
  } catch {
    store.setLoading({ isLoading: false });
    render();
  }
};

export const handleOnUpdate = async (deps, payload) => {
  const { refs, store, render, projectService } = deps;
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
    const { width, height } = store.selectRenderedSize();
    renderWaveformCanvas({
      canvas: refs.waveformCanvas,
      waveformData,
      width,
      height,
    });
  } catch {
    store.setLoading({ isLoading: false });
    render();
  }
};
