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
