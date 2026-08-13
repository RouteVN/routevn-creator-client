import { generateId } from "../../internal/id.js";

const playMuted = (video) => {
  if (!video) return;
  video.defaultMuted = true;
  video.muted = true;
  try {
    const playback = video.play();
    playback?.catch(() => undefined);
  } catch {
    // A later canplay event retries playback when the media becomes ready.
  }
};

const revokePreviewUrl = (store) => {
  const src = store.selectSrc();
  if (src) URL.revokeObjectURL(src);
};

export const handleBeforeMount = (deps) => {
  const { projectService, store } = deps;
  return () => {
    const operationId = store.selectOperationId();
    if (operationId) {
      projectService.cancelResourceImport({ operationId });
    }
    store.cancelLoading();
    revokePreviewUrl(store);
  };
};

const loadPreview = async (deps) => {
  const { projectService, props, store, render } = deps;
  if (store.selectLoadRequested()) return;
  const operationId = generateId();
  store.startLoading({ operationId });
  render();
  const result = await projectService.loadResourceImportPreview({
    planId: props.planId,
    sourceFileId: props.sourceFileId,
    operationId,
  });
  if (store.selectOperationId() !== operationId) return;
  if (result.valid === false) {
    store.setLoadFailed({ operationId });
    render();
    return;
  }
  const previewUrl = URL.createObjectURL(
    new Blob([result.preview.bytes], { type: result.preview.mimeType }),
  );
  revokePreviewUrl(store);
  store.setPreview({
    src: previewUrl,
    kind: result.preview.kind,
    operationId,
  });
  render();
};

export const handleAfterMount = async (deps) => {
  if (deps.props.lazy === true) return;
  await loadPreview(deps);
};

export const handleVisible = async (deps) => {
  await loadPreview(deps);
};

export const handleVideoCanPlay = (_deps, payload) => {
  playMuted(payload._event.currentTarget);
};
