import {
  applyTransformPositionIntent,
  createTransformKeyboardIntent,
} from "../../internal/transformKeyboard.js";
import { normalizeBackgroundTransformEditorTransform } from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";

const dispatchTransformChange = (
  { dispatchEvent },
  { transform, name, value, transient = false, startTransform } = {},
) => {
  dispatchEvent(
    new CustomEvent("transform-change", {
      detail: {
        transform: normalizeBackgroundTransformEditorTransform(transform),
        name,
        value,
        transient,
        startTransform,
      },
      bubbles: true,
      composed: true,
    }),
  );
};

const createTransformFromInspectorValues = (currentTransform, values = {}) => {
  const nextTransform = {
    ...currentTransform,
    ...values,
  };

  if (Number.isFinite(Number(values.anchor?.x))) {
    nextTransform.anchorX = Number(values.anchor.x);
  }
  if (Number.isFinite(Number(values.anchor?.y))) {
    nextTransform.anchorY = Number(values.anchor.y);
  }
  delete nextTransform.anchor;

  return normalizeBackgroundTransformEditorTransform(nextTransform);
};

const flushBackgroundDragPreview = (deps) => {
  const { refs, store } = deps;
  const drag = store.selectBackgroundDrag();
  if (!drag) {
    return;
  }

  store.setBackgroundDragPreviewFrameId({ frameId: undefined });
  dispatchTransformChange(deps, {
    transform: drag.currentTransform,
    transient: true,
    startTransform: drag.transform,
  });
  refs.transformInspector.setTransientValues({
    values: {
      x: drag.currentTransform.x,
      y: drag.currentTransform.y,
    },
  });
};

const scheduleBackgroundDragPreview = (deps) => {
  const { store } = deps;
  const drag = store.selectBackgroundDrag();
  if (!drag || drag.previewFrameId !== undefined) {
    return;
  }

  if (typeof globalThis.requestAnimationFrame !== "function") {
    flushBackgroundDragPreview(deps);
    return;
  }

  const frameId = globalThis.requestAnimationFrame(() => {
    flushBackgroundDragPreview(deps);
  });
  store.setBackgroundDragPreviewFrameId({ frameId });
};

export const handleBeforeMount = ({ store, uiConfig }) => {
  store.setUiConfig({ uiConfig });
};

export const handleInspectorUpdate = (deps, payload) => {
  const detail = payload._event.detail;
  const transform = createTransformFromInspectorValues(
    deps.props.transform,
    detail.formValues,
  );

  dispatchTransformChange(deps, {
    transform,
    name: detail.name,
    value: detail.value,
  });
};

export const handleWindowKeyDown = (deps, payload) => {
  const event = payload._event;
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    deps.appService.isInputFocused()
  ) {
    return;
  }

  const intent = createTransformKeyboardIntent({
    key: event.key,
    shiftKey: event.shiftKey,
  });
  if (!intent) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  const transform = applyTransformPositionIntent(
    normalizeBackgroundTransformEditorTransform(deps.props.transform),
    intent,
  );
  dispatchTransformChange(deps, { transform });
};

export const handleBackgroundPointerDown = (deps, payload) => {
  const event = payload._event;
  if (
    deps.props.targetType !== "background" ||
    event.button !== 0 ||
    event.isPrimary === false
  ) {
    return;
  }

  const canvasBounds = event.currentTarget.getBoundingClientRect();
  if (canvasBounds.width <= 0 || canvasBounds.height <= 0) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  deps.store.startBackgroundDrag({
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    canvasWidth: canvasBounds.width,
    canvasHeight: canvasBounds.height,
    projectResolution: deps.props.projectResolution,
    transform: normalizeBackgroundTransformEditorTransform(
      deps.props.transform,
    ),
  });
  deps.render();
};

export const handleWindowPointerMove = (deps, payload) => {
  const { store } = deps;
  const event = payload._event;
  const drag = store.selectBackgroundDrag();
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  event.preventDefault();
  const projectResolution = drag.projectResolution ?? {
    width: 1920,
    height: 1080,
  };
  const transform = normalizeBackgroundTransformEditorTransform({
    ...drag.transform,
    x: Math.round(
      drag.transform.x +
        ((event.clientX - drag.startClientX) / drag.canvasWidth) *
          projectResolution.width,
    ),
    y: Math.round(
      drag.transform.y +
        ((event.clientY - drag.startClientY) / drag.canvasHeight) *
          projectResolution.height,
    ),
  });

  store.setBackgroundDragTransform({ transform });
  scheduleBackgroundDragPreview(deps);
};

export const handleWindowPointerUp = (deps, payload) => {
  const event = payload._event;
  const drag = deps.store.selectBackgroundDrag();
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }

  if (drag.previewFrameId !== undefined) {
    globalThis.cancelAnimationFrame?.(drag.previewFrameId);
    flushBackgroundDragPreview(deps);
  }
  dispatchTransformChange(deps, {
    transform: deps.store.selectBackgroundDrag().currentTransform,
  });
  deps.store.stopBackgroundDrag();
  deps.render();
};

export const handleDoneClick = (deps, payload) => {
  payload._event.preventDefault();
  payload._event.stopPropagation();
  deps.dispatchEvent(
    new CustomEvent("done", {
      detail: {},
      bubbles: true,
      composed: true,
    }),
  );
};
