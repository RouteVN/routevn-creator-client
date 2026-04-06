import { fromEvent, tap } from "rxjs";
import {
  createSquareCroppedImageFile,
  getImageDimensions,
} from "../../deps/clients/web/fileProcessors.js";

const propsChanged = (oldProps = {}, newProps = {}) => {
  return oldProps.file !== newProps.file;
};

const isBlobFile = (file) => {
  return file instanceof Blob;
};

const emitReadyStateChanged = (deps, isReady) => {
  deps.dispatchEvent(
    new CustomEvent("ready-state-changed", {
      detail: {
        isReady: isReady === true,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const revokeImageUrl = (url) => {
  if (!url) {
    return;
  }

  URL.revokeObjectURL(url);
};

const releaseCurrentImageUrl = ({ store } = {}) => {
  const currentUrl = store.selectImageUrl();
  if (!currentUrl) {
    return;
  }

  revokeImageUrl(currentUrl);
};

const syncFromFile = async (deps, file = deps.props.file) => {
  emitReadyStateChanged(deps, false);
  releaseCurrentImageUrl(deps);
  deps.store.clearImage();
  deps.render();

  if (!isBlobFile(file)) {
    return;
  }

  let imageUrl;

  try {
    imageUrl = URL.createObjectURL(file);
    const dimensions = await getImageDimensions(file);
    if (deps.props.file !== file) {
      revokeImageUrl(imageUrl);
      return;
    }

    if (!dimensions) {
      revokeImageUrl(imageUrl);
      emitReadyStateChanged(deps, false);
      return;
    }

    deps.store.setImage({
      imageUrl,
      imageWidth: dimensions.width,
      imageHeight: dimensions.height,
    });
    deps.render();
    emitReadyStateChanged(deps, true);
  } catch {
    revokeImageUrl(imageUrl);
    if (deps.props.file === file) {
      emitReadyStateChanged(deps, false);
    }
  }
};

const mountSubscriptions = (deps) => {
  const subscriptions = [
    fromEvent(window, "mousemove").pipe(
      tap((event) =>
        deps.handlers.handleWindowMouseMove(deps, { _event: event }),
      ),
    ),
    fromEvent(window, "mouseup").pipe(
      tap((event) =>
        deps.handlers.handleWindowMouseUp(deps, { _event: event }),
      ),
    ),
    fromEvent(window, "blur").pipe(
      tap((event) => deps.handlers.handleWindowBlur(deps, { _event: event })),
    ),
  ].map((stream) => stream.subscribe());

  return () => {
    subscriptions.forEach((subscription) => subscription?.unsubscribe?.());
  };
};

export const handleBeforeMount = (deps) => {
  syncFromFile(deps);
  const unmountSubscriptions = mountSubscriptions(deps);

  return () => {
    unmountSubscriptions();
    releaseCurrentImageUrl(deps);
    deps.store.clearImage();
  };
};

export const handleOnUpdate = (deps, payload = {}) => {
  const oldProps = payload.oldProps ?? {};
  const newProps = payload.newProps ?? {};

  if (!propsChanged(oldProps, newProps)) {
    return;
  }

  syncFromFile(deps, newProps.file);
};

export const handleViewportMouseDown = (deps, payload) => {
  if (!deps.store.selectImageUrl()) {
    return;
  }

  payload._event.preventDefault();
  deps.store.startDragging({
    mouseX: payload._event.clientX,
    mouseY: payload._event.clientY,
  });
  deps.render();
};

export const handleWindowMouseMove = (deps, payload) => {
  if (!deps.store.selectIsDragging()) {
    return;
  }

  deps.store.updateDragging({
    mouseX: payload._event.clientX,
    mouseY: payload._event.clientY,
  });
  deps.render();
};

export const handleWindowMouseUp = (deps) => {
  if (!deps.store.selectIsDragging()) {
    return;
  }

  deps.store.stopDragging();
  deps.render();
};

export const handleWindowBlur = (deps) => {
  if (!deps.store.selectIsDragging()) {
    return;
  }

  deps.store.stopDragging();
  deps.render();
};

export const handleZoomChange = (deps, payload) => {
  const zoomLevel = parseFloat(
    payload._event.detail?.value ?? payload._event.target?.value ?? 1,
  );

  deps.store.setZoomLevel({ zoomLevel });
  deps.render();
};

export const handleZoomIn = (deps) => {
  deps.store.nudgeZoomLevel({ delta: 0.1 });
  deps.render();
};

export const handleZoomOut = (deps) => {
  deps.store.nudgeZoomLevel({ delta: -0.1 });
  deps.render();
};

export const handleViewportWheel = (deps, payload) => {
  if (!deps.store.selectImageUrl()) {
    return;
  }

  payload._event.preventDefault();
  deps.store.nudgeZoomLevel({
    delta: payload._event.deltaY < 0 ? 0.1 : -0.1,
  });
  deps.render();
};

export const handleGetCroppedFile = async (deps) => {
  const file = deps.props.file;
  const cropSelection = deps.store.selectCropSelection();

  if (!file || !cropSelection) {
    throw new Error("Image crop is not ready.");
  }

  return createSquareCroppedImageFile({
    file,
    sourceX: cropSelection.sourceX,
    sourceY: cropSelection.sourceY,
    sourceSize: cropSelection.sourceSize,
    outputSize: cropSelection.outputSize,
  });
};
