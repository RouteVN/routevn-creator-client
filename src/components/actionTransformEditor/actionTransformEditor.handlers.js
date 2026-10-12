import {
  applyTransformPositionIntent,
  createTransformKeyboardIntent,
} from "../../internal/transformKeyboard.js";
import {
  applyBackgroundTransformAnchorOrigin,
  normalizeBackgroundTransformEditorTransform,
} from "../../internal/ui/sceneEditor/backgroundTransformEditor.js";

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

const createTransformFromInspectorValues = (
  currentTransform,
  values = {},
  selectedElementMetrics,
) => {
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

  return applyBackgroundTransformAnchorOrigin({
    transform: nextTransform,
    selectedElementMetrics,
  });
};

const dispatchEditorEvent = ({ dispatchEvent }, type) => {
  dispatchEvent(
    new CustomEvent(type, {
      detail: {},
      bubbles: true,
      composed: true,
    }),
  );
};

// The canvas changed size, so the owner draws it again and the outline's
// handles keep their on-screen size.
const dispatchCanvasResize = (deps) => {
  dispatchEditorEvent(deps, "canvas-resize");
};

export const handleBeforeMount = (deps) => {
  const { appService, render, store, uiConfig } = deps;
  store.setUiConfig({ uiConfig });
  store.setTouchLandscape({ isTouchLandscape: appService.isTouchLandscape() });
  return appService.subscribeTouchLandscape((isTouchLandscape) => {
    if (isTouchLandscape === store.selectIsTouchLandscape()) {
      return;
    }

    store.setTouchLandscape({ isTouchLandscape });
    render();
    // Moving the inspector between the right and under the canvas rebuilds
    // it, which closes an open popover without a cancel, so its preview goes
    // too.
    dispatchEditorEvent(deps, "transform-preview-cancel");
    dispatchCanvasResize(deps);
  });
};

export const handleCanvasZoomInClick = (deps) => {
  const { render, store } = deps;
  store.zoomCanvasIn();
  render();
  dispatchCanvasResize(deps);
};

export const handleCanvasZoomOutClick = (deps) => {
  const { render, store } = deps;
  store.zoomCanvasOut();
  render();
  dispatchCanvasResize(deps);
};

// Fits the canvas to the workspace again, in the middle.
export const handleCanvasZoomResetClick = (deps) => {
  const { refs, render, store } = deps;
  store.resetCanvasZoom();
  render();
  refs.actionTransformCanvasBackground.centerContent();
  dispatchCanvasResize(deps);
};

// A pinch or wheel zoom reports its final zoom.
export const handleCanvasZoomGesture = (deps, payload) => {
  const { render, store } = deps;
  const { zoom } = payload._event.detail;
  store.setCanvasZoom({ zoom });
  render();
  dispatchCanvasResize(deps);
};

// The zoom viewport cancels the first finger of a pinch on the canvas, so the
// owner drops the drag that finger started.
export const handleCanvasPointerCancel = (deps) => {
  dispatchEditorEvent(deps, "canvas-drag-cancel");
};

// Shows the transform in the inspector while the canvas drags it, without a
// render; the owner renders when the drag ends.
export const setTransientTransform = (deps, { transform } = {}) => {
  const { refs } = deps;
  refs.transformInspector.setTransientValues({
    values: {
      x: transform.x,
      y: transform.y,
      scaleX: transform.scaleX,
      scaleY: transform.scaleY,
    },
  });
};

export const handleInspectorUpdate = (deps, payload) => {
  const { props } = deps;
  const detail = payload._event.detail;
  const transform = createTransformFromInspectorValues(
    props.transform,
    detail.formValues,
    props.selectedElementMetrics,
  );

  dispatchTransformChange(deps, {
    transform,
    name: detail.name,
    value: detail.value,
  });
};

// Number fields show their popover value on the canvas while it is chosen.
// Only the field and the fields it moves with it (the other scale while the
// aspect ratio is kept) apply, as the inspector's other values can be older
// than the transform. The owner keeps the preview out of the transform until
// a change arrives, and drops it on transform-preview-cancel.
export const handleInspectorPreview = (deps, payload) => {
  const { dispatchEvent, props } = deps;
  const { name, value, linkedValues } = payload._event.detail;
  const changes = { [name]: value };
  Object.assign(changes, linkedValues);

  dispatchEvent(
    new CustomEvent("transform-preview", {
      detail: {
        transform: createTransformFromInspectorValues(
          props.transform,
          changes,
          props.selectedElementMetrics,
        ),
      },
      bubbles: true,
      composed: true,
    }),
  );
};

// The popover closed without submitting its value.
export const handleInspectorPreviewCancel = (deps) => {
  dispatchEditorEvent(deps, "transform-preview-cancel");
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

export const handleCancelClick = (deps, payload) => {
  const { dispatchEvent } = deps;
  const { _event: event } = payload;
  event.preventDefault();
  event.stopPropagation();
  dispatchEvent(
    new CustomEvent("cancel", {
      detail: {},
      bubbles: true,
      composed: true,
    }),
  );
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
