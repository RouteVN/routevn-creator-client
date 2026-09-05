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
    // Keyed DOM moves disconnect this instance briefly. Keep completed data
    // and its canvas, but prevent an unfinished request from rendering later.
    store.cancelWaveformLoad();
  };
};

const loadWaveform = async (deps, fileId) => {
  const { refs, store, render, projectService } = deps;
  const { loadedFileId, loadingFileId } = store.selectWaveformLoad();

  if (!fileId) {
    if (loadedFileId || loadingFileId) {
      store.resetWaveform();
      render();
    }
    return;
  }

  if (fileId === loadedFileId || fileId === loadingFileId) {
    return;
  }

  store.startWaveformLoad({ fileId });
  const { version } = store.selectWaveformLoad();
  render();

  try {
    const waveformData = await projectService.downloadMetadata(fileId);
    if (store.selectWaveformLoad().version !== version) {
      return;
    }

    store.finishWaveformLoad({ fileId, data: waveformData });
    render();
    const { width, height } = store.selectRenderedSize();
    renderWaveformCanvas({
      canvas: refs.waveformCanvas,
      waveformData,
      width,
      height,
    });
  } catch {
    if (store.selectWaveformLoad().version !== version) {
      return;
    }
    store.finishWaveformLoad({ fileId, data: undefined });
    render();
  }
};

export const handleAfterMount = (deps) => {
  return loadWaveform(deps, deps.props.waveformDataFileId);
};

export const handleOnUpdate = (deps, { oldProps, newProps }) => {
  const { render } = deps;
  if (oldProps.w !== newProps.w || oldProps.h !== newProps.h) {
    render();
  }
  return loadWaveform(deps, newProps.waveformDataFileId);
};
